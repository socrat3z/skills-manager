use crate::core::mcp_service::{
    self, McpInventory, McpPreset, McpServerConfig,
};

#[tauri::command]
pub fn get_mcp_inventory() -> Result<McpInventory, String> {
    Ok(mcp_service::get_mcp_inventory())
}

#[tauri::command]
pub fn save_mcp_server(
    server: McpServerConfig,
    target_harnesses: Vec<String>,
) -> Result<McpInventory, String> {
    mcp_service::save_mcp_server(server, target_harnesses).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_mcp_server(
    server_id: String,
    target_harnesses: Vec<String>,
) -> Result<McpInventory, String> {
    mcp_service::delete_mcp_server(&server_id, target_harnesses).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_mcp_server(
    server_id: String,
    harness_key: String,
    enabled: bool,
) -> Result<McpInventory, String> {
    mcp_service::toggle_mcp_server(&server_id, &harness_key, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sync_all_mcp_servers(target_harnesses: Vec<String>) -> Result<McpInventory, String> {
    mcp_service::sync_all_mcp_servers(target_harnesses).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_mcp_presets() -> Result<Vec<McpPreset>, String> {
    Ok(mcp_service::get_mcp_presets())
}

#[tauri::command]
pub fn export_mcp_config() -> Result<String, String> {
    let inventory = mcp_service::get_mcp_inventory();
    serde_json::to_string_pretty(&inventory.servers).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_mcp_config(
    json_str: String,
    target_harnesses: Vec<String>,
) -> Result<McpInventory, String> {
    let servers: Vec<McpServerConfig> =
        serde_json::from_str(&json_str).map_err(|e| format!("Invalid JSON format: {}", e))?;
    for server in servers {
        mcp_service::save_mcp_server(server, target_harnesses.clone()).map_err(|e| e.to_string())?;
    }
    Ok(mcp_service::get_mcp_inventory())
}

#[tauri::command]
pub fn fetch_mcp_marketplace_servers(
    query: Option<String>,
    category: Option<String>,
) -> Result<Vec<mcp_service::MarketplaceMcpServer>, String> {
    Ok(mcp_service::fetch_mcp_marketplace_servers(query, category))
}

#[tauri::command]
pub fn validate_mcp_server(
    server: McpServerConfig,
) -> Result<mcp_service::McpValidationReport, String> {
    Ok(mcp_service::validate_mcp_server(&server))
}

#[tauri::command]
pub fn resolve_mcp_command_path(command: String) -> Result<String, String> {
    Ok(mcp_service::resolve_binary_path(&command))
}

#[tauri::command]
pub async fn ping_mcp_server(
    server: McpServerConfig,
) -> Result<mcp_service::McpPingResult, String> {
    // The underlying ping performs blocking network I/O (up to 3s timeout),
    // so run it on a thread pool to avoid blocking the Tauri IPC thread.
    tauri::async_runtime::spawn_blocking(move || mcp_service::ping_mcp_server(&server))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn bulk_toggle_harness(
    harness_key: String,
    enabled: bool,
) -> Result<mcp_service::McpInventory, String> {
    mcp_service::bulk_toggle_harness(&harness_key, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_mcp_profiles() -> Result<Vec<mcp_service::McpProfile>, String> {
    Ok(mcp_service::get_mcp_profiles())
}

#[tauri::command]
pub fn activate_mcp_profile(
    profile_id: String,
    target_harnesses: Vec<String>,
) -> Result<McpInventory, String> {
    mcp_service::activate_mcp_profile(&profile_id, &target_harnesses).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn backup_harness_config(
    harness_key: String,
) -> Result<mcp_service::McpBackupEntry, String> {
    tauri::async_runtime::spawn_blocking(move || mcp_service::backup_harness_config(&harness_key))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_harness_backups(
    harness_key: String,
) -> Result<Vec<mcp_service::McpBackupEntry>, String> {
    Ok(mcp_service::get_harness_backups(&harness_key))
}

#[tauri::command]
pub async fn restore_harness_config(
    harness_key: String,
    backup_path: String,
) -> Result<McpInventory, String> {
    tauri::async_runtime::spawn_blocking(move || {
        mcp_service::restore_harness_config(&harness_key, &backup_path)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_git_mcp_sources() -> Result<Vec<mcp_service::McpGitProfileSource>, String> {
    Ok(mcp_service::get_git_mcp_sources())
}

#[tauri::command]
pub fn add_git_mcp_source(
    name: String,
    repo_url: String,
    branch: Option<String>,
) -> Result<Vec<mcp_service::McpGitProfileSource>, String> {
    mcp_service::add_git_mcp_source(name, repo_url, branch).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sync_git_mcp_sources() -> Result<Vec<mcp_service::McpGitProfileSource>, String> {
    mcp_service::sync_git_mcp_sources().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_git_mcp_source(
    source_id: String,
) -> Result<Vec<mcp_service::McpGitProfileSource>, String> {
    mcp_service::delete_git_mcp_source(&source_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_harness_config_content(
    harness_key: String,
) -> Result<mcp_service::HarnessConfigContent, String> {
    mcp_service::get_harness_config_content(&harness_key)
}

#[tauri::command]
pub fn save_harness_config_content(
    harness_key: String,
    content: String,
) -> Result<mcp_service::McpInventory, String> {
    mcp_service::save_harness_config_content(&harness_key, &content)
}

