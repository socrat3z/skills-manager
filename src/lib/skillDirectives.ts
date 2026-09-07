/**
 * Catalog and helper utilities for modern Agent Skills (SKILL.md) specifications.
 * Aligned with 2026 AgentSkills.io / TonsOfSkills / Agensi / Claude Code / Antigravity standards.
 */

export type DirectiveCategory = "required" | "metadata" | "behavioral" | "body-features";
export type DirectiveInputType =
  | "text"
  | "kebab"
  | "textarea"
  | "select"
  | "multiselect"
  | "boolean"
  | "tags"
  | "key-value"
  | "snippet";

export interface SkillDirectiveDef {
  id: string;
  label: string;
  category: DirectiveCategory;
  description: string;
  agentRole: string; // How AI agents and orchestrators interpret this
  inputType: DirectiveInputType;
  options?: string[];
  placeholder?: string;
  defaultValue?: unknown;
  example: string;
  documentationUrl?: string;
  validate?: (value: unknown) => string | null;
}

export interface AgentInstructionSection {
  id: string;
  title: string;
  heading: string;
  description: string;
  agentBenefit: string;
  template: string;
}

export interface SkillBodyFeature {
  id: string;
  title: string;
  category: "dci" | "variables" | "substitutions";
  syntax: string;
  description: string;
  example: string;
  template: string;
}

export interface SkillPresetTemplate {
  id: string;
  name: string;
  badge: string;
  description: string;
  frontmatter: Record<string, unknown>;
  bodyTemplate: (name: string, description: string) => string;
}

// ── CANONICAL TOOL LIST (Claude Code & Modern Agent Skills) ──
export const CANONICAL_AGENT_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Bash",
  "Bash(git:*)",
  "Bash(npm:*)",
  "Bash(docker:*)",
  "Bash(kubectl:*)",
  "read_file",
  "write_to_file",
  "replace_file_content",
  "run_command",
  "grep_search",
  "list_dir",
  "view_file",
  "browser_subagent",
  "ask_question",
];

export const CANONICAL_MODELS = [
  "sonnet",
  "haiku",
  "opus",
  "claude-3-7-sonnet",
  "gemini-2.5-pro",
  "gpt-4o",
  "o3-mini",
];

// ── DIRECTIVES REGISTRY ──

