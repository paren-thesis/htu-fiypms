---
name: fypms-supervisor-matching
description: FYPMS supervisor matching engine with Jaccard tag overlap and capacity score, programme-scoped candidate filtering, top-3 recommendations, accept/decline flow. Use for jaccard.ts, matching-engine.ts, supervision page.
---

# Formula (pure functions in `src/lib/matching/jaccard.ts`, no I/O)
```ts
const norm = (xs: string[]) => new Set(xs.map(s => s.trim().toLowerCase()).filter(Boolean));
export function tagOverlap(t: string[], s: string[]): number {
  const T = norm(t), S = norm(s), U = new Set([...T, ...S]);
  if (U.size === 0) return 0;
  let i = 0; T.forEach(x => { if (S.has(x)) i++; });
  return i / U.size;
}
export const capacityScore = (curr: number, max: number) => Math.max(0, 1 - curr / Math.max(1, max));
export const matchScore = (t: string[], s: string[], curr: number, max = 5) =>
  tagOverlap(t, s) * 0.7 + capacityScore(curr, max) * 0.3;
```
Test vector: T={a,b}, S={b,c}, curr 2, max 5 → overlap 1/3, capacity 0.6, score ≈ 0.4133.

# Engine (`matching-engine.ts`, Node, coordinator/admin only)
1. Load team's approved/current topic tags `T`.
2. Candidates = whitelist staff with `is_active` and `programmes[]` ∋ `team.course_id` and role `supervisor`.
3. Score, sort desc (tie-break: lower `current_assigned_count`, then name). Return top 3 with breakdown (overlap, capacity, score).
4. Coordinator assigns (or overrides outside the candidate list with a required reason → audit). Create/update `supervisions` doc; supervisor gets a notification and accepts/declines within the window; accept increments `current_assigned_count` in a transaction, sets `team.assigned_supervisor_id`, and notifies the team and coordinator in-app (`fypms-notifications`); at capacity → status `at_capacity`.
5. Show an "At capacity" badge when `curr >= max` (spec quirk: max=0 and curr=0 yields capacity 1.0, so badge on `>=`).
