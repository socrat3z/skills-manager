import { useMemo, useState } from "react";
import {
  FileText,
  Folder,
  FolderOpen,
  Plus,
  Trash2,
  RefreshCw,
  FileCode,
  FileJson,
  Terminal,
  ChevronRight,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
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

// ── Client-side ignore (defense-in-depth for dev/mock mode) ──
const IGNORED_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
  ".turbo",
  ".next",
  ".nuxt",
  ".cache",
  ".parcel-cache",
  ".venv",
  "venv",
]);

function isIgnored(relativePath: string): boolean {
  return relativePath.split("/").some(
    (seg) =>
      IGNORED_SEGMENTS.has(seg) ||
      seg.endsWith(".pyc") ||
      seg.endsWith(".pyo")
  );
}

// ── Tree model ──
interface TreeNode {
  name: string;
  path: string; // relative path as returned by backend
  isDir: boolean;
  size: number;
  children: TreeNode[];
  depth: number;
}

function buildTree(files: SkillFileInfo[]): TreeNode[] {
  const visible = files.filter((f) => !isIgnored(f.relative_path));

  const byPath: Map<string, TreeNode> = new Map();
  const roots: TreeNode[] = [];

  // Index all entries
  for (const f of visible) {
    const parts = f.relative_path.split("/");
    const depth = parts.length - 1;
    byPath.set(f.relative_path, {
      name: f.name,
      path: f.relative_path,
      isDir: f.is_dir,
      size: f.size,
      children: [],
      depth,
    });
  }

  // Build parent-child relationships
  for (const [path, node] of byPath) {
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash === -1) {
      roots.push(node);
    } else {
      const parentPath = path.slice(0, lastSlash);
      const parent = byPath.get(parentPath);
      if (parent) {
        parent.children.push(node);
      } else {
        // Parent dir might be missing from listing — attach to root
        roots.push(node);
      }
    }
  }

  // Sort recursively: dirs first, then alphabetically; SKILL.md pinned at top
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.path === "SKILL.md") return -1;
      if (b.path === "SKILL.md") return 1;
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);

  return roots;
}

function collectAllDirPaths(nodes: TreeNode[]): Set<string> {
  const paths = new Set<string>();
  const walk = (ns: TreeNode[]) => {
    for (const n of ns) {
      if (n.isDir) {
        paths.add(n.path);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return paths;
}

// ── File icon by extension ──
function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "md":
      return <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    case "json":
    case "yaml":
    case "yml":
    case "toml":
      return <FileJson className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    case "py":
    case "js":
    case "mjs":
    case "ts":
    case "tsx":
    case "rs":
    case "go":
    case "rb":
      return <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
    case "sh":
    case "ps1":
    case "bat":
    case "cmd":
      return <Terminal className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
    default:
      return <FileText className="w-3.5 h-3.5 text-muted shrink-0" />;
  }
}

// ── TreeNodeRow renders a single row ──
interface TreeNodeRowProps {
  node: TreeNode;
  activeFile: string | null;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelectFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
}

function TreeNodeRow({
  node,
  activeFile,
  expanded,
  onToggle,
  onSelectFile,
  onDeleteFile,
}: TreeNodeRowProps) {
  const isSelected = activeFile === node.path;
  const isOpen = expanded.has(node.path);
  const isSkillMd = node.path === "SKILL.md";
  const indent = node.depth * 12; // px per depth level

  if (node.isDir) {
    return (
      <>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          style={{ paddingLeft: `${8 + indent}px` }}
          className="w-full flex items-center gap-1.5 py-1 pr-2 rounded text-xs text-left transition-colors text-theme-text-secondary hover:bg-theme-hover hover:text-theme-text-primary group"
          title={node.path}
        >
          <span className="shrink-0 text-muted">
            {isOpen ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </span>
          {isOpen ? (
            <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          )}
          <span className="truncate flex-1 font-medium">{node.name}</span>
          {node.children.length > 0 && (
            <span className="text-[10px] text-muted font-mono shrink-0 opacity-0 group-hover:opacity-100">
              {node.children.length}
            </span>
          )}
        </button>

        {isOpen &&
          node.children.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              activeFile={activeFile}
              expanded={expanded}
              onToggle={onToggle}
              onSelectFile={onSelectFile}
              onDeleteFile={onDeleteFile}
            />
          ))}
      </>
    );
  }

  return (
    <div
      style={{ paddingLeft: `${8 + indent + 16}px` }}
      className={cn(
        "group flex items-center justify-between pr-1.5 py-1 rounded text-xs cursor-pointer transition-colors",
        isSelected
          ? "bg-accent/15 text-accent font-medium"
          : "text-theme-text-secondary hover:bg-theme-hover hover:text-theme-text-primary"
      )}
      onClick={() => onSelectFile(node.path)}
      title={node.path}
    >
      <div className="flex items-center gap-1.5 truncate min-w-0">
        {getFileIcon(node.name)}
        <span className="truncate">{node.name}</span>
      </div>

      {!isSkillMd && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete '${node.name}'?`)) {
              onDeleteFile(node.path);
            }
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-theme-text-muted hover:text-red-400 transition shrink-0"
          title="Delete File"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ── Main component ──
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildTree(files), [files]);
  const allDirPaths = useMemo(() => collectAllDirPaths(tree), [tree]);

  // Auto-expand ancestors of active file
  useMemo(() => {
    if (!activeFile) return;
    const parts = activeFile.split("/");
    const ancestors = new Set<string>();
    for (let i = 1; i < parts.length; i++) {
      ancestors.add(parts.slice(0, i).join("/"));
    }
    if (ancestors.size > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const a of ancestors) next.add(a);
        return next;
      });
    }
  }, [activeFile]);

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(allDirPaths));
  const collapseAll = () => setExpanded(new Set());

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    onCreateFile(newFileName.trim());
    setNewFileName("");
    setIsCreating(false);
  };

  const allExpanded = allDirPaths.size > 0 && expanded.size >= allDirPaths.size;

  return (
    <div className="w-64 border-r border-theme-border flex flex-col h-full bg-theme-surface/50 select-none">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-theme-border flex items-center justify-between gap-1.5 shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted">
          Skill Files
        </span>
        <div className="flex items-center gap-0.5 ml-auto">
          {allDirPaths.size > 0 && (
            <button
              onClick={allExpanded ? collapseAll : expandAll}
              className="p-1 hover:bg-theme-hover rounded text-theme-text-secondary hover:text-theme-text-primary transition"
              title={allExpanded ? "Collapse All" : "Expand All"}
            >
              {allExpanded ? (
                <ChevronsDownUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronsUpDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          <button
            onClick={() => setIsCreating(true)}
            className="p-1 hover:bg-theme-hover rounded text-theme-text-secondary hover:text-theme-text-primary transition"
            title="Create New File"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1 hover:bg-theme-hover rounded text-theme-text-secondary hover:text-theme-text-primary transition disabled:opacity-40"
            title="Refresh Files"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* New file form */}
      {isCreating && (
        <form
          onSubmit={handleCreateSubmit}
          className="p-2 border-b border-theme-border bg-theme-hover/30 shrink-0"
        >
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

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {tree.length === 0 ? (
          <div className="text-xs text-theme-text-muted text-center py-6">
            {loading ? "Loading\u2026" : "No files found"}
          </div>
        ) : (
          tree.map((node) => (
            <TreeNodeRow
              key={node.path}
              node={node}
              activeFile={activeFile}
              expanded={expanded}
              onToggle={toggleDir}
              onSelectFile={onSelectFile}
              onDeleteFile={onDeleteFile}
            />
          ))
        )}
      </div>
    </div>
  );
}