export const SKILL_DIRECTIVES: SkillDirectiveDef[] = [
  // ── REQUIRED FIELDS ──
  {
    id: "name",
    label: "name",
    category: "required",
    description: "Unique skill identifier in kebab-case. Must match the parent directory name.",
    agentRole: "Used by the orchestrator for skill resolution, folder matching, and slash-command routing.",
    inputType: "kebab",
    placeholder: "e.g. deploy-audit",
    defaultValue: "",
    example: "name: deploy-audit",
    validate: (val: unknown) => {
      const str = typeof val === "string" ? val.trim() : "";
      if (!str) return "Skill name is required.";
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(str)) {
        return "Must be lowercase alphanumeric with hyphens (e.g. 'my-skill'). No spaces or uppercase.";
      }
      if (str.length > 64) return "Must be 64 characters or fewer.";
      return null;
    },
  },
  {
    id: "description",
    label: "description",
    category: "required",
    description: "Explains when the agent should activate this skill. Include specific trigger phrases.",
    agentRole: "The primary semantic signal agents evaluate to match user queries with this skill.",
    inputType: "textarea",
    placeholder: "Use this skill when the user asks to review PRs, check diffs, or audit code changes. Trigger phrases include 'review PR', 'check changes'...",
    defaultValue: "",
    example: "description: |\n  Audit deployment configurations for security issues and misconfigurations.\n  Use when the user says 'audit deployment', 'check deploy config'.",
    validate: (val: unknown) => {
      const str = typeof val === "string" ? val.trim() : "";
      if (!str) return "Description is required.";
      if (str.length < 15) return "Provide a detailed description (>15 chars) specifying trigger conditions.";
      return null;
    },
  },
  {
    id: "allowed-tools",
    label: "allowed-tools",
    category: "required",
    description: "Comma-separated list or array of tools this skill may use (least privilege enforcement).",
    agentRole: "The agent runtime strictly restricts tool execution to this permitted whitelist.",
    inputType: "multiselect",
    options: CANONICAL_AGENT_TOOLS,
    placeholder: "Select permitted tools...",
    defaultValue: ["Read", "Write", "Edit"],
    example: "allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*)",
  },

  // ── BEHAVIORAL FIELDS ──
  {
    id: "model",
    label: "model",
    category: "behavioral",
    description: "Override LLM model ('sonnet', 'haiku', 'opus', etc.).",
    agentRole: "Directs execution to a specific model size/reasoning tier (e.g. 'haiku' for fast tasks, 'opus' for deep reasoning).",
    inputType: "select",
    options: CANONICAL_MODELS,
    defaultValue: "sonnet",
    example: "model: sonnet",
  },
  {
    id: "context",
    label: "context",
    category: "behavioral",
    description: "Set to 'fork' to run the skill in a subagent (separate context window).",
    agentRole: "Isolates long-running or token-heavy tasks in a clean sub-conversation to avoid polluting main chat.",
    inputType: "select",
    options: ["fork", "inline"],
    defaultValue: "fork",
    example: "context: fork",
  },
  {
    id: "agent",
    label: "agent",
    category: "behavioral",
    description: "Subagent type when 'context: fork' is set (e.g. 'Explore', 'Coder', 'Reviewer').",
    agentRole: "Determines the base capabilities and persona of the forked subagent.",
    inputType: "text",
    placeholder: "Explore",
    defaultValue: "Explore",
    example: "agent: Explore",
  },
  {
    id: "user-invocable",
    label: "user-invocable",
    category: "behavioral",
    description: "When false, hides skill from slash command menu (keeps it callable programmatically or via Skill tool).",
    agentRole: "Used for internal helper skills that should only be invoked by other skills, not directly by user.",
    inputType: "boolean",
    defaultValue: true,
    example: "user-invocable: true",
  },
  {
    id: "argument-hint",
    label: "argument-hint",
    category: "behavioral",
    description: "Autocomplete hint shown in slash command menu (e.g. '<ComponentName>', '[environment] [--dry-run]').",
    agentRole: "Informs user and agent about expected parameters; pairs with $1..$9 and $ARGUMENTS substitutions.",
    inputType: "text",
    placeholder: "<ComponentName>",
    defaultValue: "",
    example: 'argument-hint: "<ComponentName>"',
  },
  {
    id: "disable-model-invocation",
    label: "disable-model-invocation",
    category: "behavioral",
    description: "When true, prevents autonomous auto-activation; skill will only activate when explicitly invoked via command.",
    agentRole: "Ensures dangerous or heavy tasks are never triggered automatically by ambient chat context.",
    inputType: "boolean",
    defaultValue: false,
    example: "disable-model-invocation: true",
  },
  {
    id: "disable-formatting",
    label: "disable-formatting",
    category: "behavioral",
    description: "Prevents conversational markdown wrapper formatting around raw machine/script outputs.",
    agentRole: "Directs agent to output raw data without conversational pleasantries.",
    inputType: "boolean",
    defaultValue: false,
    example: "disable-formatting: true",
  },

  // ── OPTIONAL METADATA FIELDS ──
  {
    id: "version",
    label: "version",
    category: "metadata",
    description: "Semantic version string following SemVer (e.g. '1.0.0', '2.1.0').",
    agentRole: "Used for skill discovery, update tracking, and dependency resolution.",
    inputType: "text",
    placeholder: "1.0.0",
    defaultValue: "1.0.0",
    example: "version: 1.0.0",
    validate: (val: unknown) => {
      const str = typeof val === "string" ? val.trim() : "";
      if (str && !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(str)) {
        return "Must be valid semver (e.g. '1.0.0' or '2.1.0').";
      }
      return null;
    },
  },
  {
    id: "author",
    label: "author",
    category: "metadata",
    description: "Author attribution in the format 'Name <email>'.",
    agentRole: "Attribution and marketplace listing metadata.",
    inputType: "text",
    placeholder: "Jane Smith <jane@example.com>",
    defaultValue: "",
    example: "author: Jane Smith <jane@example.com>",
  },
  {
    id: "license",
    label: "license",
    category: "metadata",
    description: "SPDX license identifier (e.g. 'MIT', 'Apache-2.0', 'ISC').",
    agentRole: "Software license compliance.",
    inputType: "select",
    options: ["MIT", "Apache-2.0", "ISC", "BSD-3-Clause", "GPL-3.0", "UNLICENSED"],
    defaultValue: "MIT",
    example: "license: MIT",
  },
  {
    id: "tags",
    label: "tags",
    category: "metadata",
    description: "Discovery tags as a YAML array (e.g. [devops, security, deployment]).",
    agentRole: "Used by marketplace search, ccpi search, and skill discovery indexes.",
    inputType: "tags",
    placeholder: "devops, security, react",
    defaultValue: [],
    example: "tags: [devops, security, kubernetes]",
  },
  {
    id: "compatibility",
    label: "compatibility",
    category: "metadata",
    description: "Environment prerequisites in human-readable form (e.g. 'Node.js >= 18, Docker 20+').",
    agentRole: "Displayed in skill listings; verified by agents before attempting execution.",
    inputType: "text",
    placeholder: "Node.js >= 18, Docker 20+, kubectl 1.25+",
    defaultValue: "",
    example: 'compatibility: "Docker 20+, kubectl 1.25+"',
  },
  {
    id: "compatible-with",
    label: "compatible-with",
    category: "metadata",
    description: "Comma-separated list of supported agent platforms (e.g. 'claude-code, cursor, antigravity').",
    agentRole: "Identifies cross-platform compatibility across agent runtimes.",
    inputType: "text",
    placeholder: "claude-code, cursor, antigravity",
    defaultValue: "claude-code",
    example: "compatible-with: claude-code, cursor",
  },
  {
    id: "hooks",
    label: "hooks",
    category: "metadata",
    description: "Lifecycle event hooks (e.g. pre-tool-call validation scripts).",
    agentRole: "Executes guardrail scripts before tool calls proceed.",
    inputType: "snippet",
    placeholder: 'pre-tool-call:\n  command: "${CLAUDE_PLUGIN_ROOT}/scripts/validate.sh"',
    defaultValue: "",
    example: 'hooks:\n  pre-tool-call:\n    command: "${CLAUDE_PLUGIN_ROOT}/scripts/check.sh"',
  },
];

