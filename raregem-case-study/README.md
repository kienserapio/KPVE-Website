# Rare Gem Exchange — Case Study Page (portable drop-in)

A self-contained React page documenting the RGE design + build. Packaged to
drop into **any** React site with zero external dependencies beyond React
itself — no router, no UI kit, no shared stylesheet.

## What's in this folder

```
raregem-case-study/
├── component/
│   ├── CaseStudyPage.jsx     ← the page (default export)
│   ├── CaseStudyPage.css     ← self-contained: design tokens + animation baked in
│   └── Reveal.jsx            ← scroll-reveal helper (used by the page)
├── public/                   ← static assets — copy contents to your site's web root
│   ├── background.jpeg
│   └── case-study/           ← 11 screenshots (.jpg)
└── docs/                     ← source write-ups (reference only, not imported)
    ├── CASE-STUDY.md
    └── DESIGN-SYSTEM.md
```

> **Note — it's JSX, not TypeScript.** The source project is React + JSX. It
> runs as-is in any JS or TS React project. To use `.tsx`, rename the two
> `.jsx` files to `.tsx`; there are no type annotations to fix.

## Requirements

- React 18+ (any bundler: Vite, CRA, Next.js, Remix, Astro-with-React …)
- The four Google Fonts the design uses (see step 3)

## Drop-in, 4 steps

### 1. Copy the component files

Copy the three files in `component/` into your project, keeping them together
(the imports are relative — `./Reveal` and `./CaseStudyPage.css`):

```
your-app/src/case-study/
├── CaseStudyPage.jsx
├── CaseStudyPage.css
└── Reveal.jsx
```

### 2. Copy the static assets to your web root

Copy **the contents of** `public/` into your site's public/static root so the
files resolve at these URLs:

```
/background.jpeg
/case-study/hero.jpg
/case-study/concierge.jpg
/case-study/gem-light.jpg
/case-study/gem-dark.jpg
/case-study/collection.jpg
/case-study/admin.jpg
/case-study/endorsements.jpg
/case-study/mobile.jpg
/case-study/compare.jpg   ← spare (not shown by default)
/case-study/specs.jpg     ← spare (not shown by default)
/case-study/team.jpg      ← spare (not shown by default)
```

- Vite / CRA: drop them in `public/`.
- Next.js: drop them in `public/`.
- Paths are **root-absolute** (`/case-study/…`). If your site is served from a
  sub-path instead of the domain root, prefix the image `src`s in the JSX and
  the one `url('/background.jpeg')` in the CSS with your base path.

### 3. Load the fonts

Add this once to your site's `<head>` (Cinzel, Montserrat, Plus Jakarta Sans,
Great Vibes):

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Great+Vibes&family=Montserrat:wght@300;400;500;600&family=Plus+Jakarta+Sans:wght@300;400;500;600&display=swap"
  rel="stylesheet"
/>
```

Fonts degrade to system serif/sans if omitted — the page still works, it just
loses the intended type.

### 4. Render it

```jsx
import CaseStudyPage from './case-study/CaseStudyPage'

export default function App() {
  return <CaseStudyPage />
}
```

Or on a route:

```jsx
<Route path="/case-study" element={<CaseStudyPage />} />
```

**Next.js App Router:** the page uses `useEffect`/`useState`, so add
`'use client'` at the very top of `CaseStudyPage.jsx` and `Reveal.jsx`.

## Editing the footer links

Two buttons at the bottom are controlled by constants at the top of
`CaseStudyPage.jsx` — change them for your own site:

```js
const LIVE_PRODUCT_URL = 'https://raregemexchange.com'  // "View the live product"
const SECONDARY_URL = 'https://kpve-website.vercel.app' // "Explore KPVE"
```

## Why it's portable (design notes)

- **No router.** The original used `react-router`'s `<Link>`; replaced with a
  plain `<a>` so the page needs nothing but React.
- **No global CSS leak.** Design tokens and the `.reveal` animation are scoped
  under `.csp` inside `CaseStudyPage.css` — they can't touch or clash with your
  host site's `:root` variables or classes.
- **All styling is namespaced** under the `.csp` / `.csp-*` class prefix.
- **Self-contained CSS** — importing `CaseStudyPage.css` is all you need; there
  is no shared `tokens.css` dependency.
