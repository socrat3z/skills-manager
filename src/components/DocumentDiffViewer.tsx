import { useState, useMemo, useDeferredValue } from "react";
import { Columns2, Rows3 } from "lucide-react";
import { cn } from "../utils";

interface DocumentDiffViewerProps {
  original: string;
  updated: string;
  className?: string;
  defaultMode?: "split" | "unified";
}

export type InlineDiffPart = {
  text: string;
  type: "same" | "removed" | "added";
};

export type RowToneType = "context" | "removed" | "added" | "modified" | "empty";

export interface SplitDiffRow {
  leftNumber: number | null;
  leftContent: string;
  leftType: RowToneType;
  leftParts?: InlineDiffPart[];

  rightNumber: number | null;
  rightContent: string;
  rightType: RowToneType;
  rightParts?: InlineDiffPart[];
}

export interface UnifiedDiffRow {
  type: "context" | "removed" | "added";
  leftNumber: number | null;
  rightNumber: number | null;
  content: string;
  parts?: InlineDiffPart[];
}

interface DiffHunk {
  id: string;
  leftStart: number;
  leftCount: number;
  rightStart: number;
  rightCount: number;
  splitRows: SplitDiffRow[];
  unifiedRows: UnifiedDiffRow[];
}

interface DiffSummary {
  additions: number;
  deletions: number;
  modifications: number;
  hunks: DiffHunk[];
}

const CONTEXT_LINES = 3;

/**
 * Normalizes all line endings (CRLF -> LF, CR -> LF) to prevent
 * Windows \r characters from breaking line equality.
 */