// ── BODY FEATURES: DYNAMIC CONTEXT INJECTION (DCI) & VARIABLES ──

export const SKILL_BODY_FEATURES: SkillBodyFeature[] = [
  {
    id: "dci_git_status",
    title: "Dynamic Context: Git Status",
    category: "dci",
    syntax: "!`git status --short 2>/dev/null || echo 'Not a git repository'`",
    description: "Runs shell command at activation time and injects short status output directly into context before tool execution.",
    example: "## Current Repository State\n!`git status --short 2>/dev/null || echo 'Not a git repo'`",
    template: "!`git status --short 2>/dev/null || echo 'Not a git repository'`",
  },
  {
    id: "dci_env_detect",
    title: "Dynamic Context: Runtime Detection",
    category: "dci",
    syntax: "!`node --version 2>/dev/null || echo 'Node not installed'`",
    description: "Pre-loads environment versions so agent doesn't waste tool call rounds checking basic tools.",
    example: "## Environment\n!`node --version 2>/dev/null || echo 'Node not installed'`\n!`python3 --version 2>/dev/null || echo 'Python not installed'`",
    template: "!`node --version 2>/dev/null || echo 'Node not installed'`\n!`python3 --version 2>/dev/null || echo 'Python not installed'`",
  },
  {
    id: "var_skill_dir",
    title: "Path Variable: ${CLAUDE_SKILL_DIR}",
    category: "variables",
    syntax: "${CLAUDE_SKILL_DIR}",
    description: "Absolute path to directory containing current SKILL.md. Used in bash commands to reference supporting templates/scripts.",
    example: 'Read the template at `${CLAUDE_SKILL_DIR}/templates/component.tpl`',
    template: "${CLAUDE_SKILL_DIR}",
  },
  {
    id: "var_plugin_root",
    title: "Path Variable: ${CLAUDE_PLUGIN_ROOT}",
    category: "variables",
    syntax: "${CLAUDE_PLUGIN_ROOT}",
    description: "Absolute path to plugin root directory. Used to call shared scripts or hooks across skills.",
    example: 'Run validation at `${CLAUDE_PLUGIN_ROOT}/scripts/check-prerequisites.sh`',
    template: "${CLAUDE_PLUGIN_ROOT}",
  },
  {
    id: "var_plugin_data",
    title: "Path Variable: ${CLAUDE_PLUGIN_DATA}",
    category: "variables",
    syntax: "${CLAUDE_PLUGIN_DATA}",
    description: "Persistent data directory for storing caches or reports surviving plugin updates.",
    example: 'Save cache to `${CLAUDE_PLUGIN_DATA}/analysis-cache.json`',
    template: "${CLAUDE_PLUGIN_DATA}",
  },
  {
    id: "sub_arguments",
    title: "String Substitution: $ARGUMENTS / $1..$9",
    category: "substitutions",
    syntax: "$1, $2, $ARGUMENTS",
    description: "Replaces positional or full arguments passed via slash command before the agent sees instructions.",
    example: "Create component named `$1` with storybook `$1.stories.tsx`",
    template: "$1",
  },
];

