# UX Checklist Reference

How to add UI/UX coverage to implementation plans. Used when any issue or feature description involves user-facing interface changes.

---

## When to Apply

Trigger this checklist when the issue body, feature description, or user input contains any of:

`UI`, `UX`, `frontend`, `page`, `screen`, `component`, `dashboard`, `form`, `modal`, `button`, `design`, `layout`, `responsive`, `user interface`, `view`, `widget`, `panel`, `sidebar`, `navigation`, `nav`, `menu`, `dialog`, `tooltip`, `animation`, `style`, `theme`, `color`, `icon`

If triggered, append a **UI/UX Plan** section to the implementation plan document.

---

## Information Hierarchy

Every screen or component has a hierarchy. Document what the user sees first, second, third.

**Bad:** "Display the user's profile information"

**Good:**
```
Profile screen hierarchy:
  1. Avatar + name (identity — establish trust immediately)
  2. Active status / last seen (context)
  3. Primary action (message / follow button — what most users do next)
  4. Secondary content (bio, stats)
  5. Tertiary: settings / edit (rare action — bottom of the page)
```

Ask: if the user has 3 seconds, what must they see? If they have 30 seconds? Document both.

---

## Interaction States Table

Every user-facing feature has multiple states. Leaving any state unspecified means the engineer ships whatever they feel like — usually "No items found." in plain text.

For each UI feature in the plan, fill in this table:

```markdown
| Feature | Loading | Empty | Error | Success | Partial |
|---------|---------|-------|-------|---------|---------|
| Issue list | Skeleton rows (3 placeholder items) | "No issues yet. Create one to get started." + New Issue button | "Failed to load issues. Retry?" + retry button | Issues render immediately | Shows loaded issues + spinner for remaining pages |
| Search results | Inline spinner in input | "No results for '{query}'" + clear search link | "Search failed. Try again." | Results list | First 10 results + "Load more" |
```

**Empty state rules:**
- "No items found." alone is never acceptable
- Every empty state needs: a warm message, context (why it's empty), and a primary action
- Example: "Your team hasn't created any issues yet. Start by describing what you want to build." + "Create first issue" button

**Error state rules:**
- Always include a recovery action (retry, go back, contact support)
- Never show a raw error message to the user — translate to human language
- Log the technical error; show a friendly summary

---

## Responsive Behavior

"Stacks on mobile" is not responsive design. For each screen or component, specify what changes at each breakpoint:

```markdown
### Responsive: Issue List

**Desktop (≥1024px):** Two-column layout — issue list (70%) + filter sidebar (30%)
**Tablet (768-1023px):** Single column — filter sidebar collapses to filter button + drawer
**Mobile (<768px):** Single column — filter drawer full-screen, list items show title + status only (no description preview)
```

Document:
- What gets hidden vs. collapsed vs. reorganized at each breakpoint
- Touch-friendly tap targets (44×44px minimum)
- Any interactions that work differently on touch (hover → tap, drag → swipe)

---

## Accessibility Requirements

Specify per component, not as a general goal:

```markdown
### Accessibility: Issue Form

**Keyboard:** Tab order follows visual order: Title → Description → Labels → Submit
**Focus:** Visible focus ring on all interactive elements (2px solid, #3B82F6)
**Screen reader:** Form labels are associated (htmlFor), error messages use aria-describedby
**ARIA:** Modal uses role="dialog" + aria-modal="true" + focus trap; closes on Escape
**Contrast:** Body text #1a1a1a on white: 17:1 ratio (WCAG AAA). Button text white on #2563EB: 5.7:1 (WCAG AA).
**Touch:** All buttons/inputs minimum 44×44px hit target
```

**Minimum bar (WCAG 2.1 AA):**
- Text contrast ≥ 4.5:1 (3:1 for large text)
- All functionality reachable by keyboard
- Focus visible on all interactive elements
- Meaningful alt text on images
- Form inputs have associated labels

---

## AI Slop Patterns to Avoid

These patterns make the UI feel generic and untrustworthy. Flag them in the plan if they appear:

| Pattern | Problem | Fix |
|---------|---------|-----|
| Generic 3-column feature grid (icon + bold title + 2-line description, repeated) | Screams "generated template" | Use a layout that reflects the actual content relationships |
| "Clean, modern UI" in the plan | Not a design decision | Specify: font, spacing, color, interaction pattern |
| Centered everything | Loss of visual hierarchy | Use deliberate alignment — not everything should be centered |
| Cards for everything | Overuse loses meaning — cards should be interactions, not containers | Ask: does this actually need to be a card? |
| Uniform border-radius on every element | Everything looks alike, no visual weight | Differentiate: buttons vs. inputs vs. containers |
| Colored left border on cards | Dated SaaS aesthetic | Use a different differentiation pattern |
| Hero section with generic copy ("Unlock the power of...") | Not your product | Write copy that describes what this actually does |
| Loading spinner with no skeleton | Jarring layout shift when content appears | Use skeleton screens that match the final layout |

---

## UI/UX Plan Section Template

Add this section to the implementation plan document (after the main tasks):

```markdown
## UI/UX Plan

### Information Hierarchy

[For each new or modified screen, list what the user sees in order of visual priority]

### Interaction States

| Feature | Loading | Empty | Error | Success | Partial |
|---------|---------|-------|-------|---------|---------|
| [feature] | [spec] | [spec] | [spec] | [spec] | [spec] |

### Responsive Behavior

| Screen/Component | Desktop (≥1024px) | Tablet (768-1023px) | Mobile (<768px) |
|-----------------|-------------------|---------------------|-----------------|
| [component] | [layout] | [layout] | [layout] |

### Accessibility

| Component | Keyboard | Screen Reader | Contrast | Touch |
|-----------|----------|---------------|----------|-------|
| [component] | [Tab order, shortcuts] | [ARIA roles, labels] | [ratio] | [44px?] |

### Design Decisions Locked In

[List explicit decisions that prevent scope creep or "we'll figure it out later" situations]
- Empty states: [what they contain]
- Error recovery: [how users recover]
- Loading experience: [skeleton vs. spinner vs. nothing]
- Font stack: [specific font names, not "sans-serif"]
- Breakpoints: [px values]
```
