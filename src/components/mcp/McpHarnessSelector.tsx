import React, { useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../utils";
import { AgentIcon } from "../AgentIcon";
import type { McpHarnessInfo } from "../../lib/tauri";

interface McpHarnessSelectorProps {
  harnesses: McpHarnessInfo[];
  selectedHarnesses: string[];
  onToggle: (key: string) => void;
}

export const McpHarnessSelector: React.FC<McpHarnessSelectorProps> = ({
  harnesses,
  selectedHarnesses,
  onToggle,
}) => {
  const [showAll, setShowAll] = useState(false);

  const uninstalledHarnesses = harnesses.filter((h) => !h.installed);
  const hiddenUninstalledCount = uninstalledHarnesses.filter(
    (h) => !selectedHarnesses.includes(h.key)
  ).length;

  const visibleHarnesses = showAll
    ? harnesses
    : harnesses.filter((h) => h.installed || selectedHarnesses.includes(h.key));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {visibleHarnesses.map((h) => {
          const isSelected = selectedHarnesses.includes(h.key);
          return (
            <button
              key={h.key}
              type="button"
              onClick={() => onToggle(h.key)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-medium transition-all text-left",
                isSelected
                  ? "border-accent-border bg-accent-bg text-accent-light"
                  : "border-border-subtle bg-surface text-muted hover:border-border",
                !h.installed && !isSelected && "opacity-60"
              )}
            >
              <div
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded border transition-colors shrink-0",
                  isSelected
                    ? "border-accent-dark bg-accent-dark text-white"
                    : "border-border-subtle bg-bg-secondary"
                )}
              >
                {isSelected && <Check className="h-3 w-3" />}
              </div>
              <AgentIcon
                agentKey={h.key}
                displayName={h.display_name}
                className="h-4 w-4 rounded-[3px] shrink-0"
              />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="truncate leading-tight">{h.display_name}</span>
                {!h.installed && (
                  <span className="text-[10px] text-faint leading-none mt-0.5">Not installed</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {hiddenUninstalledCount > 0 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-[11px] text-muted hover:text-accent-light flex items-center gap-1 font-medium transition-colors pt-1"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Show all harnesses ({hiddenUninstalledCount} not connected)
        </button>
      )}

      {showAll && uninstalledHarnesses.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="text-[11px] text-muted hover:text-accent-light flex items-center gap-1 font-medium transition-colors pt-1"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          Hide unconnected harnesses
        </button>
      )}
    </div>
  );
};