// ── AGENT INSTRUCTION SECTIONS (HOW TO USE SKILLS) ──

export const AGENT_INSTRUCTION_SECTIONS: AgentInstructionSection[] = [
  {
    id: "when_to_use",
    title: "When to Use & Routing Boundary",
    heading: "## When to Use",
    description: "Explicit trigger conditions and positive / negative routing criteria for agents.",
    agentBenefit: "Prevents hallucinated activations, false positives, and misrouted tasks.",
    template: `## When to Use

Use this skill whenever:
- The user asks to [Primary trigger task, e.g. review PR, audit code, deploy]
- User says trigger phrases: "review PR", "audit changes", "check diff"
- Specific files or conditions are present (e.g. \`*.tf\`, \`package.json\`)

DO NOT use this skill when:
- The user is asking for general conversational questions
- Work involves unrelated domain tasks without specified files`,
  },
  {
    id: "instructions",
    title: "Step-by-Step Instructions & Workflow",
    heading: "## Instructions",
    description: "Clear, sequential procedural steps the agent must execute in order.",
    agentBenefit: "Guarantees deterministic execution without skipped verification or missed edge cases.",
    template: `## Instructions

Follow these steps in sequence:

1. **Environment Inspection**:
   - Inspect required configuration files and verify dependencies.
   - Reference schema or checklist files before modifying code.

2. **Core Execution**:
   - Apply changes methodically with minimal targeted edits.
   - Adhere strictly to the permitted \`allowed-tools\`.

3. **Validation & Reporting**:
   - Verify syntax and run tests or linter commands.
   - Provide a clean summary diff and confirmation report.`,
  },
  {
    id: "dci_env_section",
    title: "Environment Detection (DCI)",
    heading: "## Environment Detection",
    description: "Dynamic Context Injection block pre-loading live shell state at activation time.",
    agentBenefit: "Zero-latency discovery: agent immediately knows git and tool state without issuing commands.",
    template: `## Environment Detection

!\`git status --short 2>/dev/null || echo 'No git repository detected'\`
!\`node --version 2>/dev/null || echo 'Node.js not available'\``,
  },
  {
    id: "examples",
    title: "Few-Shot Examples & Invocations",
    heading: "## Examples",
    description: "Sample user prompts paired with expected agent tool calls and deliverables.",
    agentBenefit: "Gives the agent concrete demonstrations of ideal behavior and tone.",
    template: `## Examples

### Example 1: Standard Request
**User Prompt**:
> "/deploy-audit production"

**Agent Behavior**:
1. Uses argument \`$1\` (\`production\`).
2. Reads configuration files with \`Read\`.
3. Validates against security criteria and outputs structured report.`,
  },
  {
    id: "guardrails",
    title: "Safety Guardrails & Fallbacks",
    heading: "## Constraints & Fallbacks",
    description: "Strict prohibitions and recovery steps when tools fail or assumptions are violated.",
    agentBenefit: "Prevents catastrophic file loss, endless loops, or silent failures.",
    template: `## Constraints & Fallbacks

- **Safety Prohibitions**:
  - Never execute destructive commands without fallback confirmation.
  - Never overwrite uncommitted changes without reading them first.
- **Fallback Recovery**:
  - If a command fails, inspect stderr before retrying.
  - If prerequisites are missing, notify the user with installation steps.`,
  },
];

// ── PRESET TEMPLATES ──

