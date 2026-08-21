import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Search,
  CheckCircle2,
  Star,
  ExternalLink,
  Download,
  Filter,
  Globe,
} from "lucide-react";
import { McpHarnessSelector } from "./McpHarnessSelector";
import { buildServerConfigFromParams } from "../../lib/mcpInstall";
import * as api from "../../lib/tauri";
import type {
  MarketplaceMcpServer,
  McpServerConfig,
  McpHarnessInfo,
} from "../../lib/tauri";

interface McpMarketplaceModalProps {
  isOpen: boolean;
  harnesses: McpHarnessInfo[];
  onClose: () => void;
  onInstall: (server: McpServerConfig, targetHarnesses: string[]) => void;
}

export const McpMarketplaceModal: React.FC<McpMarketplaceModalProps> = ({
  isOpen,
  harnesses,
  onClose,
  onInstall,
}) => {
  const [allServers, setAllServers] = useState<MarketplaceMcpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  // Installation Sub-dialog State
  const [installingServer, setInstallingServer] = useState<MarketplaceMcpServer | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [selectedHarnesses, setSelectedHarnesses] = useState<string[]>([]);

  // 500ms Debounce on typing in search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveSearchQuery(searchInput);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (isOpen) {
      loadMarketplaceData(activeSearchQuery, selectedCategory);
      setSelectedHarnesses(harnesses.filter((h) => h.installed).map((h) => h.key));
    }
  }, [isOpen, activeSearchQuery, selectedCategory, harnesses]);

  const loadMarketplaceData = async (query?: string, cat?: string) => {
    setLoading(true);
    try {
      const data = await api.fetchMcpMarketplaceServers(
        query && query.trim() ? query.trim() : undefined,
        cat && cat !== "All" ? cat : undefined
      );
      setAllServers(data);
    } catch (err: any) {
      console.error("Failed to fetch marketplace servers from Glama:", err);
    } finally {
      setLoading(false);
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    set.add("All");
    set.add("MCP Server");
    set.add("MCP Connector");
    allServers.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set);
  }, [allServers]);

  const filteredServers = useMemo(() => {
    return [...allServers].sort((a, b) => {
      const starsA = a.stars ?? -1;
      const starsB = b.stars ?? -1;
      if (starsA !== starsB) {
        return starsB - starsA;
      }
      return a.name.localeCompare(b.name);
    });
  }, [allServers]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearchQuery(searchInput);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setActiveSearchQuery("");
  };

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInstallingServer(null);
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleStartInstall = (server: MarketplaceMcpServer) => {
    setInstallingServer(server);
    const initialParams: Record<string, string> = {};
    server.params.forEach((p) => {
      initialParams[p.name] = p.default_value || "";
    });
    setParamValues(initialParams);
  };

  const handleParamChange = (name: string, value: string) => {
    setParamValues({ ...paramValues, [name]: value });
  };

  const handleConfirmInstall = (e: React.FormEvent) => {
    e.preventDefault();
    if (!installingServer) return;

    const serverConfig = buildServerConfigFromParams(installingServer, paramValues);

    onInstall(serverConfig, selectedHarnesses);
    setInstallingServer(null);
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
        setInstallingServer(null);
        onClose();
      }}
    >
      <div
        className="relative w-full max-w-4xl h-[85vh] min-h-[550px] max-h-[90vh] flex flex-col app-panel shadow-card-hover overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-accent-light" />
            <h2 className="text-[16px] font-semibold tracking-tight text-primary">
              Glama MCP Directory & Connectors
            </h2>
          </div>
          <button
            onClick={() => {
              setInstallingServer(null);
              onClose();
            }}
            className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Directory Search & Filter Header */}
        {!installingServer ? (
          <>
            <form
              onSubmit={handleSearchSubmit}
              className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-border-subtle bg-bg-secondary px-6 py-3"
            >
              <div className="relative flex-1 w-full flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={handleInputChange}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSearchSubmit(e);
                      }
                    }}
                    placeholder="Search Glama MCP servers & connectors by name, author, tag..."
                    className="app-input w-full pl-9 pr-8 text-[13px]"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors p-0.5 rounded-full"
                      title="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  className="app-button-primary px-3.5 py-1.5 text-[12px] whitespace-nowrap flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Search</span>
                </button>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <Filter className="h-3.5 w-3.5 text-muted" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="app-input text-[12px] cursor-pointer"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </form>

            {/* Grid list of marketplace servers */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
              {loading ? (
                <div className="flex justify-center items-center h-full py-12 text-xs text-muted">
                  Loading directory listings...
                </div>
              ) : filteredServers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredServers.map((server) => (
                    <div
                      key={server.id}
                      className="group flex flex-col justify-between app-panel-muted p-4 transition-all hover:border-border hover:bg-surface-hover"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-semibold text-primary text-[14px] leading-tight group-hover:text-accent-light transition-colors">
                                {server.name}
                              </h3>
                              {server.verified && (
                                <span title="Verified Server">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-faint font-medium">
                              by {server.author}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {server.rating !== undefined && server.rating !== null && (
                              <span
                                className="flex items-center gap-1 text-[11px] text-amber-400 font-medium bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20"
                                title="Rating"
                              >
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                <span>{server.rating.toFixed(1)}</span>
                                {server.rating_count && (
                                  <span className="text-[10px] text-amber-400/70">({server.rating_count})</span>
                                )}
                              </span>
                            )}
                            {server.stars !== undefined && server.stars !== null && (
                              <span
                                className="flex items-center gap-1 text-[11px] text-primary font-medium bg-surface-hover px-1.5 py-0.5 rounded border border-border-subtle"
                                title="GitHub Stars"
                              >
                                <Star className="h-3 w-3 text-muted" />
                                <span>
                                  {server.stars >= 1000
                                    ? `${(server.stars / 1000).toFixed(1)}k`
                                    : server.stars}
                                </span>
                              </span>
                            )}
                            <span className="rounded bg-accent-bg px-2 py-0.5 text-[10px] font-bold text-accent-light border border-accent-border">
                              {server.transport.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        <p className="mt-2 text-[12px] leading-relaxed text-muted line-clamp-3">
                          {server.description}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-1">
                          {server.tags.map((t) => (
                            <span
                              key={t}
                              className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-faint border border-border-subtle"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-border-faint pt-3">
                        {server.repository_url ? (
                          <a
                            href={server.repository_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-[11px] text-muted hover:text-primary transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" /> Repository
                          </a>
                        ) : (
                          <span />
                        )}

                        <button
                          onClick={() => handleStartInstall(server)}
                          className="app-button-primary py-1.5 px-3 text-[12px]"
                        >
                          <Download className="h-3.5 w-3.5" /> Install
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-16 text-center text-muted text-xs">
                  No MCP servers match your criteria.
                </div>
              )}
            </div>
          </>
        ) : (
          /* Installation Setup Step */
          <form onSubmit={handleConfirmInstall} className="flex-1 overflow-y-auto p-6 space-y-5">
            <div>
              <button
                type="button"
                onClick={() => setInstallingServer(null)}
                className="text-[12px] text-accent-light font-medium hover:underline mb-2 block"
              >
                ← Back to Marketplace List
              </button>
              <h3 className="text-[16px] font-semibold text-primary">{installingServer.name} Installation</h3>
              <p className="text-[13px] text-muted mt-1">{installingServer.description}</p>
            </div>

            {/* Parameters Prompt */}
            {installingServer.params.length > 0 ? (
              <div className="space-y-4 app-panel-muted p-4">
                <h4 className="app-section-title text-[11px]">
                  Configuration Parameters
                </h4>
                {installingServer.params.map((param) => (
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
                Ready to install standard command setup. No additional tokens required.
              </div>
            )}

            {/* Target Harness Selection */}
            <div>
              <label className="app-section-title block mb-2 text-[11px]">
                Deploy to AI Harnesses
              </label>
              <McpHarnessSelector
                harnesses={harnesses}
                selectedHarnesses={selectedHarnesses}
                onToggle={toggleHarness}
              />
            </div>

            {/* Submit Footer */}
            <div className="flex justify-end gap-3 border-t border-border-subtle pt-4">
              <button
                type="button"
                onClick={() => setInstallingServer(null)}
                className="app-button-secondary"
              >
                Back
              </button>
              <button
                type="submit"
                className="app-button-primary"
              >
                <Download className="h-4 w-4" /> Save & Deploy Server
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
