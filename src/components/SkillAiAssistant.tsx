import { useState } from "react";
import { Sparkles, Wand2, Check, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "../utils";
import * as api from "../lib/tauri";

interface SkillAiAssistantProps {
  currentContent: string;
  activeFile: string;
  onApplyContent: (newContent: string) => void;
}

export function SkillAiAssistant({
  currentContent,
  activeFile: _activeFile,
  onApplyContent,
}: SkillAiAssistantProps) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"refine_file" | "fix_safety" | "create_script" | "generate_skill">("refine_file");
  const [loading, setLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);

  const handleGenerate = async (customMode?: typeof mode, customPrompt?: string) => {
    const targetMode = customMode || mode;
    const targetPrompt = customPrompt || prompt;
    if (!targetPrompt.trim() && targetMode !== "fix_safety") return;

    setLoading(true);
    setAiResult(null);
    try {
      const res = await api.generateAiSkillContent(
        targetPrompt || "Fix safety and YAML frontmatter format",
        targetMode,
        currentContent
      );
      setAiResult(res);
    } catch (e: any) {
      alert("AI generation failed: " + e);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (aiResult) {
      onApplyContent(aiResult);
      setAiResult(null);
    }
  };

  return (
    <div className="w-80 border-l border-theme-border flex flex-col h-full bg-theme-surface/50">
      <div className="p-3 border-b border-theme-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-theme-text-primary">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>AI Skill Assistant</span>
        </div>
      </div>

      <div className="p-3 flex-1 flex flex-col gap-3 overflow-y-auto">
        {/* Preset Prompt Cards */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-theme-text-muted uppercase tracking-wider">
            Quick Actions
          </label>
          <div className="grid grid-cols-1 gap-1.5">
            <button
              onClick={() => {
                setMode("refine_file");
                handleGenerate("refine_file", "Refine instructions to be clear, unambiguous, and structured");
              }}
              disabled={loading}
              className="text-left text-xs p-2 bg-theme-surface hover:bg-theme-hover border border-theme-border rounded transition flex items-center justify-between group"
            >
              <span className="text-theme-text-secondary group-hover:text-theme-text-primary">
                ✨ Refine Instructions
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-theme-text-muted group-hover:text-accent" />
            </button>

            <button
              onClick={() => {
                setMode("fix_safety");
                handleGenerate("fix_safety", "Fix safety rules and frontmatter format");
              }}
              disabled={loading}
              className="text-left text-xs p-2 bg-theme-surface hover:bg-theme-hover border border-theme-border rounded transition flex items-center justify-between group"
            >
              <span className="text-theme-text-secondary group-hover:text-theme-text-primary">
                🛡️ Generate Safe Frontmatter
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-theme-text-muted group-hover:text-accent" />
            </button>

            <button
              onClick={() => {
                setMode("create_script");
                handleGenerate("create_script", "Generate a Python script for file automation");
              }}
              disabled={loading}
              className="text-left text-xs p-2 bg-theme-surface hover:bg-theme-hover border border-theme-border rounded transition flex items-center justify-between group"
            >
              <span className="text-theme-text-secondary group-hover:text-theme-text-primary">
                🐍 Generate Python Helper Script
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-theme-text-muted group-hover:text-accent" />
            </button>
          </div>
        </div>

        {/* Custom Prompt Box */}
        <div className="space-y-1.5 flex-1 flex flex-col">
          <label className="text-[11px] font-semibold text-theme-text-muted uppercase tracking-wider">
            Custom AI Modification Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask AI to modify code, add a section, optimize markdown, or generate scripts..."
            className="w-full text-xs p-2.5 bg-theme-surface border border-theme-border rounded focus:outline-none focus:ring-1 focus:ring-accent text-theme-text-primary placeholder:text-theme-text-muted resize-none flex-1 min-h-[100px]"
          />

          <button
            onClick={() => handleGenerate()}
            disabled={loading || !prompt.trim()}
            className={cn(
              "w-full text-xs py-2 rounded font-medium transition flex items-center justify-center gap-2 shadow-sm",
              prompt.trim() && !loading
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "bg-theme-hover text-theme-text-muted cursor-not-allowed"
            )}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Generating...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" /> Run AI Modification
              </>
            )}
          </button>
        </div>

        {/* AI Result Preview */}
        {aiResult && (
          <div className="border border-amber-500/30 bg-amber-500/5 rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-400">AI Response Preview</span>
              <button
                onClick={() => setAiResult(null)}
                className="text-[11px] text-theme-text-muted hover:text-theme-text-primary"
              >
                Dismiss
              </button>
            </div>

            <pre className="text-[11px] font-mono bg-theme-surface p-2 rounded border border-theme-border overflow-x-auto max-h-48 text-theme-text-secondary whitespace-pre-wrap">
              {aiResult}
            </pre>

            <button
              onClick={handleApply}
              className="w-full text-xs py-1.5 bg-accent text-white rounded font-medium hover:bg-accent/90 transition flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Check className="w-4 h-4" /> Apply Changes to Editor
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
