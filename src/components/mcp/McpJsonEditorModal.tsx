import React, { useState, useEffect } from "react";
import { X, Code, Copy, Download, Check, FileCode, Sparkles } from "lucide-react";
import { toast } from "sonner";
import * as api from "../../lib/tauri";
import type { McpHarnessInfo, HarnessConfigContent } from "../../lib/tauri";

interface McpJsonEditorModalProps {
  isOpen: boolean;
  initialJson: string;
  harnesses?: McpHarnessInfo[];
  initialHarnessKey?: string | null;
  onClose: () => void;
  onImportGlobal: (jsonStr: string) => void;
  onSaveHarnessConfig?: (harnessKey: string, content: string) => Promise<void>;
}

export const McpJsonEditorModal: React.FC<McpJsonEditorModalProps> = ({
  isOpen,
  initialJson,
  harnesses = [],
  initialHarnessKey = null,
  onClose,
  onImportGlobal,
  onSaveHarnessConfig,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<string>("global");
  const [jsonText, setJsonText] = useState("");
  const [copied, setCopied] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [harnessDetails, setHarnessDetails] = useState<HarnessConfigContent | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialHarnessKey) {
        setSelectedTarget(initialHarnessKey);
      } else {
        setSelectedTarget("global");
        setJsonText(initialJson);
        setHarnessDetails(null);
      }
    }
  }, [isOpen, initialJson, initialHarnessKey]);

  useEffect(() => {
    if (!isOpen) return;

    if (selectedTarget === "global") {
      setJsonText(initialJson);
      setHarnessDetails(null);
    } else {
      loadHarnessConfig(selectedTarget);
    }
  }, [selectedTarget, isOpen]);

  const loadHarnessConfig = async (harnessKey: string) => {
    setLoadingConfig(true);
    try {
      const data = await api.getHarnessConfigContent(harnessKey);
      setHarnessDetails(data);
      try {
        const parsed = JSON.parse(data.content);
        setJsonText(JSON.stringify(parsed, null, 2));
      } catch {
        setJsonText(data.content);
      }
    } catch (err: any) {
      toast.error(`Failed to load config for ${harnessKey}: ${err}`);
    } finally {
      setLoadingConfig(false);
    }
  };

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

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonText);
    setCopied(true);
    toast.success("JSON copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      toast.success("JSON formatted");
    } catch (err: any) {
      toast.error(`JSON syntax error: ${err.message}`);
    }
  };

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      JSON.parse(jsonText);
    } catch (err: any) {
      toast.error(`Invalid JSON syntax: ${err.message}`);
      return;
    }

    if (selectedTarget === "global") {
      onImportGlobal(jsonText);
      onClose();
    } else if (onSaveHarnessConfig) {
      try {
        await onSaveHarnessConfig(selectedTarget, jsonText);
        onClose();
      } catch (err: any) {
        toast.error(`Failed to save ${selectedTarget} config: ${err}`);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col app-panel shadow-card-hover overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle px-6 py-4">
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4 text-accent-light" />
            <h2 className="text-[16px] font-semibold tracking-tight text-primary">
              MCP Configuration Editor
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[12px] font-medium text-muted shrink-0">Source:</label>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="app-input text-[12px] font-semibold cursor-pointer max-w-xs"
            >
              <option value="global">📦 Global Server Inventory Export</option>
              {harnesses.filter((h) => h.installed).length > 0 && (
                <optgroup label="Connected AI Harnesses">
                  {harnesses
                    .filter((h) => h.installed)
                    .map((h) => (
                      <option key={h.key} value={h.key}>
                        ✓ {h.display_name} ({h.key})
                      </option>
                    ))}
                </optgroup>
              )}
              {harnesses.filter((h) => !h.installed).length > 0 && (
                <optgroup label="Unconnected (Not Installed)">
                  {harnesses
                    .filter((h) => !h.installed)
                    .map((h) => (
                      <option key={h.key} value={h.key}>
                        ✗ {h.display_name} ({h.key})
                      </option>
                    ))}
                </optgroup>
              )}
            </select>

            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-primary transition-colors ml-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Disk Path Bar */}
        {harnessDetails && harnessDetails.config_path && (
          <div className="px-6 py-2 flex items-center justify-between text-[11px] font-mono bg-bg-secondary border-b border-border-subtle">
            <span className="truncate flex items-center gap-1.5">
              <FileCode className="h-3.5 w-3.5 text-accent-light shrink-0" />
              <span className="text-faint">Disk Path:</span>
              <span className="text-primary font-semibold truncate">{harnessDetails.config_path}</span>
            </span>
            <span className={harnessDetails.exists ? "text-emerald-400 font-semibold shrink-0" : "text-amber-400 shrink-0"}>
              {harnessDetails.exists ? "✓ Existing Config" : "⚡ Will Create File"}
            </span>
          </div>
        )}

        {/* Content */}
        <form onSubmit={handleSaveSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between text-[12px]">
            <p className="text-muted">
              {selectedTarget === "global"
                ? "View, copy, or edit raw JSON array of all MCP server configurations."
                : `Inspect and edit raw configuration file for ${harnessDetails?.display_name || selectedTarget}.`}
            </p>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleFormatJson}
                className="flex items-center gap-1 text-muted hover:text-primary font-medium transition-colors"
                title="Format JSON code"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Format
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-accent-light font-medium hover:underline"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy JSON"}
              </button>
            </div>
          </div>

          <textarea
            rows={16}
            value={jsonText}
            disabled={loadingConfig}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder='{\n  "mcpServers": {}\n}'
            className="w-full font-mono text-[12px] text-primary bg-bg-secondary border border-border-subtle rounded-lg p-4 focus:border-border outline-none resize-none leading-relaxed"
          />

          <div className="flex justify-end gap-3 border-t border-border-subtle pt-4">
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
              <Download className="h-4 w-4" />
              {selectedTarget === "global" ? "Save & Import JSON" : "Save & Sync Harness Config"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