function normalizeLineEndings(str: string): string {
  return (str || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Tokenizes a line into alphanumeric tokens, punctuation, and whitespace for intra-line diffing.
 */
function tokenizeLine(line: string): string[] {
  const tokens = line.match(/[\w]+|[^\w\s]|\s+/g);
  return tokens || (line ? [line] : []);
}

function mergeContiguousParts(parts: InlineDiffPart[]): InlineDiffPart[] {
  if (parts.length <= 1) return parts;
  const result: InlineDiffPart[] = [];
  let current = { ...parts[0] };
  for (let k = 1; k < parts.length; k++) {
    if (parts[k].type === current.type) {
      current.text += parts[k].text;
    } else {
      result.push(current);
      current = { ...parts[k] };
    }
  }
  result.push(current);
  return result;
}

/**
 * Computes character/word-level differences between old and new lines for modified lines.
 */
function computeInlineDiff(
  oldLine: string,
  newLine: string
): { leftParts: InlineDiffPart[]; rightParts: InlineDiffPart[] } {
  if (oldLine === newLine) {
    return {
      leftParts: [{ text: oldLine, type: "same" }],
      rightParts: [{ text: newLine, type: "same" }],
    };
  }

  const tokensA = tokenizeLine(oldLine);
  const tokensB = tokenizeLine(newLine);

  if (tokensA.length === 0) {
    return {
      leftParts: [],
      rightParts: [{ text: newLine, type: "added" }],
    };
  }
  if (tokensB.length === 0) {
    return {
      leftParts: [{ text: oldLine, type: "removed" }],
      rightParts: [],
    };
  }

  // Guard against very long minified lines
  if (tokensA.length * tokensB.length > 25000) {
    return {
      leftParts: [{ text: oldLine, type: "removed" }],
      rightParts: [{ text: newLine, type: "added" }],
    };
  }

  const n = tokensA.length;
  const m = tokensB.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (tokensA[i] === tokensB[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const leftParts: InlineDiffPart[] = [];
  const rightParts: InlineDiffPart[] = [];

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (tokensA[i] === tokensB[j]) {
      leftParts.push({ text: tokensA[i], type: "same" });
      rightParts.push({ text: tokensB[j], type: "same" });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      leftParts.push({ text: tokensA[i], type: "removed" });
      i++;
    } else {
      rightParts.push({ text: tokensB[j], type: "added" });
      j++;
    }
  }
  while (i < n) {
    leftParts.push({ text: tokensA[i], type: "removed" });
    i++;
  }
  while (j < m) {
    rightParts.push({ text: tokensB[j], type: "added" });
    j++;
  }

  return {
    leftParts: mergeContiguousParts(leftParts),
    rightParts: mergeContiguousParts(rightParts),
  };
}

interface RawDiffOp {
  type: "context" | "removed" | "added";
  leftIndex?: number;
  rightIndex?: number;
  text: string;
}

/**
 * Builds aligned split and unified diff rows with modified line pairing.
 */
function computeDiff(original: string, updated: string): DiffSummary {
  const normOrig = normalizeLineEndings(original);
  const normUpd = normalizeLineEndings(updated);

  if (normOrig === normUpd) {
    return { additions: 0, deletions: 0, modifications: 0, hunks: [] };
  }

  const left = normOrig.split("\n");
  const right = normUpd.split("\n");

  const dp = Array.from({ length: left.length + 1 }, () => new Int32Array(right.length + 1));

  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      if (left[i] === right[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const rawOps: RawDiffOp[] = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      rawOps.push({
        type: "context",
        leftIndex: i + 1,
        rightIndex: j + 1,
        text: left[i],
      });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rawOps.push({
        type: "removed",
        leftIndex: i + 1,
        text: left[i],
      });
      i++;
    } else {
      rawOps.push({
        type: "added",
        rightIndex: j + 1,
        text: right[j],
      });
      j++;
    }
  }

  while (i < left.length) {
    rawOps.push({
      type: "removed",
      leftIndex: i + 1,
      text: left[i],
    });
    i++;
  }

  while (j < right.length) {
    rawOps.push({
      type: "added",
      rightIndex: j + 1,
      text: right[j],
    });
    j++;
  }

  // Group raw ops into change blocks, pairing modified lines side-by-side
  const splitRows: SplitDiffRow[] = [];
  const unifiedRows: UnifiedDiffRow[] = [];
  const isChangedRow: boolean[] = [];

  let additions = 0;
  let deletions = 0;
  let modifications = 0;

  let opIdx = 0;
  while (opIdx < rawOps.length) {
    const op = rawOps[opIdx];

    if (op.type === "context") {
      splitRows.push({
        leftNumber: op.leftIndex ?? null,
        leftContent: op.text,
        leftType: "context",
        rightNumber: op.rightIndex ?? null,
        rightContent: op.text,
        rightType: "context",
      });
      unifiedRows.push({
        type: "context",
        leftNumber: op.leftIndex ?? null,
        rightNumber: op.rightIndex ?? null,
        content: op.text,
      });
      isChangedRow.push(false);
      opIdx++;
    } else {
      // Gather contiguous change block (all removals and additions)
      const removedGroup: RawDiffOp[] = [];
      const addedGroup: RawDiffOp[] = [];

      while (opIdx < rawOps.length && rawOps[opIdx].type !== "context") {
        if (rawOps[opIdx].type === "removed") {
          removedGroup.push(rawOps[opIdx]);
        } else {
          addedGroup.push(rawOps[opIdx]);
        }
        opIdx++;
      }

      // Pair modified lines side-by-side
      const pairs = Math.min(removedGroup.length, addedGroup.length);

      for (let p = 0; p < pairs; p++) {
        const rem = removedGroup[p];
        const add = addedGroup[p];
        const { leftParts, rightParts } = computeInlineDiff(rem.text, add.text);

        modifications++;

        // Side-by-Side: paired on the exact same row
        splitRows.push({
          leftNumber: rem.leftIndex ?? null,
          leftContent: rem.text,
          leftType: "modified",
          leftParts,
          rightNumber: add.rightIndex ?? null,
          rightContent: add.text,
          rightType: "modified",
          rightParts,
        });

        // Unified: stacked - then +
        unifiedRows.push({
          type: "removed",
          leftNumber: rem.leftIndex ?? null,
          rightNumber: null,
          content: rem.text,
          parts: leftParts,
        });
        unifiedRows.push({
          type: "added",
          leftNumber: null,
          rightNumber: add.rightIndex ?? null,
          content: add.text,
          parts: rightParts,
        });

        isChangedRow.push(true);
      }

      // Remaining deletions
      for (let p = pairs; p < removedGroup.length; p++) {
        const rem = removedGroup[p];
        deletions++;

        splitRows.push({
          leftNumber: rem.leftIndex ?? null,
          leftContent: rem.text,
          leftType: "removed",
          rightNumber: null,
          rightContent: "",
          rightType: "empty",
        });

        unifiedRows.push({
          type: "removed",
          leftNumber: rem.leftIndex ?? null,
          rightNumber: null,
          content: rem.text,
        });

        isChangedRow.push(true);
      }

      // Remaining additions
      for (let p = pairs; p < addedGroup.length; p++) {
        const add = addedGroup[p];
        additions++;

        splitRows.push({
          leftNumber: null,
          leftContent: "",
          leftType: "empty",
          rightNumber: add.rightIndex ?? null,
          rightContent: add.text,
          rightType: "added",
        });

        unifiedRows.push({
          type: "added",
          leftNumber: null,
          rightNumber: add.rightIndex ?? null,
          content: add.text,
        });

        isChangedRow.push(true);
      }
    }
  }

  // Build Hunks with CONTEXT_LINES
  const changedIndexes = isChangedRow
    .map((changed, index) => (changed ? index : -1))
    .filter((idx) => idx !== -1);

  if (changedIndexes.length === 0) {
    return { additions: 0, deletions: 0, modifications: 0, hunks: [] };
  }

  const hunks: DiffHunk[] = [];
  let start = Math.max(0, changedIndexes[0] - CONTEXT_LINES);
  let end = Math.min(splitRows.length - 1, changedIndexes[0] + CONTEXT_LINES);

  for (let k = 1; k < changedIndexes.length; k++) {
    const nextStart = Math.max(0, changedIndexes[k] - CONTEXT_LINES);
    const nextEnd = Math.min(splitRows.length - 1, changedIndexes[k] + CONTEXT_LINES);
    if (nextStart <= end + 1) {
      end = Math.max(end, nextEnd);
    } else {
      hunks.push(createHunk(splitRows, unifiedRows, start, end, hunks.length));
      start = nextStart;
      end = nextEnd;
    }
  }
  hunks.push(createHunk(splitRows, unifiedRows, start, end, hunks.length));

  return { additions, deletions, modifications, hunks };
}

function createHunk(
  splitRows: SplitDiffRow[],
  unifiedRows: UnifiedDiffRow[],
  start: number,
  end: number,
  hunkIndex: number
): DiffHunk {
  const hunkSplitRows = splitRows.slice(start, end + 1);

  const leftNumbers = hunkSplitRows.flatMap((row) => (row.leftNumber == null ? [] : [row.leftNumber]));
  const rightNumbers = hunkSplitRows.flatMap((row) => (row.rightNumber == null ? [] : [row.rightNumber]));

  // Find corresponding unified rows by line number ranges
  const leftStart = leftNumbers[0] ?? 0;
  const leftEnd = leftNumbers[leftNumbers.length - 1] ?? leftStart;
  const rightStart = rightNumbers[0] ?? 0;
  const rightEnd = rightNumbers[rightNumbers.length - 1] ?? rightStart;

  const hunkUnifiedRows = unifiedRows.filter((row) => {
    if (row.type === "context") {
      return (
        row.leftNumber !== null &&
        row.leftNumber >= leftStart &&
        row.leftNumber <= leftEnd
      );
    }
    if (row.type === "removed") {
      return (
        row.leftNumber !== null &&
        row.leftNumber >= leftStart &&
        row.leftNumber <= leftEnd
      );
    }
    if (row.type === "added") {
      return (
        row.rightNumber !== null &&
        row.rightNumber >= rightStart &&
        row.rightNumber <= rightEnd
      );
    }
    return false;
  });

  return {
    id: `hunk-${hunkIndex}-${start}-${end}`,
    leftStart: leftNumbers[0] ?? 0,
    leftCount: leftNumbers.length,
    rightStart: rightNumbers[0] ?? 0,
    rightCount: rightNumbers.length,
    splitRows: hunkSplitRows,
    unifiedRows: hunkUnifiedRows.length > 0 ? hunkUnifiedRows : (unifiedRows.slice(start, end + 1) as UnifiedDiffRow[]),
  };
}

function cellTone(type: RowToneType) {
  if (type === "removed") {
    return {
      lineNoClass: "text-rose-700 dark:text-rose-400 bg-rose-500/15 dark:bg-rose-950/40",
      codeClass: "text-rose-900 dark:text-rose-100 bg-rose-500/10 dark:bg-rose-950/25 border-l-2 border-rose-500",
      markerClass: "text-rose-600 dark:text-rose-400 font-bold",
    };
  }
  if (type === "added") {
    return {
      lineNoClass: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 dark:bg-emerald-950/40",
      codeClass: "text-emerald-900 dark:text-emerald-100 bg-emerald-500/10 dark:bg-emerald-950/25 border-l-2 border-emerald-500",
      markerClass: "text-emerald-600 dark:text-emerald-400 font-bold",
    };
  }
  if (type === "modified") {
    return {
      lineNoClass: "text-amber-800 dark:text-amber-300 bg-amber-500/15 dark:bg-amber-950/40",
      codeClass: "text-secondary bg-amber-500/5 dark:bg-amber-950/15 border-l-2 border-amber-500",
      markerClass: "text-amber-600 dark:text-amber-400 font-bold",
    };
  }
  if (type === "empty") {
    return {
      lineNoClass: "text-transparent bg-bg-secondary/20 dark:bg-bg-secondary/40 select-none",
      codeClass: "bg-bg-secondary/10 dark:bg-bg-secondary/30",
      markerClass: "text-transparent select-none",
    };
  }
  return {
    lineNoClass: "text-muted bg-surface/50",
    codeClass: "text-secondary bg-surface/30",
    markerClass: "text-muted/40",
  };
}

function renderContentWithParts(parts: InlineDiffPart[] | undefined, fallback: string) {
  if (!parts || parts.length === 0) {
    return <span className="whitespace-pre-wrap break-words">{fallback || " "}</span>;
  }

  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, idx) => {
        if (part.type === "removed") {
          return (
            <mark
              key={idx}
              className="bg-rose-500/30 dark:bg-rose-500/40 text-rose-950 dark:text-rose-100 font-semibold rounded-xs px-0.5"
            >
              {part.text}
            </mark>
          );
        }
        if (part.type === "added") {
          return (
            <mark
              key={idx}
              className="bg-emerald-500/30 dark:bg-emerald-500/40 text-emerald-950 dark:text-emerald-100 font-semibold rounded-xs px-0.5"
            >
              {part.text}
            </mark>
          );
        }
        return <span key={idx}>{part.text}</span>;
      })}
    </span>
  );
}

