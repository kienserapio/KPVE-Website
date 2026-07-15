# Rare Gem Exchange — Design System & Layout Specification

A complete reference for the visual language, tokens, components, and layout rules behind Rare Gem Exchange. Everything here is extracted from the production build so a case‑study page (or any new surface) can be reproduced faithfully on another site.

**Design ethos:** *Estate / private‑banking luxury.* Near‑black canvas, one warm rose‑gold accent, engraved high‑tracking serif type, hard edges, and long soft shadows. Restraint over decoration; evidence over persuasion.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Color System](#2-color-system)
3. [Typography](#3-typography)
4. [Spacing & Layout](#4-spacing--layout)
5. [Grid Patterns](#5-grid-patterns)
6. [Radii, Borders & Hairlines](#6-radii-borders--hairlines)
7. [Elevation & Shadows](#7-elevation--shadows)
8. [Gradients & Backgrounds](#8-gradients--backgrounds)
9. [Motion & Animation](#9-motion--animation)
10. [Iconography](#10-iconography)
11. [Core Layout Primitives](#11-core-layout-primitives)
12. [Component Library](#12-component-library)
13. [The Concierge (Chatbot) System](#13-the-concierge-chatbot-system)
14. [Light / Dark Theming](#14-light--dark-theming)
15. [Responsive Breakpoints](#15-responsive-breakpoints)
16. [Accessibility Standards](#16-accessibility-standards)
17. [Copy‑Paste Token Sheet](#17-copy-paste-token-sheet)

---

## 1. Design Principles

| Principle | In practice |
|---|---|
| **One accent, used sparingly** | A single gold family carries all emphasis. Colour is earned, never decorative. |
| **Hard edges = engraved luxury** | Marketing surfaces use `0`‑radius corners; only utility surfaces (admin, chat) soften to `2px`. |
| **Tracking as tone** | Wide letter‑spacing (`0.1em`–`0.4em`) on caps makes type feel monumental and deliberate. |
| **Depth without gloss** | Long, low‑opacity shadows lift elements on hover; no glassmorphism, no heavy borders. |
| **Motion is calm and singular** | One easing curve everywhere; content reveals on scroll; all motion is optional. |
| **Data is legible** | Specs are laid out like lab reports — hairline‑ruled tables, right‑aligned values, uppercase labels. |

---

## 2. Color System

All colour is expressed as CSS custom properties on `:root`. Never hardcode hex values in components — reference the token.

### Brand / Accent

| Token | Value | Usage |
|---|---|---|
| `--rg-gold` | `#d8a07a` | Logo wordmark, primary display accent |
| `--rg-gold-light` | `#f6b99a` | Section labels, nav, buttons, borders, icons |
| `--rg-gold-deep` | `#4c2711` | Text sitting **on** gold‑filled surfaces |

### Neutrals / Text (brightest → dimmest)

| Token | Value | Usage |
|---|---|---|
| `--rg-cream` | `#f2eee9` | Brightest text, headings |
| `--rg-text` | `#e4e2e1` | Primary body / strong labels |
| `--rg-text-body` | `#d6d3d1` | Default body copy |
| `--rg-text-muted` | `#a8a29e` | Supporting copy |
| `--rg-text-dim` | `#8f8a85` | Footer / fine print |
| `--rg-nav` | `#d6c3ba` | Nav link rest state |

### Surfaces & Lines

| Token | Value | Usage |
|---|---|---|
| `--rg-bg` | `#080808` | Base canvas (near‑black) |
| `--rg-surface` | `rgba(255,255,255,0.02)` | Faint raised surface |
| `--rg-surface-2` | `rgba(246,185,154,0.04)` | Warm card fill |
| `--rg-border` | `rgba(246,185,154,0.1)` | Default line |
| `--rg-border-strong` | `rgba(246,185,154,0.2)` | Card / header borders |
| `--rg-hairline` | `rgba(255,255,255,0.06)` | Neutral dividers |

### Semantic / Accent Extras

| Purpose | Value | Where |
|---|---|---|
| "Your Gem" highlight | `#141f1f` fill + gold ring | Comparison widget only |
| Success / online dot | `#6ad29a` (glow `rgba(106,210,154,.7)`) | Concierge status, success states |
| Error | `#e57373` (ring `0 0 0 1px #e57373`) | Form validation |
| Light‑mode canvas | `#f4f1ed` / `#f4f1ed` | Gem detail light theme |

---

## 3. Typography

### Font Families

| Token | Font | Role |
|---|---|---|
| `--rg-font-serif` | **Cinzel** (400–700) | Display, headings, brand wordmark |
| `--rg-font-body` | **Montserrat** (300–600) | Body copy, subheadings |
| `--rg-font-ui` | **Plus Jakarta Sans** (300–600) | Buttons, nav, eyebrows, UI labels |
| *(accent)* | **Great Vibes** | Founder / signature flourish only |

Loaded via a single Google Fonts request with `preconnect`. Body defaults to Montserrat with antialiasing.

### Type Scale (observed usage)

| px | Typical role |
|---|---|
| 84 | Hero display (`Cinzel`, `0.25em` tracking) |
| 72 | Founder/team monogram |
| 56 / 52 / 48 | Large page titles, signature |
| 44 / 40 / 38 / 36 | Section headings (`.rg-heading` = 40) |
| 32 / 30 / 26 | Sub‑headings, mobile heading steps |
| 22 / 19 / 18 | Card titles, hero subheading |
| 17 / 16 / 15 | Brand mark, lead body, labels |
| 14 / 13 | Default body, nav, buttons |
| 12 / 11 / 10 / 9 | Eyebrows, meta, fine print |

### Heading Recipes

```css
/* Eyebrow / kicker — sits above big headings */
.rg-eyebrow {
  font-family: var(--rg-font-ui);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.35em;
  text-transform: uppercase;
  color: var(--rg-gold-light);
}

/* Large serif section heading (e.g. OUR STANDARDS) */
.rg-heading {
  font-family: var(--rg-font-serif);
  font-weight: 600;
  font-size: 40px;          /* 30 @ ≤768, 26 @ ≤480 */
  line-height: 1.2;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--rg-cream);
  text-shadow: 0 0 30px rgba(216, 160, 122, 0.15);
}

/* Small serif label */
.rg-label {
  font-family: var(--rg-font-serif);
  font-weight: 600;
  font-size: 16px;          /* 14 @ ≤480 */
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--rg-gold-light);
}
```

### Letter‑Spacing Ladder

Tracking is a core expressive tool. Most‑used values: `0.02em` (nav/UI) · `0.04–0.06em` (labels) · `0.08–0.12em` (headings) · `0.15–0.2em` (support text) · `0.22–0.25em` (hero, CTAs) · up to `0.4em` (hero subheading). Headings gain tracking on hover for a subtle "expand" cue.

---

## 4. Spacing & Layout

### Layout Tokens

| Token | Value | Notes |
|---|---|---|
| `--rg-maxw` | `1280px` | Content max width |
| `--rg-gutter` | `64px` | Horizontal page gutter (`24px` @ ≤768, `16px` @ ≤480) |
| Header height | `80px` | `68px` on mobile |

### Section Rhythm

Vertical section padding uses fluid clamps so spacing scales with the viewport:

```css
padding-top:    clamp(64px, 10vw, 112px);
padding-bottom: clamp(64px, 10vw, 112px);
```

Header‑to‑content gaps within sections use `clamp(48px, 8vw, 96px)`. The default inter‑element gap is **24px**; card internal padding runs `40–56px`.

### Spacing Values in Rotation

`4 · 12 · 16 · 20 · 24 · 28 · 32 · 40 · 48 · 56 · 64 · 72 · 80` px — an informal 4‑based scale. Prefer these over arbitrary values.

---

## 5. Grid Patterns

| Surface | Grid |
|---|---|
| Collection catalog | `grid-template-columns: repeat(3, 1fr); gap: 24px` → 2‑col @ ≤1000, 1‑col @ ≤520 |
| Gem hero | `grid-template-columns: 7fr 5fr; gap: 64px` → 1‑col @ ≤960 |
| Gem specs | 3 equal columns w/ hairline dividers → 1‑col @ ≤860 |
| Includes / Compare | `1fr 1fr` → 1‑col @ ≤860 |
| Standards cards | Flex, `flex: 1 1 0`, wrap → 2‑col @ ≤768, 1‑col @ ≤480 |
| Team / Founder | `grid-template-columns: 0.85fr 1.15fr; column-gap: 72px` → 1‑col @ ≤900 |
| Admin stat cards | `repeat(4, 1fr)` |
| Similar gems | Horizontal scroll‑snap flex, cards `flex: 0 0 calc(25% - 18px)` |

---

## 6. Radii, Borders & Hairlines

| Radius | Where |
|---|---|
| `0` | **Marketing surfaces** — buttons, cards, sections (sharp, "luxury") |
| `1px` | Subtle focus/nav rounding |
| `2px` | Admin console & chatbot surfaces (`--chat-radius`) |
| `8px` | Rare soft container |
| `50%` | Round icon buttons, status dots, avatars |
| `99px` | Full pill (occasional) |

**Borders** are always token‑driven hairlines: `1px solid var(--rg-border)` (default), `--rg-border-strong` (cards/header), `--rg-hairline` (neutral dividers). Vertical hairline rules separate spec columns. The deliberate split — hard edges on marketing, `2px` on tooling — signals "showroom vs. workshop."

---

## 7. Elevation & Shadows

Shadows are long, soft, and low‑opacity — either warm‑gold (accent lift) or deep‑black (media depth). Standard recipes:

```css
/* Accent hover lift — cards, CTAs */
box-shadow: 0 24px 60px -28px rgba(216, 160, 122, 0.45);
box-shadow: 0 18px 50px -20px rgba(216, 160, 122, 0.65);   /* filled button */
box-shadow: 0 26px 64px -30px rgba(216, 160, 122, 0.50);

/* Media / modal depth — black */
box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.70);
box-shadow: 0 32px 80px -16px rgba(0, 0, 0, 0.80);
box-shadow: 0 50px 130px -40px rgba(0, 0, 0, 0.85);

/* Focus ring / inset outline */
box-shadow: 0 0 0 1px var(--rg-gold);
box-shadow: inset 0 0 0 1px var(--rg-gold);

/* Status glow */
box-shadow: 0 0 8px rgba(106, 210, 154, 0.7);
```

Pattern: large negative spread + high blur = a shadow that reads as ambient light, not a drop shadow.

---

## 8. Gradients & Backgrounds

**Global page background** — a fixed, cover‑fit photograph dimmed by a `rgba(5,5,5,0.72)` scrim so content always sits on near‑black. All sections render above it at `z-index: 1`.

```css
.page-bg { position: fixed; inset: 0; background: url('/background.jpeg') center top / cover no-repeat; }
.page-bg::after { content: ''; position: absolute; inset: 0; background: rgba(5,5,5,0.72); }
```

**Atmospheric glows** — radial gradients add warmth behind hero/section content:

```css
radial-gradient(120% 80% at 50% 30%, rgba(216,160,122,0.08), transparent 60%)
radial-gradient(1100px 480px at 18% -8%, rgba(246,185,154,0.07), transparent 60%)
radial-gradient(circle, rgba(246,185,154,0.12), transparent 65%)     /* icon glow */
```

**Surface sheen** — subtle top‑lighting on cards/media:

```css
linear-gradient(160deg, rgba(255,255,255,0.02), rgba(0,0,0,0.25))
linear-gradient(90deg, var(--rg-gold), var(--rg-gold-light))          /* accent bar */
```

---

## 9. Motion & Animation

### The One Curve

```css
--rg-ease: cubic-bezier(0.16, 1, 0.3, 1);   /* used by everything */
```

### Duration Scale

`0.22s` (theme fade) · `0.25–0.3s` (hover/nav) · `0.35–0.45s` (buttons, cards) · `0.9s` (scroll reveal). Loader phrase swap: `800ms`. Simulated bot delay: `1500–2500ms` (randomised).

### Scroll Reveal (`Reveal` primitive)

Content starts `opacity: 0; translateY(42px)` and animates to rest when it enters the viewport (via `IntersectionObserver`). Stagger children with a `transition-delay` (typ. `0.05–0.32s` steps).

```css
.reveal {
  opacity: 0;
  transform: translateY(42px);
  transition: opacity 0.9s var(--rg-ease), transform 0.9s var(--rg-ease);
  will-change: opacity, transform;
}
.reveal.is-visible { opacity: 1; transform: translateY(0); }
```

### Signature Interactions

- **Card hover:** `translateY(-6px)` + gold border + accent shadow; inner image `scale(1.04–1.06)`.
- **Filled button hover:** background fills gold, text → `--rg-gold-deep`, tracking widens `+0.04em`, accent shadow blooms.
- **Underline links:** a `::after` 1px bar grows from `width: 0 → 100%` on hover; full width on active.
- **Marquee (endorsements):** duplicated track slides `translateX(-50%)` on a linear infinite loop; pauses on hover; edge‑fade mask; drag‑scroll under reduced motion.
- **Error shake:** re‑triggered by toggling a class / changing a React `key` so identical repeat failures still animate.

### Reduced Motion

Every animated surface ships a `@media (prefers-reduced-motion: reduce)` block that removes transforms/transitions and shows content statically. This is mandatory for any new component.

---

## 10. Iconography

- **Inline SVG only** — no icon font, no icon library. Each icon is a tiny local component.
- **Grid:** `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.5"`, round caps/joins.
- **Sizing:** `20px` inline (lists, buttons), `40px` feature icons (`0.9px` effective hairline stroke), `12–16px` glyphs (diamonds, plus).
- **Colour by context** via `currentColor` — icons inherit `--rg-gold-light` and recolour automatically under light mode.
- **Always** `aria-hidden="true"` + `focusable="false"` on decorative icons.

Recurring glyphs: diamond `◇` divider, microscope / vault / scroll (Standards), globe / trend / seal (About), quote mark (Testimonials), plus→× (FAQ), sun/moon (theme), chevrons (carousel), truck / box / award (Includes).

---

## 11. Core Layout Primitives

Reuse these instead of re‑implementing:

```css
/* Centered, max-width, gutter-padded section wrapper */
.rg-section {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: var(--rg-maxw);
  margin: 0 auto;
  padding-left: var(--rg-gutter);
  padding-right: var(--rg-gutter);
}
```

- **`.rg-section`** — every content block's outer container.
- **`.rg-eyebrow` / `.rg-heading` / `.rg-label`** — the standard header stack (see §3).
- **`<Reveal>`** — polymorphic (`as` prop) scroll‑in wrapper with `delay`, `threshold`, and `once` props.
- **Divider motif** — `line — ◇ — line` (a flex row with two 1px rules and a centered diamond) marks hero/about breaks.

---

## 12. Component Library

### Buttons

| Variant | Spec |
|---|---|
| **Primary CTA** (outline→fill) | `1px solid var(--rg-gold-light)`, transparent, `19px 56px` pad, `0.32em` tracking, uppercase 13px UI. Hover: fills gold, text `--rg-gold-deep`, `+0.04em` tracking, accent shadow. |
| **Secondary (quiet)** | Text‑only, muted, animated underline `::after`; hover → gold. Works as `<a>` or `<button>`. |
| **Contact / filled** | Solid `--rg-gold-light` bg, `--rg-gold-deep` text, `12px 32px`, `0` radius. Hover → `--rg-cream`. |
| **Cream CTA** | Solid cream fill for high‑contrast section CTAs (e.g. "Inquire About Services"). |
| **Round icon button** | `50%`, `28–44px`, `currentColor`, hover → cream (carousel arrows, refresh, close). |

### Navigation

Sticky, translucent bar: `rgba(8,8,8,0.72)` + `backdrop-filter: blur(12px)`, `--rg-border-strong` bottom, `z-index: 100` (below chatbot ~1000). Brand in `Cinzel` 700. Nav links: 13px UI, `--rg-nav` rest → cream hover, with a growing 1px underline; active state = full underline. Mobile collapses to a hamburger‑toggled drawer that animates `max-height 0 → 360px`.

### Cards

- **Standards card** — `--rg-surface-2` fill, `--rg-border-strong`, `49px 40px 56px` pad, centered icon/title/body. Hover: lift `-6px`, gold border, icon `scale(1.06)`, title → gold.
- **Gallery / gem card** — `<Link>` wrapping a cropped media block (4:5 or 1:1, `object-fit: cover`) over an info block (serif uppercase name + spec line). Hover: lift + image zoom.
- **Includes card** — atmospheric media block with radial‑glow `::before` and centered gold icon.

### Filter Pills

Toggle buttons (`.col-pill`) for category and carat range; active state via class concat (`--active`); clicking an active pill clears it. Shared visual language with admin tabs.

### Accordion (FAQ)

Single‑open accordion; smooth auto‑height via the **grid‑rows `0fr → 1fr`** technique (no JS height measurement). Plus glyph rotates `45°` into an × when open. Full ARIA (`aria-expanded`, `aria-controls`, `role="region"`).

### Forms & Inputs

- White or dark field, 1px token border, focus ring in gold.
- Inline **currency‑symbol adornment** on budget inputs (live, IP‑detected).
- **Validation:** client‑side with per‑group error state; failed submit triggers a shake + red ring (`0 0 0 1px #e57373`) + `role="alert"` message; error clears on edit.
- `noValidate` on forms (JS owns validation); required asterisks and optional labels.

### Tables (Admin)

Sticky headers (`position: sticky; top: 0`) inside an `overflow: auto` wrapper with `min-width` forcing horizontal scroll. Consent badges (✓/✗), mailto links, budget/date formatting helpers. **Skeleton shimmer** rows/cards (moving‑gradient keyframe) during load; contextual empty states.

### Modals / Dialogs

`role="dialog"`, `aria-modal`, backdrop scrim, pop/fade entrance. Close on backdrop click (via `mousedown` so text selection doesn't dismiss), X button, or **Escape**. Focus moves to the close button on open. Used by the transcript viewer, intake form, and success overlay.

### Badges & Status

Small uppercase pills; a pulsing dot (`#6ad29a` + glow) marks "Online" / "Live". Price‑delta chips show `+$2,750` / `−$10,000` in gold within the compare widget.

### Decorative

- **Breadcrumb** — 10px uppercase, gold current segment, `Link` ancestors.
- **Monogram plate** — double‑framed 4:5 placeholder with a large serif initials monogram + role label (team portraits).
- **Signature** — `Great Vibes` cursive, 52px gold with glow, over an uppercase credit line.

---

## 13. The Concierge (Chatbot) System

A self‑contained floating assistant with its own token scope.

### Chat Tokens

```css
--chat-panel:        #131313;             /* window background */
--chat-surface:      #1f2020;             /* header / input bar / bot bubble */
--chat-input-bg:     #ffffff;             /* free-text field */
--chat-input-text:   #1a1512;
--chat-input-border: #6b7280;
--chat-scrim:        rgba(8, 8, 8, 0.55);
--chat-launcher-h:   60px;
--chat-gap:          28px;                /* viewport inset (20px @ ≤480) */
--chat-radius:       2px;                 /* near-sharp, on brand */
--chat-z-launcher:   1000;
--chat-z-window:     1001;
```

### Anatomy

- **Launcher** — sticky gold "Concierge" bar, bottom‑right; icon morphs chat‑bubble ↔ × ; `aria-expanded` / `aria-haspopup="dialog"`.
- **Window** — always mounted (animates open/close; `inert` + `aria-hidden` when closed). `role="dialog"`, header with live status dot + reset/close, an `aria-live="polite"` message log, typing indicator, quick replies, and input.
- **Bubbles** — bot left ("Concierge"), user right ("You"), each with a localized clock‑time meta line; memoized.
- **Typing indicator** — three staggered pulsing dots + a cycling loader phrase.
- **Quick replies** — context‑aware pill row (`role="group"`), regenerated per node.
- **Intake form** — modal gate (see §12 Forms) collected before chat opens.

### Behaviour Rules

- Free‑text is normalised → keyword‑scored against the 16‑node tree → best node or graceful fallback (always offering "speak to a representative").
- Perceived‑thoughtfulness delay: `1500–2500ms` with rotating domain phrases.
- Escape closes; input auto‑focuses `320ms` after open; input disabled while "thinking"; send disabled unless there's trimmed text.
- Any external CTA can open it by dispatching a `rge:open-intake` window event.

---

## 14. Light / Dark Theming

The gem detail page ships a per‑page reading‑mode toggle. **Light mode is implemented by redefining the `--rg-*` tokens on a single class** — the entire subtree recolours through the cascade, no duplicate stylesheets.

```css
/* Dark is the default (:root tokens). Light overrides them locally: */
.gem-detail--light {
  --rg-bg: #f4f1ed;
  --rg-cream: /* darkened */;
  --rg-text-body: /* darkened */;
  --rg-border: /* darkened */;
  /* …plus targeted overrides for components with hardcoded dark surfaces */
}
```

A fixed pill toggle (top‑right, `backdrop-filter` blur) swaps sun/moon icons and cross‑fades over `220ms`. **Takeaway:** design new components against tokens, and they inherit theming for free.

---

## 15. Responsive Breakpoints

No framework grid — bespoke media queries at these widths:

| Breakpoint | Primary effect |
|---|---|
| `≤1024px` | Header gutters/gap tighten |
| `≤1000px` | Catalog grid → 2 columns |
| `≤960px` | Gem hero → single column |
| `≤900px` | Team layout → single column |
| `≤860px` | Specs / includes / compare / similar → single column; admin sidebar → top bar |
| `≤768px` | Gutter → 24px; heading → 30px; nav → hamburger drawer; standards → 2‑col |
| `≤520px` | Catalog grid → 1 column |
| `≤480px` | Gutter → 16px; heading → 26px; standards → 1‑col; chat gap → 20px |
| `≤360px` | Smallest hero step |

Mobile‑down adjustments always reduce type size, tracking, and padding in step — never just reflow.

---

## 16. Accessibility Standards

Baseline every new surface must meet:

- **Reduced motion** — ship a `prefers-reduced-motion` fallback that disables transforms/transitions.
- **Semantics** — `role="dialog"` + `aria-modal` on modals; `aria-live` on the chat log; `aria-expanded`/`aria-controls` on accordions & menus; `aria-current` on active nav.
- **Keyboard** — Escape closes overlays; focus is moved into and out of modals; visible focus rings use `2px solid var(--rg-gold-light)` with `3px` offset.
- **Labels** — every icon button has an `aria-label`; decorative SVGs are `aria-hidden`.
- **Contrast** — text tiers are tuned against near‑black; the brightest tiers (`--rg-cream`, `--rg-text`) carry primary reading copy.

---

## 17. Copy‑Paste Token Sheet

Drop this into a new project's global stylesheet to inherit the entire system.

```css
:root {
  /* Brand / accent */
  --rg-gold: #d8a07a;
  --rg-gold-light: #f6b99a;
  --rg-gold-deep: #4c2711;

  /* Text ladder */
  --rg-cream: #f2eee9;
  --rg-text: #e4e2e1;
  --rg-text-body: #d6d3d1;
  --rg-text-muted: #a8a29e;
  --rg-text-dim: #8f8a85;
  --rg-nav: #d6c3ba;

  /* Surfaces */
  --rg-bg: #080808;
  --rg-surface: rgba(255, 255, 255, 0.02);
  --rg-surface-2: rgba(246, 185, 154, 0.04);

  /* Lines */
  --rg-border: rgba(246, 185, 154, 0.1);
  --rg-border-strong: rgba(246, 185, 154, 0.2);
  --rg-hairline: rgba(255, 255, 255, 0.06);

  /* Type */
  --rg-font-serif: 'Cinzel', serif;
  --rg-font-body: 'Montserrat', sans-serif;
  --rg-font-ui: 'Plus Jakarta Sans', sans-serif;

  /* Layout */
  --rg-maxw: 1280px;
  --rg-gutter: 64px;

  /* Motion */
  --rg-ease: cubic-bezier(0.16, 1, 0.3, 1);
}

/* Fonts (single request) */
/* Cinzel 400–700 · Great Vibes · Montserrat 300–600 · Plus Jakarta Sans 300–600 */

@media (max-width: 768px) { :root { --rg-gutter: 24px; } }
@media (max-width: 480px) { :root { --rg-gutter: 16px; } }
```

---

*Companion document: `CASE-STUDY.md`. This specification reflects the production build of Rare Gem Exchange; all values are extracted from its source.*
