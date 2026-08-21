import { useState } from "react";
import {
  FileText,
  Folder,
  Plus,
  Trash2,
  RefreshCw,
  FileCode,
  FileJson,
  Terminal,
} from "lucide-react";
import { cn } from "../utils";
import type { SkillFileInfo } from "../lib/tauri";

interface SkillFileExplorerProps {
  files: SkillFileInfo[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onCreateFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onRefresh: () => void;
  loading?: boolean;
}

export function SkillFileExplorer({
  files,
  activeFile,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  onRefresh,
  loading,
}: SkillFileExplorerProps) {
  const [newFileName, setNewFileName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const getFileIcon = (fileName: string, isDir: boolean) => {
    if (isDir) return null;
    const ext = fileName.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "md":
        return <FileText className="w-4 h-4 text-emerald-400" />;
      case "json":
      case "yaml":
      case "yml":
        return <FileJson className="w-4 h-4 text-amber-400" />;
      case "py":
      case "js":
      case "ts":
      case "rs":
        return <FileCode className="w-4 h-4 text-blue-400" />;
      case "sh":
      case "ps1":
      case "bat":
        return <Terminal className="w-4 h-4 text-purple-400" />;
      default:
        return <FileText className="w-4 h-4 text-gray-400" />;
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    onCreateFile(newFileName.trim());
    setNewFileName("");
    setIsCreating(false);
  };

  return (
    <div className="w-64 border-r border-theme-border flex flex-col h-full bg-theme-surface/50 select-none">
      <div className="p-3 border-b border-theme-border flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-theme-text-muted">
          Skill Files
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCreating(true)}
            className="p-1 hover:bg-theme-hover rounded text-theme-text-secondary hover:text-theme-text-primary transition"
            title="Create New File"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1 hover:bg-theme-hover rounded text-theme-text-secondary hover:text-theme-text-primary transition"
            title="Refresh Files"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {isCreating && (
        <form onSubmit={handleCreateSubmit} className="p-2 border-b border-theme-border bg-theme-hover/30">
          <input
            type="text"
            placeholder="e.g. scripts/helper.py"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            autoFocus
            className="w-full text-xs px-2 py-1 bg-theme-surface border border-theme-border rounded focus:outline-none focus:ring-1 focus:ring-accent text-theme-text-primary placeholder:text-theme-text-muted"
          />
          <div className="flex justify-end gap-1 mt-1.5">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-[11px] px-2 py-0.5 text-theme-text-muted hover:text-theme-text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-[11px] px-2 py-0.5 bg-accent text-white rounded hover:bg-accent/90"
            >
              Add
            </button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {files.length === 0 ? (
          <div className="text-xs text-theme-text-muted text-center py-6">No files found</div>
        ) : (
          files.map((file) => {
            const isSelected = activeFile === file.relative_path;
            const isSkillMd = file.relative_path === "SKILL.md";

            return (
              <div
                key={file.relative_path}
                className={cn(
                  "group flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer transition-colors",
                  isSelected
                    ? "bg-accent/15 text-accent font-medium"
                    : "text-theme-text-secondary hover:bg-theme-hover hover:text-theme-text-primary"
                )}
                onClick={() => onSelectFile(file.relative_path)}
              >
                <div className="flex items-center gap-2 truncate">
                  {file.is_dir ? (
                    <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    getFileIcon(file.name, file.is_dir)
                  )}
                  <span className="truncate">{file.name}</span>
                </div>

                {!isSkillMd && !file.is_dir && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete '${file.name}'?`)) {
                        onDeleteFile(file.relative_path);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-theme-text-muted hover:text-red-400 transition"
                    title="Delete File"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