export const SKILL_PRESET_TEMPLATES: SkillPresetTemplate[] = [
  {
    id: "deploy-audit-standard",
    name: "Standard Production Skill",
    badge: "AgentSkills 2026",
    description: "Full production SKILL.md with allowed-tools, DCI environment detection, and structured instructions.",
    frontmatter: {
      name: "deploy-audit",
      description: "Audit deployment configurations for security issues, missing environment variables, and misconfigurations. Use when the user says 'audit deployment', 'check deploy config', or 'review infrastructure'.",
      "allowed-tools": "Read, Glob, Grep, Bash(docker:*), Bash(kubectl:*)",
      version: "1.0.0",
      author: "DevOps Team <devops@example.com>",
      license: "MIT",
      model: "sonnet",
      context: "fork",
      agent: "Explore",
      "user-invocable": true,
      "argument-hint": "<environment>",
      compatibility: "Docker 20+, kubectl 1.25+",
      "compatible-with": "claude-code, cursor",
      tags: ["devops", "security", "deployment", "kubernetes", "docker"],
    },
    bodyTemplate: (name, description) => `# ${name}

${description}

## Environment Detection
!\`kubectl config current-context 2>/dev/null || echo 'No active Kubernetes context'\`
!\`docker --version 2>/dev/null || echo 'Docker not available'\`

## Instructions
You are auditing the **$1** deployment environment.

1. Read all configuration files with \`Read\` and verify security standards.
2. Check for missing or hardcoded secrets.
3. Output the final report to \`\${CLAUDE_PLUGIN_DATA}/audits/$1-audit.md\`.
`,
  },
  {
    id: "subagent-task-skill",
    name: "Subagent Task (Forked Context)",
    badge: "context: fork",
    description: "Runs in an isolated subagent with separate context window to avoid polluting primary conversation.",
    frontmatter: {
      name: "deep-code-review",
      description: "Performs deep architectural and security analysis across the codebase. Use when the user asks for comprehensive review.",
      context: "fork",
      agent: "Explore",
      "allowed-tools": "Read, Glob, Grep, Bash(git:*)",
      model: "sonnet",
      "user-invocable": true,
      version: "1.0.0",
      license: "MIT",
      tags: ["code-review", "architecture", "security"],
    },
    bodyTemplate: (name, description) => `# ${name}

> [!NOTE]
> This skill executes in an isolated subagent context (\`context: fork\`) to keep the main conversation clean.

${description}

## When to Use
Use when the user requests comprehensive code reviews, diff checks, or architecture audits.

## Instructions
1. Inspect git changes:
!\`git diff --stat 2>/dev/null || echo 'No git changes'\`
2. Perform static inspection using \`Read\` and \`Grep\`.
3. Provide concise, prioritized feedback.
`,
  },
  {
    id: "cli-component-scaffold",
    name: "Component Scaffolder ($1 Substitutions)",
    badge: "$1 Substitutions",
    description: "Slash command skill leveraging argument-hint and $1 parameter substitutions for code generation.",
    frontmatter: {
      name: "scaffold-component",
      description: "Generate a component with tests and stories. Use when the user says 'scaffold component' or 'create component'.",
      "allowed-tools": "Read, Write, Edit, Glob",
      "argument-hint": "<ComponentName>",
      "user-invocable": true,
      version: "1.0.0",
      license: "MIT",
      tags: ["frontend", "react", "scaffolding"],
    },
    bodyTemplate: (name, description) => `# ${name}

${description}

Create a component named \`$1\` with the following structure:
- \`src/components/$1/$1.tsx\` - Component implementation
- \`src/components/$1/$1.test.tsx\` - Unit tests
- \`src/components/$1/$1.stories.tsx\` - Storybook stories

## Instructions
1. Read the template at \`\${CLAUDE_SKILL_DIR}/templates/component.tpl\` if present.
2. Create \`src/components/$1/$1.tsx\` with clean TypeScript types.
3. Create corresponding test file.
`,
  },
];

// ── UTILITY FUNCTIONS ──

export interface ParsedSkillDoc {
  hasFrontmatter: boolean;
  isValidFrontmatter: boolean;
  frontmatterError?: string;
  frontmatter: Record<string, unknown>;
  rawYaml: string;
  body: string;
}

/**
 * Parses frontmatter accurately, including booleans, numbers, arrays, strings, and multi-line scalar blocks.
 * Also reports whether the frontmatter is syntactically valid or broken.
 */
