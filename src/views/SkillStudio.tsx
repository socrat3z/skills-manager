import { useState, useEffect, useCallback, useMemo, useDeferredValue } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Code,
  Sparkles,
  Plus,
  GitCommit,
  AlertTriangle,
  Wand2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ShieldAlert,
  Search,
  Lightbulb,
  CheckCircle2,
  Info,
  X,
  Loader2,
  GitCompare,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import * as api from "../lib/tauri";
import { SkillFileExplorer } from "../components/SkillFileExplorer";
import { SkillCodeEditor } from "../components/SkillCodeEditor";
import { SkillAiAssistant } from "../components/SkillAiAssistant";
import { DocumentDiffViewer } from "../components/DocumentDiffViewer";
import { NewSkillDialog } from "../components/NewSkillDialog";
import { validateSkillContent, safeAutoFixSkill } from "../lib/skillValidation";
import { cn } from "../utils";

const ISSUE_HINTS: Record<string, { hint: string; autoFixable?: boolean }> = {
  MISSING_FRONTMATTER: {
    hint: "Click 'Safe Auto-Fix' to generate standard YAML frontmatter with name, description, and least-privilege tools.",
    autoFixable: true,
  },
  MISSING_NAME: {
    hint: "Specify a 'name: my-skill' directive to identify your skill to LLM agents and routing models.",
    autoFixable: true,
  },
  INVALID_NAME_FORMAT: {
    hint: "Convert skill name to lowercase kebab-case (e.g. 'my-awesome-skill'). Auto-fix can slugify this for you.",
    autoFixable: true,
  },
  LONG_NAME: {
    hint: "Keep skill names under 64 characters for clean command autocomplete in slash menus.",
  },
  MISSING_DESCRIPTION: {
    hint: "Add a 'description: ...' directive detailing what the skill does and when the agent should trigger it.",
    autoFixable: true,
  },
  SHORT_DESCRIPTION: {
    hint: "Detail trigger conditions and capabilities for better LLM semantic matching and tool selection.",
  },
  TRIGGER_HINT: {
    hint: "Include explicit activation phrases like 'Use when the user asks to...', or 'Trigger phrases include...'.",
  },
  MISSING_ALLOWED_TOOLS: {
    hint: "Specify permitted tools (e.g., allowed-tools: [Read, Write, Edit]) to enforce least privilege.",
    autoFixable: true,
  },
  EMPTY_ALLOWED_TOOLS: {
    hint: "If this skill requires filesystem or shell execution, list authorized tools or permissions.",
  },
  INVALID_CONTEXT: {
    hint: "Set context to 'fork' for subagent isolation in a new context window, or 'inline' for current chat context.",
  },
  MISSING_FORK_AGENT: {
    hint: "When context is 'fork', specify the agent type (e.g. 'agent: Explore' or 'agent: Coder').",
  },
  INVALID_BOOLEAN: {
    hint: "Ensure boolean directives use unquoted 'true' or 'false' (e.g. user-invocable: true).",
  },
  ARGUMENT_HINT_WITHOUT_SUBSTITUTIONS: {
    hint: "Reference $ARGUMENTS or $1..$9 in instructions so user-provided arguments are utilized.",
  },
  SUBSTITUTIONS_WITHOUT_ARGUMENT_HINT: {
    hint: "Add 'argument-hint: <args>' to frontmatter so users see parameter hints during slash autocomplete.",
  },
  DCI_MISSING_FALLBACK: {
    hint: "Ensure shell backticks include a safe fallback handler, e.g. `!git status || echo 'Not a repo'`.",
  },
  EMPTY_SKILL_BODY: {
    hint: "Add markdown instructions, execution steps, and workflow guidance for the agent to follow.",
  },
};

