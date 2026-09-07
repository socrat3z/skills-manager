import {
  parseSkillFrontmatter,
  upsertFrontmatterDirective,
  slugifyKebabCase,
} from "./skillDirectives";

export interface SkillValidationIssue {
  type: "error" | "warning" | "info";
  message: string;
  line?: number;
  code: string;
}

export interface SkillValidationResult {
  isValid: boolean;
  issues: SkillValidationIssue[];
  frontmatter: Record<string, any> | null;
}

/**
 * Backward compatible frontmatter parser wrapper.
 */
export function parseFrontmatter(markdown: string): {
  frontmatter: Record<string, string> | null;
  body: string;
  rawYaml: string;
} {
  const parsed = parseSkillFrontmatter(markdown);
  if (!parsed.hasFrontmatter) {
    return { frontmatter: null, body: markdown, rawYaml: "" };
  }
  const strFrontmatter: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.frontmatter)) {
    strFrontmatter[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return { frontmatter: strFrontmatter, body: parsed.body, rawYaml: parsed.rawYaml };
}

/**
 * Validates a SKILL.md content against modern Skill specifications and agent guidelines.
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

  const { hasFrontmatter, frontmatter, body } = parseSkillFrontmatter(content);
  const totalLines = content.split("\n").length;

  if (!hasFrontmatter) {
    issues.push({
      type: "error",
      message: "Missing YAML frontmatter block (starts with --- and ends with ---).",
      line: 1,
      code: "MISSING_FRONTMATTER",
    });
  } else {
    // 1. Validate 'name' (Mandatory)
    const name = frontmatter.name;
    if (!name || (typeof name === "string" && !name.trim())) {
      issues.push({
        type: "error",
        message: "Frontmatter missing mandatory 'name' directive.",
        line: 2,
        code: "MISSING_NAME",
      });
    } else if (typeof name === "string") {
      const trimmedName = name.trim();
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(trimmedName)) {
        issues.push({
          type: "warning",
          message: `Skill name '${trimmedName}' should be lowercase kebab-case (e.g. 'my-awesome-skill').`,
          code: "INVALID_NAME_FORMAT",
        });
      }
      if (trimmedName.length > 64) {
        issues.push({
          type: "warning",
          message: "Skill name exceeds recommended 64-character limit.",
          code: "LONG_NAME",
        });
      }
    }

    // 2. Validate 'description' (Mandatory)
    const desc = frontmatter.description;
    if (!desc || (typeof desc === "string" && !desc.trim())) {
      issues.push({
        type: "error",
        message: "Frontmatter missing mandatory 'description' directive.",
        line: 3,
        code: "MISSING_DESCRIPTION",
      });
    } else if (typeof desc === "string") {
      const trimmedDesc = desc.trim();
      if (trimmedDesc.length < 15) {
        issues.push({
          type: "warning",
          message: "Description is very short (<15 chars). Detail trigger conditions for agent routing.",
          code: "SHORT_DESCRIPTION",
        });
      }
      const lower = trimmedDesc.toLowerCase();
      if (!lower.includes("when") && !lower.includes("use") && !lower.includes("for") && !lower.includes("if")) {
        issues.push({
          type: "info",
          message: "Tip: Include explicit trigger phrases in description (e.g., 'Use when the user requests...').",
          code: "TRIGGER_HINT",
        });
      }
    }

    // 3. Validate 'allowed-tools' (Required for least privilege)
    if (!frontmatter["allowed-tools"]) {
      issues.push({
        type: "warning",
        message: "Missing 'allowed-tools' directive. Specify permitted tools to enforce least privilege.",
        code: "MISSING_ALLOWED_TOOLS",
      });
    }

    // 4. Validate Behavioral & Optional Directives
    if (frontmatter.context !== undefined) {
      if (frontmatter.context !== "fork" && frontmatter.context !== "inline") {
        issues.push({
          type: "warning",
          message: "Frontmatter 'context' directive should be either 'fork' or 'inline'.",
          code: "INVALID_CONTEXT",
        });
      }
    }

    if (frontmatter["disable-model-invocation"] !== undefined && typeof frontmatter["disable-model-invocation"] !== "boolean") {
      issues.push({
        type: "warning",
        message: "'disable-model-invocation' directive should be a boolean (true/false).",
        code: "INVALID_DISABLE_MODEL_INVOCATION",
      });
    }

    if (frontmatter["disable-formatting"] !== undefined && typeof frontmatter["disable-formatting"] !== "boolean") {
      issues.push({
        type: "warning",
        message: "'disable-formatting' directive should be a boolean (true/false).",
        code: "INVALID_DISABLE_FORMATTING",
      });
    }

    if (frontmatter["user-invocable"] !== undefined && typeof frontmatter["user-invocable"] !== "boolean") {
      issues.push({
        type: "warning",
        message: "'user-invocable' directive should be a boolean (true/false).",
        code: "INVALID_USER_INVOCABLE",
      });
    }

    if (frontmatter.version !== undefined && typeof frontmatter.version === "string") {
      if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(frontmatter.version.trim())) {
        issues.push({
          type: "info",
          message: "Skill 'version' should follow semantic versioning (e.g. 1.0.0).",
          code: "INVALID_VERSION",
        });
      }
    }

    if (frontmatter["argument-hint"] && !body.includes("$ARGUMENTS") && !body.includes("$0") && !/\$[1-9]/.test(body)) {
      issues.push({
        type: "info",
        message: "Tip: Skill defines 'argument-hint' but body does not reference $ARGUMENTS or $1..$9 substitutions.",
        code: "ARGUMENT_HINT_WITHOUT_SUBSTITUTION",
      });
    }
  }

  // File size check
  if (totalLines > 500) {
    issues.push({
      type: "warning",
      message: `File has ${totalLines} lines. Consider keeping SKILL.md under 500 lines and moving detailed docs to references/ subfolder.`,
      code: "LARGE_FILE",
    });
  }

  // Body structure & agent instructions check
  if (!body.includes("# ")) {
    issues.push({
      type: "info",
      message: "Markdown body missing H1 heading (# Skill Title).",
      code: "MISSING_H1",
    });
  }

  const lowerBody = body.toLowerCase();
  const hasWhenToUse = lowerBody.includes("when to use") || lowerBody.includes("when not to use");
  if (!hasWhenToUse) {
    issues.push({
      type: "info",
      message: "Recommended: Add a '## When to Use' section defining routing boundaries for agents.",
      code: "MISSING_WHEN_TO_USE",
    });
  }

  const hasWorkflow = lowerBody.includes("workflow") || lowerBody.includes("instructions") || lowerBody.includes("step");
  if (!hasWorkflow) {
    issues.push({
      type: "info",
      message: "Recommended: Add structured '## Instructions & Workflow' steps for deterministic execution.",
      code: "MISSING_INSTRUCTIONS",
    });
  }

  const isValid = issues.filter((i) => i.type === "error").length === 0;

  return {
    isValid,
    issues,
    frontmatter: hasFrontmatter ? frontmatter : null,
  };
}

/**
 * Auto-formats and fixes YAML frontmatter and structure for SKILL.md.
 */
export function safeAutoFixSkill(content: string, defaultName: string = "custom-skill"): string {
  const { hasFrontmatter, frontmatter } = parseSkillFrontmatter(content);

  const rawName = frontmatter?.name ? String(frontmatter.name) : defaultName;
  const name = slugifyKebabCase(rawName) || "custom-skill";
  const description = frontmatter?.description
    ? String(frontmatter.description)
    : `Comprehensive ${name} skill definition. Use when working on related tasks.`;

  let updated = hasFrontmatter ? content : `---\nname: ${name}\ndescription: ${description}\n---\n\n${content}`;

  // Ensure name is slugified
  updated = upsertFrontmatterDirective(updated, "name", name);
  updated = upsertFrontmatterDirective(updated, "description", description);

  // Check body heading
  const parsed = parseSkillFrontmatter(updated);
  let newBody = parsed.body.trim();
  if (!newBody.startsWith("#")) {
    newBody = `# ${name}\n\n${newBody}`;
    updated = `---\n${parsed.rawYaml}\n---\n\n${newBody}\n`;
  }

  return updated;
}
