import React, { useMemo, useState, createContext, useContext, useDeferredValue } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  Info,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Terminal,
  Copy,
  Check,
  Table2,
} from "lucide-react";
import { cn } from "../utils";
import { parseSkillFrontmatter } from "../lib/skillDirectives";

interface SkillMarkdownProps {
  content: string;
  className?: string;
  showFrontmatterCard?: boolean;
  onEditDirectives?: () => void;
}

// Context to distinguish inline code from code inside a <pre> block
const PreContext = createContext(false);

/**
 * Extracts plain text from nested React children (for copying).
 */
function extractTextFromChildren(children: React.ReactNode): string {
  let text = "";
  React.Children.forEach(children, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      text += String(child);
    } else if (React.isValidElement(child) && (child.props as any)?.children) {
      text += extractTextFromChildren((child.props as any).children);
    }
  });
  return text;
}

/**
 * Strips alert tags like "[!NOTE]" from the alert block content.
 */
function cleanAlertText(children: React.ReactNode, tag: string): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      return child.replace(tag, "").trim();
    }
    if (React.isValidElement(child) && (child.props as any)?.children) {
      return React.cloneElement(child, {
        ...(child.props as any),
        children: cleanAlertText((child.props as any).children, tag),
      });
    }
    return child;
  });
}

/**
 * Styled Code Block with top bar, language label, and copy button.
 */
function CodeBlockContainer({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  // Extract language from child code if present
  let language = "";
  let rawText = "";

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      const className = String((child.props as any)?.className || "");
      const match = /language-(\w+)/.exec(className);
      if (match) {
        language = match[1];
      }
      rawText = extractTextFromChildren((child.props as any)?.children);
    }
  });

  if (!rawText) {
    rawText = extractTextFromChildren(children);
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="my-5 rounded-xl border border-border bg-bg-secondary/90 shadow-sm overflow-hidden not-prose">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/70 bg-surface/70 text-[11px] select-none">
        <div className="flex items-center gap-1.5 font-mono text-muted uppercase tracking-wider font-semibold text-[10px]">
          <Terminal className="w-3 h-3 text-accent" />
          <span>{language || "code"}</span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-muted hover:text-primary hover:bg-surface-hover transition border border-transparent hover:border-border"
          title="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-500" />
              <span className="text-emerald-500">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Content */}
      <div className="p-4 overflow-x-auto">
        <pre className="font-mono text-[12.5px] leading-relaxed text-primary/90 bg-transparent p-0 m-0 border-0 whitespace-pre">
          {children}
        </pre>
      </div>
    </div>
  );
}