export function SkillStudio() {
  const { skillId: routeSkillId } = useParams();
  const navigate = useNavigate();
  const { managedSkills, refreshManagedSkills } = useApp();

  const [selectedSkillId, setSelectedSkillId] = useState<string>("");
  const [files, setFiles] = useState<api.SkillFileInfo[]>([]);
  const [activeFile, setActiveFile] = useState<string>("SKILL.md");
  const [fileContent, setFileContent] = useState<string>("");
  const [savedContent, setSavedContent] = useState<string>("");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [savingFile, setSavingFile] = useState(false);

  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [showNewSkillDialog, setShowNewSkillDialog] = useState(false);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [showDiffInCommit, setShowDiffInCommit] = useState(true);
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [showValidationIssuesPanel, setShowValidationIssuesPanel] = useState(false);
  const [validationFilter, setValidationFilter] = useState<"all" | "error" | "warning" | "info">("all");
  const [validationSearch, setValidationSearch] = useState<string>("");

  // Initialize selected skill ID
  useEffect(() => {
    if (routeSkillId) {
      setSelectedSkillId(routeSkillId);
    } else if (managedSkills.length > 0 && !selectedSkillId) {
      setSelectedSkillId(managedSkills[0].id);
    }
  }, [routeSkillId, managedSkills, selectedSkillId]);

  const activeSkill = useMemo(() => {
    return managedSkills.find((s: api.ManagedSkill) => s.id === selectedSkillId) || null;
  }, [managedSkills, selectedSkillId]);

  // Load files for selected skill
  const loadSkillFiles = useCallback(async () => {
    if (!selectedSkillId) return;
    setLoadingFiles(true);
    try {
      const fileList = await api.listSkillFiles(selectedSkillId);
      setFiles(fileList);
    } catch (e: any) {
      toast.error("Failed to load skill files: " + (e?.message || String(e)));
    } finally {
      setLoadingFiles(false);
    }
  }, [selectedSkillId]);

  useEffect(() => {
    if (selectedSkillId) {
      loadSkillFiles();
      setActiveFile("SKILL.md");
    }
  }, [selectedSkillId, loadSkillFiles]);

  // Load file content when active file changes
  const loadFileContent = useCallback(async () => {
    if (!selectedSkillId || !activeFile) return;
    setLoadingContent(true);
    try {
      const text = await api.readSkillFile(selectedSkillId, activeFile);
      setFileContent(text);
      setSavedContent(text);
    } catch (e: any) {
      toast.error("Failed to read file: " + (e?.message || String(e)));
    } finally {
      setLoadingContent(false);
    }
  }, [selectedSkillId, activeFile]);

  useEffect(() => {
    if (selectedSkillId && activeFile) {
      loadFileContent();
    }
  }, [selectedSkillId, activeFile, loadFileContent]);

  // Validation rules check for active file using deferred value for smooth typing
  const deferredFileContent = useDeferredValue(fileContent);

  const validationResult = useMemo(() => {
    return validateSkillContent(deferredFileContent, activeFile);
  }, [deferredFileContent, activeFile]);

  const issueCounts = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    let infos = 0;
    for (const issue of validationResult.issues) {
      if (issue.type === "error") errors++;
      else if (issue.type === "warning") warnings++;
      else infos++;
    }
    return { errors, warnings, infos };
  }, [validationResult.issues]);

  const filteredValidationIssues = useMemo(() => {
    return validationResult.issues.filter((issue) => {
      if (validationFilter !== "all" && issue.type !== validationFilter) {
        return false;
      }
      if (validationSearch.trim()) {
        const q = validationSearch.toLowerCase();
        const matchMsg = issue.message.toLowerCase().includes(q);
        const matchCode = issue.code.toLowerCase().includes(q);
        const hint = ISSUE_HINTS[issue.code]?.hint.toLowerCase() || "";
        const matchHint = hint.includes(q);
        return matchMsg || matchCode || matchHint;
      }
      return true;
    });
  }, [validationResult.issues, validationFilter, validationSearch]);

  const isDirty = fileContent !== savedContent;

  const handleSave = async () => {
    if (!selectedSkillId || !activeFile) return;
    setSavingFile(true);
    try {
      await api.saveSkillFile(selectedSkillId, activeFile, fileContent);
      setSavedContent(fileContent);
      toast.success(`Saved ${activeFile}`);
      refreshManagedSkills();
    } catch (e: any) {
      toast.error("Save failed: " + (e?.message || String(e)));
    } finally {
      setSavingFile(false);
    }
  };

  const handleCreateFile = async (newRelPath: string) => {
    if (!selectedSkillId) return;
    try {
      await api.createSkillFile(selectedSkillId, newRelPath, `# ${newRelPath}\n\nFile created via Skill Studio.\n`);
      toast.success(`Created ${newRelPath}`);
      await loadSkillFiles();
      setActiveFile(newRelPath);
    } catch (e: any) {
      toast.error("Failed to create file: " + (e?.message || String(e)));
    }
  };

  const handleDeleteFile = async (relPath: string) => {
    if (!selectedSkillId) return;
    try {
      await api.deleteSkillFile(selectedSkillId, relPath);
      toast.success(`Deleted ${relPath}`);
      await loadSkillFiles();
      if (activeFile === relPath) {
        setActiveFile("SKILL.md");
      }
    } catch (e: any) {
      toast.error("Delete failed: " + (e?.message || String(e)));
    }
  };

  const handleAutoFix = () => {
    const fixed = safeAutoFixSkill(fileContent, activeSkill?.name || "custom-skill");
    setFileContent(fixed);
    toast.success("Applied frontmatter safe auto-fix");
  };

  const handleCommit = async () => {
    if (!selectedSkillId) return;
    setCommitting(true);
    try {
      if (isDirty) {
        await api.saveSkillFile(selectedSkillId, activeFile, fileContent);
        setSavedContent(fileContent);
      }
      const res = await api.commitSkillChanges(selectedSkillId, commitMessage);
      toast.success(res);
      setShowCommitModal(false);
      setCommitMessage("");
    } catch (e: any) {
      toast.error("Commit failed: " + (e?.message || String(e)));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-theme-surface text-theme-text-primary overflow-hidden">
      {/* Top Header Navigation */}
      <header className="h-14 border-b border-theme-border px-4 flex items-center justify-between bg-theme-surface shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/10 text-accent rounded-lg">
            <Code className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-theme-text-primary flex items-center gap-2">
              Skill Studio
              <span className="text-[10px] font-normal px-2 py-0.5 bg-accent/10 text-accent rounded-full border border-accent/20">
                IDE & Safe Editor
              </span>
            </h1>
            <p className="text-xs text-theme-text-muted">Edit, validate rules, AI transform & commit skill files</p>
          </div>
        </div>

        {/* Skill Selector & Controls */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={selectedSkillId}
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedSkillId(newId);
                navigate(`/studio/${newId}`);
              }}
              style={{ backgroundColor: "var(--color-surface)" }}
              className="appearance-none text-xs font-medium bg-surface hover:bg-surface-hover border border-border rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-accent text-primary cursor-pointer min-w-[200px] shadow-xs"
            >
              {managedSkills.map((s: api.ManagedSkill) => (
                <option key={s.id} value={s.id} className="bg-surface text-primary">
                  {s.name} ({s.source_type})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-muted absolute right-2.5 top-2 pointer-events-none" />
          </div>

          <button
            onClick={() => setShowNewSkillDialog(true)}
            className="text-xs px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border rounded-lg font-medium transition flex items-center gap-1.5 text-primary shadow-xs"
          >
            <Plus className="w-4 h-4 text-accent" /> New Skill
          </button>

          <button
            onClick={() => setShowCommitModal(true)}
            className="text-xs px-3 py-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg font-medium transition flex items-center gap-1.5"
          >
            <GitCommit className="w-4 h-4" /> Git Commit
          </button>

          <button
            onClick={() => setShowAiAssistant(!showAiAssistant)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 border shadow-sm ${
              showAiAssistant
                ? "bg-amber-500 text-white border-amber-500"
                : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border-amber-500/20"
            }`}
          >
            <Sparkles className="w-4 h-4" /> AI Assistant
          </button>
        </div>
      </header>

      {/* Validation Issue Banner */}
      {validationResult.issues.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/15 via-surface/40 to-amber-500/10 dark:from-amber-950/40 dark:via-surface/60 dark:to-amber-950/30 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs text-amber-950 dark:text-amber-100 shrink-0 gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
            {/* Status Icon */}
            <div className="flex items-center justify-center shrink-0">
              {issueCounts.errors > 0 ? (
                <div className="p-1 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400">
                  <ShieldAlert className="w-4 h-4" />
                </div>
              ) : (
                <div className="p-1 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              )}
            </div>

            {/* Title & Stats */}
            <div className="flex items-center gap-2 shrink-0 font-medium">
              <span className="font-semibold text-primary">Safety & Rule Validation</span>
              <span className="text-muted text-[11px]">—</span>
              <span className="text-secondary text-[11px] font-mono">
                {validationResult.issues.length} {validationResult.issues.length === 1 ? "issue" : "issues"} in {activeFile}
              </span>
            </div>

            {/* Severity Pill Badges (Clicking toggles or focuses panel) */}
            <div className="flex items-center gap-1.5 shrink-0 ml-1">
              {issueCounts.errors > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setValidationFilter("error");
                    setShowValidationIssuesPanel(true);
                  }}
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25 hover:bg-rose-500/25 transition cursor-pointer"
                  title="Filter errors in panel"
                >
                  {issueCounts.errors} error{issueCounts.errors > 1 ? "s" : ""}
                </button>
              )}
              {issueCounts.warnings > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setValidationFilter("warning");
                    setShowValidationIssuesPanel(true);
                  }}
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/25 hover:bg-amber-500/25 transition cursor-pointer"
                  title="Filter warnings in panel"
                >
                  {issueCounts.warnings} warning{issueCounts.warnings > 1 ? "s" : ""}
                </button>
              )}
              {issueCounts.infos > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setValidationFilter("info");
                    setShowValidationIssuesPanel(true);
                  }}
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/25 hover:bg-blue-500/25 transition cursor-pointer"
                  title="Filter tips in panel"
                >
                  {issueCounts.infos} tip{issueCounts.infos > 1 ? "s" : ""}
                </button>
              )}
            </div>

            {/* Top Issue Snippets */}
            <div className="hidden lg:flex items-center gap-2 ml-2 min-w-0 overflow-hidden">
              {validationResult.issues.slice(0, 2).map((issue, idx) => (
                <span
                  key={idx}
                  className={cn(
                    "text-[11px] px-2.5 py-0.5 rounded-md border font-medium truncate max-w-xs shadow-2xs",
                    issue.type === "error"
                      ? "bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200 border-rose-200 dark:border-rose-800/80"
                      : issue.type === "warning"
                      ? "bg-amber-50 dark:bg-amber-950/50 text-amber-950 dark:text-amber-200 border-amber-200 dark:border-amber-700/60"
                      : "bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-800/80"
                  )}
                  title={issue.message}
                >
                  {issue.line ? `L${issue.line}: ` : ""}{issue.message}
                </span>
              ))}
              {validationResult.issues.length > 2 && (
                <span className="text-[11px] font-medium text-muted shrink-0">
                  +{validationResult.issues.length - 2} more
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {validationResult.issues.length >= 2 && (
              <button
                type="button"
                onClick={() => setShowValidationIssuesPanel((prev) => !prev)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-lg font-medium border transition flex items-center gap-1.5 shadow-2xs",
                  showValidationIssuesPanel
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-950 dark:text-amber-100"
                    : "bg-surface hover:bg-surface-hover border-border text-secondary hover:text-primary"
                )}
                title={showValidationIssuesPanel ? "Hide full issues panel" : "Expand full issues panel"}
              >
                {showValidationIssuesPanel ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Hide Panel</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>View All ({validationResult.issues.length})</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleAutoFix}
              className="text-xs px-3 py-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-lg font-medium transition flex items-center gap-1.5 shadow-xs"
              title="Automatically fix missing required frontmatter and directives"
            >
              <Wand2 className="w-3.5 h-3.5" /> 1-Click Safe Auto-Fix
            </button>
          </div>
        </div>
      )}

      {/* Expandable Validation Issues Drawer */}
      {showValidationIssuesPanel && validationResult.issues.length >= 2 && (
        <div className="bg-surface border-b border-border shadow-xl shrink-0 z-30 overflow-hidden flex flex-col max-h-[420px]">
          {/* Header & Controls */}
          <div className="px-4 py-2.5 bg-bg-secondary/70 border-b border-border-subtle flex items-center justify-between gap-3 flex-wrap">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-surface p-0.5 rounded-lg border border-border/80">
              <button
                type="button"
                onClick={() => setValidationFilter("all")}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md font-medium transition flex items-center gap-1.5",
                  validationFilter === "all"
                    ? "bg-accent text-white shadow-xs"
                    : "text-muted hover:text-primary"
                )}
              >
                <span>All</span>
                <span className="text-[10px] opacity-75 font-mono">({validationResult.issues.length})</span>
              </button>

              {issueCounts.errors > 0 && (
                <button
                  type="button"
                  onClick={() => setValidationFilter("error")}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-md font-medium transition flex items-center gap-1.5",
                    validationFilter === "error"
                      ? "bg-rose-600 text-white shadow-xs"
                      : "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                  )}
                >
                  <AlertCircle className="w-3 h-3" />
                  <span>Errors</span>
                  <span className="text-[10px] font-mono">({issueCounts.errors})</span>
                </button>
              )}

              {issueCounts.warnings > 0 && (
                <button
                  type="button"
                  onClick={() => setValidationFilter("warning")}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-md font-medium transition flex items-center gap-1.5",
                    validationFilter === "warning"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  )}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Warnings</span>
                  <span className="text-[10px] font-mono">({issueCounts.warnings})</span>
                </button>
              )}

              {issueCounts.infos > 0 && (
                <button
                  type="button"
                  onClick={() => setValidationFilter("info")}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-md font-medium transition flex items-center gap-1.5",
                    validationFilter === "info"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                  )}
                >
                  <Info className="w-3 h-3" />
                  <span>Tips</span>
                  <span className="text-[10px] font-mono">({issueCounts.infos})</span>
                </button>
              )}
            </div>

            {/* Search Input & Quick Auto-Fix */}
            <div className="flex items-center gap-2 flex-1 justify-end max-w-md">
              <div className="relative w-full max-w-xs">
                <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter rules or messages..."
                  value={validationSearch}
                  onChange={(e) => setValidationSearch(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1 bg-surface border border-border rounded-lg text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {validationSearch && (
                  <button
                    onClick={() => setValidationSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button
                onClick={handleAutoFix}
                className="text-xs px-2.5 py-1 bg-amber-600 dark:bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-700 dark:hover:bg-amber-600 transition flex items-center gap-1.5 shrink-0 shadow-xs"
                title="Automatically fix missing required frontmatter and directives"
              >
                <Wand2 className="w-3.5 h-3.5" /> Auto-Fix
              </button>

              <button
                onClick={() => setShowValidationIssuesPanel(false)}
                className="p-1 rounded-lg hover:bg-surface-hover text-muted hover:text-primary transition shrink-0"
                title="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Issue Cards Scrollable List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredValidationIssues.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted flex flex-col items-center gap-1.5">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 opacity-80" />
                <span>No issues match current filters</span>
              </div>
            ) : (
              filteredValidationIssues.map((issue, idx) => {
                const hintInfo = ISSUE_HINTS[issue.code];
                const isError = issue.type === "error";
                const isWarning = issue.type === "warning";

                return (
                  <div
                    key={idx}
                    className={cn(
                      "p-3 rounded-xl text-xs flex items-start gap-3 transition border",
                      isError
                        ? "bg-rose-500/5 dark:bg-rose-950/20 border-rose-500/20 hover:border-rose-500/40"
                        : isWarning
                        ? "bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/20 hover:border-amber-500/40"
                        : "bg-blue-500/5 dark:bg-blue-950/20 border-blue-500/20 hover:border-blue-500/40"
                    )}
                  >
                    {/* Severity Icon Box */}
                    <div
                      className={cn(
                        "p-2 rounded-lg shrink-0 mt-0.5",
                        isError
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          : isWarning
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                      )}
                    >
                      {isError ? (
                        <AlertCircle className="w-4 h-4" />
                      ) : isWarning ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : (
                        <Info className="w-4 h-4" />
                      )}
                    </div>

                    {/* Middle Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border",
                            isError
                              ? "bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-700"
                              : isWarning
                              ? "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700"
                              : "bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700"
                          )}
                        >
                          {issue.type}
                        </span>

                        <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-surface border border-border text-primary font-medium shadow-2xs">
                          {issue.code}
                        </span>

                        {issue.line !== undefined && (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-surface border border-border/80 text-muted">
                            Line {issue.line}
                          </span>
                        )}
                      </div>

                      {/* Primary Error Message */}
                      <p className="text-xs text-primary font-medium leading-relaxed">
                        {issue.message}
                      </p>

                      {/* Actionable Hint / Solution */}
                      {hintInfo && (
                        <div className="flex items-start gap-1.5 text-[11px] text-muted bg-surface/70 p-2 rounded-lg border border-border/50">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <span className="leading-normal">{hintInfo.hint}</span>
                        </div>
                      )}
                    </div>

                    {/* Right Action */}
                    {hintInfo?.autoFixable && (
                      <button
                        onClick={handleAutoFix}
                        className="px-2.5 py-1 text-[11px] bg-surface hover:bg-surface-hover border border-border rounded-lg text-primary font-medium transition flex items-center gap-1 shrink-0 shadow-2xs mt-0.5"
                        title="Auto-fix this issue"
                      >
                        <Wand2 className="w-3 h-3 text-accent" />
                        <span>Fix</span>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Drawer Footer Status Bar */}
          <div className="px-4 py-2 bg-bg-secondary/40 border-t border-border-subtle flex items-center justify-between text-[11px] text-muted">
            <span>
              Validated against <strong>2026 AgentSkills Specification</strong> (TonsOfSkills / Agensi standards)
            </span>
            <button
              onClick={() => setShowValidationIssuesPanel(false)}
              className="text-xs text-muted hover:text-primary transition font-medium"
            >
              Collapse Panel ↑
            </button>
          </div>
        </div>
      )}

      {/* Main Studio Content Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Sidebar File Explorer */}
        <SkillFileExplorer
          files={files}
          activeFile={activeFile}
          onSelectFile={setActiveFile}
          onCreateFile={handleCreateFile}
          onDeleteFile={handleDeleteFile}
          onRefresh={loadSkillFiles}
          loading={loadingFiles}
        />

        {/* Center Code Editor */}
        {loadingContent ? (
          <div className="flex-1 flex items-center justify-center text-theme-text-muted text-xs gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-accent" /> Loading file content...
          </div>
        ) : (
          <SkillCodeEditor
            filename={activeFile}
            value={fileContent}
            originalValue={savedContent}
            onChange={setFileContent}
            onSave={handleSave}
            onAutoFix={activeFile === "SKILL.md" ? handleAutoFix : undefined}
            isDirty={isDirty}
            saving={savingFile}
            skillName={activeSkill?.name}
          />
        )}

        {/* Right Drawer AI Assistant */}
        {showAiAssistant && (
          <SkillAiAssistant
            currentContent={fileContent}
            activeFile={activeFile}
            onApplyContent={setFileContent}
          />
        )}
      </div>

      {/* Git Commit Modal with Diff Preview */}
      {showCommitModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            style={{ backgroundColor: "var(--color-surface)" }}
            className="bg-surface border border-border rounded-xl shadow-2xl max-w-3xl w-full p-5 space-y-4 max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-border pb-3 shrink-0">
              <div className="flex items-center gap-2.5 font-semibold text-primary text-sm">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <GitCommit className="w-4 h-4" />
                </div>
                <span>Commit Skill Changes to Git</span>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-surface-hover border border-border text-muted font-mono">
                {activeSkill?.name || "Skill"}
              </span>
            </div>

            <p className="text-xs text-secondary leading-relaxed shrink-0">
              Stage and commit changes in <strong>{activeSkill?.name || "Skill"}</strong> directly to the central Git repository.
            </p>

            <div className="space-y-1.5 shrink-0">
              <label className="text-xs font-semibold text-primary">Commit Message</label>
              <input
                type="text"
                placeholder={`feat(skill): update ${activeSkill?.name || "skill"}`}
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                autoFocus
                className="w-full text-xs px-3 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent text-primary placeholder:text-muted shadow-xs"
              />
            </div>

            {/* Diff Preview before Commit */}
            <div className="flex-1 min-h-[160px] overflow-hidden flex flex-col border border-border rounded-xl bg-bg-secondary/40">
              <div className="px-3.5 py-2 border-b border-border bg-surface flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <GitCompare className="w-3.5 h-3.5 text-accent" />
                  <span className="text-xs font-semibold text-primary">
                    Diff Preview: {activeFile}
                  </span>
                  {isDirty ? (
                    <span className="text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-full font-medium">
                      Unsaved changes will auto-save on commit
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted font-mono">Saved on disk</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowDiffInCommit(!showDiffInCommit)}
                  className="text-xs px-2 py-0.5 rounded text-muted hover:text-primary hover:bg-surface-hover transition"
                >
                  {showDiffInCommit ? "Hide Diff" : "Show Diff"}
                </button>
              </div>

              {showDiffInCommit && (
                <div className="flex-1 overflow-y-auto p-3">
                  <DocumentDiffViewer original={savedContent} updated={fileContent} />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border shrink-0">
              <button
                type="button"
                onClick={() => setShowCommitModal(false)}
                className="px-4 py-2 text-xs text-secondary hover:text-primary rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={committing}
                className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition flex items-center gap-1.5 shadow-sm"
              >
                {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCommit className="w-4 h-4" />} Commit Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Skill Dialog */}
      <NewSkillDialog
        isOpen={showNewSkillDialog}
        onClose={() => setShowNewSkillDialog(false)}
        onCreated={(skill) => {
          refreshManagedSkills();
          setSelectedSkillId(skill.id);
          navigate(`/studio/${skill.id}`);
          toast.success(`Created skill ${skill.name}`);
        }}
      />
    </div>
  );
}
