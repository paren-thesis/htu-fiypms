---
name: fypms-ui-design-system
description: Light-mode-only visual design system and UI patterns for FYPMS (Tailwind + shadcn/ui, calm bento dashboards, sidebar app shell, lifecycle stepper, status badges, data tables, mobile digital marksheet). Use when creating or restyling any page, layout, component, form, table, or loading/empty state.
---

# Direction: "Calm Bento"
Soft-minimal, institutional, data-first. Off-white canvas, white cards with hairline borders, HTU blue on white as the single brand accent, semantic status colours, generous spacing, tabular numbers.

# Hard rules
- **Brand: HTU blue and white.** White cards on a very light blue-grey canvas; primary actions, active nav item, focus ring and stepper use HTU blue. Place the logo at `public/htu-logo.svg` once supplied (sidebar header + login screen); until then use a text wordmark "HTU · FYPMS".
- **Light only.** `color-scheme: light`; no `.dark` token block, no `dark:` classes, no next-themes, no toggle.
- First task on any UI work: ensure `src/app/globals.css` matches `resources/globals.css` (copy if not). Check the installed Tailwind version (v3 → `tailwind.config.ts` colour mapping in `resources/tailwind-extend.txt`; v4 → `@theme inline`).
- Only semantic classes (`bg-background`, `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`, `bg-success-soft text-success`, …). No hex in components.
- Inter via `next/font`; add `tabular-nums` to scores, counts, dates in tables.
- Cards `rounded-xl border bg-card shadow-sm`; inputs/buttons `rounded-lg`. No gradients, glassmorphism, heavy shadows, or decorative animation.
- Use shadcn components; add with `npx shadcn@latest add <name>` only when needed. Toasts via `sonner`.

# App shell
Left sidebar (icon-only collapse at ≤1024px, slide-over drawer on mobile) + slim top bar: breadcrumb · ⌘K command palette · notifications bell · **RoleSwitcher** (shows active role badge) · avatar menu. Nav is filtered by `activeRole`:
- student: Dashboard · My Team · Proposals · Supervisor · Chapters · Deliverables · Peer Evaluation · Grades · Archive
- supervisor: Dashboard · My Teams · Proposal Review · Chapter Review · Sign-off · Assessments · Roster Import · Archive
- coordinator: Dashboard · Students & Pool · Staff Whitelist · Matching · Rubrics · Defense · Reports · Audit Logs
- panel_member: Dashboard · My Panels · Marksheet
- admin: Users & Roles · Audit Logs · Overrides · Backups

# Page patterns
- **Dashboard home = bento grid** (`grid grid-cols-1 md:grid-cols-6 gap-4`, cards spanning 2–3 cols): Project Journey stepper (full width) · Next deadline · Team · Supervisor · Latest feedback · Notifications.
- **Lifecycle stepper**: Formation → Topic → Supervisor → Chapters → Defense → Grades, derived from `team.status` + `academic_year.deadlines`.
- **Tables**: shadcn Table (+ TanStack Table when sort/filter needed); sticky header, search + filter chips toolbar, row hover, server-side pagination for audit logs, empty state with CTA.
- **Forms**: RHF + Zod + shadcn Form; label above, inline error, submit button spinner+disabled, toast on result.
- **Gated content**: dashed-border muted card + Lock icon + "Unlocks when your topic is approved".
- **Loading**: layout-matching skeletons via `loading.tsx`; no page-level spinners.
- **Motion**: 150–200 ms opacity/translate on state changes only; respect `prefers-reduced-motion`.

# Status badges (icon + text, never colour alone)
| Domain | Value → tone |
|---|---|
| topic | draft→neutral · submitted→info · under_review→info (Clock) · approved→success · revision_requested→warning · rejected→danger |
| chapter | pending→neutral · approved→success · revision_needed→warning |
| team | formation→neutral · topic_pending→info · topic_approved→success · defense_ready→primary · completed→success · disbanded→danger |
| defense slot | scheduled→neutral · in_progress→info (pulse dot) · completed→success · cancelled→danger |
| conflict | warning/danger with AlertTriangle (`ConflictAlertBadge`) |
Build one `<StatusBadge domain value />` component and reuse it everywhere.

# Digital marksheet (mobile-first, used on phones/tablets)
- Single column ≤768px; sticky bottom bar: running total · "Saved · 2s ago / Syncing…".
- Each criterion = card: title, collapsible description, score control = slider + −/+ stepper (≥44 px targets), `inputMode="decimal"`, clamped to `max_points`.
- Chair/coordinator view shows other examiners' live scores as read-only chips.
- Locked (`is_published`): inputs disabled + info banner.

# Accessibility
WCAG AA contrast, visible `focus-visible` ring, ≥44 px touch targets, `aria-live="polite"` for toasts and live scores, labels on every control.
