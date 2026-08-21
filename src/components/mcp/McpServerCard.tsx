import React, { useState } from "react";
import {
  Terminal,
  Globe,
  Trash2,
  Pencil,
  Power,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../utils";
import { AgentIcon } from "../AgentIcon";
import * as api from "../../lib/tauri";
import type { McpServerConfig, McpHarnessInfo, McpPingResult } from "../../lib/tauri";

interface McpServerCardProps {
  server: McpServerConfig;
  harnesses: McpHarnessInfo[];
  harnessBindings: Record<string, string[]>;
  onEdit: (server: McpServerConfig) => void;
  onDelete: (server: McpServerConfig) => void;
  onToggleHarness: (serverId: string, harnessKey: string, enabled: boolean) => void;
}

export const McpServerCard: React.FC<McpServerCardProps> = ({
  server,
  harnesses,
  harnessBindings,
  onEdit,
  onDelete,
  onToggleHarness,
}) => {
  const isStdio = server.transport === "stdio";
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<McpPingResult | null>(null);
  const [showAllHarnesses, setShowAllHarnesses] = useState(false);

  const handlePingServer = async () => {
    setIsPinging(true);
    try {
      const result = await api.pingMcpServer(server);
      setPingResult(result);
      if (result.online) {
        toast.success(`Server '${server.name || server.id}' ping: ${result.latency_ms}ms`);
      } else {
        toast.error(`Server offline: ${result.message}`);
      }
    } catch (err: any) {
      toast.error(`Ping failed: ${err}`);
    } finally {
      setIsPinging(false);
    }
  };

  return (
    <div className="group relative flex flex-col justify-between app-panel p-4 transition-all hover:border-border hover:shadow-card-hover">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle bg-bg-secondary text-secondary">
              {isStdio ? <Terminal className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
            </div>
            <div>
              <h3 className="font-semibold text-primary text-[14px] leading-tight flex items-center gap-1.5 flex-wrap">
                {server.name || server.id}
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border uppercase",
                    isStdio
                      ? "bg-accent-bg text-accent-light border-accent-border"
                      : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                  )}
                >
                  {server.transport}
                </span>
                {server.scope === "workspace" && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border bg-amber-500/10 text-amber-400 border-amber-500/20 uppercase">
                    Workspace
                  </span>
                )}
              </h3>
              <p className="text-[12px] text-faint font-mono mt-0.5">id: {server.id}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handlePingServer}
              disabled={isPinging}
              className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-accent-light transition-colors"
              title="Ping & Test Latency"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isPinging && "animate-spin")} />
            </button>
            <button
              onClick={() => onEdit(server)}
              className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-primary transition-colors"
              title="Edit Configuration"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(server)}
              className="rounded-md p-1.5 text-danger hover:bg-danger-bg transition-colors"
              title="Delete Server"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Command or URL */}
        <div className="mt-3.5 app-panel-muted p-3 font-mono text-[12px] text-secondary overflow-x-auto scrollbar-hide">
          {isStdio ? (
            <div className="space-y-1">
              <div className="truncate">
                <span className="text-accent font-semibold">$ </span>
                {server.command} {server.args?.join(" ")}
              </div>
              {server.env && Object.keys(server.env).length > 0 && (
                <div className="mt-2 text-[11px] text-muted border-t border-border-faint pt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="font-sans font-medium text-tertiary">Env: </span>
                  {Object.keys(server.env).map((k) => (
                    <span key={k} className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-tertiary border border-border-subtle">
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="truncate text-purple-400">
              <span className="text-muted">URL: </span>
              {server.url}
            </div>
          )}
        </div>

        {pingResult && (
          <div
            className={cn(
              "mt-2 rounded p-2 text-[11px] font-mono flex items-center justify-between border",
              pingResult.online
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : "border-danger-bg bg-danger-bg text-danger"
            )}
          >
            <div className="flex items-center gap-1.5 truncate">
              {pingResult.online ? (
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">{pingResult.message}</span>
            </div>
            <span className="flex items-center gap-1 font-semibold ml-2 shrink-0">
              <Zap className="h-3 w-3 text-amber-400" /> {pingResult.latency_ms}ms
            </span>
          </div>
        )}

        {server.description && (
          <p className="mt-3 text-[12px] leading-relaxed text-muted line-clamp-2">
            {server.description}
          </p>
        )}
      </div>

      {/* Harness Deployment Badges */}
      <div className="mt-4 border-t border-border-faint pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="app-section-title text-[11px]">
            Target Harness Deployment
          </span>
          {harnesses.some((h) => !h.installed) && (
            <button
              type="button"
              onClick={() => setShowAllHarnesses(!showAllHarnesses)}
              className="text-[10px] text-muted hover:text-accent-light flex items-center gap-0.5 font-medium transition-colors"
            >
              {showAllHarnesses ? (
                <><ChevronUp className="h-3 w-3" /> Hide unconnected</>
              ) : (
                <><ChevronDown className="h-3 w-3" /> +{harnesses.filter((h) => !h.installed).length} more</>
              )}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {harnesses
            .filter((h) => h.installed || showAllHarnesses)
            .map((harness) => {
              const isBound = harnessBindings[harness.key]?.includes(server.id);
              return (
                <button
                  key={harness.key}
                  onClick={() => onToggleHarness(server.id, harness.key, !isBound)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all border",
                    isBound
                      ? "bg-accent-bg text-accent-light border-accent-border hover:opacity-90"
                      : "bg-surface-hover text-muted border-border-subtle hover:text-tertiary hover:border-border",
                    !harness.installed && "opacity-60"
                  )}
                  title={`${harness.display_name}: ${isBound ? "Active (click to disable)" : harness.installed ? "Inactive (click to enable)" : "Not installed"}`}
                >
                  <AgentIcon
                    agentKey={harness.key}
                    displayName={harness.display_name}
                    className="h-3.5 w-3.5 rounded-[3px]"
                  />
                  <span>{harness.display_name}</span>
                  <Power className={cn("h-3 w-3 ml-0.5", isBound ? "text-accent-light" : "text-faint")} />
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
};
