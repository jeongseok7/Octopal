//! Effective-MCP-config resolver (NEW_CAPABILITY: global registry + per-agent
//! override).
//!
//! The agent spawn path in `agent.rs` calls `resolve_effective_mcp_config` to
//! merge the global server map (from `AppSettings.mcp`) with the per-agent
//! overlay (`OctoFile.mcp`), drop disabled servers, and produce the JSON for
//! `--mcp-config` plus the `mcp__<server>__<tool>` arg list for
//! `--disallowed-tools`.
//!
//! Storage stays as `serde_json::Value` so existing on-disk files keep
//! deserializing — the typed `AgentMcp`/`GlobalMcp` are only used at the
//! validation/UI boundary.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

/// Per-agent MCP overlay block. Lives in `<agent>/config.json` under `mcp`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentMcp {
    /// Servers defined inline on this agent. Overrides any global server
    /// of the same name.
    #[serde(default, skip_serializing_if = "Map::is_empty")]
    pub servers: Map<String, Value>,
    /// Global server names this agent has explicitly disabled.
    #[serde(rename = "disabledServers", default, skip_serializing_if = "Vec::is_empty")]
    pub disabled_servers: Vec<String>,
    /// Per-server disabled tool names. Key is server name, value is list
    /// of tool names. Tools not listed are enabled by default.
    #[serde(rename = "disabledTools", default, skip_serializing_if = "BTreeMap::is_empty")]
    pub disabled_tools: BTreeMap<String, Vec<String>>,
}

/// Global MCP block. Lives in `~/.octopal/settings.json` under `mcp`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct GlobalMcp {
    #[serde(default)]
    pub servers: Map<String, Value>,
}

/// Result of resolving the effective MCP config for one agent invocation.
pub struct ResolvedMcp {
    /// JSON ready for `--mcp-config` (always includes `mcpServers` key,
    /// even if empty — matches existing behavior at agent.rs:494-505).
    pub mcp_config: Value,
    /// Tool names for `--disallowed-tools mcp__<server>__<tool>`. One
    /// entry per disabled tool. Caller emits `--disallowed-tools <name>`
    /// for each.
    pub disallowed_mcp_tools: Vec<String>,
}

/// Pure resolver. Precedence: agent-defined server NAME wins over global
/// server with the same name. Disabled global servers drop out entirely.
/// Per-tool disables produce one `mcp__<server>__<tool>` arg each.
///
/// `legacy_mcp_servers` is the old `OctoFile.mcpServers` blob — used as a
/// fallback ONLY when neither global servers exist nor the agent has a
/// non-empty new-shape `mcp` block (i.e. the agent hasn't been migrated to
/// the new shape).
pub fn resolve_effective_mcp_config(
    global: &GlobalMcp,
    agent: Option<&AgentMcp>,
    legacy_mcp_servers: Option<&Value>,
) -> ResolvedMcp {
    let mut effective: Map<String, Value> = Map::new();

    // 1. Start with global servers.
    for (name, cfg) in &global.servers {
        effective.insert(name.clone(), cfg.clone());
    }

    // 2. Apply agent overlay.
    let mut disallowed_mcp_tools = Vec::new();
    if let Some(a) = agent {
        // Drop disabled globals.
        for name in &a.disabled_servers {
            effective.remove(name);
        }
        // Overlay agent-defined servers (overrides by name).
        for (name, cfg) in &a.servers {
            effective.insert(name.clone(), cfg.clone());
        }
        // Per-tool disables — emit args for tools whose server is still active.
        for (server, tools) in &a.disabled_tools {
            if effective.contains_key(server) {
                for tool in tools {
                    disallowed_mcp_tools.push(format!("mcp__{server}__{tool}"));
                }
            }
        }
    }

    // 3. Legacy fallback: only if no global, no overlay servers, no overlay
    //    disables, and the agent has a legacy `mcpServers` blob — treat
    //    that as the effective set.
    let agent_empty = agent.is_none_or(|a| {
        a.servers.is_empty() && a.disabled_servers.is_empty() && a.disabled_tools.is_empty()
    });
    if effective.is_empty() && agent_empty {
        if let Some(Value::Object(legacy)) = legacy_mcp_servers {
            effective = legacy.clone();
        }
    }

    ResolvedMcp {
        mcp_config: serde_json::json!({ "mcpServers": effective }),
        disallowed_mcp_tools,
    }
}

