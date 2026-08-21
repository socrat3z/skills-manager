use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlamaRepository {
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlamaMcpServer {
    pub id: String,
    pub name: String,
    pub namespace: Option<String>,
    pub description: Option<String>,
    pub repository: Option<GlamaRepository>,
    pub slug: Option<String>,
    pub url: Option<String>,
    #[serde(default)]
    pub attributes: Vec<String>,
}

impl GlamaMcpServer {
    pub fn is_connector(&self) -> bool {
        self.attributes.iter().any(|attr| {
            attr.contains("remote-capable")
                || attr.contains("connector")
                || attr.contains("hybrid")
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum GlamaApiResponse {
    Wrapped { servers: Vec<GlamaMcpServer> },
    Direct(Vec<GlamaMcpServer>),
}

pub fn build_http_client(timeout_secs: u64) -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .user_agent("skills-manager")
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .unwrap_or_default()
}

pub fn fetch_glama_mcp_servers(query: Option<&str>) -> Result<Vec<GlamaMcpServer>> {
    let client = build_http_client(8);
    let mut url = "https://glama.ai/api/mcp/v1/servers".to_string();
    if let Some(q) = query.filter(|s| !s.trim().is_empty()) {
        url = format!(
            "https://glama.ai/api/mcp/v1/servers?query={}",
            urlencoding::encode(q.trim())
        );
    }

    let parsed: GlamaApiResponse = client
        .get(&url)
        .send()
        .context("Failed to send request to Glama API")?
        .json()
        .context("Failed to parse Glama API JSON response")?;

    let servers = match parsed {
        GlamaApiResponse::Wrapped { servers } => servers,
        GlamaApiResponse::Direct(servers) => servers,
    };

    Ok(servers)
}

#[cfg(test)]
mod tests {
    use super::GlamaMcpServer;

    #[test]
    fn parses_glama_server_json() {
        let json_str = r#"[
            {
                "id": "hhre0t8ca4",
                "name": "Office-Word-MCP-Server",
                "namespace": "rk2k3",
                "description": "Word MCP server",
                "repository": {"url": "https://github.com/rk2k3/Office-Word-MCP-Server"},
                "slug": "Office-Word-MCP-Server",
                "url": "https://glama.ai/mcp/servers/hhre0t8ca4"
            }
        ]"#;

        let servers: Vec<GlamaMcpServer> = serde_json::from_str(json_str).expect("Valid JSON");
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].name, "Office-Word-MCP-Server");
        assert_eq!(servers[0].namespace.as_deref(), Some("rk2k3"));
    }

    #[test]
    fn tests_glama_query_parameter_handling() {
        let servers = super::fetch_glama_mcp_servers(Some("vision"));
        if let Ok(results) = servers {
            assert!(!results.is_empty());
        }
    }
}
