import type { McpPresetParam, McpServerConfig, McpTransport } from "./tauri";

/** Shape shared by preset and marketplace templates when building a config. */
export interface McpInstallTemplate {
  id: string;
  name: string;
  transport: McpTransport;
  command?: string | null;
  args?: string[];
  url?: string | null;
  env?: Record<string, string>;
  description?: string | null;
  params: McpPresetParam[];
}

/**
 * Build a complete `McpServerConfig` from a preset/marketplace template.
 *
 * Parameter values are injected deterministically:
 *  - `{{PARAM_NAME}}` placeholder tokens inside `args` are replaced by name
 *    (not by content sniffing), and
 *  - params whose name matches an `env` key fill that env entry.
 *
 * Params with no token in args and no matching env key are ignored, matching
 * the previous behaviour without the fragile hardcoded-sentinel heuristics.
 */
export function buildServerConfigFromParams(
  template: McpInstallTemplate,
  paramValues: Record<string, string>,
): McpServerConfig {
  const envMap: Record<string, string> = { ...(template.env || {}) };

  const argsCopy = (template.args || []).map((arg) => {
    let result = arg;
    for (const param of template.params) {
      const token = `{{${param.name}}}`;
      if (result.includes(token)) {
        result = result.split(token).join(paramValues[param.name] ?? "");
      }
    }
    return result;
  });

  // Fill env entries from matching params.
  for (const param of template.params) {
    if (param.name in envMap) {
      envMap[param.name] = paramValues[param.name] ?? "";
    }
  }

  return {
    id: template.id,
    name: template.name,
    transport: template.transport,
    command: template.command ?? undefined,
    args: argsCopy,
    url: template.url ?? undefined,
    env: envMap,
    description: template.description ?? undefined,
    disabled: false,
  };
}
