import React, { useState, useEffect } from "react";
import { X, Sparkles, Download } from "lucide-react";
import { McpHarnessSelector } from "./McpHarnessSelector";
import type { McpPreset, McpServerConfig, McpHarnessInfo } from "../../lib/tauri";
import { buildServerConfigFromParams } from "../../lib/mcpInstall";

interface McpPresetModalProps {
  isOpen: boolean;
  presets: McpPreset[];
  harnesses: McpHarnessInfo[];
  onClose: () => void;
  onInstallPreset: (server: McpServerConfig, targetHarnesses: string[]) => void;
}

export const McpPresetModal: React.FC<McpPresetModalProps> = ({
  isOpen,
  presets,
  harnesses,
  onClose,
  onInstallPreset,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<McpPreset | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [selectedHarnesses, setSelectedHarnesses] = useState<string[]>([]);

  useEffect(() => {
    setSelectedHarnesses(harnesses.filter((h) => h.installed).map((h) => h.key));
  }, [harnesses]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedPreset(null);
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: McpPreset) => {
    setSelectedPreset(preset);
    const initialParams: Record<string, string> = {};
    preset.params.forEach((p) => {
      initialParams[p.name] = p.default_value || "";
    });
    setParamValues(initialParams);
  };

  const handleParamChange = (name: string, value: string) => {
    setParamValues({ ...paramValues, [name]: value });
  };

  const handleInstallSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPreset) return;

    const serverConfig = buildServerConfigFromParams(selectedPreset, paramValues);

    onInstallPreset(serverConfig, selectedHarnesses);
    setSelectedPreset(null);
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
      onClick={() => {
        setSelectedPreset(null);
        onClose();
      }}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col app-panel shadow-card-hover overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <h2 className="text-[16px] font-semibold tracking-tight text-primary">MCP Server Presets</h2>
          </div>
          <button
            onClick={() => {
              setSelectedPreset(null);
              onClose();
            }}
            className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Content */}
        {!selectedPreset ? (
          <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
            <p className="text-[13px] text-muted mb-4">
              Select a pre-configured MCP server template to install across your AI harnesses with 1-click.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  className="group cursor-pointer flex flex-col justify-between app-panel-muted p-4 transition-all hover:border-border hover:bg-surface-hover"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="app-section-title text-[10px]">
                        {preset.category}
                      </span>
                      <span className="rounded bg-accent-bg px-2 py-0.5 text-[10px] font-bold text-accent-light border border-accent-border">
                        {preset.transport.toUpperCase()}
                      </span>
                    </div>
                    <h3 className="mt-1 text-[14px] font-semibold text-primary group-hover:text-accent-light transition-colors">
                      {preset.name}
                    </h3>
                    <p className="mt-2 text-[12px] leading-relaxed text-muted line-clamp-2">
                      {preset.description}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-border-faint pt-3 text-[11px] text-faint">
                    <span className="font-mono">{preset.command || preset.url}</span>
                    <button className="flex items-center gap-1 font-semibold text-accent-light group-hover:underline">
                      <Download className="h-3.5 w-3.5" /> Setup
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleInstallSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
            <div>
              <button
                type="button"
                onClick={() => setSelectedPreset(null)}
                className="text-[12px] text-accent-light font-medium hover:underline mb-2 block"
              >
                ← Back to Presets
              </button>
              <h3 className="text-[16px] font-semibold text-primary">{selectedPreset.name} Setup</h3>
              <p className="text-[13px] text-muted mt-1">{selectedPreset.description}</p>
            </div>

            {/* Parametric Form Fields */}
            {selectedPreset.params.length > 0 ? (
              <div className="space-y-4 app-panel-muted p-4">
                <h4 className="app-section-title text-[11px]">
                  Required Parameters
                </h4>
                {selectedPreset.params.map((param) => (
                  <div key={param.name}>
                    <label className="block text-[12px] font-medium text-muted mb-1.5">
                      {param.label} {param.required && "*"}
                    </label>
                    <input
                      type={param.is_secret ? "password" : "text"}
                      required={param.required}
                      value={paramValues[param.name] || ""}
                      onChange={(e) => handleParamChange(param.name, e.target.value)}
                      placeholder={param.description}
                      className="app-input w-full font-mono text-[12px]"
                    />
                    <p className="text-[11px] text-faint mt-1">{param.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-accent-border bg-accent-bg p-3 text-[12px] text-accent-light">
                No additional parameters required for this preset. Ready to deploy!
              </div>
            )}

            {/* Target Harness Selection */}
            <div>
              <label className="app-section-title block mb-2 text-[11px]">
                Deploy to Target Harnesses
              </label>
              <McpHarnessSelector
                harnesses={harnesses}
                selectedHarnesses={selectedHarnesses}
                onToggle={toggleHarness}
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end gap-3 border-t border-border-subtle pt-4">
              <button
                type="button"
                onClick={() => setSelectedPreset(null)}
                className="app-button-secondary"
              >
                Back
              </button>
              <button
                type="submit"
                className="app-button-primary"
              >
                <Download className="h-4 w-4" /> Install Preset
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
