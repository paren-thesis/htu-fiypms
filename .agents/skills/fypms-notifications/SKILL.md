---
name: fypms-notifications
description: FYPMS in-app notifications and real-time toasts backed by the notifications collection. Use for the notifications page, bell badge, notify helper, and any server action that must alert users (topic review, chapter review, assignment accepted, defense schedule, grades published).
---

# Rules
- **No email in v1** (spec D-03, FR-09.3 deferred). Do not add an email provider or `lib/email/*`. If asked, say it is deferred.
- Notifications are created only by Server Actions via the Admin SDK (rules deny client creates). One helper `notify(userIds, { title, body, type, target_url })` writes `notifications/{id}` in the same batch/transaction as the triggering change. Types: `topic_status | chapter_review | defense_schedule | grade_published`.
- Recipients are resolved server-side (team members, assigned supervisor, panel members); never from client input.
- Client: `onSnapshot` on `where('user_id','==',uid).orderBy('created_at','desc').limit(50)`; show a `sonner` toast for each newly arrived unread item (skip the initial snapshot); bell badge = unread count; clicking marks `is_read` (the only client-writable field) and navigates to `target_url`. Users may delete their own notifications.
- Events to cover: topic submitted/under review/approved/revision requested; chapter reviewed; supervisor assignment proposed/accepted/declined; defense scheduled/updated (with deliverables link for examiners); grades published and appeal window opened.
- Unsubscribe listeners on unmount. Page: `/notifications` (list, unread filter, mark all read).
