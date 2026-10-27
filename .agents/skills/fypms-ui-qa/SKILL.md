---
name: fypms-ui-qa
description: Finds and fixes visual and layout bugs in the FYPMS UI - overlapping or clipped elements, doubled rings or borders, tabs or columns in the wrong place, overflow, z-index clashes with the Next.js dev badge, responsive breakage - using screenshots at fixed widths, a pitfalls catalog and a Playwright layout assertion. Use when the user shows a screenshot or describes a visual problem, and after building any page or shared component.
---

# Procedure
1. **Evidence**: view the screenshot (path in `where.screenshot`, usually `docs/screenshots/`). Otherwise capture the route with Playwright at **375, 768 and 1280 px** for the affected role (`NEXT_PUBLIC_DEV_ROLE` or the dev login). State the defect in one sentence: element, what is wrong, where.
2. **Locate**: grep a visible string from the screenshot (e.g. "Formation", "Cohort Roster") to find the component. Decide whether it is a shared component (`src/components/common`, `ui`, `navbar`) or one page.
3. **Match `references/pitfalls.md`** (symptom, cause, fix). Pick the cause by inspecting classes and computed styles, not by guessing.
4. **Fix at the lowest shared level** so every page benefits. Tailwind semantic tokens only, light mode only, no inline pixel hacks, no `!important`, and never add padding or hide UI to work around a dev-only widget (move or disable the Next.js dev indicator instead).
5. **Verify**: re-capture the three widths and run the assertions in `references/layout-assertions.template.ts`: no horizontal scroll, no overlap, nothing clipped, single focus/current indicator, tabs above their content, touch targets >= 44 px. Walk `references/screenshot-checklist.md`.
6. **Lock it**: add `e2e/ui/<component>.spec.ts` using those helpers (for stepper/tabs use `/dev/ui` or the real route), add a row to `references/pitfalls.md` if the cause was new, and log it in `docs/bugs.md` (class V).
7. **Reply (JSON only)**: `{"status":"fixed","bug_id":"BUG-00N","class":"V","defect":"...","root_cause":"...","files":["..."],"widths_checked":[375,768,1280],"assertions_added":["e2e/ui/..."],"follow_ups":[]}`

# After building any page or shared component
Run steps 1 and 5 once for each role that can open it, with realistic fixture data loaded (`npm run seed:base`), and fix issues before reporting done.

# Never
Fix one page when the shared component is at fault; rely on a single viewport; change copy or behaviour while fixing layout; add dark-mode styles.