export function parseSkillFrontmatter(content: string): ParsedSkillDoc {
  // Check if document attempts to have frontmatter
  const isFrontmatterAttempt = content.startsWith("---");

  // Support both CRLF and LF, and optional spaces after closing ---
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) {
    if (isFrontmatterAttempt) {
      return {
        hasFrontmatter: true,
        isValidFrontmatter: false,
        frontmatterError: "Unclosed frontmatter block (missing ending '---')",
        frontmatter: {},
        rawYaml: content,
        body: "",
      };
    }
    return {
      hasFrontmatter: false,
      isValidFrontmatter: true,
      frontmatter: {},
      rawYaml: "",
      body: content,
    };
  }

  const rawYaml = match[1].trim();
  const body = match[2].trimStart();
  const frontmatter: Record<string, unknown> = {};

  const lines = rawYaml.split("\n");
  let currentKey: string | null = null;
  let currentArray: unknown[] | null = null;
  let currentBlockScalar: string[] | null = null;
  let isValid = true;
  let frontmatterError: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    // Check multi-line block scalar: indented lines
    if (currentBlockScalar && currentKey && (rawLine.startsWith("  ") || rawLine.startsWith("\t"))) {
      currentBlockScalar.push(rawLine.replace(/^ {2}|\t/, ""));
      continue;
    } else if (currentBlockScalar && currentKey) {
      frontmatter[currentKey] = currentBlockScalar.join("\n");
      currentBlockScalar = null;
    }

    // Check array item: "  - item" or "- item"
    if (line.startsWith("- ")) {
      if (!currentKey) {
        isValid = false;
        frontmatterError = `List item outside of a key on line ${i + 1}`;
        break;
      }
      const item = line.substring(2).trim();
      if (!currentArray) {
        currentArray = [];
        frontmatter[currentKey] = currentArray;
      }
      currentArray.push(cleanScalarValue(item));
      continue;
    }

    currentArray = null;

    const colonIndex = line.indexOf(":");
    if (colonIndex !== -1) {
      const key = line.substring(0, colonIndex).trim();
      const valueStr = line.substring(colonIndex + 1).trim();

      if (!key || /\s/.test(key)) {
        isValid = false;
        frontmatterError = `Invalid key identifier "${key}" on line ${i + 1}`;
        break;
      }

      currentKey = key;

      if (valueStr === "|" || valueStr === ">") {
        currentBlockScalar = [];
        frontmatter[key] = "";
      } else if (!valueStr) {
        frontmatter[key] = "";
      } else {
        frontmatter[key] = parseYamlScalar(valueStr);
      }
    } else {
      // Line is not a comment, not an indented scalar or list item, and has no colon
      isValid = false;
      frontmatterError = `Syntax error: expected 'key: value' on line ${i + 1}: "${line}"`;
      break;
    }
  }

  if (currentBlockScalar && currentKey) {
    frontmatter[currentKey] = currentBlockScalar.join("\n");
  }

  if (isValid && Object.keys(frontmatter).length === 0 && rawYaml.length > 0) {
    isValid = false;
    frontmatterError = "No valid key-value pairs in frontmatter block";
  }

  return {
    hasFrontmatter: true,
    isValidFrontmatter: isValid,
    frontmatterError,
    frontmatter: isValid ? frontmatter : {},
    rawYaml,
    body,
  };
}

function cleanScalarValue(val: string): unknown {
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.substring(1, val.length - 1);
  }
  if (val === "true") return true;
  if (val === "false") return false;
  return val;
}

function parseYamlScalar(val: string): unknown {
  const cleaned = cleanScalarValue(val);
  if (typeof cleaned !== "string") return cleaned;

  // Bracketed array: [a, b, c]
  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    return cleaned
      .substring(1, cleaned.length - 1)
      .split(",")
      .map((item) => String(cleanScalarValue(item.trim())))
      .filter((item) => item.length > 0);
  }

  return cleaned;
}

/**
 * Formats a JavaScript value into a clean YAML representation.
 */
export function formatYamlValue(val: unknown, isMultilineText: boolean = false): string {
  if (val === true) return "true";
  if (val === false) return "false";
  if (Array.isArray(val)) {
    if (val.length === 0) return "[]";
    return `[${val.map((x) => String(x)).join(", ")}]`;
  }
  if (typeof val === "object" && val !== null) {
    const entries = Object.entries(val);
    if (entries.length === 0) return "{}";
    return `\n${entries.map(([k, v]) => `  ${k}: ${String(v)}`).join("\n")}`;
  }
  if (typeof val === "string") {
    if (isMultilineText || val.includes("\n")) {
      const indented = val
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n");
      return `|\n${indented}`;
    }
    if (val.includes(":") || val.includes("#") || val.includes('"') || val.includes("'")) {
      return `"${val.replace(/"/g, '\\"')}"`;
    }
    return val;
  }
  return String(val);
}

