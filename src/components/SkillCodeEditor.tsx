import { useState, useMemo, useRef, useEffect, useCallback, useTransition } from "react";
import {
  Copy,
  Check,
  Eye,
  Edit3,
  Columns,
  Save,
  Wand2,
  FileText,
  Sliders,
  Plus,
  ChevronDown,
  Sparkles,
  GitCompare,
  Undo2,
  Loader2,
} from "lucide-react";
import { SkillMarkdown } from "./SkillMarkdown";
import { DocumentDiffViewer } from "./DocumentDiffViewer";
import { cn } from "../utils";
import { SkillDirectivesModal } from "./SkillDirectivesModal";
import {
  parseSkillFrontmatter,
  upsertFrontmatterDirective,
  insertAgentInstructionSection,
  AGENT_INSTRUCTION_SECTIONS,
} from "../lib/skillDirectives";
import { toast } from "sonner";

interface SkillCodeEditorProps {
  filename: string;
  value: string;
  originalValue?: string;
  onChange: (val: string) => void;
  onSave: () => void;
  onAutoFix?: () => void;
  isDirty?: boolean;
  saving?: boolean;
  skillName?: string;
}

export function SkillCodeEditor({
  filename,
  value,
  originalValue,
  onChange,
  onSave,
  onAutoFix,
  isDirty: externalIsDirty,
  saving,
  skillName,
}: SkillCodeEditorProps) {
  const [viewMode, setViewMode] = useState<"edit" | "split" | "preview" | "diff">("edit");
  const [copied, setCopied] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [showDirectivesModal, setShowDirectivesModal] = useState(false);
  const [showQuickInsertMenu, setShowQuickInsertMenu] = useState(false);
  const quickMenuRef = useRef<HTMLDivElement>(null);

  // Immediate local state for 60fps typing without rendering lags
  const [localText, setLocalText] = useState(value);
  // Debounced & deferred state for markdown preview and diff computation
  const [debouncedPreviewText, setDebouncedPreviewText] = useState(value);
  const [isUpdatingPreview, startPreviewTransition] = useTransition();

  const lastEmittedValueRef = useRef(value);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Synchronize when value changes externally (e.g. file switched, auto-fixed, or reverted)
  useEffect(() => {
    if (value !== lastEmittedValueRef.current) {
      setLocalText(value);
      lastEmittedValueRef.current = value;
      setDebouncedPreviewText(value);
    }
  }, [value]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, []);

  // Flush pending changes immediately to parent
  const flushChanges = useCallback(
    (textToFlush?: string) => {
      const text = textToFlush !== undefined ? textToFlush : localText;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (lastEmittedValueRef.current !== text) {
        lastEmittedValueRef.current = text;
        onChange(text);
      }
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      setDebouncedPreviewText(text);
    },
    [localText, onChange]
  );

  const handleTextChange = useCallback(
    (newText: string) => {
      // 1. Immediate local state update (zero keystroke latency)
      setLocalText(newText);

      // 2. Debounced parent update (180ms) to prevent freezing outer components
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        lastEmittedValueRef.current = newText;
        onChange(newText);
      }, 180);

      // 3. Debounced async preview / diff update (250ms) using React 19 concurrent transition
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
      }
      previewTimerRef.current = setTimeout(() => {
        startPreviewTransition(() => {
          setDebouncedPreviewText(newText);
        });
      }, 250);
    },
    [onChange]
  );

  // Close quick insert dropdown when clicking outside
  useEffect(() => {
    if (!showQuickInsertMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (quickMenuRef.current && !quickMenuRef.current.contains(e.target as Node)) {
        setShowQuickInsertMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showQuickInsertMenu]);

  const isMarkdown = filename.endsWith(".md");
  const isDirty = originalValue !== undefined ? localText !== originalValue : externalIsDirty;

  const lines = useMemo(() => localText.split("\n"), [localText]);
  const totalLines = lines.length;
  const totalChars = localText.length;

  // Real-time frontmatter inspect from debounced preview text
  const parsedDoc = useMemo(() => {
    return parseSkillFrontmatter(debouncedPreviewText);
  }, [debouncedPreviewText]);

  const activeDirectivesCount = Object.keys(parsedDoc.frontmatter).length;
  const hasMissingMandatory =
    !parsedDoc.frontmatter.name || !parsedDoc.frontmatter.description;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(localText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const updateCursorPosition = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const pos = target.selectionStart;
    const textBefore = localText.substring(0, pos);
    const lineNum = textBefore.split("\n").length;
    const lastNewLine = textBefore.lastIndexOf("\n");
    const colNum = pos - lastNewLine;
    setCursorPos({ line: lineNum, col: colNum });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      flushChanges();
      onSave();
    }
  };

  const handleSaveClick = () => {
    flushChanges();
    onSave();
  };

  const handleQuickAddDirective = (key: string, defaultVal: any) => {
    setShowQuickInsertMenu(false);
    const updated = upsertFrontmatterDirective(localText, key, defaultVal);
    setLocalText(updated);
    setDebouncedPreviewText(updated);
    lastEmittedValueRef.current = updated;
    onChange(updated);
    toast.success(`Added directive '${key}'`);
  };

  const handleQuickAddSection = (sectionId: string) => {
    setShowQuickInsertMenu(false);
    const sec = AGENT_INSTRUCTION_SECTIONS.find((s) => s.id === sectionId);
    if (!sec) return;
    const { updatedMarkdown, alreadyExisted } = insertAgentInstructionSection(
      localText,
      sec.heading,
      sec.template
    );
    if (alreadyExisted) {
      toast.info(`Section '${sec.heading}' is already present`);
    } else {
      setLocalText(updatedMarkdown);
      setDebouncedPreviewText(updatedMarkdown);
      lastEmittedValueRef.current = updatedMarkdown;
      onChange(updatedMarkdown);
      toast.success(`Added section '${sec.title}'`);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-surface min-w-0 overflow-hidden relative">
      {/* Editor Header Bar */}
      <div className="h-10 border-b border-border px-3 flex items-center justify-between bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold text-primary">{filename}</span>
          {isDirty && (
            <span className="w-2 h-2 rounded-full bg-amber-400" title="Unsaved changes" />
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Directives & Instructions Controls for SKILL.md */}
          {isMarkdown && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowDirectivesModal(true)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-lg border transition flex items-center gap-1.5 shadow-xs",
                  hasMissingMandatory
                    ? "bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                    : "bg-surface hover:bg-surface-hover text-primary border-border"
                )}
                title="Configure Agent Directives & Instructions"
              >
                <Sliders className="w-3.5 h-3.5 text-accent" />
                <span className="font-medium">Directives</span>
                {hasMissingMandatory ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" title="Mandatory directive missing" />
                ) : (
                  <span className="text-[10px] text-muted font-mono">
                    ({activeDirectivesCount})
                  </span>
                )}
              </button>

              {/* Quick Add Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowQuickInsertMenu(!showQuickInsertMenu)}
                  className="text-xs px-1.5 py-1 bg-surface hover:bg-surface-hover border border-border rounded-lg text-muted hover:text-primary transition flex items-center gap-0.5 shadow-xs"
                  title="Quick insert directive or agent section"
                >
                  <Plus className="w-3.5 h-3.5 text-accent" />
                  <ChevronDown className="w-3 h-3" />
                </button>

                {showQuickInsertMenu && (
                  <div
                    ref={quickMenuRef}
                    style={{ backgroundColor: "var(--color-surface)" }}
                    className="absolute right-0 top-full mt-1.5 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-2xl z-50 text-xs text-primary"
                  >
                    <div className="px-2.5 py-1 text-[10px] font-semibold text-muted uppercase tracking-wider">
                      Quick Directives
                    </div>
                    <button
                      onClick={() => handleQuickAddDirective("allowed-tools", ["read_file", "run_command"])}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-primary flex items-center justify-between group transition-colors"
                    >
                      <span className="font-mono text-[11px] text-primary">allowed-tools</span>
                      <span className="text-[10px] text-muted group-hover:text-accent font-medium">+ array</span>
                    </button>
                    <button
                      onClick={() => handleQuickAddDirective("context", "fork")}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-primary flex items-center justify-between group transition-colors"
                    >
                      <span className="font-mono text-[11px] text-primary">context: fork</span>
                      <span className="text-[10px] text-muted group-hover:text-accent font-medium">+ subagent</span>
                    </button>
                    <button
                      onClick={() => handleQuickAddDirective("argument-hint", "[argument] [--flag]")}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-primary flex items-center justify-between group transition-colors"
                    >
                      <span className="font-mono text-[11px] text-primary">argument-hint</span>
                      <span className="text-[10px] text-muted group-hover:text-accent font-medium">+ params</span>
                    </button>
                    <button
                      onClick={() => handleQuickAddDirective("model", "claude-3-7-sonnet")}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-primary flex items-center justify-between group transition-colors"
                    >
                      <span className="font-mono text-[11px] text-primary">model</span>
                      <span className="text-[10px] text-muted group-hover:text-accent font-medium">+ override</span>
                    </button>

                    <div className="border-t border-border my-1" />

                    <div className="px-2.5 py-1 text-[10px] font-semibold text-muted uppercase tracking-wider">
                      Agent Guidance Sections
                    </div>
                    <button
                      onClick={() => handleQuickAddSection("when_to_use")}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-primary flex items-center justify-between group transition-colors"
                    >
                      <span className="text-primary font-medium">## When to Use</span>
                      <span className="text-[10px] text-muted group-hover:text-accent font-medium">+ section</span>
                    </button>
                    <button
                      onClick={() => handleQuickAddSection("workflow")}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-primary flex items-center justify-between group transition-colors"
                    >
                      <span className="text-primary font-medium">## Workflow</span>
                      <span className="text-[10px] text-muted group-hover:text-accent font-medium">+ steps</span>
                    </button>

                    <div className="border-t border-border my-1" />

                    <button
                      onClick={() => {
                        setShowQuickInsertMenu(false);
                        setShowDirectivesModal(true);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-accent font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Full Directives Assistant...
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

            <div className="flex items-center bg-bg-secondary p-0.5 rounded-lg border border-border">
              <button
                onClick={() => setViewMode("edit")}
                className={cn(
                  "px-2 py-0.5 text-xs rounded-md transition flex items-center gap-1",
                  viewMode === "edit"
                    ? "bg-surface text-primary shadow-xs font-medium"
                    : "text-muted hover:text-primary"
                )}
                title="Edit Code"
              >
                <Edit3 className="w-3 h-3" /> Edit
              </button>

              {isMarkdown && (
                <>
                  <button
                    onClick={() => setViewMode("split")}
                    className={cn(
                      "px-2 py-0.5 text-xs rounded-md transition flex items-center gap-1",
                      viewMode === "split"
                        ? "bg-surface text-primary shadow-xs font-medium"
                        : "text-muted hover:text-primary"
                    )}
                    title="Split Edit & Preview"
                  >
                    <Columns className="w-3 h-3" /> Split
                  </button>
                  <button
                    onClick={() => setViewMode("preview")}
                    className={cn(
                      "px-2 py-0.5 text-xs rounded-md transition flex items-center gap-1",
                      viewMode === "preview"
                        ? "bg-surface text-primary shadow-xs font-medium"
                        : "text-muted hover:text-primary"
                    )}
                    title="Rendered Markdown Preview"
                  >
                    <Eye className="w-3 h-3" /> Preview
                  </button>
                </>
              )}

              <button
                onClick={() => setViewMode("diff")}
                className={cn(
                  "px-2 py-0.5 text-xs rounded-md transition flex items-center gap-1",
                  viewMode === "diff"
                    ? "bg-surface text-primary shadow-xs font-medium"
                    : "text-muted hover:text-primary"
                )}
                title="Diff Preview (Buffer vs Disk)"
              >
                <GitCompare className="w-3 h-3 text-accent" /> Diff
                {isDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" title="Unsaved changes" />
                )}
              </button>
            </div>

          {onAutoFix && (
            <button
              onClick={onAutoFix}
              className="text-xs px-2.5 py-1 bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/25 rounded-lg hover:bg-amber-500/20 transition flex items-center gap-1 font-medium"
              title="Safe Auto-Format / Fix Frontmatter"
            >
              <Wand2 className="w-3.5 h-3.5" /> Auto-Fix
            </button>
          )}

          <button
            onClick={handleCopy}
            className="p-1.5 text-muted hover:text-primary hover:bg-surface-hover rounded-lg transition"
            title="Copy Content"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            onClick={handleSaveClick}
            disabled={saving || !isDirty}
            className={cn(
              "text-xs px-3 py-1 rounded-lg font-medium transition flex items-center gap-1.5 shadow-xs",
              isDirty
                ? "bg-accent text-white hover:bg-accent/90"
                : "bg-surface-hover text-muted cursor-not-allowed border border-border/50"
            )}
          >
            <Save className="w-3.5 h-3.5" /> {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Code Input Area */}
        {(viewMode === "edit" || viewMode === "split") && (
          <div
            className={cn(
              "flex min-w-0 h-full font-mono text-xs leading-relaxed bg-surface",
              viewMode === "split" ? "w-1/2 flex-1" : "w-full flex-1"
            )}
          >
            {/* Line Numbers */}
            <div className="w-10 py-3 select-none text-right pr-2.5 text-muted/40 bg-bg-secondary/60 border-r border-border/50 shrink-0 font-mono text-[11px]">
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            {/* Textarea */}
            <textarea
              value={localText}
              onChange={(e) => handleTextChange(e.target.value)}
              onBlur={() => flushChanges()}
              onKeyUp={updateCursorPosition}
              onClick={updateCursorPosition}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              className="flex-1 p-3 bg-transparent text-primary focus:outline-none resize-none font-mono whitespace-pre overflow-y-auto leading-relaxed"
              placeholder="Write your skill instructions or code here..."
            />
          </div>
        )}

        {/* Markdown Preview Area */}
        {(viewMode === "preview" || viewMode === "split") && isMarkdown && (
          <div
            className={cn(
              "flex-1 min-w-0 p-6 md:p-8 overflow-y-auto bg-surface border-l border-border text-primary",
              viewMode === "split" ? "w-1/2" : "w-full"
            )}
          >
            <div className="max-w-3xl mx-auto">
              {isUpdatingPreview && (
                <div className="mb-2 flex items-center justify-end gap-1.5 text-[11px] text-muted font-mono animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin text-accent" />
                  <span>updating preview...</span>
                </div>
              )}
              <SkillMarkdown content={debouncedPreviewText} />
            </div>
          </div>
        )}

        {/* Diff Preview Area */}
        {viewMode === "diff" && (
          <div className="flex-1 min-w-0 p-6 md:p-8 overflow-y-auto bg-surface text-primary">
            <div className="max-w-4xl mx-auto space-y-4">
              {/* Diff Header Bar */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-bg-secondary/70 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/10 text-accent">
                    <GitCompare className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-primary">{filename}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-border text-muted font-mono">
                        Buffer vs Disk
                      </span>
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">
                      {isDirty
                        ? "Unsaved modifications in editor compared to file on disk."
                        : "No unsaved changes; active editor buffer matches file on disk."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isDirty && originalValue !== undefined && (
                    <button
                      type="button"
                      onClick={() => {
                        setLocalText(originalValue);
                        setDebouncedPreviewText(originalValue);
                        lastEmittedValueRef.current = originalValue;
                        onChange(originalValue);
                        toast.info("Reverted all unsaved changes to file on disk");
                      }}
                      className="text-xs px-2.5 py-1 rounded-lg border border-border bg-surface hover:bg-surface-hover text-secondary hover:text-primary transition flex items-center gap-1 shadow-xs font-medium"
                      title="Discard unsaved changes and revert to file on disk"
                    >
                      <Undo2 className="w-3.5 h-3.5" /> Revert
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveClick}
                    disabled={saving || !isDirty}
                    className={cn(
                      "text-xs px-3 py-1 rounded-lg font-medium transition flex items-center gap-1.5 shadow-xs",
                      isDirty
                        ? "bg-accent text-white hover:bg-accent/90"
                        : "bg-surface-hover text-muted cursor-not-allowed border border-border/50"
                    )}
                  >
                    <Save className="w-3.5 h-3.5" /> {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>

              {/* Document Diff Viewer */}
              <DocumentDiffViewer original={originalValue ?? ""} updated={debouncedPreviewText} />
            </div>
          </div>
        )}
      </div>

      {/* Editor Status Footer */}
      <div className="h-6 border-t border-border px-3 flex items-center justify-between text-[11px] text-muted bg-surface shrink-0 select-none">
        <div className="flex items-center gap-4">
          <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          <span>{totalLines} lines</span>
          <span>{totalChars} characters</span>
          {isMarkdown && (
            <span className="text-accent font-medium">
              {activeDirectivesCount} directives
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span>UTF-8</span>
          <span className="uppercase">{filename.split(".").pop() || "TXT"}</span>
        </div>
      </div>

      {/* Directives & Instructions Modal */}
      {isMarkdown && (
        <SkillDirectivesModal
          isOpen={showDirectivesModal}
          onClose={() => setShowDirectivesModal(false)}
          content={localText}
          onChangeContent={(val) => {
            setLocalText(val);
            setDebouncedPreviewText(val);
            lastEmittedValueRef.current = val;
            onChange(val);
          }}
          skillName={skillName}
        />
      )}
    </div>
  );
}
