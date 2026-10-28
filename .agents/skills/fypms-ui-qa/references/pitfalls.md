# Pitfalls catalog (symptom -> cause -> fix)

| Symptom | Likely cause | Fix |
|---|---|---|
| Doubled ring or outline on a circle, avatar or stepper node | `border-*` plus `ring-*` (or `outline`) applied together for the "current/active" state | Use one treatment: border for state, ring only for `focus-visible`. Never stack them on the same element. |
| Ring or outline cut off at one edge | An ancestor has `overflow-hidden`/tight padding, or the node touches the card edge | Give the parent `p-1`/`overflow-visible`, or draw the state with `box-shadow inset`; keep `outline-offset` inside the parent. |
| Tabs appear as a left column beside the content | Tabs root is a child of a `flex`/`grid` row, or `orientation="vertical"` | `<Tabs className="w-full">` with the list above: root `flex flex-col`, `TabsList` `w-fit`, `TabsContent` `mt-4`; remove the row wrapper. |
| Page scrolls sideways | Wide table or long text inside a flex/grid child without `min-w-0` | Table in `div.overflow-x-auto`; add `min-w-0` to flex/grid children; `truncate` long strings. |
| Table header hidden behind the top bar | Sticky header without offset or lower z-index | `sticky top-[var(--topbar-h)] z-10 bg-card`. |
| Dev "N" badge covers the sidebar footer | Next.js dev indicator sits bottom-left over the sidebar | Move it with the `devIndicators` position option for the installed Next version (or disable it in dev). Do not change the layout for it. |
| Footer or bottom bar hidden by mobile browser UI | `h-screen`/`100vh` | `h-dvh`, `pb-[env(safe-area-inset-bottom)]`. |
| Dropdown or popover under other content | Ancestor created a stacking context (`transform`, `overflow`, `z-index`) | Render through the shadcn portal; remove the stacking context; keep z-index scale consistent. |
| Badge/pill wraps or squashes | Flex child shrinks | `whitespace-nowrap shrink-0`. |
| Icon and text misaligned | Block icon next to inline text | `inline-flex items-center gap-2`. |
| Content under fixed top bar | Missing offset | Use sticky bar or `pt-[var(--topbar-h)]` on the scroll container. |
| Two scrollbars | Nested `overflow-y-auto` with fixed heights | One scroll container per page region; `min-h-0` on flex parents. |
| Focus ring invisible on blue | No offset against `bg-primary` | `focus-visible:ring-2 ring-ring ring-offset-2`. |
| Mobile drawer or dialog behind content | z-index below sticky elements | Use the shared Sheet/Dialog components; do not set custom z-index. |
| Top bar controls (role switcher, avatar) clipped or pushed off right edge on 375px mobile | Search trigger has fixed/large width (`w-full max-w-[200px]`) without `flex-1 min-w-0` + `shrink-0` on sibling buttons | Make the right toolbar `flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2.5`, let the search trigger shrink (`flex-1 min-w-11 max-w-[140px] sm:w-48`), and mark icon/role/avatar buttons `shrink-0` with `h-11 w-11 sm:h-9 sm:w-9`. |
| Stepper steps 4–6 cut off with a horizontal scrollbar inside mobile cards | Stepper `<ol>` forces a single horizontal row (`flex min-w-[560px]`) on narrow screens | Use a responsive grid on mobile (`grid grid-cols-2 sm:grid-cols-3 md:flex md:items-center md:justify-between`) so all steps are visible without horizontal scrolling. |