/**
 * Adds or updates a directive in the SKILL.md YAML frontmatter block.
 */
export function upsertFrontmatterDirective(
  markdown: string,
  key: string,
  value: unknown
): string {
  const { frontmatter, body } = parseSkillFrontmatter(markdown);

  const updatedFrontmatter = { ...frontmatter, [key]: value };

  // Generate canonical ordering:
  // 1. name, 2. description, 3. allowed-tools, 4. behavioral, 5. metadata
  const priorityOrder = [
    "name",
    "description",
    "allowed-tools",
    "model",
    "context",
    "agent",
    "user-invocable",
    "argument-hint",
    "disable-model-invocation",
    "disable-formatting",
    "version",
    "author",
    "license",
    "compatibility",
    "compatible-with",
    "tags",
    "hooks",
  ];

  const orderedKeys = Object.keys(updatedFrontmatter).sort((a, b) => {
    const idxA = priorityOrder.indexOf(a);
    const idxB = priorityOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const yamlLines: string[] = ["---"];
  for (const k of orderedKeys) {
    const val = updatedFrontmatter[k];
    if (val === undefined || val === null || (typeof val === "string" && !val.trim() && k !== "description")) {
      continue;
    }
    const isMultiline = k === "description" && typeof val === "string" && (val.includes("\n") || val.length > 80);
    const formatted = formatYamlValue(val, isMultiline);
    if (formatted.startsWith("|\n") || formatted.startsWith("\n")) {
      yamlLines.push(`${k}: ${formatted}`);
    } else {
      yamlLines.push(`${k}: ${formatted}`);
    }
  }
  yamlLines.push("---");

  const cleanBody = body.trimStart();
  return `${yamlLines.join("\n")}\n\n${cleanBody}`;
}

/**
 * Removes a directive from frontmatter.
 */
export function removeFrontmatterDirective(markdown: string, key: string): string {
  const { hasFrontmatter, frontmatter, body } = parseSkillFrontmatter(markdown);
  if (!hasFrontmatter || !(key in frontmatter)) return markdown;

  const copy = { ...frontmatter };
  delete copy[key];

  const orderedKeys = Object.keys(copy).sort((a, b) => {
    if (a === "name") return -1;
    if (b === "name") return 1;
    if (a === "description") return -1;
    if (b === "description") return 1;
    return a.localeCompare(b);
  });

  const yamlLines: string[] = ["---"];
  for (const k of orderedKeys) {
    const val = copy[k];
    const isMultiline = k === "description" && typeof val === "string" && (val.includes("\n") || val.length > 80);
    const formatted = formatYamlValue(val, isMultiline);
    if (formatted.startsWith("|\n") || formatted.startsWith("\n")) {
      yamlLines.push(`${k}: ${formatted}`);
    } else {
      yamlLines.push(`${k}: ${formatted}`);
    }
  }
  yamlLines.push("---");

  const cleanBody = body.trimStart();
  return `${yamlLines.join("\n")}\n\n${cleanBody}`;
}

/**
 * Inserts an agent instruction section (e.g. ## When to Use) into the markdown body
 * if not already present.
 */
export function insertAgentInstructionSection(
  markdown: string,
  sectionHeading: string,
  sectionContent: string
): { updatedMarkdown: string; alreadyExisted: boolean } {
  const cleanHeading = sectionHeading.toLowerCase().trim();
  const lowerContent = markdown.toLowerCase();

  if (lowerContent.includes(cleanHeading)) {
    return { updatedMarkdown: markdown, alreadyExisted: true };
  }

  // Append with clean spacing
  const trimmed = markdown.trimEnd();
  const updatedMarkdown = `${trimmed}\n\n${sectionContent.trim()}\n`;
  return { updatedMarkdown, alreadyExisted: false };
}

/**
 * Inserts a snippet (e.g. DCI snippet or variable) at cursor or end of body.
 */
export function insertSnippetIntoMarkdown(markdown: string, snippet: string): string {
  const trimmed = markdown.trimEnd();
  return `${trimmed}\n\n${snippet}\n`;
}

/**
 * Formats an arbitrary string to valid lowercase kebab-case.
 */
export function slugifyKebabCase(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
