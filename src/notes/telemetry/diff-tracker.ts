/**
 * Utility for tracking section-level edits and calculating string diff distances.
 */

export interface EditTelemetryResult {
  editedSections: string[];
  characterDiffCount: number;
  totalEdits: number;
  lastEditedAt: string;
}

/**
 * Calculates a fast token/character difference metric between two text representations.
 */
export function calculateCharDiff(before: string, after: string): number {
  if (before === after) return 0;
  // Calculate character length delta + simple mismatch heuristic
  const lenDelta = Math.abs(before.length - after.length);
  let mismatches = 0;
  const minLen = Math.min(before.length, after.length);
  for (let i = 0; i < minLen; i++) {
    if (before[i] !== after[i]) mismatches++;
  }
  return lenDelta + mismatches;
}

/**
 * Compares an existing note or plan with newly saved content, identifying
 * which pedagogical sections the teacher modified.
 */
export function trackContentDiff(
  previousContent: Record<string, any> | null | undefined,
  updatedContent: Record<string, any> | null | undefined,
  existingTelemetry?: Partial<EditTelemetryResult>,
): EditTelemetryResult {
  const sectionsChecked = [
    'objectives',
    'previousKnowledge',
    'entryBehaviour',
    'instructionalMaterials',
    'referenceBooks',
    'presentation',
    'subjectContent',
    'boardSummary',
    'commonMisconceptions',
    'differentiation',
    'evaluation',
    'summary',
    'assignment',
  ];

  const newlyEditedSections: string[] = [];
  let addedDiffCount = 0;

  if (previousContent && updatedContent) {
    for (const sec of sectionsChecked) {
      const prevVal = JSON.stringify(previousContent[sec] ?? '');
      const nextVal = JSON.stringify(updatedContent[sec] ?? '');
      if (prevVal !== nextVal) {
        newlyEditedSections.push(sec);
        addedDiffCount += calculateCharDiff(prevVal, nextVal);
      }
    }
  }

  const existingSections = existingTelemetry?.editedSections ?? [];
  const mergedSections = Array.from(new Set([...existingSections, ...newlyEditedSections]));

  return {
    editedSections: mergedSections,
    characterDiffCount: (existingTelemetry?.characterDiffCount ?? 0) + addedDiffCount,
    totalEdits: (existingTelemetry?.totalEdits ?? 0) + (newlyEditedSections.length > 0 ? 1 : 0),
    lastEditedAt: new Date().toISOString(),
  };
}