export function DocumentDiffViewer({
  original,
  updated,
  className,
  defaultMode = "split",
}: DocumentDiffViewerProps) {
  const [viewMode, setViewMode] = useState<"split" | "unified">(defaultMode);

  const deferredOriginal = useDeferredValue(original);
  const deferredUpdated = useDeferredValue(updated);

  const { additions, deletions, modifications, hunks } = useMemo(
    () => computeDiff(deferredOriginal, deferredUpdated),
    [deferredOriginal, deferredUpdated]
  );

  if (hunks.length === 0) {
    return (
      <div className={cn("rounded-xl border border-border bg-surface px-4 py-8 text-center", className)}>
        <div className="text-xs font-medium text-muted">No content changes detected</div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Diff Toolbar & Mode Toggle */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface border border-border rounded-xl shadow-xs text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-primary">Diff Summary:</span>
          {modifications > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-amber-600 dark:text-amber-400 font-medium">
              ~{modifications} modified
            </span>
          )}
          {additions > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-emerald-600 dark:text-emerald-400 font-medium">
              +{additions} added
            </span>
          )}
          {deletions > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-rose-600 dark:text-rose-400 font-medium">
              -{deletions} removed
            </span>
          )}
        </div>

        {/* View Mode Toggle: Split vs Unified */}
        <div className="flex items-center gap-1 bg-bg-secondary p-0.5 rounded-lg border border-border-subtle">
          <button
            type="button"
            onClick={() => setViewMode("split")}
            className={cn(
              "px-2 py-1 text-xs rounded-md font-medium transition flex items-center gap-1.5",
              viewMode === "split"
                ? "bg-surface text-primary shadow-xs"
                : "text-muted hover:text-primary"
            )}
            title="Side-by-side split view"
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>Split</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("unified")}
            className={cn(
              "px-2 py-1 text-xs rounded-md font-medium transition flex items-center gap-1.5",
              viewMode === "unified"
                ? "bg-surface text-primary shadow-xs"
                : "text-muted hover:text-primary"
            )}
            title="Unified inline view"
          >
            <Rows3 className="w-3.5 h-3.5" />
            <span>Unified</span>
          </button>
        </div>
      </div>

      {/* Hunks List */}
      {hunks.map((hunk) => (
        <div key={hunk.id} className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          {/* Hunk Header */}
          <div className="flex items-center justify-between border-b border-border bg-sky-500/10 dark:bg-sky-950/30 px-3 py-1.5 font-mono text-[11px] text-sky-700 dark:text-sky-300 font-semibold">
            <span>
              @@ -{hunk.leftStart},{hunk.leftCount} +{hunk.rightStart},{hunk.rightCount} @@
            </span>
            <span className="text-[10px] text-sky-600/80 dark:text-sky-400/80 font-sans font-normal">
              {viewMode === "split" ? "Side-by-Side View" : "Unified View"}
            </span>
          </div>

          <div className="overflow-x-auto">
            {viewMode === "split" ? (
              /* Side-by-Side (Split) View */
              <table className="min-w-full border-collapse">
                <tbody>
                  {hunk.splitRows.map((row, index) => {
                    const leftTone = cellTone(row.leftType);
                    const rightTone = cellTone(row.rightType);
                    const leftMarker =
                      row.leftType === "removed" || row.leftType === "modified" ? "-" : " ";
                    const rightMarker =
                      row.rightType === "added" || row.rightType === "modified" ? "+" : " ";

                    return (
                      <tr key={`${hunk.id}-${index}`} className="border-b border-border-subtle/80 last:border-b-0">
                        {/* Left Column */}
                        <td
                          className={cn(
                            "w-12 select-none border-r border-border/60 px-2.5 py-0.5 text-right font-mono text-[11px]",
                            leftTone.lineNoClass
                          )}
                        >
                          {row.leftNumber ?? ""}
                        </td>
                        <td
                          className={cn(
                            "w-1/2 border-r border-border/60 px-3 py-0.5 font-mono text-[12px] leading-6",
                            leftTone.codeClass
                          )}
                        >
                          <span
                            className={cn(
                              "mr-2.5 inline-block w-2.5 select-none text-center font-bold",
                              leftTone.markerClass
                            )}
                          >
                            {leftMarker}
                          </span>
                          {renderContentWithParts(row.leftParts, row.leftContent)}
                        </td>

                        {/* Right Column */}
                        <td
                          className={cn(
                            "w-12 select-none border-r border-border/60 px-2.5 py-0.5 text-right font-mono text-[11px]",
                            rightTone.lineNoClass
                          )}
                        >
                          {row.rightNumber ?? ""}
                        </td>
                        <td
                          className={cn(
                            "w-1/2 px-3 py-0.5 font-mono text-[12px] leading-6",
                            rightTone.codeClass
                          )}
                        >
                          <span
                            className={cn(
                              "mr-2.5 inline-block w-2.5 select-none text-center font-bold",
                              rightTone.markerClass
                            )}
                          >
                            {rightMarker}
                          </span>
                          {renderContentWithParts(row.rightParts, row.rightContent)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              /* Unified (Inline) View */
              <table className="min-w-full border-collapse font-mono text-[12px]">
                <tbody>
                  {hunk.unifiedRows.map((row, index) => {
                    const isRemoved = row.type === "removed";
                    const isAdded = row.type === "added";
                    const rowClass = isRemoved
                      ? "text-rose-900 dark:text-rose-100 bg-rose-500/10 dark:bg-rose-950/25 border-l-2 border-rose-500"
                      : isAdded
                      ? "text-emerald-900 dark:text-emerald-100 bg-emerald-500/10 dark:bg-emerald-950/25 border-l-2 border-emerald-500"
                      : "text-secondary bg-surface/30";

                    const marker = isRemoved ? "-" : isAdded ? "+" : " ";
                    const markerColor = isRemoved
                      ? "text-rose-600 dark:text-rose-400 font-bold"
                      : isAdded
                      ? "text-emerald-600 dark:text-emerald-400 font-bold"
                      : "text-muted/40";

                    return (
                      <tr
                        key={`${hunk.id}-u-${index}`}
                        className={cn("border-b border-border-subtle/80 last:border-b-0", rowClass)}
                      >
                        {/* Old Line Number */}
                        <td className="w-12 select-none border-r border-border/60 px-2 py-0.5 text-right text-[11px] text-muted">
                          {row.leftNumber ?? ""}
                        </td>
                        {/* New Line Number */}
                        <td className="w-12 select-none border-r border-border/60 px-2 py-0.5 text-right text-[11px] text-muted">
                          {row.rightNumber ?? ""}
                        </td>
                        {/* Marker (+, -, space) */}
                        <td className={cn("w-6 select-none text-center font-mono font-bold", markerColor)}>
                          {marker}
                        </td>
                        {/* Line content with intra-line highlights */}
                        <td className="px-3 py-0.5 leading-6">
                          {renderContentWithParts(row.parts, row.content)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
