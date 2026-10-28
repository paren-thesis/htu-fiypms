/**
 * Deterministic evaluation ID format: `${teamId}__${evaluatorUid}__team`.
 * student_id is always null in v1 (FR-06.6, Decision D-02).
 */
export function evaluationId(teamId: string, evaluatorUid: string): string {
  return `${teamId}__${evaluatorUid}__team`;
}

/**
 * Parses an evaluation ID back into its constituent teamId and evaluatorUid.
 * Returns null if the ID format does not match the deterministic pattern.
 */
export function parseEvaluationId(id: string): { teamId: string; evaluatorUid: string } | null {
  if (!id || typeof id !== 'string') return null;
  const parts = id.split('__');
  if (parts.length === 3 && parts[2] === 'team' && parts[0] && parts[1]) {
    return {
      teamId: parts[0],
      evaluatorUid: parts[1],
    };
  }
  return null;
}
