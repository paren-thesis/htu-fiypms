/**
 * Deterministic peer evaluation ID format: `${teamId}__${evaluatorUid}__${evaluateeUid}`.
 * Spec section 8.1 & F-09.
 */
export function peerEvaluationId(
  teamId: string,
  evaluatorUid: string,
  evaluateeUid: string
): string {
  return `${teamId}__${evaluatorUid}__${evaluateeUid}`;
}

/**
 * Parses a peer evaluation ID back into its constituent parts.
 * Returns null if the ID format does not match the deterministic pattern.
 */
export function parsePeerEvaluationId(
  id: string
): { teamId: string; evaluatorUid: string; evaluateeUid: string } | null {
  if (!id || typeof id !== 'string') return null;
  const parts = id.split('__');
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return {
      teamId: parts[0],
      evaluatorUid: parts[1],
      evaluateeUid: parts[2],
    };
  }
  return null;
}