/// Validate that a server JSON value matches one of the supported transport
/// shapes (stdio, http, sse). Used at IPC boundary on save.
#[allow(dead_code)]
pub fn validate_server(name: &str, cfg: &Value) -> Result<(), String> {
    let obj = cfg
        .as_object()
        .ok_or_else(|| format!("server '{name}' is not an object"))?;
    let ttype = obj.get("type").and_then(|v| v.as_str()).unwrap_or("stdio");
    match ttype {
        "stdio" => {
            if !obj.contains_key("command") {
                return Err(format!("server '{name}' (stdio) missing 'command'"));
            }
        }
        "http" | "sse" => {
            if !obj.contains_key("url") {
                return Err(format!("server '{name}' ({ttype}) missing 'url'"));
            }
        }
        other => return Err(format!("server '{name}' has unsupported type '{other}'")),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stdio(cmd: &str) -> Value {
        serde_json::json!({ "command": cmd, "args": [], "env": {} })
    }
    fn http(url: &str) -> Value {
        serde_json::json!({ "type": "http", "url": url, "headers": {} })
    }

    #[test]
    fn empty_inputs_yield_empty_mcp_config() {
        let r = resolve_effective_mcp_config(&GlobalMcp::default(), None, None);
        assert_eq!(r.mcp_config, serde_json::json!({ "mcpServers": {} }));
        assert!(r.disallowed_mcp_tools.is_empty());
    }

    #[test]
    fn global_only_passthrough() {
        let mut g = GlobalMcp::default();
        g.servers.insert("figma".into(), stdio("npx"));
        let r = resolve_effective_mcp_config(&g, None, None);
        assert_eq!(r.mcp_config["mcpServers"]["figma"]["command"], "npx");
    }

    #[test]
    fn agent_server_overrides_global_with_same_name() {
        let mut g = GlobalMcp::default();
        g.servers.insert("figma".into(), stdio("npx"));
        let mut a = AgentMcp::default();
        a.servers
            .insert("figma".into(), http("https://my-figma.local"));
        let r = resolve_effective_mcp_config(&g, Some(&a), None);
        assert_eq!(r.mcp_config["mcpServers"]["figma"]["type"], "http");
        assert_eq!(
            r.mcp_config["mcpServers"]["figma"]["url"],
            "https://my-figma.local"
        );
    }

    #[test]
    fn disabled_server_removes_from_effective_set() {
        let mut g = GlobalMcp::default();
        g.servers.insert("figma".into(), stdio("npx"));
        g.servers
            .insert("stripe".into(), http("https://mcp.stripe.com"));
        let mut a = AgentMcp::default();
        a.disabled_servers.push("stripe".into());
        let r = resolve_effective_mcp_config(&g, Some(&a), None);
        assert!(r.mcp_config["mcpServers"]["figma"].is_object());
        assert!(r.mcp_config["mcpServers"].get("stripe").is_none());
    }

    #[test]
    fn disabled_tools_emit_dot_separated_args_only_for_active_servers() {
        let mut g = GlobalMcp::default();
        g.servers.insert("figma".into(), stdio("npx"));
        let mut a = AgentMcp::default();
        a.disabled_tools.insert(
            "figma".into(),
            vec!["create_comment".into(), "delete_file".into()],
        );
        // Tools for a server that doesn't exist must NOT generate args
        a.disabled_tools
            .insert("ghost-server".into(), vec!["foo".into()]);
        let r = resolve_effective_mcp_config(&g, Some(&a), None);
        assert_eq!(
            r.disallowed_mcp_tools,
            vec!["mcp__figma__create_comment", "mcp__figma__delete_file"]
        );
    }

    #[test]
    fn legacy_mcp_servers_used_when_new_shape_empty() {
        let legacy = serde_json::json!({
            "old-server": { "command": "old-bin" }
        });
        let r = resolve_effective_mcp_config(&GlobalMcp::default(), None, Some(&legacy));
        assert!(r.mcp_config["mcpServers"]["old-server"].is_object());
    }

    #[test]
    fn legacy_ignored_when_global_present() {
        let legacy = serde_json::json!({ "old-server": { "command": "old-bin" } });
        let mut g = GlobalMcp::default();
        g.servers.insert("new".into(), stdio("npx"));
        let r = resolve_effective_mcp_config(&g, None, Some(&legacy));
        assert!(r.mcp_config["mcpServers"]["new"].is_object());
        assert!(r.mcp_config["mcpServers"].get("old-server").is_none());
    }

    #[test]
    fn validate_stdio_requires_command() {
        assert!(validate_server("x", &stdio("npx")).is_ok());
        assert!(validate_server("x", &serde_json::json!({})).is_err());
    }

    #[test]
    fn validate_http_requires_url() {
        assert!(validate_server("x", &http("https://x.com")).is_ok());
        assert!(validate_server("x", &serde_json::json!({"type":"http"})).is_err());
    }

    #[test]
    fn validate_unknown_type_rejected() {
        let bad = serde_json::json!({"type":"smoke-signal","url":"x"});
        assert!(validate_server("x", &bad).is_err());
    }

    #[test]
    fn agent_mcp_default_serializes_compactly() {
        // Empty AgentMcp must round-trip to `{}` so legacy agents stay
        // byte-clean (mirrors Phase-3 provider/model handling).
        let s = serde_json::to_string(&AgentMcp::default()).unwrap();
        assert_eq!(s, "{}");
    }
}
