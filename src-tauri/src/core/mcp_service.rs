use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum McpTransport {
    Stdio,
    Sse,
    Websocket,
}

impl Default for McpTransport {
    fn default() -> Self {
        McpTransport::Stdio
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum McpScope {
    Global,
    Workspace,
}

impl Default for McpScope {
    fn default() -> Self {
        McpScope::Global
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpPingResult {
    pub online: bool,
    pub latency_ms: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpValidationReport {
    pub valid: bool,
    pub error: Option<String>,
    pub resolved_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub transport: McpTransport,
    #[serde(default)]
    pub scope: McpScope,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub args: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub env: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub disabled: bool,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpHarnessInfo {
    pub key: String,
    pub display_name: String,
    pub config_path: String,
    pub installed: bool,
    pub server_count: usize,
    pub server_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpPresetParam {
    pub name: String,
    pub label: String,
    pub description: String,
    pub default_value: Option<String>,
    pub required: bool,
    pub is_secret: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpPreset {
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: String,
    pub transport: McpTransport,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    pub env: HashMap<String, String>,
    pub params: Vec<McpPresetParam>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpProfile {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub server_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpGitProfileSource {
    pub id: String,
    pub name: String,
    pub repo_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_synced: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpBackupEntry {
    pub harness_key: String,
    pub backup_path: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarnessConfigContent {
    pub harness_key: String,
    pub display_name: String,
    pub config_path: Option<String>,
    pub exists: bool,
    pub content: String,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpInventory {
    pub servers: Vec<McpServerConfig>,
    pub harnesses: Vec<McpHarnessInfo>,
    /// Map of harness_key -> list of server_ids present in that harness
    pub harness_bindings: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub profiles: Vec<McpProfile>,
}

#[derive(Debug, Clone)]
pub struct HarnessAdapterDef {
    pub key: String,
    pub display_name: String,
    pub config_path: Option<PathBuf>,
    /// Whether this adapter uses the standard `{"mcpServers": {...}}` JSON format.
    /// If false, the adapter's config file has a different format and should only
    /// be read/written with an adapter-specific implementation.
    pub supports_standard_json: bool,
}

impl HarnessAdapterDef {
    pub fn all() -> Vec<HarnessAdapterDef> {
        let db_path = crate::core::central_repo::db_path();
        let adapters = if let Ok(store) = crate::core::skill_store::SkillStore::new(&db_path) {
            crate::core::tool_adapters::all_tool_adapters(&store)
        } else {
            crate::core::tool_adapters::default_tool_adapters()
        };

        adapters
            .into_iter()
            .map(|adapter| {
                let config_path = adapter.mcp_config_path();
                let supports_standard_json = adapter.mcp_supports_standard_json();
                HarnessAdapterDef {
                    key: adapter.key,
                    display_name: adapter.display_name,
                    config_path,
                    supports_standard_json,
                }
            })
            .collect()
    }

    pub fn find(key: &str) -> Option<HarnessAdapterDef> {
        Self::all().into_iter().find(|a| {
            a.key == key
                || (a.key == "roo_code" && key == "roo_cline")
                || (a.key == "roo_cline" && key == "roo_code")
        })
    }
}

pub fn get_central_mcp_store_dir() -> PathBuf {
    dirs::home_dir()
        .map(|p| p.join(".skills_manager").join("mcp"))
        .unwrap_or_else(|| PathBuf::from(".skills_manager/mcp"))
}

pub fn get_central_mcp_store_file() -> PathBuf {
    get_central_mcp_store_dir().join("servers.json")
}

pub fn resolve_binary_path(command: &str) -> String {
    let path_buf = PathBuf::from(command);
    if path_buf.is_absolute() && path_buf.exists() {
        return command.to_string();
    }

    let mut candidates = Vec::new();
    let sys_path = std::env::var("PATH").unwrap_or_default();
    
    #[cfg(target_os = "windows")]
    let extensions = vec!["", ".cmd", ".exe", ".bat"];
    #[cfg(not(target_os = "windows"))]
    let extensions = vec![""];

    for p in std::env::split_paths(&sys_path) {
        for ext in &extensions {
            candidates.push(p.join(format!("{}{}", command, ext)));
        }
    }

    if let Some(home) = dirs::home_dir() {
        let cargo_bin = home.join(".cargo").join("bin");
        let local_bin = home.join(".local").join("bin");
        for ext in &extensions {
            candidates.push(cargo_bin.join(format!("{}{}", command, ext)));
            candidates.push(local_bin.join(format!("{}{}", command, ext)));
        }

        #[cfg(target_os = "windows")]
        if let Some(appdata) = dirs::config_dir() {
            let npm_dir = appdata.join("npm");
            for ext in &extensions {
                candidates.push(npm_dir.join(format!("{}{}", command, ext)));
            }
        }
    }

    for candidate in candidates {
        if candidate.is_file() {
            return candidate.to_string_lossy().to_string();
        }
    }

    command.to_string()
}

pub fn expand_env_vars(input: &str, custom_env: &HashMap<String, String>) -> String {
    let mut result = input.to_string();
    let mut search_idx = 0;

    while let Some(start) = result[search_idx..].find("${") {
        let absolute_start = search_idx + start;
        if let Some(end) = result[absolute_start..].find('}') {
            let absolute_end = absolute_start + end;
            let raw_var = &result[absolute_start + 2..absolute_end];
            let var_name = raw_var.strip_prefix("env:").unwrap_or(raw_var);

            let value = custom_env
                .get(var_name)
                .cloned()
                .or_else(|| std::env::var(var_name).ok())
                .unwrap_or_else(|| format!("${{{}}}", raw_var));

            result.replace_range(absolute_start..=absolute_end, &value);
            search_idx = absolute_start + value.len();
        } else {
            break;
        }
    }

    // Windows-style %VAR% expansion (e.g. "%USERPROFILE%\\projects").
    // "%%" is a literal '%' escape and is left untouched.
    let mut search_idx = 0;
    loop {
        let remaining = &result[search_idx..];
        let Some(start) = remaining.find('%') else { break };
        let absolute_start = search_idx + start;
        let after = &result[absolute_start + 1..];
        let Some(end_rel) = after.find('%') else { break };
        let absolute_end = absolute_start + 1 + end_rel;
        let var_name = &result[absolute_start + 1..absolute_end];

        if var_name.is_empty() {
            // "%%" — skip both characters and keep searching from after them.
            search_idx = absolute_end + 1;
            continue;
        }

        let value = custom_env
            .get(var_name)
            .cloned()
            .or_else(|| std::env::var(var_name).ok())
            .unwrap_or_else(|| format!("%{}%", var_name));
        result.replace_range(absolute_start..=absolute_end, &value);
        search_idx = absolute_start + value.len();
    }

    result
}

pub fn validate_mcp_server(server: &McpServerConfig) -> McpValidationReport {
    match server.transport {
        McpTransport::Sse | McpTransport::Websocket => {
            if let Some(ref url) = server.url {
                if url.starts_with("http://")
                    || url.starts_with("https://")
                    || url.starts_with("ws://")
                    || url.starts_with("wss://")
                {
                    McpValidationReport {
                        valid: true,
                        error: None,
                        resolved_command: None,
                    }
                } else {
                    McpValidationReport {
                        valid: false,
                        error: Some("URL must start with http://, https://, ws://, or wss://".into()),
                        resolved_command: None,
                    }
                }
            } else {
                McpValidationReport {
                    valid: false,
                    error: Some("Missing URL for SSE/Websocket transport".into()),
                    resolved_command: None,
                }
            }
        }
        McpTransport::Stdio => {
            if let Some(ref cmd) = server.command {
                if cmd.trim().is_empty() {
                    return McpValidationReport {
                        valid: false,
                        error: Some("Executable command cannot be empty".into()),
                        resolved_command: None,
                    };
                }
                let resolved = resolve_binary_path(cmd);
                McpValidationReport {
                    valid: true,
                    error: None,
                    resolved_command: Some(resolved),
                }
            } else {
                McpValidationReport {
                    valid: false,
                    error: Some("Missing command for stdio transport".into()),
                    resolved_command: None,
                }
            }
        }
    }
}

pub fn ping_mcp_server(server: &McpServerConfig) -> McpPingResult {
    let start = std::time::Instant::now();
    match server.transport {
        McpTransport::Sse | McpTransport::Websocket => {
            if let Some(ref url) = server.url {
                if url.starts_with("http://") || url.starts_with("https://") {
                    let client = reqwest::blocking::Client::builder()
                        .timeout(std::time::Duration::from_secs(3))
                        .build();
                    if let Ok(c) = client {
                        if let Ok(resp) = c.get(url).send() {
                            let latency = start.elapsed().as_millis() as u64;
                            return McpPingResult {
                                online: resp.status().is_success() || resp.status().as_u16() < 500,
                                latency_ms: latency,
                                message: format!("HTTP {}", resp.status()),
                            };
                        }
                    }
                }
            }
            McpPingResult {
                online: false,
                latency_ms: start.elapsed().as_millis() as u64,
                message: "Connection failed or timeout".into(),
            }
        }
        McpTransport::Stdio => {
            if let Some(ref cmd) = server.command {
                let resolved = resolve_binary_path(cmd);
                let path = PathBuf::from(&resolved);
                if path.exists() || resolved != *cmd {
                    let latency = start.elapsed().as_millis() as u64;
                    McpPingResult {
                        online: true,
                        latency_ms: latency,
                        message: format!("Binary ready: {}", resolved),
                    }
                } else {
                    McpPingResult {
                        online: false,
                        latency_ms: start.elapsed().as_millis() as u64,
                        message: format!("Binary not found: {}", cmd),
                    }
                }
            } else {
                McpPingResult {
                    online: false,
                    latency_ms: start.elapsed().as_millis() as u64,
                    message: "Missing command".into(),
                }
            }
        }
    }
}

pub fn bulk_toggle_harness(harness_key: &str, enabled: bool) -> Result<McpInventory> {
    let servers = load_central_mcp_servers();
    let adapter = HarnessAdapterDef::find(harness_key)
        .context(format!("Harness '{}' not supported", harness_key))?;

    if !adapter.supports_standard_json {
        return Err(anyhow::anyhow!(
            "Harness '{}' uses a non-standard config format and cannot be bulk-toggled",
            harness_key
        ));
    }

    let path = match &adapter.config_path {
        Some(p) => p,
        None => return Err(anyhow::anyhow!("Config path not available for harness")),
    };

    if enabled {
        write_mcp_servers_to_json_config(path, &servers)?;
    } else {
        write_mcp_servers_to_json_config(path, &[])?;
    }

    Ok(get_mcp_inventory())
}

pub fn load_central_mcp_servers() -> Vec<McpServerConfig> {
    let file = get_central_mcp_store_file();
    if !file.exists() {
        return vec![];
    }
    match fs::read_to_string(&file) {
        Ok(content) => serde_json::from_str::<Vec<McpServerConfig>>(&content).unwrap_or_default(),
        Err(_) => vec![],
    }
}

pub fn save_central_mcp_servers(servers: &[McpServerConfig]) -> Result<()> {
    let dir = get_central_mcp_store_dir();
    fs::create_dir_all(&dir).context("Failed to create central MCP store directory")?;
    let file = get_central_mcp_store_file();
    let content = serde_json::to_string_pretty(servers)?;
    fs::write(file, content).context("Failed to write central MCP store file")?;
    Ok(())
}

/// Read MCP servers from a standard JSON config file containing a `mcpServers` object.
fn read_mcp_servers_from_json_config(path: &Path) -> Vec<McpServerConfig> {
    if !path.exists() {
        return vec![];
    }
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    let json_val: Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    let mut list = Vec::new();
    if let Some(mcp_servers) = json_val.get("mcpServers").and_then(|v| v.as_object()) {
        for (id, obj) in mcp_servers {
            let command = obj.get("command").and_then(|v| v.as_str()).map(|s| s.to_string());
            let url = obj.get("url").and_then(|v| v.as_str()).map(|s| s.to_string());
            let transport = if url.is_some() {
                McpTransport::Sse
            } else {
                McpTransport::Stdio
            };

            let args = obj
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|item| item.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();

            let mut env = HashMap::new();
            if let Some(env_obj) = obj.get("env").and_then(|v| v.as_object()) {
                for (k, v) in env_obj {
                    if let Some(val_str) = v.as_str() {
                        env.insert(k.clone(), val_str.to_string());
                    } else if let Some(val_num) = v.as_i64() {
                        env.insert(k.clone(), val_num.to_string());
                    } else if let Some(val_bool) = v.as_bool() {
                        env.insert(k.clone(), val_bool.to_string());
                    }
                }
            }

            let disabled = obj.get("disabled").and_then(|v| v.as_bool()).unwrap_or(false);
            // Preserve display name from the config if present, otherwise use the server ID
            let name = obj.get("name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| id.clone());
            let description = obj.get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            list.push(McpServerConfig {
                id: id.clone(),
                name,
                transport,
                scope: McpScope::Global,
                command,
                args,
                url,
                env,
                description,
                disabled,
            });
        }
    }
    list
}

/// Write MCP servers to a standard JSON config file containing a `mcpServers` object,
/// preserving existing top-level keys in the JSON file.
fn write_mcp_servers_to_json_config(path: &Path, servers: &[McpServerConfig]) -> Result<()> {
    let mut root_val: Value = if path.exists() {
        let content = fs::read_to_string(path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };

    if !root_val.is_object() {
        root_val = json!({});
    }

    let root_obj = root_val.as_object_mut().unwrap();
    let mut mcp_servers_obj = root_obj
        .get("mcpServers")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    // Rebuild mcpServers map
    mcp_servers_obj.clear();
    for s in servers {
        let mut server_val = json!({});
        let obj = server_val.as_object_mut().unwrap();

        if let Some(ref url) = s.url {
            obj.insert("url".into(), Value::String(url.clone()));
        }
        if let Some(ref cmd) = s.command {
            obj.insert("command".into(), Value::String(cmd.clone()));
        }
        if !s.args.is_empty() {
            obj.insert(
                "args".into(),
                Value::Array(s.args.iter().map(|a| Value::String(a.clone())).collect()),
            );
        }
        if !s.env.is_empty() {
            let mut env_obj = serde_json::Map::new();
            for (k, v) in &s.env {
                env_obj.insert(k.clone(), Value::String(v.clone()));
            }
            obj.insert("env".into(), Value::Object(env_obj));
        }
        if s.disabled {
            obj.insert("disabled".into(), Value::Bool(true));
        }

        mcp_servers_obj.insert(s.id.clone(), server_val);
    }

    root_obj.insert("mcpServers".into(), Value::Object(mcp_servers_obj));

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
        if path.exists() {
            let backup_dir = parent.join(".mcp_backups");
            if fs::create_dir_all(&backup_dir).is_ok() {
                let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
                let file_name = path.file_name().and_then(|f| f.to_str()).unwrap_or("mcp.json");
                let backup_file = backup_dir.join(format!("{}.bak.{}", file_name, timestamp));
                let _ = fs::copy(path, backup_file);
            }
        }
    }
    let formatted = serde_json::to_string_pretty(&root_val)?;
    fs::write(path, formatted)?;
    Ok(())
}

pub fn get_mcp_inventory() -> McpInventory {
    let mut central_servers = load_central_mcp_servers();
    let central_map: HashMap<String, usize> = central_servers
        .iter()
        .enumerate()
        .map(|(idx, s)| (s.id.clone(), idx))
        .collect();

    let mut harnesses = Vec::new();
    let mut harness_bindings: HashMap<String, Vec<String>> = HashMap::new();
    let mut discovered_new = false;

    let adapter_defs = HarnessAdapterDef::all();
    for adapter in adapter_defs {
        let path_opt = adapter.config_path.clone();
        let path_str = path_opt
            .as_ref()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let installed = path_opt.as_ref().map(|p| p.exists()).unwrap_or(false);

        let mut server_ids = Vec::new();
        if let Some(path) = &path_opt {
            // Only read from harnesses that use the standard JSON format
            if adapter.supports_standard_json {
                let scanned = read_mcp_servers_from_json_config(path);
                for s in scanned {
                    server_ids.push(s.id.clone());
                    // Merge scanned server into central list if not already present
                    if !central_map.contains_key(&s.id) && !central_servers.iter().any(|cs| cs.id == s.id) {
                        central_servers.push(s);
                        discovered_new = true;
                    }
                }
            }
        }

        harness_bindings.insert(adapter.key.clone(), server_ids.clone());

        harnesses.push(McpHarnessInfo {
            key: adapter.key.clone(),
            display_name: adapter.display_name.clone(),
            config_path: path_str,
            installed,
            server_count: server_ids.len(),
            server_ids,
        });
    }

    // Only persist if we actually discovered new servers from harness configs
    if discovered_new {
        if let Err(e) = save_central_mcp_servers(&central_servers) {
            log::warn!("Failed to persist discovered MCP servers to central store: {}", e);
        }
    }

    McpInventory {
        servers: central_servers,
        harnesses,
        harness_bindings,
        profiles: get_mcp_profiles(),
    }
}

/// Validate that a server ID is safe to use as a JSON object key and as a
/// filesystem-adjacent identifier (prevents path traversal / injection).
pub fn validate_server_id(id: &str) -> Result<(), String> {
    let id = id.trim();
    if id.is_empty() {
        return Err("Server ID cannot be empty".into());
    }
    if id.len() > 128 {
        return Err("Server ID is too long (maximum 128 characters)".into());
    }
    // Path separators and control characters are never valid in a config key.
    if id.contains('/') || id.contains('\\') || id.contains('\0')
        || id.chars().any(|c| c.is_control())
    {
        return Err("Server ID cannot contain path separators or control characters".into());
    }
    // Reject `..` path-traversal components explicitly.
    if id.split(['/', '\\']).any(|seg| seg == "..") {
        return Err("Server ID cannot contain path traversal sequences (e.g. '..')".into());
    }
    Ok(())
}

pub fn save_mcp_server(
    server: McpServerConfig,
    target_harnesses: Vec<String>,
) -> Result<McpInventory> {
    validate_server_id(&server.id).map_err(anyhow::Error::msg)?;

    let mut servers = load_central_mcp_servers();
    if let Some(existing) = servers.iter_mut().find(|s| s.id == server.id) {
        *existing = server.clone();
    } else {
        servers.push(server.clone());
    }
    save_central_mcp_servers(&servers)?;

    // Sync to selected target harnesses
    for adapter in HarnessAdapterDef::all() {
        if target_harnesses.contains(&adapter.key) && adapter.supports_standard_json {
            if let Some(path) = &adapter.config_path {
                let mut current = read_mcp_servers_from_json_config(path);
                if let Some(pos) = current.iter().position(|s| s.id == server.id) {
                    current[pos] = server.clone();
                } else {
                    current.push(server.clone());
                }
                let _ = write_mcp_servers_to_json_config(path, &current);
            }
        }
    }

    Ok(get_mcp_inventory())
}

pub fn delete_mcp_server(server_id: &str, target_harnesses: Vec<String>) -> Result<McpInventory> {
    let mut servers = load_central_mcp_servers();
    servers.retain(|s| s.id != server_id);
    save_central_mcp_servers(&servers)?;

    // Remove from specified target harnesses (skip if no harnesses specified — central-only delete)
    if !target_harnesses.is_empty() {
        for adapter in HarnessAdapterDef::all() {
            if target_harnesses.contains(&adapter.key) && adapter.supports_standard_json {
                if let Some(path) = &adapter.config_path {
                    if path.exists() {
                        let mut current = read_mcp_servers_from_json_config(path);
                        let initial_len = current.len();
                        current.retain(|s| s.id != server_id);
                        if current.len() != initial_len {
                            let _ = write_mcp_servers_to_json_config(path, &current);
                        }
                    }
                }
            }
        }
    }

    Ok(get_mcp_inventory())
}

pub fn toggle_mcp_server(
    server_id: &str,
    harness_key: &str,
    enabled: bool,
) -> Result<McpInventory> {
    if let Some(adapter) = HarnessAdapterDef::find(harness_key) {
        if !adapter.supports_standard_json {
            return Err(anyhow::anyhow!(
                "Harness '{}' uses a non-standard config format and cannot be toggled",
                harness_key
            ));
        }
        if let Some(path) = &adapter.config_path {
            let mut current = if path.exists() {
                read_mcp_servers_from_json_config(path)
            } else {
                vec![]
            };

            if let Some(srv) = current.iter_mut().find(|s| s.id == server_id) {
                // Server exists in harness — toggle its disabled flag or remove it
                if enabled {
                    srv.disabled = false;
                } else {
                    // When disabling, remove the server from the harness config entirely
                    current.retain(|s| s.id != server_id);
                }
                let _ = write_mcp_servers_to_json_config(path, &current);
            } else if enabled {
                // Server not in harness yet — add it from central store
                let central = load_central_mcp_servers();
                if let Some(srv) = central.into_iter().find(|s| s.id == server_id) {
                    current.push(McpServerConfig { disabled: false, ..srv });
                    let _ = write_mcp_servers_to_json_config(path, &current);
                }
            }
        }
    }

    Ok(get_mcp_inventory())
}

pub fn sync_all_mcp_servers(target_harnesses: Vec<String>) -> Result<McpInventory> {
    let central_servers = load_central_mcp_servers();

    for adapter in HarnessAdapterDef::all() {
        if target_harnesses.contains(&adapter.key) && adapter.supports_standard_json {
            if let Some(path) = &adapter.config_path {
                let _ = write_mcp_servers_to_json_config(path, &central_servers);
            }
        }
    }

    Ok(get_mcp_inventory())
}

pub fn get_static_presets() -> Vec<McpPreset> {
    vec![
        McpPreset {
            id: "github".into(),
            name: "GitHub MCP".into(),
            category: "Developer Tools".into(),
            description: "Integrate GitHub issues, PRs, contents, and workflow interactions into your AI agent.".into(),
            transport: McpTransport::Stdio,
            command: Some("npx".into()),
            args: vec!["-y".into(), "@modelcontextprotocol/server-github".into()],
            url: None,
            env: {
                let mut m = HashMap::new();
                m.insert("GITHUB_PERSONAL_ACCESS_TOKEN".into(), "".into());
                m
            },
            params: vec![McpPresetParam {
                name: "GITHUB_PERSONAL_ACCESS_TOKEN".into(),
                label: "GitHub Personal Access Token".into(),
                description: "Personal access token with repo permissions".into(),
                default_value: None,
                required: true,
                is_secret: true,
            }],
        },
        McpPreset {
            id: "postgres".into(),
            name: "PostgreSQL MCP".into(),
            category: "Database".into(),
            description: "Allows AI to query schema, inspect tables, and safely query Postgres databases.".into(),
            transport: McpTransport::Stdio,
            command: Some("npx".into()),
            args: vec!["-y".into(), "@modelcontextprotocol/server-postgres".into(), "postgresql://user:password@localhost:5432/dbname".into()],
            url: None,
            env: HashMap::new(),
            params: vec![McpPresetParam {
                name: "DB_URL".into(),
                label: "Database Connection String".into(),
                description: "Postgres connection string, e.g. postgresql://user:pass@localhost:5432/db".into(),
                default_value: Some("postgresql://postgres:postgres@localhost:5432/postgres".into()),
                required: true,
                is_secret: true,
            }],
        },
        McpPreset {
            id: "puppeteer".into(),
            name: "Puppeteer Browser Automation MCP".into(),
            category: "Web & Scraping".into(),
            description: "Automate browser navigation, screenshot generation, and web page inspection.".into(),
            transport: McpTransport::Stdio,
            command: Some("npx".into()),
            args: vec!["-y".into(), "@modelcontextprotocol/server-puppeteer".into()],
            url: None,
            env: HashMap::new(),
            params: vec![],
        },
        McpPreset {
            id: "fetch".into(),
            name: "Fetch Web Content MCP".into(),
            category: "Web & Scraping".into(),
            description: "Fetch and convert web pages to readable Markdown format for the agent.".into(),
            transport: McpTransport::Stdio,
            command: Some("uvx".into()),
            args: vec!["mcp-server-fetch".into()],
            url: None,
            env: HashMap::new(),
            params: vec![],
        },
        McpPreset {
            id: "memory".into(),
            name: "Knowledge Graph Memory MCP".into(),
            category: "Utility".into(),
            description: "Persistent graph-based memory storage for storing entity insights across sessions.".into(),
            transport: McpTransport::Stdio,
            command: Some("npx".into()),
            args: vec!["-y".into(), "@modelcontextprotocol/server-memory".into()],
            url: None,
            env: HashMap::new(),
            params: vec![],
        },
    ]
}

pub fn get_mcp_presets() -> Vec<McpPreset> {
    let mut presets = Vec::new();
    if let Ok(glama_servers) = crate::core::glama_api::fetch_glama_mcp_servers(None) {
        for g_server in glama_servers {
            let is_conn = g_server.is_connector();
            let cat = if is_conn { "MCP Connector" } else { "MCP Server" };

            presets.push(McpPreset {
                id: format!("glama-{}", g_server.id),
                name: g_server.name.clone(),
                category: cat.into(),
                description: g_server
                    .description
                    .unwrap_or_else(|| format!("{} from Glama Directory", cat)),
                transport: if is_conn {
                    McpTransport::Sse
                } else {
                    McpTransport::Stdio
                },
                command: if is_conn { None } else { Some("npx".into()) },
                args: if is_conn {
                    vec![]
                } else {
                    vec!["-y".into(), g_server.name]
                },
                url: g_server.url,
                env: HashMap::new(),
                params: vec![],
            });
        }
    }
    for static_p in get_static_presets() {
        if !presets.iter().any(|p| p.id == static_p.id) {
            presets.push(static_p);
        }
    }
    presets
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplaceMcpServer {
    pub id: String,
    pub name: String,
    pub author: String,
    pub category: String,
    pub description: String,
    pub repository_url: Option<String>,
    pub transport: McpTransport,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    pub env: HashMap<String, String>,
    pub params: Vec<McpPresetParam>,
    pub tags: Vec<String>,
    pub verified: bool,
    pub stars: Option<u32>,
    pub rating: Option<f32>,
    pub rating_count: Option<u32>,
}

pub fn get_curated_marketplace_servers() -> Vec<MarketplaceMcpServer> {
    get_static_presets()
        .into_iter()
        .map(|p| MarketplaceMcpServer {
            id: p.id.clone(),
            name: p.name,
            author: "Official / Community".into(),
            category: p.category,
            description: p.description,
            repository_url: None,
            transport: p.transport,
            command: p.command,
            args: p.args,
            url: p.url,
            env: p.env,
            params: p.params,
            tags: vec!["mcp".into(), "preset".into()],
            verified: true,
            stars: Some(100),
            rating: Some(4.8),
            rating_count: Some(50),
        })
        .collect()
}

pub fn fetch_mcp_marketplace_servers(
    query: Option<String>,
    category: Option<String>,
) -> Vec<MarketplaceMcpServer> {
    let mut servers = Vec::new();

    if let Ok(glama_servers) = crate::core::glama_api::fetch_glama_mcp_servers(query.as_deref()) {
        for g_server in glama_servers {
            let server_id = format!("glama-{}", g_server.id);
            let is_conn = g_server.is_connector();
            let cat = if is_conn { "MCP Connector" } else { "MCP Server" };

            let repo_url = g_server
                .repository
                .as_ref()
                .and_then(|r| r.url.clone())
                .or_else(|| g_server.url.clone());
            let author = g_server
                .namespace
                .clone()
                .filter(|n| !n.is_empty())
                .unwrap_or_else(|| "Glama Registry".into());

            let mut tags = vec!["mcp".into(), "glama".into()];
            if is_conn {
                tags.push("connector".into());
                tags.push("remote".into());
            } else {
                tags.push("server".into());
                tags.push("local".into());
            }

            servers.push(MarketplaceMcpServer {
                id: server_id,
                name: g_server.name.clone(),
                author,
                category: cat.into(),
                description: g_server
                    .description
                    .clone()
                    .unwrap_or_else(|| format!("{} from Glama Directory", cat)),
                repository_url: repo_url,
                transport: if is_conn {
                    McpTransport::Sse
                } else {
                    McpTransport::Stdio
                },
                command: if is_conn { None } else { Some("npx".into()) },
                args: if is_conn {
                    vec![]
                } else {
                    vec!["-y".into(), g_server.name.clone()]
                },
                url: if is_conn { g_server.url.clone() } else { None },
                env: HashMap::new(),
                params: vec![],
                tags,
                verified: true,
                stars: None,
                rating: None,
                rating_count: None,
            });
        }
    }

    for curated in get_curated_marketplace_servers() {
        if !servers.iter().any(|s| s.id == curated.id) {
            servers.push(curated);
        }
    }

    // Query scoring & filtering
    if let Some(ref q) = query {
        let q_clean = q.trim().to_lowercase();
        if !q_clean.is_empty() {
            let tokens: Vec<String> = q_clean
                .split(|c: char| !c.is_alphanumeric())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect();

            let mut scored: Vec<(i32, MarketplaceMcpServer)> = Vec::new();

            for s in servers {
                let s_id = s.id.to_lowercase();
                let s_name = s.name.to_lowercase();
                let s_desc = s.description.to_lowercase();
                let s_author = s.author.to_lowercase();
                let s_repo = s.repository_url.as_deref().unwrap_or("").to_lowercase();
                let s_tags = s.tags.join(" ").to_lowercase();

                let mut score = 0i32;

                // Exact match on ID or Name
                if s_id == q_clean || s_name == q_clean {
                    score += 100;
                } else if s_id.contains(&q_clean) || s_name.contains(&q_clean) {
                    score += 60;
                } else if s_desc.contains(&q_clean) || s_repo.contains(&q_clean) || s_tags.contains(&q_clean) {
                    score += 30;
                } else {
                    let mut matched_token_count = 0;
                    for t in &tokens {
                        if t.len() > 1 {
                            if s_id.contains(t) || s_name.contains(t) || s_desc.contains(t) || s_author.contains(t) || s_tags.contains(t) {
                                matched_token_count += 1;
                            }
                        }
                    }
                    if matched_token_count > 0 {
                        score += matched_token_count * 15;
                    } else if s.id.starts_with("glama-") {
                        // Server returned by Glama API endpoint search
                        score += 5;
                    }
                }

                if score > 0 {
                    scored.push((score, s));
                }
            }

            scored.sort_by(|a, b| {
                b.0.cmp(&a.0)
                    .then_with(|| b.1.stars.unwrap_or(0).cmp(&a.1.stars.unwrap_or(0)))
                    .then_with(|| a.1.name.to_lowercase().cmp(&b.1.name.to_lowercase()))
            });
            servers = scored.into_iter().map(|(_, s)| s).collect();
        } else {
            servers.sort_by(|a, b| {
                b.stars.unwrap_or(0).cmp(&a.stars.unwrap_or(0))
                    .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            });
        }
    } else {
        servers.sort_by(|a, b| {
            b.stars.unwrap_or(0).cmp(&a.stars.unwrap_or(0))
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
    }

    if let Some(ref cat) = category {
        let cat_lower = cat.to_lowercase();
        if cat_lower != "all" && !cat_lower.trim().is_empty() {
            servers.retain(|s| {
                let s_cat = s.category.to_lowercase();
                s_cat == cat_lower
                    || s_cat.contains(&cat_lower)
                    || cat_lower.contains(&s_cat)
                    || (cat_lower.contains("connector") && s_cat.contains("connector"))
                    || (cat_lower.contains("server") && s_cat.contains("server"))
            });
        }
    }

    servers
}

pub fn get_harness_config_content(harness_key: &str) -> Result<HarnessConfigContent, String> {
    let adapter = HarnessAdapterDef::find(harness_key)
        .ok_or_else(|| format!("Unknown harness key: {}", harness_key))?;

    match &adapter.config_path {
        Some(path) => {
            let config_path_str = path.to_string_lossy().to_string();
            if path.exists() {
                let content = fs::read_to_string(path)
                    .map_err(|e| format!("Failed to read {}: {}", config_path_str, e))?;
                Ok(HarnessConfigContent {
                    harness_key: harness_key.to_string(),
                    display_name: adapter.display_name.clone(),
                    config_path: Some(config_path_str),
                    exists: true,
                    content,
                })
            } else {
                Ok(HarnessConfigContent {
                    harness_key: harness_key.to_string(),
                    display_name: adapter.display_name.clone(),
                    config_path: Some(config_path_str),
                    exists: false,
                    content: "{\n  \"mcpServers\": {}\n}".to_string(),
                })
            }
        }
        None => Ok(HarnessConfigContent {
            harness_key: harness_key.to_string(),
            display_name: adapter.display_name.clone(),
            config_path: None,
            exists: false,
            content: "{\n  \"mcpServers\": {}\n}".to_string(),
        }),
    }
}

pub fn save_harness_config_content(
    harness_key: &str,
    content: &str,
) -> Result<McpInventory, String> {
    let adapter = HarnessAdapterDef::find(harness_key)
        .ok_or_else(|| format!("Unknown harness key: {}", harness_key))?;

    let path = adapter
        .config_path
        .as_ref()
        .ok_or_else(|| format!("Could not resolve config path for harness: {}", harness_key))?;

    // Validate JSON structure if it's a JSON content
    let _: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| format!("Invalid JSON format: {}", e))?;

    // Create automatic backup before writing
    if path.exists() {
        let _ = backup_harness_config(harness_key);
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory {}: {}", parent.display(), e))?;
    }

    fs::write(path, content)
        .map_err(|e| format!("Failed to write config file {}: {}", path.display(), e))?;

    Ok(get_mcp_inventory())
}

pub fn get_mcp_profiles() -> Vec<McpProfile> {
    vec![
        McpProfile {
            id: "full_stack".into(),
            name: "Full-Stack Web Dev".into(),
            description: Some("GitHub, Postgres, Puppeteer, and Fetch MCP servers".into()),
            server_ids: vec!["github".into(), "postgres".into(), "puppeteer".into(), "fetch".into()],
        },
        McpProfile {
            id: "ai_research".into(),
            name: "AI & Knowledge".into(),
            description: Some("Knowledge Graph Memory, Obsidian Vault, and Slack MCP servers".into()),
            server_ids: vec!["memory".into(), "obsidian".into(), "slack".into()],
        },
        McpProfile {
            id: "devops".into(),
            name: "Cloud & DevOps".into(),
            description: Some("Docker Container, Cloudflare, Sentry, and Redis MCP servers".into()),
            server_ids: vec!["docker".into(), "cloudflare".into(), "sentry".into(), "redis".into()],
        },
        McpProfile {
            id: "data_eng".into(),
            name: "Data Engineering".into(),
            description: Some("PostgreSQL, SQLite, and Redis MCP servers".into()),
            server_ids: vec!["postgres".into(), "sqlite".into(), "redis".into()],
        },
    ]
}

pub fn activate_mcp_profile(profile_id: &str, target_harnesses: &[String]) -> Result<McpInventory> {
    let profiles = get_mcp_profiles();
    let profile = profiles
        .iter()
        .find(|p| p.id == profile_id)
        .context(format!("Profile '{}' not found", profile_id))?;

    let central_servers = load_central_mcp_servers();
    let active_servers: Vec<McpServerConfig> = central_servers
        .into_iter()
        .filter(|s| profile.server_ids.contains(&s.id))
        .collect();

    for adapter in HarnessAdapterDef::all() {
        if target_harnesses.contains(&adapter.key) && adapter.supports_standard_json {
            if let Some(path) = &adapter.config_path {
                let _ = write_mcp_servers_to_json_config(path, &active_servers);
            }
        }
    }

    Ok(get_mcp_inventory())
}

pub fn backup_harness_config(harness_key: &str) -> Result<McpBackupEntry> {
    let adapter = HarnessAdapterDef::find(harness_key)
        .context(format!("Harness '{}' not supported", harness_key))?;

    let path = adapter
        .config_path
        .as_ref()
        .context("Harness config path not available")?;
    if !path.exists() {
        return Err(anyhow::anyhow!("Configuration file does not exist for harness"));
    }

    let parent = path.parent().context("Invalid config path parent")?;
    let backup_dir = parent.join(".mcp_backups");
    fs::create_dir_all(&backup_dir)?;

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let file_name = path.file_name().and_then(|f| f.to_str()).unwrap_or("mcp.json");
    let backup_file = backup_dir.join(format!("{}.bak.{}", file_name, timestamp));

    fs::copy(path, &backup_file)?;

    Ok(McpBackupEntry {
        harness_key: harness_key.to_string(),
        backup_path: backup_file.to_string_lossy().to_string(),
        timestamp,
    })
}

pub fn get_harness_backups(harness_key: &str) -> Vec<McpBackupEntry> {
    let adapter = match HarnessAdapterDef::find(harness_key) {
        Some(a) => a,
        None => return vec![],
    };

    let path = match &adapter.config_path {
        Some(p) => p,
        None => return vec![],
    };

    let parent = match path.parent() {
        Some(p) => p,
        None => return vec![],
    };

    let backup_dir = parent.join(".mcp_backups");
    if !backup_dir.exists() {
        return vec![];
    }

    let mut entries = Vec::new();
    if let Ok(dir_entries) = fs::read_dir(backup_dir) {
        for entry in dir_entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                let name = p.file_name().and_then(|f| f.to_str()).unwrap_or_default();
                let timestamp = name.split(".bak.").nth(1).unwrap_or("unknown").to_string();
                entries.push(McpBackupEntry {
                    harness_key: harness_key.to_string(),
                    backup_path: p.to_string_lossy().to_string(),
                    timestamp,
                });
            }
        }
    }

    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    entries
}

pub fn restore_harness_config(harness_key: &str, backup_path: &str) -> Result<McpInventory> {
    let adapter = HarnessAdapterDef::find(harness_key)
        .context(format!("Harness '{}' not supported", harness_key))?;

    let path = adapter
        .config_path
        .as_ref()
        .context("Harness config path not available")?;
    let backup_file = PathBuf::from(backup_path);

    if !backup_file.exists() {
        return Err(anyhow::anyhow!("Backup file does not exist: {}", backup_path));
    }

    // Validate that the backup file is within the expected .mcp_backups directory
    // to prevent path traversal attacks.
    if let Some(parent) = path.parent() {
        let expected_backup_dir = parent.join(".mcp_backups");
        let canonical_backup = backup_file.canonicalize()
            .context("Failed to canonicalize backup path")?;
        let canonical_dir = expected_backup_dir.canonicalize()
            .unwrap_or_else(|_| expected_backup_dir.clone());
        if !canonical_backup.starts_with(&canonical_dir) {
            return Err(anyhow::anyhow!(
                "Backup path '{}' is not within the expected backup directory",
                backup_path
            ));
        }
    }

    fs::copy(backup_file, path)?;
    Ok(get_mcp_inventory())
}

fn get_git_sources_path() -> PathBuf {
    get_central_mcp_store_dir().join("git_sources.json")
}

pub fn get_git_mcp_sources() -> Vec<McpGitProfileSource> {
    let file = get_git_sources_path();
    let mut sources: Vec<McpGitProfileSource> = if file.exists() {
        let content = fs::read_to_string(&file).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        vec![]
    };
    if sources.is_empty() {
        sources.push(McpGitProfileSource {
            id: "official_community".into(),
            name: "Official Community Profiles".into(),
            repo_url: "https://github.com/modelcontextprotocol/servers".into(),
            branch: Some("main".into()),
            last_synced: Some(chrono::Utc::now().format("%Y-%m-%d %H:%M").to_string()),
        });
    }
    sources
}

pub fn add_git_mcp_source(
    name: String,
    repo_url: String,
    branch: Option<String>,
) -> Result<Vec<McpGitProfileSource>> {
    let mut sources = get_git_mcp_sources();
    let id = format!("git_{}", chrono::Utc::now().timestamp());
    sources.push(McpGitProfileSource {
        id,
        name,
        repo_url,
        branch,
        last_synced: Some(chrono::Utc::now().format("%Y-%m-%d %H:%M").to_string()),
    });

    let dir = get_central_mcp_store_dir();
    fs::create_dir_all(&dir)?;
    let content = serde_json::to_string_pretty(&sources)?;
    fs::write(get_git_sources_path(), content)?;

    Ok(sources)
}

/// Sync git MCP profile sources.
///
/// NOTE: This is currently a stub — it only updates the `last_synced` timestamps
/// without actually cloning or pulling server definitions from the repositories.
/// Full git-driven profile sync will be implemented in a future iteration.
pub fn sync_git_mcp_sources() -> Result<Vec<McpGitProfileSource>> {
    let mut sources = get_git_mcp_sources();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M").to_string();
    for s in &mut sources {
        s.last_synced = Some(now.clone());
    }

    let dir = get_central_mcp_store_dir();
    fs::create_dir_all(&dir)?;
    let content = serde_json::to_string_pretty(&sources)?;
    fs::write(get_git_sources_path(), content)?;

    Ok(sources)
}

pub fn delete_git_mcp_source(source_id: &str) -> Result<Vec<McpGitProfileSource>> {
    let mut sources = get_git_mcp_sources();
    let initial_len = sources.len();
    sources.retain(|s| s.id != source_id);
    if sources.len() == initial_len {
        return Err(anyhow::anyhow!("Git MCP source '{}' not found", source_id));
    }

    let dir = get_central_mcp_store_dir();
    fs::create_dir_all(&dir)?;
    let content = serde_json::to_string_pretty(&sources)?;
    fs::write(get_git_sources_path(), content)?;

    Ok(sources)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_mcp_transport_default_and_serde() {
        assert_eq!(McpTransport::default(), McpTransport::Stdio);

        let json_stdio = serde_json::to_string(&McpTransport::Stdio).unwrap();
        assert_eq!(json_stdio, "\"stdio\"");

        let json_sse = serde_json::to_string(&McpTransport::Sse).unwrap();
        assert_eq!(json_sse, "\"sse\"");

        let parsed: McpTransport = serde_json::from_str("\"websocket\"").unwrap();
        assert_eq!(parsed, McpTransport::Websocket);
    }

    #[test]
    fn test_read_and_write_json_config() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("mcp_test.json");

        let servers = vec![
            McpServerConfig {
                id: "github".into(),
                name: "GitHub MCP".into(),
                transport: McpTransport::Stdio,
                scope: McpScope::Global,
                command: Some("npx".into()),
                args: vec!["-y".into(), "@modelcontextprotocol/server-github".into()],
                url: None,
                env: {
                    let mut m = HashMap::new();
                    m.insert("GITHUB_PERSONAL_ACCESS_TOKEN".into(), "secret123".into());
                    m
                },
                description: Some("GitHub server".into()),
                disabled: false,
            },
            McpServerConfig {
                id: "custom_sse".into(),
                name: "Custom SSE Server".into(),
                transport: McpTransport::Sse,
                scope: McpScope::Global,
                command: None,
                args: vec![],
                url: Some("http://localhost:8080/sse".into()),
                env: HashMap::new(),
                description: None,
                disabled: true,
            },
        ];

        write_mcp_servers_to_json_config(&file_path, &servers).unwrap();

        let read_back = read_mcp_servers_from_json_config(&file_path);
        assert_eq!(read_back.len(), 2);

        let gh = read_back.iter().find(|s| s.id == "github").unwrap();
        assert_eq!(gh.command.as_deref(), Some("npx"));
        assert_eq!(
            gh.env.get("GITHUB_PERSONAL_ACCESS_TOKEN").map(String::as_str),
            Some("secret123")
        );
        assert!(!gh.disabled);

        let sse = read_back.iter().find(|s| s.id == "custom_sse").unwrap();
        assert_eq!(sse.transport, McpTransport::Sse);
        assert_eq!(sse.url.as_deref(), Some("http://localhost:8080/sse"));
        assert!(sse.disabled);
    }

    #[test]
    fn test_harness_adapter_defs() {
        let adapters = HarnessAdapterDef::all();
        assert!(adapters.len() >= 8);
        let keys: Vec<&str> = adapters.iter().map(|a| a.key.as_str()).collect();
        assert!(keys.contains(&"cursor"));
        assert!(keys.contains(&"claude_code"));
        assert!(keys.contains(&"windsurf"));
        assert!(keys.contains(&"cline"));
        assert!(keys.contains(&"roo_code"));
        assert!(keys.contains(&"antigravity"));
        assert!(keys.contains(&"zed"));
        assert!(keys.contains(&"goose"));
    }

    #[test]
    fn test_get_mcp_presets() {
        let presets = get_mcp_presets();
        assert!(!presets.is_empty());
        let ids: Vec<&str> = presets.iter().map(|p| p.id.as_str()).collect();
        assert!(ids.contains(&"github"));
        assert!(ids.contains(&"postgres"));
        assert!(ids.contains(&"puppeteer"));
        assert!(ids.contains(&"fetch"));
        assert!(ids.contains(&"memory"));
    }

    #[test]
    fn test_fetch_mcp_marketplace_servers_filtering() {
        let all_servers = fetch_mcp_marketplace_servers(None, None);
        assert!(!all_servers.is_empty());

        let github_results = fetch_mcp_marketplace_servers(Some("github".into()), None);
        assert!(!github_results.is_empty());
        assert!(github_results
            .iter()
            .any(|s| s.id.contains("github") || s.name.to_lowercase().contains("github")));

        let db_results = fetch_mcp_marketplace_servers(None, Some("Database".into()));
        assert!(!db_results.is_empty());
        assert!(db_results
            .iter()
            .all(|s| s.category.eq_ignore_ascii_case("database")));
    }

    #[test]
    fn test_expand_env_vars() {
        let mut custom_env = HashMap::new();
        custom_env.insert("CUSTOM_KEY".into(), "my_secret_token".into());

        let input = "Bearer ${CUSTOM_KEY} or ${env:CUSTOM_KEY} with ${NON_EXISTENT}";
        let expanded = expand_env_vars(input, &custom_env);
        assert_eq!(expanded, "Bearer my_secret_token or my_secret_token with ${NON_EXISTENT}");
    }

    #[test]
    fn test_expand_env_vars_windows_percent() {
        let mut custom_env = HashMap::new();
        custom_env.insert("PROJECT_ROOT".into(), "C:/projects".into());

        // %VAR% expansion with known var
        assert_eq!(
            expand_env_vars("%PROJECT_ROOT%/data", &custom_env),
            "C:/projects/data"
        );
        // Unknown var stays untouched
        assert_eq!(
            expand_env_vars("%MISSING_VAR%/x", &custom_env),
            "%MISSING_VAR%/x"
        );
        // Literal %% is preserved
        assert_eq!(expand_env_vars("100%%sure", &custom_env), "100%%sure");
        // Unclosed % is left untouched
        assert_eq!(expand_env_vars("20% of 80", &custom_env), "20% of 80");
        // Mixed ${VAR} and %VAR% both expand
        let mixed = "${PROJECT_ROOT} and %PROJECT_ROOT%";
        assert_eq!(expand_env_vars(mixed, &custom_env), "C:/projects and C:/projects");
    }

    #[test]
    fn test_validate_server_id() {
        assert!(validate_server_id("github").is_ok());
        assert!(validate_server_id("my-server_2").is_ok());
        assert!(validate_server_id("").is_err());
        assert!(validate_server_id("   ").is_err());
        assert!(validate_server_id("a/b").is_err());
        assert!(validate_server_id("a\\b").is_err());
        assert!(validate_server_id("..\\..\\etc\\passwd").is_err());
        assert!(validate_server_id("../../etc/passwd").is_err());
        assert!(validate_server_id(&"x".repeat(200)).is_err());
    }

    #[test]
    fn test_validate_mcp_server() {
        let stdio_server = McpServerConfig {
            id: "test".into(),
            name: "Test Stdio".into(),
            transport: McpTransport::Stdio,
            scope: McpScope::Global,
            command: Some("npx".into()),
            args: vec![],
            url: None,
            env: HashMap::new(),
            description: None,
            disabled: false,
        };
        let report = validate_mcp_server(&stdio_server);
        assert!(report.valid);
        assert!(report.resolved_command.is_some());

        let sse_server = McpServerConfig {
            id: "sse_test".into(),
            name: "Test SSE".into(),
            transport: McpTransport::Sse,
            scope: McpScope::Global,
            command: None,
            args: vec![],
            url: Some("http://localhost:8000/sse".into()),
            env: HashMap::new(),
            description: None,
            disabled: false,
        };
        let sse_report = validate_mcp_server(&sse_server);
        assert!(sse_report.valid);

        let invalid_sse = McpServerConfig {
            id: "bad_sse".into(),
            name: "Bad SSE".into(),
            transport: McpTransport::Sse,
            scope: McpScope::Global,
            command: None,
            args: vec![],
            url: Some("invalid_url".into()),
            env: HashMap::new(),
            description: None,
            disabled: false,
        };
        let bad_report = validate_mcp_server(&invalid_sse);
        assert!(!bad_report.valid);
        assert!(bad_report.error.is_some());
    }

    #[test]
    fn test_validate_websocket_transport() {
        let ws_server = McpServerConfig {
            id: "ws_test".into(),
            name: "Test WebSocket".into(),
            transport: McpTransport::Websocket,
            scope: McpScope::Global,
            command: None,
            args: vec![],
            url: Some("ws://localhost:8080/mcp".into()),
            env: HashMap::new(),
            description: None,
            disabled: false,
        };
        assert!(validate_mcp_server(&ws_server).valid);

        let wss_server = McpServerConfig {
            id: "wss_test".into(),
            name: "Test Secure WebSocket".into(),
            transport: McpTransport::Websocket,
            scope: McpScope::Global,
            command: None,
            args: vec![],
            url: Some("wss://example.com/mcp".into()),
            env: HashMap::new(),
            description: None,
            disabled: false,
        };
        assert!(validate_mcp_server(&wss_server).valid);

        // Websocket server with a non-ws URL is invalid
        let invalid_ws = McpServerConfig {
            id: "bad_ws".into(),
            name: "Bad WebSocket".into(),
            transport: McpTransport::Websocket,
            scope: McpScope::Global,
            command: None,
            args: vec![],
            url: Some("not-a-url".into()),
            env: HashMap::new(),
            description: None,
            disabled: false,
        };
        assert!(!validate_mcp_server(&invalid_ws).valid);

        // Websocket server missing a URL is invalid
        let missing_url = McpServerConfig {
            id: "no_url_ws".into(),
            name: "Missing URL WebSocket".into(),
            transport: McpTransport::Websocket,
            scope: McpScope::Global,
            command: None,
            args: vec![],
            url: None,
            env: HashMap::new(),
            description: None,
            disabled: false,
        };
        assert!(!validate_mcp_server(&missing_url).valid);
    }

    #[test]
    fn test_mcp_scope_serde() {
        assert_eq!(McpScope::default(), McpScope::Global);

        let json_global = serde_json::to_string(&McpScope::Global).unwrap();
        assert_eq!(json_global, "\"global\"");

        let json_ws = serde_json::to_string(&McpScope::Workspace).unwrap();
        assert_eq!(json_ws, "\"workspace\"");

        let parsed: McpScope = serde_json::from_str("\"workspace\"").unwrap();
        assert_eq!(parsed, McpScope::Workspace);
    }

    #[test]
    fn test_ping_mcp_server() {
        let valid_stdio = McpServerConfig {
            id: "cmd_ping".into(),
            name: "Cmd Ping".into(),
            transport: McpTransport::Stdio,
            scope: McpScope::Global,
            command: Some("npx".into()),
            args: vec![],
            url: None,
            env: HashMap::new(),
            description: None,
            disabled: false,
        };
        let ping_res = ping_mcp_server(&valid_stdio);
        assert!(ping_res.online);

        let invalid_cmd = McpServerConfig {
            id: "bad_ping".into(),
            name: "Bad Ping".into(),
            transport: McpTransport::Stdio,
            scope: McpScope::Global,
            command: Some("non_existent_binary_xyz_123".into()),
            args: vec![],
            url: None,
            env: HashMap::new(),
            description: None,
            disabled: false,
        };
        let bad_ping_res = ping_mcp_server(&invalid_cmd);
        assert!(!bad_ping_res.online);

        let invalid_sse = McpServerConfig {
            id: "sse_ping".into(),
            name: "SSE Ping".into(),
            transport: McpTransport::Sse,
            scope: McpScope::Global,
            command: None,
            args: vec![],
            url: Some("http://127.0.0.1:59999/non_existent".into()),
            env: HashMap::new(),
            description: None,
            disabled: false,
        };
        let sse_ping_res = ping_mcp_server(&invalid_sse);
        assert!(!sse_ping_res.online);
    }

    #[test]
    fn test_mcp_profiles_and_auto_backup() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("mcp.json");

        let initial_servers = vec![McpServerConfig {
            id: "github".into(),
            name: "GitHub MCP".into(),
            transport: McpTransport::Stdio,
            scope: McpScope::Global,
            command: Some("npx".into()),
            args: vec!["-y".into(), "@modelcontextprotocol/server-github".into()],
            url: None,
            env: HashMap::new(),
            description: None,
            disabled: false,
        }];

        // First write creates the config
        write_mcp_servers_to_json_config(&file_path, &initial_servers).unwrap();
        assert!(file_path.exists());

        // Second write triggers automatic backup in .mcp_backups
        let updated_servers = vec![];
        write_mcp_servers_to_json_config(&file_path, &updated_servers).unwrap();

        let backup_dir = dir.path().join(".mcp_backups");
        assert!(backup_dir.exists());

        let backup_files: Vec<_> = fs::read_dir(backup_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert!(!backup_files.is_empty());

        let profiles = get_mcp_profiles();
        assert!(profiles.len() >= 4);
        assert!(profiles.iter().any(|p| p.id == "full_stack"));
    }

    #[test]
    fn test_restore_and_bulk_toggle() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("mcp.json");

        let s1 = McpServerConfig {
            id: "s1".into(),
            name: "S1".into(),
            transport: McpTransport::Stdio,
            scope: McpScope::Global,
            command: Some("npx".into()),
            args: vec![],
            url: None,
            env: HashMap::new(),
            description: None,
            disabled: false,
        };

        write_mcp_servers_to_json_config(&file_path, &vec![s1.clone()]).unwrap();
        let initial = read_mcp_servers_from_json_config(&file_path);
        assert_eq!(initial.len(), 1);

        // Update config to disable server
        let mut disabled_s1 = s1.clone();
        disabled_s1.disabled = true;
        write_mcp_servers_to_json_config(&file_path, &vec![disabled_s1]).unwrap();

        let updated = read_mcp_servers_from_json_config(&file_path);
        assert!(updated[0].disabled);

        // Backup directory exists
        let backup_dir = dir.path().join(".mcp_backups");
        assert!(backup_dir.exists());

        let backups: Vec<_> = fs::read_dir(backup_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert!(!backups.is_empty());

        // Restore from backup file
        let backup_file = backups[0].path();
        fs::copy(backup_file, &file_path).unwrap();

        let restored = read_mcp_servers_from_json_config(&file_path);
        assert!(!restored[0].disabled);
    }

    #[test]
    fn test_git_mcp_sources() {
        let sources = get_git_mcp_sources();
        assert!(!sources.is_empty());
        assert!(sources.iter().any(|s| s.repo_url.contains("modelcontextprotocol")));
    }

    #[test]
    fn test_add_and_sync_git_mcp_sources() {
        let added = add_git_mcp_source(
            "Team Profiles".into(),
            "https://github.com/my-org/mcp-profiles".into(),
            Some("main".into()),
        ).unwrap();

        assert!(added.iter().any(|s| s.name == "Team Profiles"));

        let synced = sync_git_mcp_sources().unwrap();
        assert!(synced.iter().all(|s| s.last_synced.is_some()));
    }

    #[test]
    fn test_activate_mcp_profile() {
        let profiles = get_mcp_profiles();
        assert!(!profiles.is_empty());

        let full_stack = profiles.iter().find(|p| p.id == "full_stack").unwrap();
        assert_eq!(full_stack.server_ids.len(), 4);
        assert!(full_stack.server_ids.contains(&"github".to_string()));
    }
}