function renderDirectiveValue(key: string, value: unknown) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted italic text-[11px]">(empty list)</span>;
    }
    return (
      <div className="flex flex-wrap gap-1.5 my-0.5">
        {value.map((item, idx) => (
          <span
            key={idx}
            className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent/10 text-accent font-mono text-[11px] font-medium border border-accent/25"
          >
            {String(item)}
          </span>
        ))}
      </div>
    );
  }

  if (typeof value === "boolean") {
    return (
      <span
        className={cn(
          "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold",
          value
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
            : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
        )}
      >
        {value ? "true" : "false"}
      </span>
    );
  }

  if (typeof value === "string") {
    if (value.includes("\n")) {
      return (
        <div className="whitespace-pre-wrap font-sans text-secondary leading-relaxed bg-bg-secondary/40 p-2.5 rounded-lg border border-border/40 text-[12px]">
          {value}
        </div>
      );
    }
    if (
      key === "name" ||
      key === "version" ||
      key === "model" ||
      key === "context" ||
      key === "agent" ||
      key === "license"
    ) {
      return <span className="font-mono text-primary font-medium">{value}</span>;
    }
    return <span className="text-secondary">{value || <span className="text-muted italic">(empty)</span>}</span>;
  }

  if (typeof value === "object" && value !== null) {
    return (
      <pre className="font-mono text-[11px] bg-bg-secondary/70 p-2 rounded-lg border border-border/50 overflow-x-auto text-primary">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  return <span className="text-secondary">{String(value)}</span>;
}

export function SkillMarkdown({
  content,
  className,
}: SkillMarkdownProps) {
  const deferredContent = useDeferredValue(content);

  const {
    hasFrontmatter,
    isValidFrontmatter,
    frontmatterError,
    frontmatter,
    rawYaml,
    body,
  } = useMemo(() => {
    return parseSkillFrontmatter(deferredContent);
  }, [deferredContent]);

  // Strip frontmatter from preview so it doesn't render raw --- delimiters as horizontal rules
  const markdownToRender = hasFrontmatter ? body : deferredContent;

  return (
    <article
      className={cn(
        "mx-auto w-full text-[14px] leading-relaxed text-secondary select-text",
        className
      )}
    >
      {/* Frontmatter Preview (Key-Value Table if valid, Pre/Code if invalid) */}
      {hasFrontmatter && (
        isValidFrontmatter ? (
          <div className="mb-6 overflow-hidden rounded-xl border border-border bg-surface shadow-xs not-prose">
            {/* Table Header Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/80 bg-bg-secondary/60">
              <div className="flex items-center gap-2">
                <Table2 className="w-4 h-4 text-accent" />
                <span className="text-xs font-semibold text-primary">Skill Frontmatter</span>
                <span className="text-[11px] text-muted font-mono">
                  ({Object.keys(frontmatter).length} {Object.keys(frontmatter).length === 1 ? "directive" : "directives"})
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
                <Check className="w-3 h-3 text-emerald-500" />
                valid table
              </span>
            </div>

            {/* Key-Value Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs font-sans">
                <thead>
                  <tr className="border-b border-border-subtle/80 bg-surface/40 text-[11px] font-semibold text-muted uppercase tracking-wider">
                    <th className="w-1/3 min-w-[150px] px-4 py-2 border-r border-border/40 font-mono">
                      Directive / Key
                    </th>
                    <th className="w-2/3 px-4 py-2">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/60">
                  {Object.entries(frontmatter).map(([key, value]) => (
                    <tr key={key} className="hover:bg-surface-hover/50 transition">
                      <td className="px-4 py-2.5 font-mono font-medium text-primary text-[12px] border-r border-border/40 align-top">
                        <span className="px-1.5 py-0.5 rounded bg-bg-secondary border border-border/60 text-primary">
                          {key}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-secondary text-[12px] leading-relaxed align-top">
                        {renderDirectiveValue(key, value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="mb-6 overflow-hidden rounded-xl border border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/20 shadow-xs not-prose">
            {/* Invalid Frontmatter Header Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-rose-500/25 bg-rose-500/10 text-xs">
              <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200 font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>Invalid Frontmatter</span>
                {frontmatterError && (
                  <span className="font-normal text-[11px] opacity-90 truncate max-w-md">
                    ({frontmatterError})
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-rose-500/20 text-rose-900 dark:text-rose-200 font-medium border border-rose-500/30">
                pre / code
              </span>
            </div>

            {/* Pre / Code Block */}
            <div className="p-3.5 overflow-x-auto bg-surface/60">
              <pre className="font-mono text-[12px] leading-relaxed text-rose-950 dark:text-rose-100 whitespace-pre m-0">
                <code>{rawYaml || content}</code>
              </pre>
            </div>
          </div>
        )
      )}

      {/* Main Markdown Content */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          h1: ({ className, ...props }) => (
            <h1
              className={cn(
                "mt-8 mb-4 text-2xl sm:text-[26px] font-bold tracking-tight text-primary pb-3 border-b border-border first:mt-0",
                className
              )}
              {...props}
            />
          ),
          h2: ({ className, ...props }) => (
            <h2
              className={cn(
                "mt-8 mb-3.5 text-xl sm:text-[20px] font-semibold tracking-tight text-primary pb-2 border-b border-border/50 first:mt-0",
                className
              )}
              {...props}
            />
          ),
          h3: ({ className, ...props }) => (
            <h3
              className={cn(
                "mt-6 mb-2.5 text-base sm:text-[17px] font-semibold tracking-tight text-primary first:mt-0",
                className
              )}
              {...props}
            />
          ),
          h4: ({ className, ...props }) => (
            <h4
              className={cn(
                "mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-muted first:mt-0",
                className
              )}
              {...props}
            />
          ),
          h5: ({ className, ...props }) => (
            <h5
              className={cn(
                "mt-4 mb-1.5 text-xs font-semibold text-muted uppercase tracking-wider first:mt-0",
                className
              )}
              {...props}
            />
          ),
          h6: ({ className, ...props }) => (
            <h6
              className={cn(
                "mt-4 mb-1.5 text-xs font-semibold text-muted first:mt-0",
                className
              )}
              {...props}
            />
          ),
          p: ({ className, ...props }) => (
            <p
              className={cn(
                "my-3.5 text-[14px] leading-7 text-secondary font-normal",
                className
              )}
              {...props}
            />
          ),
          strong: ({ className, ...props }) => (
            <strong
              className={cn("font-semibold text-primary", className)}
              {...props}
            />
          ),
          em: ({ className, ...props }) => (
            <em className={cn("italic text-secondary", className)} {...props} />
          ),
          del: ({ className, ...props }) => (
            <del
              className={cn("line-through text-muted/80", className)}
              {...props}
            />
          ),
          a: ({ className, href, ...props }) => {
            const dangerous = /^(javascript|vbscript|data):/i;
            const safeHref = href && !dangerous.test(href.trim()) ? href : undefined;
            return (
              <a
                className={cn(
                  "text-accent hover:text-accent-light underline underline-offset-4 decoration-accent/40 hover:decoration-accent font-medium transition-colors",
                  className
                )}
                href={safeHref}
                target="_blank"
                rel="noreferrer"
                {...props}
              />
            );
          },
          ul: ({ className, ...props }) => (
            <ul
              className={cn(
                "my-3.5 pl-6 list-disc space-y-1.5 text-[14px] leading-7 text-secondary [&_ul]:my-1 [&_ol]:my-1 [&_ul]:pl-5 [&_ol]:pl-5",
                className
              )}
              {...props}
            />
          ),
          ol: ({ className, ...props }) => (
            <ol
              className={cn(
                "my-3.5 pl-6 list-decimal space-y-1.5 text-[14px] leading-7 text-secondary [&_ul]:my-1 [&_ol]:my-1 [&_ul]:pl-5 [&_ol]:pl-5",
                className
              )}
              {...props}
            />
          ),
          li: ({ className, ...props }) => (
            <li
              className={cn("pl-0.5 leading-7 marker:text-muted/70", className)}
              {...props}
            />
          ),
          input: ({ type, checked, ...props }) => {
            if (type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  disabled
                  className="mr-2 h-3.5 w-3.5 rounded border-border text-accent accent-emerald-500 align-middle cursor-default"
                  {...props}
                />
              );
            }
            return <input type={type} {...props} />;
          },
          blockquote: ({ className, children, ...props }) => {
            const childArray = React.Children.toArray(children);
            let textContent = "";
            try {
              textContent = extractTextFromChildren(childArray);
            } catch {
              // fallback
            }

            // GitHub Alert Callouts
            if (textContent.includes("[!NOTE]")) {
              return (
                <div className="my-5 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-xs text-blue-900 dark:text-blue-100 space-y-1 shadow-xs">
                  <div className="flex items-center gap-2 font-bold text-blue-700 dark:text-blue-300 text-xs">
                    <Info className="w-4 h-4" /> NOTE
                  </div>
                  <div className="opacity-95 leading-relaxed text-[13px]">
                    {cleanAlertText(children, "[!NOTE]")}
                  </div>
                </div>
              );
            }
            if (textContent.includes("[!TIP]")) {
              return (
                <div className="my-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-900 dark:text-emerald-100 space-y-1 shadow-xs">
                  <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300 text-xs">
                    <Sparkles className="w-4 h-4" /> TIP
                  </div>
                  <div className="opacity-95 leading-relaxed text-[13px]">
                    {cleanAlertText(children, "[!TIP]")}
                  </div>
                </div>
              );
            }
            if (textContent.includes("[!IMPORTANT]")) {
              return (
                <div className="my-5 rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 text-xs text-purple-900 dark:text-purple-100 space-y-1 shadow-xs">
                  <div className="flex items-center gap-2 font-bold text-purple-700 dark:text-purple-300 text-xs">
                    <AlertCircle className="w-4 h-4" /> IMPORTANT
                  </div>
                  <div className="opacity-95 leading-relaxed text-[13px]">
                    {cleanAlertText(children, "[!IMPORTANT]")}
                  </div>
                </div>
              );
            }
            if (textContent.includes("[!WARNING]")) {
              return (
                <div className="my-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-950 dark:text-amber-100 space-y-1 shadow-xs">
                  <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-300 text-xs">
                    <AlertTriangle className="w-4 h-4" /> WARNING
                  </div>
                  <div className="opacity-95 leading-relaxed text-[13px]">
                    {cleanAlertText(children, "[!WARNING]")}
                  </div>
                </div>
              );
            }
            if (textContent.includes("[!CAUTION]")) {
              return (
                <div className="my-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-900 dark:text-rose-100 space-y-1 shadow-xs">
                  <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-300 text-xs">
                    <ShieldAlert className="w-4 h-4" /> CAUTION
                  </div>
                  <div className="opacity-95 leading-relaxed text-[13px]">
                    {cleanAlertText(children, "[!CAUTION]")}
                  </div>
                </div>
              );
            }

            return (
              <blockquote
                className={cn(
                  "my-5 border-l-4 border-accent/60 bg-bg-secondary/60 px-4 py-3 text-[13.5px] italic rounded-r-lg text-secondary leading-relaxed",
                  className
                )}
                {...props}
              >
                {children}
              </blockquote>
            );
          },
          hr: ({ className, ...props }) => (
            <hr className={cn("my-8 border-border/80", className)} {...props} />
          ),
          pre: ({ children }) => (
            <PreContext.Provider value={true}>
              <CodeBlockContainer>{children}</CodeBlockContainer>
            </PreContext.Provider>
          ),
          code: ({ className, children, ...props }) => {
            const isInsidePre = useContext(PreContext);

            // If inside a <pre> tag, render standard unstyled code child
            if (isInsidePre) {
              return (
                <code
                  className={cn(
                    "block font-mono text-[12.5px] leading-relaxed text-secondary select-text whitespace-pre",
                    className
                  )}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            const textStr = String(children);

            // Highlight Dynamic Context Injection expressions: !`cmd` or ${CLAUDE_...} or $ARGUMENTS
            if (
              textStr.startsWith("!") ||
              textStr.includes("${CLAUDE_") ||
              textStr.includes("$ARGUMENTS") ||
              /^\$[1-9]/.test(textStr)
            ) {
              return (
                <code
                  className={cn(
                    "rounded-md bg-purple-500/15 border border-purple-500/25 px-1.5 py-0.5 font-mono text-[12px] text-purple-700 dark:text-purple-300 inline-block font-medium align-baseline",
                    className
                  )}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            // Standard inline code
            return (
              <code
                className={cn(
                  "rounded-md bg-bg-secondary border border-border/80 px-1.5 py-0.5 font-mono text-[12px] text-accent font-medium inline-block align-baseline",
                  className
                )}
                {...props}
              >
                {children}
              </code>
            );
          },
          table: ({ className, ...props }) => (
            <div className="my-6 overflow-x-auto rounded-xl border border-border shadow-xs">
              <table
                className={cn("min-w-full border-collapse text-left text-xs", className)}
                {...props}
              />
            </div>
          ),
          thead: ({ className, ...props }) => (
            <thead
              className={cn(
                "bg-bg-secondary border-b border-border text-primary font-semibold uppercase tracking-wider text-[11px]",
                className
              )}
              {...props}
            />
          ),
          th: ({ className, ...props }) => (
            <th
              className={cn("px-4 py-2.5 font-semibold text-primary border-b border-border", className)}
              {...props}
            />
          ),
          td: ({ className, ...props }) => (
            <td
              className={cn(
                "px-4 py-2.5 border-b border-border/40 text-secondary leading-normal",
                className
              )}
              {...props}
            />
          ),
        }}
      >
        {markdownToRender}
      </ReactMarkdown>
    </article>
  );
}
