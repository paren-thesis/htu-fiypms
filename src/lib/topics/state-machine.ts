export type TopicStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'revision_requested';

export type TopicTransitionActor = 'team' | 'supervisor' | 'coordinator' | 'admin';

export const ALL_TOPIC_STATUSES: TopicStatus[] = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'revision_requested',
];

/**
 * Validates topic proposal lifecycle state transitions (Spec FR-03.2, §8.1).
 *
 * Allowed transitions:
 * - draft -> submitted (actor: team)
 * - submitted -> under_review (actor: supervisor | coordinator | admin)
 * - under_review -> approved (actor: supervisor | coordinator | admin)
 * - under_review -> rejected (actor: supervisor | coordinator | admin)
 * - under_review -> revision_requested (actor: supervisor | coordinator | admin)
 * - revision_requested -> submitted (actor: team)
 * - rejected -> submitted (actor: team)
 */
export function canTransition(
  from: TopicStatus,
  to: TopicStatus,
  actor: TopicTransitionActor
): boolean {
  if (from === to) return false;

  const isTeam = actor === 'team';
  const isSupervisorOrStaff = actor === 'supervisor' || actor === 'coordinator' || actor === 'admin';

  if (from === 'draft' && to === 'submitted') {
    return isTeam;
  }

  if (from === 'submitted' && to === 'under_review') {
    return isSupervisorOrStaff;
  }

  if (from === 'under_review') {
    if (to === 'approved' || to === 'rejected' || to === 'revision_requested') {
      return isSupervisorOrStaff;
    }
  }

  if (from === 'revision_requested' && to === 'submitted') {
    return isTeam;
  }

  if (from === 'rejected' && to === 'submitted') {
    return isTeam;
  }

  return false;
}

export function getAllowedTransitions(
  from: TopicStatus,
  actor: TopicTransitionActor
): TopicStatus[] {
  return ALL_TOPIC_STATUSES.filter((to) => canTransition(from, to, actor));
}
