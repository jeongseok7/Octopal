use crate::state::ManagedState;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

#[derive(Serialize)]
pub struct WikiPage {
    /// Path relative to wiki_dir with forward-slash separators, e.g. "docs/intro.md".
    /// Pages at the top level have no prefix.
    pub name: String,
    pub path: String,
    pub size: u64,
    pub mtime: f64,
}

/// Walk the wiki dir recursively, collecting .md files with relative paths.
/// Caps depth to avoid runaway traversal on symlink loops or pathological trees.
pub(crate) fn collect_pages(root: &Path, current: &Path, depth: u8, out: &mut Vec<WikiPage>) {
    if depth > 8 {
        return;
    }
    let Ok(entries) = fs::read_dir(current) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() {
            // Skip hidden dirs (e.g. .git, .DS_Store shouldn't be dirs but defensive)
            if entry
                .file_name()
                .to_string_lossy()
                .starts_with('.')
            {
                continue;
            }
            collect_pages(root, &path, depth + 1, out);
        } else if ft.is_file()
            && path.extension().and_then(|e| e.to_str()) == Some("md")
        {
            let Ok(meta) = entry.metadata() else { continue };
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as f64)
                .unwrap_or(0.0);
            // Build a forward-slash-separated relative path so the frontend
            // can split on "/" to derive folder grouping.
            let rel = path.strip_prefix(root).unwrap_or(&path);
            let name = rel
                .components()
                .filter_map(|c| c.as_os_str().to_str())
                .collect::<Vec<_>>()
                .join("/");
            out.push(WikiPage {
                name,
                path: path.to_string_lossy().to_string(),
                size: meta.len(),
                mtime,
            });
        }
    }
}

#[tauri::command]
pub fn wiki_list(workspace_id: String, state: State<'_, ManagedState>) -> Result<Vec<WikiPage>, String> {
    let wiki_dir = state.wiki_dir(&workspace_id);
    if !wiki_dir.exists() {
        return Ok(vec![]);
    }
    let mut pages: Vec<WikiPage> = vec![];
    collect_pages(&wiki_dir, &wiki_dir, 0, &mut pages);
    pages.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(pages)
}

#[tauri::command]
pub fn wiki_read(
    workspace_id: String,
    name: String,
    state: State<'_, ManagedState>,
) -> Result<serde_json::Value, String> {
    let wiki_dir = state.wiki_dir(&workspace_id);
    let rel = match sanitize_rel_name(&name) {
        Some(p) => p,
        None => return Err(format!("invalid wiki page name: {}", name)),
    };
    let file_path = wiki_dir.join(&rel);
    if !file_path.exists() {
        return Ok(serde_json::json!({ "ok": false, "error": "Page not found" }));
    }
    let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true, "content": content }))
}

/// Reject names that would escape the wiki_dir (e.g. "../../etc/passwd").
/// Allows forward-slash subpaths ("folder/page.md") but strips any path
/// components that are "." or "..".
fn sanitize_rel_name(name: &str) -> Option<PathBuf> {
    let mut buf = PathBuf::new();
    for comp in name.split('/').filter(|s| !s.is_empty()) {
        if comp == "." || comp == ".." {
            return None;
        }
        buf.push(comp);
    }
    if buf.as_os_str().is_empty() {
        return None;
    }
    Some(buf)
}

#[tauri::command]
pub fn wiki_write(
    workspace_id: String,
    name: String,
    content: String,
    state: State<'_, ManagedState>,
) -> Result<serde_json::Value, String> {
    let wiki_dir = state.wiki_dir(&workspace_id);
    fs::create_dir_all(&wiki_dir).map_err(|e| e.to_string())?;

    // Ensure .md extension
    let safe_name = if name.ends_with(".md") {
        name.clone()
    } else {
        format!("{}.md", name)
    };

    // Reject path-traversal attempts
    let rel = match sanitize_rel_name(&safe_name) {
        Some(p) => p,
        None => return Err(format!("invalid wiki page name: {}", name)),
    };

    let file_path = wiki_dir.join(&rel);
    // Create any missing parent directories so nested names like "folder/page.md" work
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&file_path, &content).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true, "name": safe_name }))
}

#[tauri::command]
pub fn wiki_delete(
    workspace_id: String,
    name: String,
    state: State<'_, ManagedState>,
) -> Result<serde_json::Value, String> {
    let wiki_dir = state.wiki_dir(&workspace_id);
    let rel = match sanitize_rel_name(&name) {
        Some(p) => p,
        None => return Err(format!("invalid wiki page name: {}", name)),
    };
    let file_path = wiki_dir.join(&rel);
    if file_path.exists() {
        // Trash so users can recover an accidental wiki page deletion.
        if let Err(e) = trash::delete(&file_path) {
            // Fallback for headless / unsupported platforms.
            fs::remove_file(&file_path)
                .map_err(|fs_err| format!("trash: {}, fs: {}", e, fs_err))?;
        }
    }
    Ok(serde_json::json!({ "ok": true }))
}
