use crate::state::{AppSettings, ManagedState};
use tauri::State;

#[tauri::command]
pub fn load_settings(state: State<'_, ManagedState>) -> Result<AppSettings, String> {
    let s = state.settings.lock().map_err(|e| e.to_string())?;
    Ok(s.clone())
}

/// Persist settings and invalidate pool entries for any provider whose
/// `configured_providers` flag changed.
///
/// Pool invalidation is driven by *flag deltas*, not by out-of-band key
/// rotation: the rotation path is `save_api_key_cmd` / `delete_api_key_cmd`
/// in `commands::api_keys`, which flip the flag as part of their own
/// transaction. That lands here via the settings persist → delta detection
/// below → `invalidate_pool_for_provider`. The helper closure is shared
/// logic (scope §4.4).
///
/// Other `ProvidersSettings` changes (e.g. `default_provider` edits in UI,
/// `useLegacyClaudeCli` toggle) do not invalidate the pool — they take
/// effect on the next `send_message` via a fresh settings read. Only key
/// presence changes warrant killing live sidecars.
#[tauri::command]
pub async fn save_settings(
    settings: AppSettings,
    state: State<'_, ManagedState>,
) -> Result<serde_json::Value, String> {
    // Snapshot BEFORE the write so we can diff configured_providers flags
    // and the global MCP block.
    // Scope §4.4: keyring rotation (save_api_key_cmd / delete_api_key_cmd)
    // lands here via `settings.providers.configured_providers[provider]`
    // flip; this diff is what catches it.
    let (prev_configured, prev_mcp_json) = {
        let s = state.settings.lock().map_err(|e| e.to_string())?;
        (
            s.providers.configured_providers.clone(),
            serde_json::to_string(&s.mcp).map_err(|e| e.to_string())?,
        )
    };

    let next_configured = settings.providers.configured_providers.clone();
    let next_mcp_json = serde_json::to_string(&settings.mcp).map_err(|e| e.to_string())?;

    {
        let mut s = state.settings.lock().map_err(|e| e.to_string())?;
        *s = settings;
    }
    state.save_settings()?;

    // Collect providers whose flag crossed true↔false (or from absent → any).
    // Flag staying the same → no-op. We do NOT invalidate on flag-stays-true
    // because that would churn the pool on every unrelated settings save
    // (theme change, shortcut edit, etc).
    let changed: Vec<String> = next_configured
        .iter()
        .filter_map(|(provider, &new_val)| {
            let prev_val = prev_configured.get(provider).copied();
            if prev_val != Some(new_val) {
                Some(provider.clone())
            } else {
                None
            }
        })
        .chain(prev_configured.keys().filter_map(|p| {
            if !next_configured.contains_key(p) {
                // Provider row removed entirely (shouldn't happen through
                // Tauri commands, but guard against hand-edited settings).
                Some(p.clone())
            } else {
                None
            }
        }))
        .collect();

    // #[must_use] on invalidate_* forces us to shutdown returned entries.
    // The lock is already released (block above); await shutdowns here.
    for provider in &changed {
        let evicted = state.goose_acp_pool.invalidate_pool_for_provider(provider);
        let n = evicted.len();
        for entry in evicted {
            entry.client.shutdown().await;
        }
        if n > 0 {
            eprintln!(
                "[settings] configured_providers[{provider}] changed → {n} sidecars evicted"
            );
        }
    }

    // Conservative: any global MCP change invalidates ALL pool entries,
    // since we don't track per-agent → per-server reverse indices. The
    // legacy ProcessPool is per-message under `--no-session-persistence`
    // so it self-heals; we only need to drain the goose ACP pool here.
    let mcp_changed = prev_mcp_json != next_mcp_json;
    if mcp_changed {
        let killed = state.goose_acp_pool.shutdown_all(200).await;
        eprintln!(
            "[settings] global MCP changed → goose pool drained ({killed} sigkilled)"
        );
    }

    Ok(serde_json::json!({
        "ok": true,
        "invalidated": changed,
        "mcpChanged": mcp_changed,
    }))
}

#[tauri::command]
pub fn get_version() -> serde_json::Value {
    serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "tauri": "2.x",
        "rust": "1.84+"
    })
}
