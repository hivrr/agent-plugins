---
name: audit-accessibility
description: Scan codebase for accessibility issues using WCAG 2.1 AA
license: MIT
compatibility: opencode
---

# Accessibility Audit

Scan frontend code for accessibility violations against WCAG 2.1 AA standards.

---

## What to Scan

**Quick mode** — prioritize these files:
1. Form components
2. Button and interactive element components
3. Navigation and layout components
4. Modal and dialog components

**Deep mode** — scan all frontend files: `.jsx`, `.tsx`, `.html`, `.vue`, `.svelte`, `.component.ts`, `.component.html`, and `.css`/`.scss` for color analysis.

If no file index was provided, use Glob to discover frontend files. If the project has no frontend files, say so and stop.

---

## What to Look For

### Text Alternatives (WCAG 1.1.1)
- `<img>` elements without an `alt` attribute
- Informative images with empty `alt=""` (correct for decorative images only)
- `<button>` elements containing only an icon with no `aria-label`
- `<svg>` elements without a `title`, `aria-label`, or `aria-labelledby`

### Structure and Relationships (WCAG 1.3.1)
- `<input>` elements with no associated `<label>` or `aria-label`
- Data tables missing `<th>` elements
- Radio or checkbox groups without `<fieldset>` and `<legend>`
- `<div>` or `<span>` used where semantic elements should be (headings, lists, tables)
- Pages missing landmark regions (`<main>`, `<nav>`, `<header>`, `<footer>`)

### Use of Color (WCAG 1.4.1)
- Error or success states indicated only by color with no other visual cue
- Links distinguished from surrounding text only by color (no underline or other indicator)
- Required fields marked only with a color change

### Color Contrast (WCAG 1.4.3)
- Hardcoded color values that appear to fail 4.5:1 for normal text or 3:1 for large text
- Very light placeholder text colors
- Note: static analysis can only flag potential issues — computed styles need runtime verification

### Keyboard Accessibility (WCAG 2.1.1)
- `<div>` or `<span>` elements with `onClick` but no keyboard event handler (`onKeyDown`, `onKeyPress`)
- Custom interactive elements without `tabindex`
- `tabindex` values greater than 0 (disrupts natural tab order)
- `onMouseOver` / `onMouseEnter` handlers with no keyboard equivalent

### Focus Visibility (WCAG 2.4.7)
- `outline: none` or `outline: 0` applied without a replacement focus style
- Custom interactive elements with no `:focus` CSS rule
- Focus rings that blend into the background

### Headings and Labels (WCAG 2.4.6)
- Skipped heading levels (e.g. `<h1>` followed directly by `<h3>`)
- More than one `<h1>` per page or view
- Empty heading elements
- Generic, non-descriptive labels like "Click here" or "Submit"

### Skip Navigation (WCAG 2.4.1)
- Navigation-heavy pages with no skip-to-content link

### Error Identification (WCAG 3.3.1)
- Form validation errors not announced to screen readers
- Invalid inputs without `aria-invalid="true"`
- Error messages not linked to their input via `aria-describedby`

### ARIA Usage — deep mode
- Native elements with redundant ARIA roles (e.g., `<button role="button">`)
- `aria-hidden="true"` applied to elements that receive keyboard focus
- Custom widgets missing required ARIA roles or state attributes (`aria-expanded`, `aria-selected`, etc.)

---

## Severity Guide

| Severity | When to use |
|----------|-------------|
| critical | Complete barrier — user cannot complete the task (e.g., form with no labels) |
| high | Major barrier that's difficult to work around (missing alt text, no keyboard access) |
| medium | Moderate impact, workarounds exist (missing skip link, potential contrast issue) |
| low | Minor impact, best practice improvement |

| Effort | When to use |
|--------|-------------|
| trivial | Add a single attribute |
| small | Localized fix, under an hour |
| medium | Multiple components, needs testing with assistive technology |
| large | Pattern change across the codebase |

---

## Output Format

Report findings as a list. For each finding include:
- **File and line number**
- **Title** — a short, specific description of the issue
- **Severity** and **effort**
- **What's wrong** — what the code is doing and why it fails accessibility
- **How to fix** — a concrete code-level recommendation
- **WCAG criterion** (e.g., WCAG 1.1.1)

Group by severity (critical first). At the end, report files scanned and issues found.

If no frontend files exist, say so — this audit doesn't apply. If a file can't be read, skip and note it.
