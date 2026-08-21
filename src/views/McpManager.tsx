import { useState, useEffect, useMemo } from "react";
import {
  Server,
  Plus,
  Sparkles,
  RefreshCw,
  Search,
  Code,
  Layers,
  Globe,
  Power,
  SlidersHorizontal,
  CheckCircle2,
  XCircle,
  History,
  FolderSync,
  Play,
  RotateCcw,
  GitBranch,
  ExternalLink,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../utils";
import { AgentIcon } from "../components/AgentIcon";

import * as api from "../lib/tauri";
import type {
  McpInventory,
  McpServerConfig,
  McpPreset,
  McpProfile,
  McpBackupEntry,
  McpGitProfileSource,
} from "../lib/tauri";

import { McpServerCard } from "../components/mcp/McpServerCard";
import { McpServerDialog } from "../components/mcp/McpServerDialog";
import { McpPresetModal } from "../components/mcp/McpPresetModal";
import { McpJsonEditorModal } from "../components/mcp/McpJsonEditorModal";
import { McpMarketplaceModal } from "../components/mcp/McpMarketplaceModal";
import { ConfirmDialog } from "../components/ConfirmDialog";

type McpTab = "inventory" | "profiles" | "backups" | "sync_matrix";

export function McpManager() {
  const [activeTab, setActiveTab] = useState<McpTab>("inventory");
  const [inventory, setInventory] = useState<McpInventory | null>(null);
  const [presets, setPresets] = useState<McpPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTransportFilter, setSelectedTransportFilter] = useState<string>("all");

  // Backups State
  const [selectedHarnessForBackup, setSelectedHarnessForBackup] = useState<string>("cursor");
  const [backups, setBackups] = useState<McpBackupEntry[]>([]);
  const [isBackingUp, setIsBackingUp] = useState(false);

  // Git Driven Profiles State
  const [gitSources, setGitSources] = useState<McpGitProfileSource[]>([]);
  const [isAddGitModalOpen, setIsAddGitModalOpen] = useState(false);
  const [gitName, setGitName] = useState("");
  const [gitRepoUrl, setGitRepoUrl] = useState("");
  const [gitBranch, setGitBranch] = useState("main");
  const [isSyncingGit, setIsSyncingGit] = useState(false);
  const [gitDeleteTarget, setGitDeleteTarget] = useState<McpGitProfileSource | null>(null);

  // Dialog States
  const [isHarnessPanelExpanded, setIsHarnessPanelExpanded] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(null);
  const [isPresetOpen, setIsPresetOpen] = useState(false);
  const [isMarketplaceOpen, setIsMarketplaceOpen] = useState(false);
  const [isJsonOpen, setIsJsonOpen] = useState(false);
  const [jsonContent, setJsonContent] = useState("");
  const [selectedHarnessKeyForJson, setSelectedHarnessKeyForJson] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<McpServerConfig | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invData, presetData, gitSrcData] = await Promise.all([
        api.getMcpInventory(),
        api.getMcpPresets(),
        api.getGitMcpSources(),
      ]);
      setInventory(invData);
      setPresets(presetData);
      setGitSources(gitSrcData);
    } catch (err: any) {
      toast.error(`Failed to load MCP Inventory: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const loadBackups = async (harnessKey: string) => {
    try {
      const list = await api.getHarnessBackups(harnessKey);
      setBackups(list);
    } catch (err: any) {
      toast.error(`Failed to load backups for ${harnessKey}: ${err}`);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === "backups" && selectedHarnessForBackup) {
      loadBackups(selectedHarnessForBackup);
    }
  }, [activeTab, selectedHarnessForBackup]);

  const filteredServers = useMemo(() => {
    if (!inventory) return [];
    return inventory.servers.filter((server) => {
      const matchesSearch =
        server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        server.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        server.command?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        server.url?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesTransport =
        selectedTransportFilter === "all" || server.transport === selectedTransportFilter;

      return matchesSearch && matchesTransport;
    });
  }, [inventory, searchQuery, selectedTransportFilter]);

  const handleAddGitSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gitName.trim() || !gitRepoUrl.trim()) return;
    try {
      const updated = await api.addGitMcpSource(gitName.trim(), gitRepoUrl.trim(), gitBranch.trim() || "main");
      setGitSources(updated);
      toast.success(`Connected Git source '${gitName}'`);
      setIsAddGitModalOpen(false);
      setGitName("");
      setGitRepoUrl("");
      setGitBranch("main");
    } catch (err: any) {
      toast.error(`Failed to add Git source: ${err}`);
    }
  };

  const handleSyncGitSources = async () => {
    setIsSyncingGit(true);
    try {
      const updated = await api.syncGitMcpSources();
      setGitSources(updated);
      toast.success("Synced all Git profile sources!");
    } catch (err: any) {
      toast.error(`Git sync failed: ${err}`);
    } finally {
      setIsSyncingGit(false);
    }
  };

  const handleDeleteGitSource = async () => {
    if (!gitDeleteTarget) return;
    try {
      const updated = await api.deleteGitMcpSource(gitDeleteTarget.id);
      setGitSources(updated);
      toast.success(`Removed Git source '${gitDeleteTarget.name}'`);
      setGitDeleteTarget(null);
    } catch (err: any) {
      toast.error(`Failed to remove Git source: ${err}`);
      setGitDeleteTarget(null);
    }
  };

  const handleOpenAdd = () => {
    setEditingServer(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (server: McpServerConfig) => {
    setEditingServer(server);
    setIsFormOpen(true);
  };

  const handleSaveServer = async (
    server: McpServerConfig,
    targetHarnesses: string[]
  ) => {
    try {
      const updated = await api.saveMcpServer(server, targetHarnesses);
      setInventory(updated);
      toast.success(`MCP Server '${server.name}' saved & deployed`);
    } catch (err: any) {
      toast.error(`Failed to save MCP server: ${err}`);
    }
  };

  const handleDeleteServer = async () => {
    if (!deleteTarget) return;
    try {
      const targetKeys = inventory?.harnesses.map((h) => h.key) || [];
      const updated = await api.deleteMcpServer(deleteTarget.id, targetKeys);
      setInventory(updated);
      toast.success(`Deleted MCP Server '${deleteTarget.name}'`);
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(`Failed to delete MCP server: ${err}`);
    }
  };

  const handleToggleHarness = async (
    serverId: string,
    harnessKey: string,
    enabled: boolean
  ) => {
    try {
      const updated = await api.toggleMcpServer(serverId, harnessKey, enabled);
      setInventory(updated);
      toast.success(`Updated ${harnessKey} state for ${serverId}`);
    } catch (err: any) {
      toast.error(`Failed to toggle harness: ${err}`);
    }
  };

  const handleBulkToggleHarness = async (harnessKey: string, enabled: boolean) => {
    try {
      const updated = await api.bulkToggleHarness(harnessKey, enabled);
      setInventory(updated);
      toast.success(
        enabled
          ? `Enabled all MCP servers for ${harnessKey}`
          : `Disabled all MCP servers for ${harnessKey}`
      );
    } catch (err: any) {
      toast.error(`Bulk toggle failed: ${err}`);
    }
  };

  const handleActivateProfile = async (profile: McpProfile) => {
    if (!inventory) return;
    try {
      const targetKeys = inventory.harnesses.map((h) => h.key);
      const updated = await api.activateMcpProfile(profile.id, targetKeys);
      setInventory(updated);
      toast.success(`Activated '${profile.name}' profile across all AI harnesses!`);
    } catch (err: any) {
      toast.error(`Profile activation failed: ${err}`);
    }
  };

  const handleCreateManualBackup = async (harnessKey: string) => {
    setIsBackingUp(true);
    try {
      await api.backupHarnessConfig(harnessKey);
      toast.success(`Backup created for ${harnessKey}`);
      loadBackups(harnessKey);
    } catch (err: any) {
      toast.error(`Backup failed: ${err}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreBackup = async (harnessKey: string, backupPath: string) => {
    try {
      const updated = await api.restoreHarnessConfig(harnessKey, backupPath);
      setInventory(updated);
      toast.success(`Restored ${harnessKey} configuration from backup`);
      loadBackups(harnessKey);
    } catch (err: any) {
      toast.error(`Restore failed: ${err}`);
    }
  };

  const handleSyncAll = async () => {
    if (!inventory) return;
    try {
      const targetKeys = inventory?.harnesses.filter((h) => h.installed).map((h) => h.key) || [];
      const updated = await api.syncAllMcpServers(targetKeys);
      setInventory(updated);
      toast.success("Successfully synced all MCP servers across all AI harnesses!");
    } catch (err: any) {
      toast.error(`Sync failed: ${err}`);
    }
  };

  const handleOpenExportJson = async () => {
    try {
      const jsonStr = await api.exportMcpConfig();
      setJsonContent(jsonStr);
      setSelectedHarnessKeyForJson(null);
      setIsJsonOpen(true);
    } catch (err: any) {
      toast.error(`Export failed: ${err}`);
    }
  };

  const handleOpenHarnessJson = (harnessKey: string) => {
    setSelectedHarnessKeyForJson(harnessKey);
    setIsJsonOpen(true);
  };

  const handleSaveHarnessConfig = async (harnessKey: string, content: string) => {
    try {
      const updated = await api.saveHarnessConfigContent(harnessKey, content);
      setInventory(updated);
      toast.success(`Saved and re-synced configuration for ${harnessKey}`);
    } catch (err: any) {
      toast.error(`Failed to save ${harnessKey} config: ${err}`);
      throw err;
    }
  };

  const handleImportJson = async (jsonStr: string) => {
    if (!inventory) return;
    try {
      const targetKeys = inventory.harnesses.filter((h) => h.installed).map((h) => h.key);
      const updated = await api.importMcpConfig(jsonStr, targetKeys);
      setInventory(updated);
      toast.success("Imported MCP configurations successfully");
    } catch (err: any) {
      toast.error(`Import failed: ${err}`);
    }
  };

  const handleInstallPreset = async (
    server: McpServerConfig,
    targetHarnesses: string[]
  ) => {
    try {
      const updated = await api.saveMcpServer(server, targetHarnesses);
      setInventory(updated);
      toast.success(`Installed '${server.name}'`);
    } catch (err: any) {
      toast.error(`Installation failed: ${err}`);
    }
  };

  return (
    <div className="app-page">
      {/* Top Header */}
      <div className="app-page-header flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="app-page-title flex items-center gap-2">
            <Server className="h-5 w-5 text-accent-light" />
            MCP Management
            <span className="app-badge font-mono">
              {inventory ? inventory.servers.length : 0}
            </span>
          </h1>
          <p className="app-page-subtitle">
            Configure, manage, and sync Model Context Protocol (MCP) servers across all installed AI harnesses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadData}
            className="app-button-secondary py-2"
            title="Refresh Inventory"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </button>
          <button
            onClick={handleOpenExportJson}
            className="app-button-secondary py-2"
          >
            <Code className="h-3.5 w-3.5" /> JSON Config
          </button>
          <button
            onClick={handleSyncAll}
            className="app-button-secondary py-2 border-accent-border text-accent-light hover:bg-accent-bg"
          >
            <RefreshCw className="h-3.5 w-3.5 text-accent-light" /> Sync All
          </button>
          <button
            onClick={handleOpenAdd}
            className="app-button-primary py-2"
          >
            <Plus className="h-4 w-4" /> Add Server
          </button>
        </div>
      </div>

      {/* Main Tab Navigation Toolbar */}
      <div className="app-toolbar">
        <div className="app-segmented">
          <button
            onClick={() => setActiveTab("inventory")}
            className={cn(
              "app-segmented-button flex items-center gap-1.5",
              activeTab === "inventory" && "app-segmented-button-active"
            )}
          >
            <Server className="h-3.5 w-3.5" /> My MCP Servers ({inventory ? inventory.servers.length : 0})
          </button>

          <button
            onClick={() => setIsMarketplaceOpen(true)}
            className="app-segmented-button flex items-center gap-1.5 text-accent-light hover:text-accent-light"
          >
            <Globe className="h-3.5 w-3.5 text-accent-light" /> MCP Marketplace
          </button>

          <button
            onClick={() => setIsPresetOpen(true)}
            className="app-segmented-button flex items-center gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Presets
          </button>

          <button
            onClick={() => setActiveTab("profiles")}
            className={cn(
              "app-segmented-button flex items-center gap-1.5",
              activeTab === "profiles" && "app-segmented-button-active"
            )}
          >
            <FolderSync className="h-3.5 w-3.5 text-blue-400" /> Profiles
          </button>

          <button
            onClick={() => setActiveTab("backups")}
            className={cn(
              "app-segmented-button flex items-center gap-1.5",
              activeTab === "backups" && "app-segmented-button-active"
            )}
          >
            <History className="h-3.5 w-3.5 text-emerald-400" /> Config Backups
          </button>

          <button
            onClick={() => setActiveTab("sync_matrix")}
            className={cn(
              "app-segmented-button flex items-center gap-1.5",
              activeTab === "sync_matrix" && "app-segmented-button-active"
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Sync Matrix
          </button>
        </div>

        {/* Search & Transport Filter Controls */}
        {activeTab === "inventory" && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search servers..."
                className="app-input w-full pl-9"
              />
            </div>

            <div className="app-segmented">
              {["all", "stdio", "sse", "websocket"].map((tOption) => (
                <button
                  key={tOption}
                  onClick={() => setSelectedTransportFilter(tOption)}
                  className={cn(
                    "app-segmented-button uppercase font-semibold text-[11px]",
                    selectedTransportFilter === tOption && "app-segmented-button-active"
                  )}
                >
                  {tOption}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Installed Harness Summary Bar */}
      {inventory && (
        <div className="app-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="app-section-title flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-accent-light" /> Detected AI Harnesses
              <span className="app-badge font-mono text-[11px]">
                {inventory.harnesses.filter((h) => h.installed).length} Connected
              </span>
            </h2>
            {inventory.harnesses.some((h) => !h.installed) && (
              <button
                type="button"
                onClick={() => setIsHarnessPanelExpanded(!isHarnessPanelExpanded)}
                className="text-[12px] text-muted hover:text-accent-light flex items-center gap-1 font-medium transition-colors"
              >
                <span>
                  {isHarnessPanelExpanded
                    ? "Hide Unconnected"
                    : `Show All (${inventory.harnesses.filter((h) => !h.installed).length} unconnected)`}
                </span>
                {isHarnessPanelExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {inventory.harnesses
              .filter((harness) => harness.installed || isHarnessPanelExpanded)
              .map((harness) => (
                <div
                  key={harness.key}
                  className={cn(
                    "flex flex-col justify-between app-panel-muted p-2.5 transition-all border",
                    harness.installed
                      ? "border-border-subtle"
                      : "border-border-faint opacity-50"
                  )}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <AgentIcon
                        agentKey={harness.key}
                        displayName={harness.display_name}
                        className="h-4 w-4 rounded-[3px] shrink-0"
                      />
                      <span className="text-[12px] font-semibold text-primary truncate">
                        {harness.display_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenHarnessJson(harness.key)}
                        className="p-1 rounded text-muted hover:text-accent-light hover:bg-surface-hover transition-colors"
                        title={`View/Edit raw config file for ${harness.display_name}`}
                      >
                        <Code className="h-3 w-3" />
                      </button>
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full shrink-0",
                          harness.installed ? "bg-accent-light" : "bg-faint"
                        )}
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted font-mono">
                    <span>{harness.installed ? "Connected" : "Not Found"}</span>
                    <span className="font-bold text-accent-light">{harness.server_count}</span>
                  </div>
                </div>
              ))}
          </div>

          {inventory.harnesses.filter((h) => h.installed).length === 0 &&
            !isHarnessPanelExpanded && (
              <div className="text-center py-4 text-[13px] text-muted">
                No connected AI harnesses detected on this system.{" "}
                <button
                  type="button"
                  onClick={() => setIsHarnessPanelExpanded(true)}
                  className="text-accent-light hover:underline font-medium ml-1"
                >
                  Show all harnesses
                </button>
              </div>
            )}
        </div>
      )}

      {/* Main Tab Content */}
      {activeTab === "inventory" && (
        loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted">
            <RefreshCw className="h-6 w-6 animate-spin text-accent-light mb-2" />
            <p className="text-[13px]">Scanning MCP Server configurations across AI harnesses...</p>
          </div>
        ) : filteredServers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredServers.map((server) => (
              <McpServerCard
                key={server.id}
                server={server}
                harnesses={inventory?.harnesses || []}
                harnessBindings={inventory?.harness_bindings || {}}
                onEdit={handleOpenEdit}
                onDelete={(srv) => setDeleteTarget(srv)}
                onToggleHarness={handleToggleHarness}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center app-panel py-16 text-center">
            <Server className="h-10 w-10 text-muted mb-3" />
            <h3 className="text-[15px] font-semibold text-primary">No MCP Servers Found</h3>
            <p className="text-[13px] text-muted max-w-md mt-1 mb-4">
              {searchQuery
                ? "No MCP servers match your search query."
                : "Get started by adding a custom MCP server or discovering 1,000+ servers in our MCP Directory & Marketplace."}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setIsMarketplaceOpen(true)}
                className="app-button-secondary text-accent-light border-accent-border hover:bg-accent-bg"
              >
                <Globe className="h-4 w-4 text-accent-light" /> Browse MCP Marketplace
              </button>
              <button
                onClick={handleOpenAdd}
                className="app-button-primary"
              >
                Add Custom Server
              </button>
            </div>
          </div>
        )
      )}

      {/* Profiles & Git Sources View */}
      {activeTab === "profiles" && inventory && (
        <div className="space-y-5">
          {/* Git Sources Toolbar Header */}
          <div className="app-panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-[15px] font-semibold text-primary flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-accent-light" /> Git-Driven Profile Sources
              </h3>
              <p className="text-[12px] text-muted">Sync team profiles and server definitions from remote Git repositories.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSyncGitSources}
                disabled={isSyncingGit}
                className="app-button-secondary py-1.5 text-[12px]"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isSyncingGit && "animate-spin")} /> Sync Git Sources
              </button>
              <button
                onClick={() => setIsAddGitModalOpen(true)}
                className="app-button-primary py-1.5 text-[12px]"
              >
                <Plus className="h-3.5 w-3.5" /> Connect Git Repo
              </button>
            </div>
          </div>

          {/* Connected Git Sources */}
          {gitSources.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {gitSources.map((src) => (
                <div key={src.id} className="app-panel-muted p-3 flex items-center justify-between gap-3 text-[12px]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <GitBranch className="h-4 w-4 text-accent-light shrink-0" />
                    <div className="min-w-0">
                      <span className="font-semibold text-primary block truncate">{src.name}</span>
                      <a
                        href={src.repo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-faint hover:text-accent-light font-mono truncate flex items-center gap-1"
                      >
                        {src.repo_url} <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="app-badge font-mono text-[10px]">
                      {src.branch || "main"}
                    </span>
                    <button
                      onClick={() => setGitDeleteTarget(src)}
                      title={`Remove '${src.name}'`}
                      className="rounded-md p-1 text-muted hover:bg-danger/10 hover:text-danger transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Workflow Profiles Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {inventory.profiles.map((profile) => (
              <div key={profile.id} className="app-panel p-5 flex flex-col justify-between hover:border-border transition-all">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-primary text-[15px]">{profile.name}</h4>
                    <span className="app-badge font-mono text-[11px]">{profile.server_ids.length} Servers</span>
                  </div>
                  <p className="text-[12px] text-muted mt-1.5 leading-relaxed">{profile.description}</p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {profile.server_ids.map((srvId) => (
                      <span key={srvId} className="rounded bg-surface-hover px-2 py-0.5 font-mono text-[11px] text-tertiary border border-border-subtle">
                        {srvId}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 border-t border-border-faint pt-3 flex justify-end">
                  <button
                    onClick={() => handleActivateProfile(profile)}
                    className="app-button-primary py-1.5 px-4 text-[12px] flex items-center gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" /> Activate Profile
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Config Backups View */}
      {activeTab === "backups" && inventory && (
        <div className="app-panel p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-4">
            <div>
              <h3 className="text-[15px] font-semibold text-primary">Configuration Backups & Rollback</h3>
              <p className="text-[12px] text-muted">History of automatic and manual snapshots created before configuration writes.</p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={selectedHarnessForBackup}
                onChange={(e) => setSelectedHarnessForBackup(e.target.value)}
                className="app-input text-[12px] font-medium"
              >
                {inventory.harnesses.map((h) => (
                  <option key={h.key} value={h.key}>
                    {h.display_name} ({h.key})
                  </option>
                ))}
              </select>

              <button
                onClick={() => handleCreateManualBackup(selectedHarnessForBackup)}
                disabled={isBackingUp}
                className="app-button-secondary text-[12px] py-1.5"
              >
                <History className={cn("h-3.5 w-3.5", isBackingUp && "animate-spin")} /> Create Snapshot
              </button>
            </div>
          </div>

          {backups.length > 0 ? (
            <div className="space-y-2">
              {backups.map((entry, idx) => (
                <div key={idx} className="app-panel-muted p-3 flex items-center justify-between gap-4 font-mono text-[12px]">
                  <div className="flex items-center gap-3 min-w-0">
                    <History className="h-4 w-4 text-accent-light shrink-0" />
                    <div className="min-w-0">
                      <span className="font-semibold text-primary block truncate">
                        {(() => {
                          // Format timestamp (YYYYMMDD_HHMMSS) as human-readable date
                          const ts = entry.timestamp;
                          if (ts && ts.length >= 15 && ts.includes("_")) {
                            const [d, t] = ts.split("_");
                            const formatted = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)} ${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}`;
                            return `Snapshot — ${formatted}`;
                          }
                          return `Snapshot — ${ts}`;
                        })()}
                      </span>
                      <span className="text-[11px] text-faint font-mono truncate block">{entry.backup_path}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRestoreBackup(entry.harness_key, entry.backup_path)}
                    className="app-button-secondary text-[11px] py-1 px-3 border-accent-border text-accent-light hover:bg-accent-bg shrink-0"
                  >
                    <RotateCcw className="h-3 w-3" /> Restore Snapshot
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-[13px]">No backups found for {selectedHarnessForBackup}.</p>
            </div>
          )}
        </div>
      )}

      {/* Sync Matrix View */}
      {activeTab === "sync_matrix" && inventory && (
        <div className="app-panel overflow-hidden">
          <div className="p-4 border-b border-border-subtle flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-semibold text-primary">Harness Deployment Matrix</h3>
              <p className="text-[12px] text-muted">Click any cell to toggle, or use column headers for bulk enable/disable actions.</p>
            </div>
            <button
              onClick={handleSyncAll}
              className="app-button-primary py-2 text-[12px]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Sync Matrix
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-bg-secondary text-muted border-b border-border-subtle font-medium text-[12px]">
                <tr>
                  <th className="py-3 px-4">MCP Server</th>
                  <th className="py-3 px-4">Transport</th>
                  {inventory.harnesses.map((h) => (
                    <th key={h.key} className="py-3 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1.5">
                          <AgentIcon
                            agentKey={h.key}
                            displayName={h.display_name}
                            className="h-4 w-4 rounded-[3px]"
                          />
                          <span>{h.display_name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleBulkToggleHarness(h.key, true)}
                            className="p-1 rounded text-accent-light hover:bg-accent-bg transition-colors"
                            title={`Enable all servers for ${h.display_name}`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleBulkToggleHarness(h.key, false)}
                            className="p-1 rounded text-danger hover:bg-danger-bg transition-colors"
                            title={`Disable all servers for ${h.display_name}`}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-faint text-primary">
                {inventory.servers.map((server) => (
                  <tr key={server.id} className="hover:bg-surface-hover transition-colors">
                    <td className="py-3 px-4 font-semibold font-mono text-[13px]">
                      {server.name || server.id}
                    </td>
                    <td className="py-3 px-4">
                      <span className="app-badge text-[11px] uppercase">
                        {server.transport}
                      </span>
                    </td>
                    {inventory.harnesses.map((harness) => {
                      const isBound = inventory.harness_bindings[harness.key]?.includes(server.id);
                      return (
                        <td key={harness.key} className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleToggleHarness(server.id, harness.key, !isBound)}
                            className={cn(
                              "inline-flex items-center justify-center p-1.5 rounded-lg border transition-all",
                              isBound
                                ? "bg-accent-bg text-accent-light border-accent-border hover:opacity-90"
                                : "bg-bg-secondary text-faint border-border-subtle hover:border-border"
                            )}
                            title={`${server.name} on ${harness.display_name}: ${isBound ? "Active" : "Inactive"}`}
                          >
                            <Power className="h-4 w-4" />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Git Source Modal */}
      {isAddGitModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => setIsAddGitModalOpen(false)}
        >
          <div
            className="w-full max-w-md app-panel p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <h3 className="text-[16px] font-semibold text-primary flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-accent-light" /> Connect Git Profile Source
              </h3>
              <button
                onClick={() => setIsAddGitModalOpen(false)}
                className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddGitSource} className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-muted mb-1.5">
                  Source Display Name *
                </label>
                <input
                  type="text"
                  required
                  value={gitName}
                  onChange={(e) => setGitName(e.target.value)}
                  placeholder="e.g. Core Team Profiles"
                  className="app-input w-full text-[13px]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-muted mb-1.5">
                  Git Repository URL *
                </label>
                <input
                  type="url"
                  required
                  value={gitRepoUrl}
                  onChange={(e) => setGitRepoUrl(e.target.value)}
                  placeholder="https://github.com/my-org/mcp-profiles"
                  className="app-input w-full font-mono text-[12px]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-muted mb-1.5">
                  Target Branch
                </label>
                <input
                  type="text"
                  value={gitBranch}
                  onChange={(e) => setGitBranch(e.target.value)}
                  placeholder="main"
                  className="app-input w-full font-mono text-[12px]"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-border-subtle pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddGitModalOpen(false)}
                  className="app-button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="app-button-primary"
                >
                  Connect Source
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modals & Dialogs */}
      <McpServerDialog
        isOpen={isFormOpen}
        initialData={editingServer}
        harnesses={inventory?.harnesses || []}
        initialSelectedHarnesses={
          editingServer && inventory
            ? inventory.harnesses
                .filter((h) => inventory.harness_bindings[h.key]?.includes(editingServer.id))
                .map((h) => h.key)
            : inventory?.harnesses.filter((h) => h.installed).map((h) => h.key) || []
        }
        onClose={() => setIsFormOpen(false)}
        onSave={handleSaveServer}
      />

      <McpPresetModal
        isOpen={isPresetOpen}
        presets={presets}
        harnesses={inventory?.harnesses || []}
        onClose={() => setIsPresetOpen(false)}
        onInstallPreset={handleInstallPreset}
      />

      <McpMarketplaceModal
        isOpen={isMarketplaceOpen}
        harnesses={inventory?.harnesses || []}
        onClose={() => setIsMarketplaceOpen(false)}
        onInstall={handleInstallPreset}
      />

      <McpJsonEditorModal
        isOpen={isJsonOpen}
        initialJson={jsonContent}
        harnesses={inventory?.harnesses || []}
        initialHarnessKey={selectedHarnessKeyForJson}
        onClose={() => setIsJsonOpen(false)}
        onImportGlobal={handleImportJson}
        onSaveHarnessConfig={handleSaveHarnessConfig}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete MCP Server"
        message={`Are you sure you want to delete MCP Server '${deleteTarget?.name}'? This will remove its configuration across target harnesses.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteServer}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!gitDeleteTarget}
        title="Remove Git Source"
        message={`Are you sure you want to remove Git source '${gitDeleteTarget?.name}'? Its remote profile will no longer be synced into this app.`}
        confirmLabel="Remove"
        onConfirm={handleDeleteGitSource}
        onClose={() => setGitDeleteTarget(null)}
      />
    </div>
  );
}
