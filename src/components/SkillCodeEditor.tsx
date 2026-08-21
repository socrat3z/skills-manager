import { useState } from "react";
import {
  Copy,
  Check,
  Eye,
  Edit3,
  Columns,
  Save,
  Wand2,
  FileText,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../utils";

interface SkillCodeEditorProps {
  filename: string;
  value: string;
  onChange: (val: string) => void;
  onSave: () => void;
  onAutoFix?: () => void;
  isDirty?: boolean;
  saving?: boolean;
}

export function SkillCodeEditor({
  filename,
  value,
  onChange,
  onSave,
  onAutoFix,
  isDirty,
  saving,
}: SkillCodeEditorProps) {
  const [viewMode, setViewMode] = useState<"edit" | "split" | "preview">("edit");
  const [copied, setCopied] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const isMarkdown = filename.endsWith(".md");

  const lines = value.split("\n");
  const totalLines = lines.length;
  const totalChars = value.length;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const updateCursorPosition = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const pos = target.selectionStart;
    const textBefore = value.substring(0, pos);
    const lineNum = textBefore.split("\n").length;
    const lastNewLine = textBefore.lastIndexOf("\n");
    const colNum = pos - lastNewLine;
    setCursorPos({ line: lineNum, col: colNum });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      onSave();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-surface min-w-0 overflow-hidden">
      {/* Editor Header Bar */}
      <div className="h-10 border-b border-theme-border px-3 flex items-center justify-between bg-theme-surface/70 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold text-theme-text-primary">{filename}</span>
          {isDirty && (
            <span className="w-2 h-2 rounded-full bg-amber-400" title="Unsaved changes" />
          )}
        </div>

        <div className="flex items-center gap-2">
          {isMarkdown && (
            <div className="flex items-center bg-theme-hover/50 p-0.5 rounded border border-theme-border">
              <button
                onClick={() => setViewMode("edit")}
                className={cn(
                  "px-2 py-0.5 text-xs rounded transition flex items-center gap-1",
                  viewMode === "edit"
                    ? "bg-theme-surface text-theme-text-primary shadow-sm"
                    : "text-theme-text-muted hover:text-theme-text-primary"
                )}
                title="Edit Only"
              >
                <Edit3 className="w-3 h-3" /> Edit
              </button>
              <button
                onClick={() => setViewMode("split")}
                className={cn(
                  "px-2 py-0.5 text-xs rounded transition flex items-center gap-1",
                  viewMode === "split"
                    ? "bg-theme-surface text-theme-text-primary shadow-sm"
                    : "text-theme-text-muted hover:text-theme-text-primary"
                )}
                title="Split Edit & Preview"
              >
                <Columns className="w-3 h-3" /> Split
              </button>
              <button
                onClick={() => setViewMode("preview")}
                className={cn(
                  "px-2 py-0.5 text-xs rounded transition flex items-center gap-1",
                  viewMode === "preview"
                    ? "bg-theme-surface text-theme-text-primary shadow-sm"
                    : "text-theme-text-muted hover:text-theme-text-primary"
                )}
                title="Rendered Preview"
              >
                <Eye className="w-3 h-3" /> Preview
              </button>
            </div>
          )}

          {onAutoFix && (
            <button
              onClick={onAutoFix}
              className="text-xs px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded hover:bg-amber-500/20 transition flex items-center gap-1"
              title="Safe Auto-Format / Fix Frontmatter"
            >
              <Wand2 className="w-3.5 h-3.5" /> Auto-Fix
            </button>
          )}

          <button
            onClick={handleCopy}
            className="p-1.5 text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-hover rounded transition"
            title="Copy Content"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            onClick={onSave}
            disabled={saving || !isDirty}
            className={cn(
              "text-xs px-3 py-1 rounded font-medium transition flex items-center gap-1.5 shadow-sm",
              isDirty
                ? "bg-accent text-white hover:bg-accent/90"
                : "bg-theme-hover text-theme-text-muted cursor-not-allowed"
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
          <div className="flex-1 flex min-w-0 h-full font-mono text-xs leading-relaxed bg-theme-surface">
            {/* Line Numbers */}
            <div className="w-10 py-3 select-none text-right pr-2.5 text-theme-text-muted/40 bg-theme-hover/20 border-r border-theme-border/50 shrink-0 font-mono text-[11px]">
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            {/* Textarea */}
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyUp={updateCursorPosition}
              onClick={updateCursorPosition}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              className="flex-1 p-3 bg-transparent text-theme-text-primary focus:outline-none resize-none font-mono whitespace-pre overflow-y-auto leading-relaxed"
              placeholder="Write your skill instructions or code here..."
            />
          </div>
        )}

        {/* Markdown Preview Area */}
        {(viewMode === "preview" || viewMode === "split") && isMarkdown && (
          <div
            className={cn(
              "flex-1 p-6 overflow-y-auto bg-theme-surface/50 border-l border-theme-border text-theme-text-primary prose prose-invert max-w-none prose-sm",
              viewMode === "split" ? "w-1/2" : "w-full"
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* Editor Status Footer */}
      <div className="h-6 border-t border-theme-border px-3 flex items-center justify-between text-[11px] text-theme-text-muted bg-theme-surface/70 shrink-0 select-none">
        <div className="flex items-center gap-4">
          <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          <span>{totalLines} lines</span>
          <span>{totalChars} characters</span>
        </div>
        <div className="flex items-center gap-3">
          <span>UTF-8</span>
          <span className="uppercase">{filename.split(".").pop() || "TXT"}</span>
        </div>
      </div>
    </div>
  );
}
