import { useState } from "react";
import { X, Sparkles, Plus, Loader2 } from "lucide-react";
import * as api from "../lib/tauri";

interface NewSkillDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (skill: api.ManagedSkill) => void;
}

export function NewSkillDialog({ isOpen, onClose, onCreated }: NewSkillDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const skill = await api.createCustomSkill(name.trim(), description.trim(), tags);
      onCreated(skill);
      setName("");
      setDescription("");
      setTagsInput("");
      onClose();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-theme-surface border border-theme-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
        <div className="p-4 border-b border-theme-border flex items-center justify-between bg-theme-surface/70">
          <div className="flex items-center gap-2 font-semibold text-theme-text-primary">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span>Create Custom Skill</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-theme-text-muted hover:text-theme-text-primary rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-theme-text-primary">Skill Name *</label>
            <input
              type="text"
              placeholder="e.g. data-processing-expert"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full text-xs px-3 py-2 bg-theme-surface border border-theme-border rounded focus:outline-none focus:ring-1 focus:ring-accent text-theme-text-primary placeholder:text-theme-text-muted"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-theme-text-primary">Description</label>
            <textarea
              placeholder="Describe when agent should use this skill..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full text-xs p-3 bg-theme-surface border border-theme-border rounded focus:outline-none focus:ring-1 focus:ring-accent text-theme-text-primary placeholder:text-theme-text-muted resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-theme-text-primary">Tags (comma separated)</label>
            <input
              type="text"
              placeholder="e.g. python, automation, database"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-theme-surface border border-theme-border rounded focus:outline-none focus:ring-1 focus:ring-accent text-theme-text-primary placeholder:text-theme-text-muted"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-theme-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-theme-text-secondary hover:text-theme-text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 text-xs bg-accent text-white rounded font-medium hover:bg-accent/90 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create Skill
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
