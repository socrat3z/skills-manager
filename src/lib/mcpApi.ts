import { invoke } from "@tauri-apps/api/core";

export type McpTransport = "stdio" | "sse" | "websocket";
export type McpScope = "global" | "workspace";

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransport;
  scope?: McpScope;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  description?: string;
  disabled?: boolean;
}

export interface McpHarnessInfo {
  key: string;
  display_name: string;
  config_path: string;
  installed: boolean;
  server_count: number;
  server_ids: string[];
}

export interface McpPresetParam {
  name: string;
  label: string;
  description: string;
  default_value: string | null;
  required: boolean;
  is_secret: boolean;
}

export interface McpPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  params: McpPresetParam[];
}

export interface McpProfile {
  id: string;
  name: string;
  description?: string;
  server_ids: string[];
}

export interface McpBackupEntry {
  harness_key: string;
  backup_path: string;
  timestamp: string;
}

export interface McpInventory {
  servers: McpServerConfig[];
  harnesses: McpHarnessInfo[];
  harness_bindings: Record<string, string[]>;
  profiles: McpProfile[];
}

export interface MarketplaceMcpServer {
  id: string;
  name: string;
  author: string;
  category: string;
  description: string;
  repository_url?: string;
  transport: McpTransport;
  command?: string;
  args: string[];
  url?: string;
  env: Record<string, string>;
  params: McpPresetParam[];
  tags: string[];
  verified: boolean;
  stars?: number;
  rating?: number;
  rating_count?: number;
}

export interface McpValidationReport {
  valid: boolean;
  error?: string;
  resolved_command?: string;
}

export interface McpPingResult {
  online: boolean;
  latency_ms: number;
  message: string;
}

export interface McpGitProfileSource {
  id: string;
  name: string;
  repo_url: string;
  branch?: string;
  last_synced?: string;
}

export interface HarnessConfigContent {
  harness_key: string;
  display_name: string;
  config_path?: string;
  exists: boolean;
  content: string;
}

export const getMcpInventory = () =>
  invoke<McpInventory>("get_mcp_inventory");

export const saveMcpServer = (server: McpServerConfig, targetHarnesses: string[]) =>
  invoke<McpInventory>("save_mcp_server", { server, targetHarnesses });

export const deleteMcpServer = (serverId: string, targetHarnesses: string[]) =>
  invoke<McpInventory>("delete_mcp_server", { serverId, targetHarnesses });

export const toggleMcpServer = (serverId: string, harnessKey: string, enabled: boolean) =>
  invoke<McpInventory>("toggle_mcp_server", { serverId, harnessKey, enabled });

export const syncAllMcpServers = (targetHarnesses: string[]) =>
  invoke<McpInventory>("sync_all_mcp_servers", { targetHarnesses });

export const getMcpPresets = () =>
  invoke<McpPreset[]>("get_mcp_presets");

export const exportMcpConfig = () =>
  invoke<string>("export_mcp_config");

export const importMcpConfig = (jsonStr: string, targetHarnesses: string[]) =>
  invoke<McpInventory>("import_mcp_config", { jsonStr, targetHarnesses });

export const fetchMcpMarketplaceServers = (query?: string, category?: string) =>
  invoke<MarketplaceMcpServer[]>("fetch_mcp_marketplace_servers", { query: query ?? null, category: category ?? null });

export const validateMcpServer = (server: McpServerConfig) =>
  invoke<McpValidationReport>("validate_mcp_server", { server });

export const resolveMcpCommandPath = (command: string) =>
  invoke<string>("resolve_mcp_command_path", { command });

export const pingMcpServer = (server: McpServerConfig) =>
  invoke<McpPingResult>("ping_mcp_server", { server });

export const bulkToggleHarness = (harnessKey: string, enabled: boolean) =>
  invoke<McpInventory>("bulk_toggle_harness", { harnessKey, enabled });

export const getMcpProfiles = () =>
  invoke<McpProfile[]>("get_mcp_profiles");

export const activateMcpProfile = (profileId: string, targetHarnesses: string[]) =>
  invoke<McpInventory>("activate_mcp_profile", { profileId, targetHarnesses });

export const backupHarnessConfig = (harnessKey: string) =>
  invoke<McpBackupEntry>("backup_harness_config", { harnessKey });

export const getHarnessBackups = (harnessKey: string) =>
  invoke<McpBackupEntry[]>("get_harness_backups", { harnessKey });

export const restoreHarnessConfig = (harnessKey: string, backupPath: string) =>
  invoke<McpInventory>("restore_harness_config", { harnessKey, backupPath });

export const getGitMcpSources = () =>
  invoke<McpGitProfileSource[]>("get_git_mcp_sources");

export const addGitMcpSource = (name: string, repoUrl: string, branch?: string) =>
  invoke<McpGitProfileSource[]>("add_git_mcp_source", { name, repoUrl, branch: branch ?? null });

export const syncGitMcpSources = () =>
  invoke<McpGitProfileSource[]>("sync_git_mcp_sources");

export const deleteGitMcpSource = (sourceId: string) =>
  invoke<McpGitProfileSource[]>("delete_git_mcp_source", { sourceId });

export const getHarnessConfigContent = (harnessKey: string) =>
  invoke<HarnessConfigContent>("get_harness_config_content", { harnessKey });

export const saveHarnessConfigContent = (harnessKey: string, content: string) =>
  invoke<McpInventory>("save_harness_config_content", { harnessKey, content });
