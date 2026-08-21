import React, { useState, useEffect } from "react";
import { X, Plus, Trash2, Eye, EyeOff, Wrench, ShieldCheck, AlertCircle, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../utils";
import { McpHarnessSelector } from "./McpHarnessSelector";
import * as api from "../../lib/tauri";
import type { McpServerConfig, McpHarnessInfo, McpTransport, McpScope, McpValidationReport } from "../../lib/tauri";

interface McpServerDialogProps {
  isOpen: boolean;
  initialData: McpServerConfig | null;
  harnesses: McpHarnessInfo[];
  initialSelectedHarnesses: string[];
  onClose: () => void;
  onSave: (server: McpServerConfig, targetHarnesses: string[]) => void;
}

export const McpServerDialog: React.FC<McpServerDialogProps> = ({
  isOpen,
  initialData,
  harnesses,
  initialSelectedHarnesses,
  onClose,
  onSave,
}) => {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransport>("stdio");
  const [scope, setScope] = useState<McpScope>("global");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState<string[]>([]);
  const [argInput, setArgInput] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string; isSecret: boolean }[]>([]);
  const [selectedHarnesses, setSelectedHarnesses] = useState<string[]>([]);
  const [showSecrets, setShowSecrets] = useState<Record<number, boolean>>({});

  // Validation Pre-flight State
  const [isValidating, setIsValidating] = useState(false);
  const [validationReport, setValidationReport] = useState<McpValidationReport | null>(null);

  useEffect(() => {
    if (initialData) {
      setId(initialData.id || "");
      setName(initialData.name || initialData.id || "");
      setTransport(initialData.transport || "stdio");
      setScope(initialData.scope || "global");
      setCommand(initialData.command || "");
      setArgs(initialData.args || []);
      setUrl(initialData.url || "");
      setDescription(initialData.description || "");

      if (initialData.env) {
        setEnvPairs(
          Object.entries(initialData.env).map(([key, value]) => ({
            key,
            value,
            isSecret: key.toLowerCase().includes("key") || key.toLowerCase().includes("token") || key.toLowerCase().includes("secret"),
          }))
        );
      } else {
        setEnvPairs([]);
      }
    } else {
      setId("");
      setName("");
      setTransport("stdio");
      setScope("global");
      setCommand("npx");
      setArgs([]);
      setUrl("");
      setDescription("");
      setEnvPairs([]);
    }
    setSelectedHarnesses(initialSelectedHarnesses);
    setValidationReport(null);
  }, [initialData, initialSelectedHarnesses, isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleApplyRuntimeTemplate = (type: "npx" | "uvx" | "bunx" | "docker" | "python") => {
    switch (type) {
      case "npx":
        setCommand("npx");
        setArgs(["-y", "@modelcontextprotocol/server-github"]);
        break;
      case "uvx":
        setCommand("uvx");
        setArgs(["mcp-server-git"]);
        break;
      case "bunx":
        setCommand("bunx");
        setArgs(["@modelcontextprotocol/server-fetch"]);
        break;
      case "docker":
        setCommand("docker");
        setArgs(["run", "-i", "--rm", "mcp/filesystem"]);
        break;
      case "python":
        setCommand("python");
        setArgs(["-m", "mcp_server"]);
        break;
    }
    toast.info(`Applied ${type.toUpperCase()} execution template`);
  };

  const handleAutoResolvePath = async () => {
    if (!command.trim()) return;
    try {
      const resolved = await api.resolveMcpCommandPath(command.trim());
      if (resolved && resolved !== command) {
        setCommand(resolved);
        toast.success(`Resolved path: ${resolved}`);
      } else {
        toast.info("Command path is already resolved or in system PATH");
      }
    } catch (err: any) {
      toast.error(`Path resolution error: ${err}`);
    }
  };

  const handleValidateServer = async () => {
    setIsValidating(true);
    try {
      const envMap: Record<string, string> = {};
      envPairs.forEach(({ key, value }) => {
        if (key.trim()) envMap[key.trim()] = value;
      });

      const serverConfig: McpServerConfig = {
        id: id || "temp",
        name: name || "temp",
        transport,
        scope,
        command: transport === "stdio" ? command.trim() : undefined,
        args: transport === "stdio" ? args : [],
        url: transport === "sse" || transport === "websocket" ? url.trim() : undefined,
        env: envMap,
        description,
        disabled: false,
      };

      const report = await api.validateMcpServer(serverConfig);
      setValidationReport(report);
      if (report.valid) {
        toast.success("Pre-flight server validation passed!");
      } else {
        toast.error(`Validation error: ${report.error}`);
      }
    } catch (err: any) {
      toast.error(`Validation failed: ${err}`);
    } finally {
      setIsValidating(false);
    }
  };

  const handleAddArg = () => {
    if (argInput.trim()) {
      setArgs([...args, argInput.trim()]);
      setArgInput("");
    }
  };

  const handleRemoveArg = (index: number) => {
    setArgs(args.filter((_, i) => i !== index));
  };

  const handleAddEnv = () => {
    setEnvPairs([...envPairs, { key: "", value: "", isSecret: false }]);
  };

  const handleRemoveEnv = (index: number) => {
    setEnvPairs(envPairs.filter((_, i) => i !== index));
  };

  const handleEnvChange = (index: number, field: "key" | "value" | "isSecret", val: any) => {
    const updated = [...envPairs];
    updated[index] = { ...updated[index], [field]: val };
    setEnvPairs(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim()) return;

    const envMap: Record<string, string> = {};
    envPairs.forEach(({ key, value }) => {
      if (key.trim()) {
        envMap[key.trim()] = value;
      }
    });

    const server: McpServerConfig = {
      id: id.trim(),
      name: name.trim() || id.trim(),
      transport,
      scope,
      command: transport === "stdio" ? command.trim() : undefined,
      args: transport === "stdio" ? args : [],
      url: transport === "sse" || transport === "websocket" ? url.trim() : undefined,
      env: envMap,
      description: description.trim() || undefined,
      disabled: false,
    };

    onSave(server, selectedHarnesses);
    onClose();
  };

  const toggleHarness = (key: string) => {
    if (selectedHarnesses.includes(key)) {
      setSelectedHarnesses(selectedHarnesses.filter((k) => k !== key));
    } else {
      setSelectedHarnesses([...selectedHarnesses, key]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col app-panel shadow-card-hover overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <h2 className="text-[16px] font-semibold tracking-tight text-primary">
            {initialData ? "Edit MCP Server" : "Add MCP Server"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Runtime Template Switcher Bar */}
          {transport === "stdio" && !initialData && (
            <div className="app-panel-muted p-3">
              <span className="app-section-title mb-2 text-[11px] flex items-center gap-1">
                <Zap className="h-3 w-3 text-amber-400" /> Quick Runtime Templates
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(["npx", "uvx", "bunx", "docker", "python"] as const).map((tmpl) => (
                  <button
                    key={tmpl}
                    type="button"
                    onClick={() => handleApplyRuntimeTemplate(tmpl)}
                    className="rounded bg-surface px-2.5 py-1 text-[11px] font-mono font-medium text-tertiary border border-border-subtle hover:border-accent-border hover:text-accent-light transition-all"
                  >
                    {tmpl}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Server ID & Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-muted mb-1.5">
                Server ID *
              </label>
              <input
                type="text"
                required
                disabled={!!initialData}
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="e.g. github, postgres"
                className="app-input w-full font-mono text-[13px] disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-muted mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. GitHub MCP Server"
                className="app-input w-full"
              />
            </div>
          </div>

          {/* Scope & Transport Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-muted mb-1.5">
                Deployment Scope
              </label>
              <div className="app-segmented">
                {(["global", "workspace"] as McpScope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={cn(
                      "flex-1 app-segmented-button text-center capitalize font-semibold text-[12px]",
                      scope === s && "app-segmented-button-active"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-muted mb-1.5">
                Transport Protocol
              </label>
              <div className="app-segmented">
                {(["stdio", "sse", "websocket"] as McpTransport[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTransport(t)}
                    className={cn(
                      "flex-1 app-segmented-button text-center uppercase font-semibold text-[12px]",
                      transport === t && "app-segmented-button-active"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Stdio: Command & Args */}
          {transport === "stdio" ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[12px] font-medium text-muted">
                    Command / Executable *
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoResolvePath}
                    className="text-[11px] text-accent-light font-medium hover:underline flex items-center gap-1"
                    title="Auto-detect absolute executable path on system"
                  >
                    <Wrench className="h-3 w-3" /> Resolve Absolute Path
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx, uvx, node, python, or C:\Program Files\..."
                  className="app-input w-full font-mono text-[12px]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-muted mb-1.5">
                  Arguments
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={argInput}
                    onChange={(e) => setArgInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddArg();
                      }
                    }}
                    placeholder="Add argument (e.g. -y or @modelcontextprotocol/server-github)"
                    className="app-input flex-1 font-mono text-[12px]"
                  />
                  <button
                    type="button"
                    onClick={handleAddArg}
                    className="app-button-secondary py-2"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </button>
                </div>
                {args.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 app-panel-muted p-2">
                    {args.map((arg, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 rounded border border-border-subtle bg-surface px-2 py-1 font-mono text-[11px] text-primary"
                      >
                        {arg}
                        <button
                          type="button"
                          onClick={() => handleRemoveArg(idx)}
                          className="text-faint hover:text-danger transition-colors ml-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[12px] font-medium text-muted mb-1.5">
                Server URL *
              </label>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:8000/sse"
                className="app-input w-full font-mono"
              />
            </div>
          )}

          {/* Environment Variables with ${VAR} expansion support */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[12px] font-medium text-muted">
                Environment Variables (supports ${"{VAR}"} expansion)
              </label>
              <button
                type="button"
                onClick={handleAddEnv}
                className="text-[12px] text-accent-light font-medium hover:underline flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add Variable
              </button>
            </div>
            {envPairs.length > 0 && (
              <div className="space-y-2">
                {envPairs.map((pair, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="KEY (e.g. GITHUB_TOKEN)"
                      value={pair.key}
                      onChange={(e) => handleEnvChange(idx, "key", e.target.value)}
                      className="app-input w-1/3 font-mono text-[12px]"
                    />
                    <div className="relative flex-1">
                      <input
                        type={showSecrets[idx] || !pair.isSecret ? "text" : "password"}
                        placeholder="VALUE (or ${GITHUB_TOKEN})"
                        value={pair.value}
                        onChange={(e) => handleEnvChange(idx, "value", e.target.value)}
                        className="app-input w-full font-mono text-[12px] pr-8"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowSecrets({ ...showSecrets, [idx]: !showSecrets[idx] })
                        }
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-secondary"
                      >
                        {showSecrets[idx] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveEnv(idx)}
                      className="rounded p-1.5 text-danger hover:bg-danger-bg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-[12px] font-medium text-muted mb-1.5">
              Description / Notes
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this MCP server..."
              className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[13px] text-primary focus:border-border outline-none transition-colors resize-none placeholder:text-faint"
            />
          </div>

          {/* Target Harness Selection */}
          <div className="border-t border-border-faint pt-4">
            <label className="app-section-title block mb-2 text-[11px]">
              Deploy to AI Harnesses
            </label>
            <McpHarnessSelector
              harnesses={harnesses}
              selectedHarnesses={selectedHarnesses}
              onToggle={toggleHarness}
            />
          </div>

          {/* Pre-flight Validation Feedback */}
          {validationReport && (
            <div
              className={cn(
                "rounded-lg border p-3 text-[12px] flex items-start gap-2.5",
                validationReport.valid
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : "border-danger-bg bg-danger-bg text-danger"
              )}
            >
              {validationReport.valid ? (
                <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <span className="font-semibold block">
                  {validationReport.valid ? "Pre-flight Validation Passed" : "Validation Warning"}
                </span>
                {validationReport.resolved_command && (
                  <p className="font-mono text-[11px] mt-0.5 opacity-90 truncate">
                    Resolved executable: {validationReport.resolved_command}
                  </p>
                )}
                {validationReport.error && (
                  <p className="text-[11px] mt-0.5 opacity-90">{validationReport.error}</p>
                )}
              </div>
            </div>
          )}

          {/* Submit Footer */}
          <div className="flex items-center justify-between border-t border-border-subtle pt-4">
            <button
              type="button"
              onClick={handleValidateServer}
              disabled={isValidating}
              className="app-button-secondary py-2 text-[12px] border-accent-border text-accent-light hover:bg-accent-bg"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isValidating && "animate-spin")} /> Test & Validate Server
            </button>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="app-button-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="app-button-primary"
              >
                Save & Deploy
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
