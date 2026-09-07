import { useState, useMemo } from "react";
import {
  X,
  Sparkles,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  HelpCircle,
  Sliders,
  Wand2,
  ChevronRight,
  Terminal,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../utils";
import {
  SKILL_DIRECTIVES,
  AGENT_INSTRUCTION_SECTIONS,
  SKILL_BODY_FEATURES,
  SKILL_PRESET_TEMPLATES,
  CANONICAL_AGENT_TOOLS,
  parseSkillFrontmatter,
  upsertFrontmatterDirective,
  removeFrontmatterDirective,
  insertAgentInstructionSection,
  insertSnippetIntoMarkdown,
  slugifyKebabCase,
  formatYamlValue,
  type SkillDirectiveDef,
  type AgentInstructionSection,
  type SkillBodyFeature,
} from "../lib/skillDirectives";

interface SkillDirectivesModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  onChangeContent: (newContent: string) => void;
  skillName?: string;
}

export function SkillDirectivesModal({
  isOpen,
  onClose,
  content,
  onChangeContent,
  skillName,
}: SkillDirectivesModalProps) {
  const [activeTab, setActiveTab] = useState<
    "all" | "required" | "behavioral" | "metadata" | "dci" | "instructions" | "templates"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDirective, setSelectedDirective] = useState<SkillDirectiveDef | null>(SKILL_DIRECTIVES[0]);
  const [selectedSection, setSelectedSection] = useState<AgentInstructionSection | null>(null);
  const [selectedBodyFeature, setSelectedBodyFeature] = useState<SkillBodyFeature | null>(null);

  // Form editing state for selected directive
  const [directiveValue, setDirectiveValue] = useState<unknown>("");

  // Parse document frontmatter and sections on content change
  const parsedDoc = useMemo(() => {
    return parseSkillFrontmatter(content);
  }, [content]);

  // When selected directive changes, populate current value from file or default
  const handleSelectDirective = (directive: SkillDirectiveDef) => {
    setSelectedDirective(directive);
    setSelectedSection(null);
    setSelectedBodyFeature(null);

    const existingVal = parsedDoc.frontmatter[directive.id];
    if (existingVal !== undefined) {
      setDirectiveValue(existingVal);
    } else {
      setDirectiveValue(directive.defaultValue ?? "");
    }
  };

  const handleSelectSection = (section: AgentInstructionSection) => {
    setSelectedSection(section);
    setSelectedDirective(null);
    setSelectedBodyFeature(null);
  };

  const handleSelectBodyFeature = (feature: SkillBodyFeature) => {
    setSelectedBodyFeature(feature);
    setSelectedDirective(null);
    setSelectedSection(null);
  };

  // Filtered directives
  const filteredDirectives = useMemo(() => {
    return SKILL_DIRECTIVES.filter((d) => {
      if (activeTab === "required" && d.category !== "required") return false;
      if (activeTab === "behavioral" && d.category !== "behavioral") return false;
      if (activeTab === "metadata" && d.category !== "metadata") return false;
      if (activeTab === "dci" || activeTab === "instructions" || activeTab === "templates") return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        d.id.toLowerCase().includes(q) ||
        d.label.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.agentRole.toLowerCase().includes(q)
      );
    });
  }, [activeTab, searchQuery]);

  // Filtered instruction sections
  const filteredSections = useMemo(() => {
    if (activeTab !== "all" && activeTab !== "instructions") return [];
    if (!searchQuery.trim()) return AGENT_INSTRUCTION_SECTIONS;
    const q = searchQuery.toLowerCase();
    return AGENT_INSTRUCTION_SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.heading.toLowerCase().includes(q)
    );
  }, [activeTab, searchQuery]);

  // Filtered DCI & Variables features
  const filteredBodyFeatures = useMemo(() => {
    if (activeTab !== "all" && activeTab !== "dci") return [];
    if (!searchQuery.trim()) return SKILL_BODY_FEATURES;
    const q = searchQuery.toLowerCase();
    return SKILL_BODY_FEATURES.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.syntax.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q)
    );
  }, [activeTab, searchQuery]);

  // Apply single directive to SKILL.md
  const handleApplyDirective = () => {
    if (!selectedDirective) return;

    if (selectedDirective.validate) {
      const error = selectedDirective.validate(directiveValue);
      if (error) {
        toast.error(error);
        return;
      }
    }

    const updated = upsertFrontmatterDirective(content, selectedDirective.id, directiveValue);
    onChangeContent(updated);
    toast.success(`Updated '${selectedDirective.id}' directive in frontmatter`);
  };

  // Remove directive from SKILL.md
  const handleRemoveDirective = () => {
    if (!selectedDirective) return;
    const updated = removeFrontmatterDirective(content, selectedDirective.id);
    onChangeContent(updated);
    toast.success(`Removed '${selectedDirective.id}' directive`);
    setDirectiveValue(selectedDirective.defaultValue ?? "");
  };

  // Apply instruction section to SKILL.md
  const handleApplySection = (section: AgentInstructionSection) => {
    const { updatedMarkdown, alreadyExisted } = insertAgentInstructionSection(
      content,
      section.heading,
      section.template
    );
    if (alreadyExisted) {
      toast.info(`Section '${section.heading}' is already present in this skill`);
    } else {
      onChangeContent(updatedMarkdown);
      toast.success(`Inserted '${section.title}' section`);
    }
  };

  // Insert DCI snippet or variable into body
  const handleInsertBodyFeature = (feature: SkillBodyFeature) => {
    const updated = insertSnippetIntoMarkdown(content, feature.template);
    onChangeContent(updated);
    toast.success(`Inserted ${feature.title} snippet into skill body`);
  };

  // Apply complete preset template
  const handleApplyTemplate = (tpl: typeof SKILL_PRESET_TEMPLATES[0]) => {
    const targetName = slugifyKebabCase(skillName || "custom-skill") || "custom-skill";
    const targetDesc = typeof tpl.frontmatter.description === "string"
      ? tpl.frontmatter.description
      : `${targetName} skill definition.`;

    let generated = `---\n`;
    for (const [k, v] of Object.entries(tpl.frontmatter)) {
      const val = k === "name" ? targetName : v;
      const isMultiline = k === "description" && typeof val === "string" && val.includes("\n");
      const formatted = formatYamlValue(val, isMultiline);
      if (formatted.startsWith("|\n") || formatted.startsWith("\n")) {
        generated += `${k}: ${formatted}\n`;
      } else {
        generated += `${k}: ${formatted}\n`;
      }
    }
    generated += `---\n\n${tpl.bodyTemplate(targetName, targetDesc)}`;

    onChangeContent(generated);
    toast.success(`Applied '${tpl.name}' template`);
    onClose();
  };

  if (!isOpen) return null;

  // Active counts for badge
  const activeDirectivesCount = Object.keys(parsedDoc.frontmatter).length;
  const missingRequiredCount = SKILL_DIRECTIVES.filter(
    (d) => d.category === "required" && parsedDoc.frontmatter[d.id] === undefined
  ).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-surface border border-border rounded-xl shadow-2xl max-w-5xl w-full h-[88vh] max-h-[780px] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-3.5 border-b border-border flex items-center justify-between bg-surface shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 text-accent rounded-lg">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-primary">
                  Skill Directives & Agent Reference
                </h2>
                <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-medium">
                  2026 AgentSkills Spec
                </span>
                {missingRequiredCount > 0 && (
                  <span className="text-[10px] px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full font-medium flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {missingRequiredCount} Required Missing
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">
                Frontmatter directives, tool access, subagent forking, path variables, DCI, and agent instructions.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-muted hover:text-primary hover:bg-surface-hover rounded-lg transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar Tabs & Search */}
        <div className="px-3.5 py-2 border-b border-border bg-bg-secondary/50 flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab("all")}
              className={cn(
                "text-xs px-2.5 py-1 rounded font-medium transition",
                activeTab === "all"
                  ? "bg-theme-hover text-theme-text-primary shadow-sm"
                  : "text-theme-text-muted hover:text-theme-text-primary"
              )}
            >
              All Directives
            </button>
            <button
              onClick={() => setActiveTab("required")}
              className={cn(
                "text-xs px-2.5 py-1 rounded font-medium transition flex items-center gap-1",
                activeTab === "required"
                  ? "bg-theme-hover text-theme-text-primary shadow-sm"
                  : "text-theme-text-muted hover:text-theme-text-primary"
              )}
            >
              Required
              {missingRequiredCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("behavioral")}
              className={cn(
                "text-xs px-2.5 py-1 rounded font-medium transition",
                activeTab === "behavioral"
                  ? "bg-theme-hover text-theme-text-primary shadow-sm"
                  : "text-theme-text-muted hover:text-theme-text-primary"
              )}
            >
              Behavioral & Subagent
            </button>
            <button
              onClick={() => setActiveTab("metadata")}
              className={cn(
                "text-xs px-2.5 py-1 rounded font-medium transition",
                activeTab === "metadata"
                  ? "bg-theme-hover text-theme-text-primary shadow-sm"
                  : "text-theme-text-muted hover:text-theme-text-primary"
              )}
            >
              Metadata & Tags
            </button>
            <button
              onClick={() => setActiveTab("dci")}
              className={cn(
                "text-xs px-2.5 py-1 rounded font-medium transition flex items-center gap-1",
                activeTab === "dci"
                  ? "bg-purple-500/15 text-purple-300 border border-purple-500/30 font-medium"
                  : "text-theme-text-muted hover:text-theme-text-primary"
              )}
            >
              <Terminal className="w-3.5 h-3.5" /> DCI & Variables
            </button>
            <button
              onClick={() => setActiveTab("instructions")}
              className={cn(
                "text-xs px-2.5 py-1 rounded font-medium transition flex items-center gap-1",
                activeTab === "instructions"
                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium"
                  : "text-theme-text-muted hover:text-theme-text-primary"
              )}
            >
              <BookOpen className="w-3.5 h-3.5" /> Agent Instructions
            </button>
            <button
              onClick={() => setActiveTab("templates")}
              className={cn(
                "text-xs px-2.5 py-1 rounded font-medium transition flex items-center gap-1 text-accent",
                activeTab === "templates"
                  ? "bg-accent/15 border border-accent/30 text-accent font-semibold"
                  : "hover:text-accent"
              )}
            >
              <Sparkles className="w-3.5 h-3.5" /> Full Templates
            </button>
          </div>

          <div className="relative w-48 sm:w-56">
            <input
              type="text"
              placeholder="Filter directives..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs px-2.5 py-1 pl-7 bg-theme-hover/60 border border-theme-border rounded focus:outline-none focus:ring-1 focus:ring-accent text-theme-text-primary placeholder:text-theme-text-muted"
            />
            <HelpCircle className="w-3.5 h-3.5 text-theme-text-muted absolute left-2 top-2 pointer-events-none" />
          </div>
        </div>

        {/* Content Body: Split View */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {activeTab === "templates" ? (
            /* Templates View */
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-theme-text-primary flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-accent" /> Ready-to-Use 2026 Agent Skill Templates
                </h3>
                <p className="text-xs text-theme-text-muted mt-0.5">
                  Pre-configured specifications with allowed-tools whitelist, DCI environment discovery, and deterministic agent instructions.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {SKILL_PRESET_TEMPLATES.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="p-4 bg-surface border border-border rounded-xl hover:border-accent/40 transition flex flex-col justify-between space-y-4 group shadow-sm"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-primary group-hover:text-accent transition">
                          {tpl.name}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 bg-accent/10 text-accent rounded-full border border-accent/20">
                          {tpl.badge}
                        </span>
                      </div>
                      <p className="text-xs text-muted leading-relaxed">
                        {tpl.description}
                      </p>
                      <div className="text-[11px] font-mono bg-bg-secondary p-2 rounded border border-border/50 text-secondary space-y-0.5">
                        {Object.entries(tpl.frontmatter).slice(0, 5).map(([k, v]) => (
                          <div key={k} className="truncate">
                            <span className="text-accent">{k}</span>: {JSON.stringify(v)}
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleApplyTemplate(tpl)}
                      className="w-full py-1.5 text-xs bg-accent text-white font-medium rounded hover:bg-accent/90 transition shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <Wand2 className="w-3.5 h-3.5" /> Apply Template
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Directives Split View */
            <>
              {/* Left Column */}
              <div className="w-5/12 border-r border-border flex flex-col bg-bg-secondary min-h-0 overflow-y-auto p-2 space-y-1">
                {/* Directives Section */}
                {filteredDirectives.length > 0 && (
                  <div className="space-y-1">
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted uppercase tracking-wider">
                      Frontmatter Directives ({filteredDirectives.length})
                    </div>
                    {filteredDirectives.map((directive) => {
                      const isSelected = selectedDirective?.id === directive.id;
                      const isSet = parsedDoc.frontmatter[directive.id] !== undefined;
                      const currentValue = parsedDoc.frontmatter[directive.id];

                      return (
                        <button
                          key={directive.id}
                          onClick={() => handleSelectDirective(directive)}
                          className={cn(
                            "w-full text-left p-2.5 rounded-lg border transition flex items-start justify-between gap-2 group",
                            isSelected
                              ? "bg-surface border-accent/50 shadow-sm"
                              : "border-transparent hover:bg-surface-hover/60 hover:border-border"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-primary group-hover:text-accent transition">
                                {directive.id}
                              </span>
                              {directive.category === "required" ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                                  Required
                                </span>
                              ) : directive.category === "behavioral" ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                                  Behavioral
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                                  Metadata
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-theme-text-muted truncate mt-0.5">
                              {directive.description}
                            </p>
                            {isSet && (
                              <div className="text-[10px] font-mono text-emerald-400/90 truncate mt-1">
                                = {typeof currentValue === "object" ? JSON.stringify(currentValue) : String(currentValue)}
                              </div>
                            )}
                          </div>

                          <div className="shrink-0 flex items-center pt-0.5">
                            {isSet ? (
                              <span className="p-1 rounded-full bg-emerald-500/10 text-emerald-400" title="Configured in file">
                                <Check className="w-3.5 h-3.5" />
                              </span>
                            ) : directive.category === "required" ? (
                              <span className="p-1 rounded-full bg-rose-500/10 text-rose-400" title="Missing required directive">
                                <AlertCircle className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <span className="text-theme-text-muted group-hover:text-accent">
                                <ChevronRight className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* DCI & Body Features */}
                {filteredBodyFeatures.length > 0 && (
                  <div className="space-y-1 pt-2">
                    <div className="px-2 py-1 text-[10px] font-semibold text-theme-text-muted uppercase tracking-wider">
                      Dynamic Context & Variables ({filteredBodyFeatures.length})
                    </div>
                    {filteredBodyFeatures.map((feat) => {
                      const isSelected = selectedBodyFeature?.id === feat.id;
                      const isPresent = content.includes(feat.syntax);

                      return (
                        <button
                          key={feat.id}
                          onClick={() => handleSelectBodyFeature(feat)}
                          className={cn(
                            "w-full text-left p-2.5 rounded-lg border transition flex items-start justify-between gap-2 group",
                            isSelected
                              ? "bg-theme-hover border-purple-500/40 shadow-sm"
                              : "border-transparent hover:bg-theme-hover/50 hover:border-theme-border"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-theme-text-primary group-hover:text-purple-300 transition">
                                {feat.title}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
                                {feat.category}
                              </span>
                            </div>
                            <code className="text-[10px] font-mono text-theme-text-muted block truncate mt-0.5">
                              {feat.syntax}
                            </code>
                          </div>

                          <div className="shrink-0 flex items-center pt-0.5">
                            {isPresent ? (
                              <span className="p-1 rounded-full bg-emerald-500/10 text-emerald-400" title="Present in body">
                                <Check className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <span className="text-theme-text-muted group-hover:text-purple-400">
                                <Plus className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Instruction Sections */}
                {filteredSections.length > 0 && (
                  <div className="space-y-1 pt-2">
                    <div className="px-2 py-1 text-[10px] font-semibold text-theme-text-muted uppercase tracking-wider">
                      Agent Instructions Guidance ({filteredSections.length})
                    </div>
                    {filteredSections.map((sec) => {
                      const isSelected = selectedSection?.id === sec.id;
                      const isPresent = parsedDoc.body.toLowerCase().includes(sec.heading.toLowerCase());

                      return (
                        <button
                          key={sec.id}
                          onClick={() => handleSelectSection(sec)}
                          className={cn(
                            "w-full text-left p-2.5 rounded-lg border transition flex items-start justify-between gap-2 group",
                            isSelected
                              ? "bg-theme-hover border-emerald-500/40 shadow-sm"
                              : "border-transparent hover:bg-theme-hover/50 hover:border-theme-border"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-theme-text-primary group-hover:text-emerald-400 transition">
                                {sec.title}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                                Section
                              </span>
                            </div>
                            <p className="text-[11px] text-theme-text-muted truncate mt-0.5">
                              {sec.description}
                            </p>
                          </div>

                          <div className="shrink-0 flex items-center pt-0.5">
                            {isPresent ? (
                              <span className="p-1 rounded-full bg-emerald-500/10 text-emerald-400" title="Present in body">
                                <Check className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <span className="text-theme-text-muted group-hover:text-emerald-400">
                                <Plus className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: Form Configurator */}
              <div className="flex-1 flex flex-col min-h-0 bg-surface p-5 overflow-y-auto">
                {selectedDirective ? (
                  /* Directive Form */
                  <div className="space-y-4 max-w-xl">
                    <div className="border-b border-border pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-bold text-accent px-2 py-0.5 bg-accent/10 rounded border border-accent/20">
                            {selectedDirective.id}
                          </code>
                          <span className="text-xs text-primary font-medium">
                            {selectedDirective.label}
                          </span>
                        </div>
                        {selectedDirective.category === "required" ? (
                          <span className="text-[10px] px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded font-medium">
                            Required Field
                          </span>
                        ) : selectedDirective.category === "behavioral" ? (
                          <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded font-medium">
                            Behavioral Directive
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded font-medium">
                            Optional Metadata
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-secondary mt-1.5 leading-relaxed">
                        {selectedDirective.description}
                      </p>
                      <div className="mt-2 p-2.5 bg-bg-secondary border border-border rounded text-[11px] text-muted flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-primary">Agent Role: </strong>
                          {selectedDirective.agentRole}
                        </div>
                      </div>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-3">
                      <label className="text-xs font-semibold text-primary flex items-center justify-between">
                        <span>Configured Value</span>
                        <span className="text-[11px] text-muted font-mono font-normal">
                          {selectedDirective.example.split("\n")[0]}
                        </span>
                      </label>

                      {/* Kebab Name */}
                      {selectedDirective.inputType === "kebab" && (
                        <div className="space-y-1.5">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={String(directiveValue || "")}
                              onChange={(e) => setDirectiveValue(e.target.value)}
                              placeholder={selectedDirective.placeholder}
                              className="flex-1 text-xs px-3 py-2 bg-bg-secondary border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent font-mono text-primary placeholder:text-muted"
                            />
                            <button
                              type="button"
                              onClick={() => setDirectiveValue(slugifyKebabCase(String(directiveValue || skillName || "")))}
                              className="text-xs px-2.5 py-1 bg-surface-hover hover:bg-border border border-border rounded font-medium transition text-secondary flex items-center gap-1"
                              title="Auto-format to kebab-case"
                            >
                              <Wand2 className="w-3 h-3 text-accent" /> Slugify
                            </button>
                          </div>
                          <p className="text-[11px] text-muted">
                            Must be lowercase alphanumeric separated by single hyphens and match the skill folder name.
                          </p>
                        </div>
                      )}

                      {/* Textarea Description with triggers */}
                      {selectedDirective.inputType === "textarea" && (
                        <div className="space-y-2">
                          <textarea
                            value={String(directiveValue || "")}
                            onChange={(e) => setDirectiveValue(e.target.value)}
                            placeholder={selectedDirective.placeholder}
                            rows={4}
                            className="w-full text-xs p-3 bg-theme-hover/60 border border-theme-border rounded focus:outline-none focus:ring-1 focus:ring-accent text-theme-text-primary placeholder:text-theme-text-muted resize-none leading-relaxed"
                          />
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-theme-text-muted font-medium">Quick trigger templates:</span>
                            <button
                              type="button"
                              onClick={() =>
                                setDirectiveValue(
                                  (directiveValue ? directiveValue + " " : "") +
                                    "Use when the user asks to review changes, check diffs, or audit configurations."
                                )
                              }
                              className="text-[10px] px-2 py-0.5 bg-theme-hover hover:bg-theme-border rounded border border-theme-border text-theme-text-secondary"
                            >
                              + "Use when the user asks to..."
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDirectiveValue(
                                  (directiveValue ? directiveValue + " " : "") +
                                    'Trigger phrases include "review PR", "check my changes", "code review".'
                                )
                              }
                              className="text-[10px] px-2 py-0.5 bg-theme-hover hover:bg-theme-border rounded border border-theme-border text-theme-text-secondary"
                            >
                              + 'Trigger phrases include...'
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Multiselect Tools Whitelist */}
                      {selectedDirective.inputType === "multiselect" && (
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1 bg-theme-hover/20 rounded border border-theme-border/50">
                            {CANONICAL_AGENT_TOOLS.map((tool) => {
                              let list: string[] = [];
                              if (Array.isArray(directiveValue)) {
                                list = directiveValue.map(String);
                              } else if (typeof directiveValue === "string" && directiveValue) {
                                list = directiveValue.split(",").map((s) => s.trim()).filter(Boolean);
                              }
                              const isChecked = list.includes(tool);

                              return (
                                <button
                                  key={tool}
                                  type="button"
                                  onClick={() => {
                                    if (isChecked) {
                                      const next = list.filter((t) => t !== tool);
                                      setDirectiveValue(next);
                                    } else {
                                      const next = [...list, tool];
                                      setDirectiveValue(next);
                                    }
                                  }}
                                  className={cn(
                                    "text-[11px] font-mono px-2.5 py-1 rounded-full border transition flex items-center gap-1.5",
                                    isChecked
                                      ? "bg-accent/15 text-accent border-accent/30 font-medium"
                                      : "bg-theme-hover/40 text-theme-text-muted border-theme-border hover:text-theme-text-primary"
                                  )}
                                >
                                  {isChecked ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                  {tool}
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[11px] text-theme-text-muted">
                            Least privilege enforcement: only tools listed here are permitted during skill execution.
                          </p>
                        </div>
                      )}

                      {/* Select (context mode, license, model) */}
                      {selectedDirective.inputType === "select" && (
                        <div className="space-y-2">
                          <select
                            value={String(directiveValue || "")}
                            onChange={(e) => setDirectiveValue(e.target.value)}
                            className="w-full text-xs px-3 py-2 bg-theme-hover/60 border border-theme-border rounded focus:outline-none focus:ring-1 focus:ring-accent text-theme-text-primary"
                          >
                            {selectedDirective.options?.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                          {selectedDirective.id === "context" && (
                            <div className="p-2.5 bg-accent/5 border border-accent/15 rounded text-[11px] text-theme-text-muted space-y-1">
                              <div>
                                <strong className="text-accent">fork:</strong> Runs in a subagent (separate context window) to avoid polluting main chat.
                              </div>
                              <div>
                                <strong className="text-accent">inline:</strong> Runs directly inside the current conversation.
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Boolean Switch */}
                      {selectedDirective.inputType === "boolean" && (
                        <div className="flex items-center gap-3 pt-1">
                          <button
                            type="button"
                            onClick={() => setDirectiveValue(!directiveValue)}
                            className={cn(
                              "relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                              directiveValue ? "bg-accent" : "bg-theme-hover border-theme-border"
                            )}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                directiveValue ? "translate-x-5" : "translate-x-0"
                              )}
                            />
                          </button>
                          <span className="text-xs font-mono text-theme-text-primary">
                            {directiveValue ? "true (enabled)" : "false (disabled)"}
                          </span>
                        </div>
                      )}

                      {/* Tags Array */}
                      {selectedDirective.inputType === "tags" && (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            value={
                              Array.isArray(directiveValue)
                                ? directiveValue.join(", ")
                                : String(directiveValue || "")
                            }
                            onChange={(e) =>
                              setDirectiveValue(
                                e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean)
                              )
                            }
                            placeholder="devops, security, kubernetes"
                            className="w-full text-xs px-3 py-2 bg-theme-hover/60 border border-theme-border rounded focus:outline-none focus:ring-1 focus:ring-accent font-mono text-theme-text-primary placeholder:text-theme-text-muted"
                          />
                          <p className="text-[11px] text-theme-text-muted">
                            Comma-separated tags for marketplace search and discovery.
                          </p>
                        </div>
                      )}

                      {/* Snippet / Code block */}
                      {selectedDirective.inputType === "snippet" && (
                        <textarea
                          value={String(directiveValue || "")}
                          onChange={(e) => setDirectiveValue(e.target.value)}
                          placeholder={selectedDirective.placeholder}
                          rows={3}
                          className="w-full text-xs p-2.5 font-mono bg-theme-hover/60 border border-theme-border rounded focus:outline-none focus:ring-1 focus:ring-accent text-theme-text-primary placeholder:text-theme-text-muted resize-none"
                        />
                      )}

                      {/* Text Input */}
                      {selectedDirective.inputType === "text" && (
                        <input
                          type="text"
                          value={String(directiveValue || "")}
                          onChange={(e) => setDirectiveValue(e.target.value)}
                          placeholder={selectedDirective.placeholder}
                          className="w-full text-xs px-3 py-2 bg-theme-hover/60 border border-theme-border rounded focus:outline-none focus:ring-1 focus:ring-accent font-mono text-theme-text-primary placeholder:text-theme-text-muted"
                        />
                      )}
                    </div>

                    {/* YAML Live Preview */}
                    <div className="space-y-1.5 pt-2">
                      <label className="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wider">
                        Generated Frontmatter Snippet
                      </label>
                      <pre className="p-3 bg-theme-hover/40 border border-theme-border rounded font-mono text-xs text-theme-text-primary overflow-x-auto">
                        <code>
                          {selectedDirective.id}: {formatYamlValue(directiveValue, selectedDirective.id === "description")}
                        </code>
                      </pre>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between pt-3 border-t border-theme-border">
                      {parsedDoc.frontmatter[selectedDirective.id] !== undefined ? (
                        <button
                          type="button"
                          onClick={handleRemoveDirective}
                          className="text-xs px-3 py-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 rounded font-medium transition flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove Directive
                        </button>
                      ) : (
                        <div />
                      )}

                      <button
                        type="button"
                        onClick={handleApplyDirective}
                        className="text-xs px-4 py-1.5 bg-accent text-white font-medium rounded hover:bg-accent/90 transition flex items-center gap-1.5 shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5" /> Insert / Update Directive
                      </button>
                    </div>
                  </div>
                ) : selectedBodyFeature ? (
                  /* DCI & Variable Feature Helper */
                  <div className="space-y-4 max-w-xl">
                    <div className="border-b border-theme-border pb-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-theme-text-primary flex items-center gap-2">
                          <Terminal className="w-4 h-4 text-purple-400" />
                          {selectedBodyFeature.title}
                        </h3>
                        <span className="text-[10px] px-2 py-0.5 bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded font-mono font-medium">
                          {selectedBodyFeature.category}
                        </span>
                      </div>
                      <p className="text-xs text-theme-text-secondary mt-1.5 leading-relaxed">
                        {selectedBodyFeature.description}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wider">
                        Syntax / Snippet
                      </label>
                      <pre className="p-3 bg-theme-hover/40 border border-theme-border rounded font-mono text-xs text-purple-300 overflow-x-auto whitespace-pre-wrap">
                        <code>{selectedBodyFeature.template}</code>
                      </pre>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wider">
                        Usage Context Example
                      </label>
                      <pre className="p-3 bg-theme-hover/30 border border-theme-border/60 rounded font-mono text-xs text-theme-text-primary overflow-x-auto whitespace-pre-wrap leading-relaxed">
                        <code>{selectedBodyFeature.example}</code>
                      </pre>
                    </div>

                    <div className="flex justify-end pt-3 border-t border-theme-border">
                      <button
                        type="button"
                        onClick={() => handleInsertBodyFeature(selectedBodyFeature)}
                        className="text-xs px-4 py-1.5 bg-purple-600 text-white font-medium rounded hover:bg-purple-700 transition flex items-center gap-1.5 shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" /> Insert into Skill Body
                      </button>
                    </div>
                  </div>
                ) : selectedSection ? (
                  /* Agent Instruction Section */
                  <div className="space-y-4 max-w-xl">
                    <div className="border-b border-theme-border pb-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-theme-text-primary">
                          {selectedSection.title}
                        </h3>
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-mono font-medium">
                          {selectedSection.heading}
                        </span>
                      </div>
                      <p className="text-xs text-theme-text-secondary mt-1 leading-relaxed">
                        {selectedSection.description}
                      </p>
                      <div className="mt-2 p-2.5 bg-emerald-500/5 border border-emerald-500/15 rounded text-[11px] text-theme-text-muted flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-emerald-300">Agent Benefit: </strong>
                          {selectedSection.agentBenefit}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wider">
                        Section Template
                      </label>
                      <pre className="p-3 bg-theme-hover/40 border border-theme-border rounded font-mono text-xs text-theme-text-primary overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-72">
                        <code>{selectedSection.template}</code>
                      </pre>
                    </div>

                    <div className="flex justify-end pt-3 border-t border-theme-border">
                      <button
                        type="button"
                        onClick={() => handleApplySection(selectedSection)}
                        className="text-xs px-4 py-1.5 bg-emerald-500 text-white font-medium rounded hover:bg-emerald-600 transition flex items-center gap-1.5 shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" /> Insert Section into SKILL.md
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-theme-text-muted text-xs">
                    <Sliders className="w-8 h-8 text-theme-text-muted/40 mb-2" />
                    <span>Select a directive, DCI snippet, or instruction section from the left panel</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Status Bar */}
        <div className="h-9 border-t border-border px-4 flex items-center justify-between text-xs text-muted bg-surface shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-accent" />
              <strong>{activeDirectivesCount}</strong> directives active
            </span>
            <span>•</span>
            <span>
              <strong>{SKILL_DIRECTIVES.length}</strong> frontmatter directives supported
            </span>
            <span>•</span>
            <span>
              <strong>{SKILL_BODY_FEATURES.length}</strong> DCI & variable patterns
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-xs px-3 py-1 bg-surface-hover hover:bg-border border border-border rounded text-primary transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
