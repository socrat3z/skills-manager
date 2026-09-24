use crate::core::tool_adapters::ToolAdapter;
use std::path::PathBuf;

pub trait ToolAdapterMcpExt {
    fn mcp_supports_standard_json(&self) -> bool;
    fn mcp_config_path(&self) -> Option<PathBuf>;
}

impl ToolAdapterMcpExt for ToolAdapter {
    fn mcp_supports_standard_json(&self) -> bool {
        match self.key.as_str() {
            "zed" | "goose" => false,
            _ => true,
        }
    }

    fn mcp_config_path(&self) -> Option<PathBuf> {
        let home = dirs::home_dir();
        let config_dir = dirs::config_dir();

        match self.key.as_str() {
            "cline" => {
                #[cfg(target_os = "windows")]
                { config_dir.map(|p| p.join("Code").join("User").join("globalStorage").join("saoudrizwan.claude-dev").join("settings").join("cline_mcp_settings.json")) }
                #[cfg(target_os = "macos")]
                { home.map(|p| p.join("Library").join("Application Support").join("Code").join("User").join("globalStorage").join("saoudrizwan.claude-dev").join("settings").join("cline_mcp_settings.json")) }
                #[cfg(not(any(target_os = "windows", target_os = "macos")))]
                { config_dir.map(|p| p.join("Code").join("User").join("globalStorage").join("saoudrizwan.claude-dev").join("settings").join("cline_mcp_settings.json")) }
            }
            "roo_cline" | "roo_code" => {
                #[cfg(target_os = "windows")]
                { config_dir.map(|p| p.join("Code").join("User").join("globalStorage").join("rooveterinaryinc.roo-cline").join("settings").join("cline_mcp_settings.json")) }
                #[cfg(target_os = "macos")]
                { home.map(|p| p.join("Library").join("Application Support").join("Code").join("User").join("globalStorage").join("rooveterinaryinc.roo-cline").join("settings").join("cline_mcp_settings.json")) }
                #[cfg(not(any(target_os = "windows", target_os = "macos")))]
                { config_dir.map(|p| p.join("Code").join("User").join("globalStorage").join("rooveterinaryinc.roo-cline").join("settings").join("cline_mcp_settings.json")) }
            }
            "antigravity" => {
                if let Some(h) = &home {
                    let candidates = vec![
                        h.join(".gemini").join("config").join("mcp_config.json"),
                        h.join(".gemini").join("antigravity").join("mcp_config.json"),
                        h.join(".gemini").join("settings").join("mcp.json"),
                    ];
                    for p in &candidates {
                        if p.exists() {
                            return Some(p.clone());
                        }
                    }
                    Some(candidates[0].clone())
                } else {
                    None
                }
            }
            "zed" => config_dir.map(|p| p.join("zed").join("settings.json")),
            "goose" => config_dir.map(|p| p.join("goose").join("config.yaml")),
            "claude_code" => {
                if let Some(h) = &home {
                    let candidates = vec![
                        h.join(".claude").join("mcp.json"),
                        h.join(".claude.json"),
                    ];
                    for p in &candidates {
                        if p.exists() {
                            return Some(p.clone());
                        }
                    }
                    Some(candidates[0].clone())
                } else {
                    None
                }
            }
            "opencode" => {
                if let Some(cfg) = &config_dir {
                    let p = cfg.join("opencode").join("mcp.json");
                    if p.exists() {
                        return Some(p);
                    }
                }
                home.map(|p| p.join(".opencode").join("mcp.json"))
            }
            "kilo_code" => {
                #[cfg(target_os = "windows")]
                { config_dir.map(|p| p.join("Code").join("User").join("globalStorage").join("kilo.kilo-code").join("settings").join("cline_mcp_settings.json")) }
                #[cfg(target_os = "macos")]
                { home.map(|p| p.join("Library").join("Application Support").join("Code").join("User").join("globalStorage").join("kilo.kilo-code").join("settings").join("cline_mcp_settings.json")) }
                #[cfg(not(any(target_os = "windows", target_os = "macos")))]
                { config_dir.map(|p| p.join("Code").join("User").join("globalStorage").join("kilo.kilo-code").join("settings").join("cline_mcp_settings.json")) }
            }
            _ => {
                if !self.relative_detect_dir.is_empty() {
                    if let Some(h) = &home {
                        let mcp_config_json = h.join(&self.relative_detect_dir).join("mcp_config.json");
                        if mcp_config_json.exists() {
                            Some(mcp_config_json)
                        } else {
                            Some(h.join(&self.relative_detect_dir).join("mcp.json"))
                        }
                    } else {
                        None
                    }
                } else if let Some(override_dir) = &self.override_skills_dir {
                    let path = PathBuf::from(override_dir);
                    path.parent().map(|p| p.join("mcp.json"))
                } else {
                    None
                }
            }
        }
    }
}
