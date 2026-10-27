# Codegen patterns (follow exactly; replace Announcement/announcements)

Shared helpers: create once if missing, reuse after. `src/lib/models/common.ts`:
```ts
export type WithId<T> = T & { id: string };
```
Assume `adminDb`, `adminAuth` exported from `@/lib/firebase/admin`; `assertRole(decoded, roles)` in `@/lib/auth/assert-role`; `writeAudit({actor, action, target, meta?})` in `@/lib/audit`. Create any that are missing, minimal.

## Type → Zod / TS mapping
string→`z.string().trim().min(1)` (+`.max`) · number→`z.number()` · integer→`z.number().int()` · boolean→`z.boolean()` · timestamp→`z.coerce.date()` input, `Timestamp` stored · enum→`z.enum([...])` and union type · string_array→`z.array(z.string().trim().min(1))` · map→`z.record(z.string(), z.unknown())` (prefer explicit object) · ref→`z.string().min(1)` (doc id). Optional → `.optional()`; default → `.default(x)`.

## types (append to src/types/firestore.ts)
```ts
export interface Announcement {
  course_id: string;
  title: string;
  audience: 'all' | 'students' | 'staff';
  expires_at?: FirebaseFirestore.Timestamp;
  created_at: FirebaseFirestore.Timestamp;   // when timestamps:true
  updated_at: FirebaseFirestore.Timestamp;
}
```

## schema.ts
```ts
import { z } from 'zod';
export const announcementCreateSchema = z.object({
  course_id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  audience: z.enum(['all', 'students', 'staff']).default('all'),
}).strict();
export const announcementUpdateSchema = announcementCreateSchema.omit({ course_id: true }).partial();
export type AnnouncementCreate = z.infer<typeof announcementCreateSchema>;
```

## repo.ts (server-only; use a transaction when read-then-write)
```ts
import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { Announcement } from '@/types/firestore';
import type { WithId } from '../common';

const col = () => adminDb.collection('announcements');
export const announcementRepo = {
  async get(id: string): Promise<WithId<Announcement> | null> {
    const s = await col().doc(id).get();
    return s.exists ? { id: s.id, ...(s.data() as Announcement) } : null;
  },
  async create(data: Omit<Announcement, 'created_at' | 'updated_at'>) {
    const ref = col().doc();            // deterministic id: col().doc(computedId) + ref.create(...)
    await ref.create({ ...data, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
    return ref.id;
  },
  async update(id: string, patch: Partial<Announcement>) {
    await col().doc(id).update({ ...patch, updated_at: FieldValue.serverTimestamp() });
  },
};
```
Strip `undefined` before writes. Add `list…` helpers only for entries in `queries`.

## action (one file per actions[] item)
```ts
'use server';
import { adminAuth } from '@/lib/firebase/admin';
import { assertRole } from '@/lib/auth/assert-role';
import { writeAudit } from '@/lib/audit';
import { ZodError } from 'zod';
import { announcementCreateSchema } from '@/lib/models/announcement/schema';
import { announcementRepo } from '@/lib/models/announcement/repo';

export async function createAnnouncement(idToken: string, input: unknown) {
  try {
    const user = await adminAuth.verifyIdToken(idToken);
    assertRole(user, ['coordinator', 'admin']);
    const data = announcementCreateSchema.parse(input);
    const id = await announcementRepo.create(data);
    await writeAudit({ actor: user.uid, action: 'announcement.created', target: id });
    return { ok: true as const, id };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false as const, errors: e.flatten() };
    throw e;
  }
}
```
Add a course-category check when `course_scoped`. Export only async functions from `'use server'` files.

## rules block (token → expression)
`any_member`→`isMember()` · role→`hasAnyRole(['coordinator'])` · `owner`→`isMember() && resource.data.<owner_field> == request.auth.uid` · `team_members`→`isTeamMember(resource.data.team_id)` · `assigned_supervisor`→`isAssignedSupervisor(resource.data.team_id)` · `server`/`none`→`false`.
```
match /announcements/{id} {
  allow read: if isMember();
  allow create, update, delete: if false;   // Server Actions only
}
```
Client-writable example: `allow update: if <access expr> && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['title','updated_at']);`. Deterministic ids: also assert `id == <template>` on create. Subcollections (`collection` with `/`) nest inside their parent `match`.

## indexes
For each query with `where` + `orderBy` on different fields (or 2+ range/inequality), add `{ "collectionGroup": "<last segment>", "queryScope": "COLLECTION", "fields": [ where fields ASC in order, then orderBy field with its direction ] }`.

## tests
schema.test.ts: valid input passes; each required field missing fails; max/min/enum violations fail; unknown key fails (`.strict()`); update schema rejects server-managed keys.
rules test (`@firebase/rules-unit-testing`): unauthenticated denied; token `registered:false` denied; each allowed role passes; a non-listed role denied; every client write denied when access is `server`; for client-writable fields, writing a non-listed key is denied.

## registry row (docs/models.md)
`| Announcement | announcements | any_member read · server write | src/lib/models/announcement | 2026-10-25 |` (use today's date)
