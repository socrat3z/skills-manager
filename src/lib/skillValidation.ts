export interface SkillValidationIssue {
  type: "error" | "warning" | "info";
  message: string;
  line?: number;
  code: string;
}

export interface SkillValidationResult {
  isValid: boolean;
  issues: SkillValidationIssue[];
  frontmatter: {
    name?: string;
    description?: string;
    [key: string]: unknown;
  } | null;
}

/**
 * Parses YAML frontmatter from a Markdown string.
 */
export function parseFrontmatter(markdown: string): {
  frontmatter: Record<string, string> | null;
  body: string;
  rawYaml: string;
} {
  const trimmed = markdown.trimStart();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: null, body: markdown, rawYaml: "" };
  }

  const endIndex = trimmed.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontmatter: null, body: markdown, rawYaml: "" };
  }

  const rawYaml = trimmed.substring(4, endIndex).trim();
  const body = trimmed.substring(endIndex + 4).trimStart();

  const frontmatter: Record<string, string> = {};
  const lines = rawYaml.split("\n");

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex !== -1) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body, rawYaml };
}

/**
 * Validates a SKILL.md content against standard Skill conventions.
 */
export function validateSkillContent(content: string, filename: string): SkillValidationResult {
  const issues: SkillValidationIssue[] = [];

  if (filename !== "SKILL.md") {
    return {
      isValid: true,
      issues: [],
      frontmatter: null,
    };
  }

  const { frontmatter, body } = parseFrontmatter(content);
  const totalLines = content.split("\n").length;

  if (!frontmatter) {
    issues.push({
      type: "error",
      message: "Missing YAML frontmatter block (starts with --- and ends with ---).",
      line: 1,
      code: "MISSING_FRONTMATTER",
    });
  } else {
    if (!frontmatter.name || !frontmatter.name.trim()) {
      issues.push({
        type: "error",
        message: "Frontmatter is missing required 'name' key.",
        line: 2,
        code: "MISSING_NAME",
      });
    } else if (frontmatter.name.length > 50) {
      issues.push({
        type: "warning",
        message: "Frontmatter 'name' is long (>50 chars). Keep skill names concise.",
        code: "LONG_NAME",
      });
    }

    if (!frontmatter.description || !frontmatter.description.trim()) {
      issues.push({
        type: "error",
        message: "Frontmatter is missing required 'description' key.",
        line: 3,
        code: "MISSING_DESCRIPTION",
      });
    } else if (frontmatter.description.length < 10) {
      issues.push({
        type: "warning",
        message: "Description is very short (<10 chars). Provide a detailed trigger description.",
        code: "SHORT_DESCRIPTION",
      });
    }
  }

  if (totalLines > 500) {
    issues.push({
      type: "warning",
      message: `File has ${totalLines} lines. Consider keeping SKILL.md under 500 lines and moving detailed references to references/ subfolder.`,
      code: "LARGE_FILE",
    });
  }

  if (!body.includes("# ")) {
    issues.push({
      type: "info",
      message: "Markdown body missing H1 heading (# Skill Title).",
      code: "MISSING_H1",
    });
  }

  const isValid = issues.filter((i) => i.type === "error").length === 0;

  return {
    isValid,
    issues,
    frontmatter,
  };
}

/**
 * Auto-formats and fixes YAML frontmatter and structure for SKILL.md.
 */
export function safeAutoFixSkill(content: string, defaultName: string = "custom-skill"): string {
  const { frontmatter, body } = parseFrontmatter(content);

  const name = frontmatter?.name || defaultName;
  const description = frontmatter?.description || `${name} skill definition.`;

  const yamlLines = ["---", `name: ${name}`, `description: ${description}`];

  if (frontmatter) {
    for (const [key, val] of Object.entries(frontmatter)) {
      if (key !== "name" && key !== "description") {
        yamlLines.push(`${key}: ${val}`);
      }
    }
  }
  yamlLines.push("---");

  let newBody = body.trim();
  if (!newBody.startsWith("#")) {
    newBody = `# ${name}\n\n${newBody}`;
  }

  return `${yamlLines.join("\n")}\n\n${newBody}\n`;
}
