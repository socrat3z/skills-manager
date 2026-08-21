import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Code,
  Sparkles,
  Plus,
  GitCommit,
  AlertTriangle,
  Wand2,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import * as api from "../lib/tauri";
import { SkillFileExplorer } from "../components/SkillFileExplorer";
import { SkillCodeEditor } from "../components/SkillCodeEditor";
import { SkillAiAssistant } from "../components/SkillAiAssistant";
import { NewSkillDialog } from "../components/NewSkillDialog";
import { validateSkillContent, safeAutoFixSkill } from "../lib/skillValidation";

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
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);

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

  // Validation rules check for active file
  const validationResult = useMemo(() => {
    return validateSkillContent(fileContent, activeFile);
  }, [fileContent, activeFile]);

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
              className="appearance-none text-xs font-medium bg-theme-hover border border-theme-border rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-accent text-theme-text-primary cursor-pointer min-w-[200px]"
            >
              {managedSkills.map((s: api.ManagedSkill) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.source_type})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-theme-text-muted absolute right-2.5 top-2 pointer-events-none" />
          </div>

          <button
            onClick={() => setShowNewSkillDialog(true)}
            className="text-xs px-3 py-1.5 bg-theme-hover hover:bg-theme-border border border-theme-border rounded-lg font-medium transition flex items-center gap-1.5 text-theme-text-primary"
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

      {/* Validation Issue Banner ("Generate Safe") */}
      {validationResult.issues.length > 0 && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs text-amber-300 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Safety & Rule Validation:</strong> {validationResult.issues.length} issue(s) detected in{" "}
              {activeFile}
            </span>
            <div className="flex items-center gap-2 ml-2">
              {validationResult.issues.slice(0, 2).map((issue, idx) => (
                <span key={idx} className="text-[11px] px-2 py-0.5 bg-amber-500/20 rounded text-amber-200">
                  {issue.message}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={handleAutoFix}
            className="text-xs px-2.5 py-1 bg-amber-500 text-white rounded font-medium hover:bg-amber-600 transition flex items-center gap-1 shrink-0"
          >
            <Wand2 className="w-3.5 h-3.5" /> 1-Click Safe Auto-Fix
          </button>
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
            onChange={setFileContent}
            onSave={handleSave}
            onAutoFix={activeFile === "SKILL.md" ? handleAutoFix : undefined}
            isDirty={isDirty}
            saving={savingFile}
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

      {/* Git Commit Modal */}
      {showCommitModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-theme-surface border border-theme-border rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-2 font-semibold text-theme-text-primary text-sm">
              <GitCommit className="w-5 h-5 text-emerald-400" />
              <span>Commit Skill Changes to Git</span>
            </div>

            <p className="text-xs text-theme-text-muted leading-relaxed">
              Stage and commit all changes in <strong>{activeSkill?.name || "Skill"}</strong> directly to the central Git repository.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-theme-text-primary">Commit Message</label>
              <input
                type="text"
                placeholder={`feat(skill): update ${activeSkill?.name || "skill"}`}
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                autoFocus
                className="w-full text-xs px-3 py-2 bg-theme-surface border border-theme-border rounded focus:outline-none focus:ring-1 focus:ring-accent text-theme-text-primary placeholder:text-theme-text-muted"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-theme-border">
              <button
                type="button"
                onClick={() => setShowCommitModal(false)}
                className="px-4 py-2 text-xs text-theme-text-secondary hover:text-theme-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={committing}
                className="px-4 py-2 text-xs bg-emerald-500 text-white rounded font-medium hover:bg-emerald-600 transition flex items-center gap-1.5 shadow-sm"
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
