# Brand assets

| File | Use |
|---|---|
| **`league-banner.png`** | **Canonical league banner.** Trophy + COLLEGE FANTASY FOOTBALL wordmark + EST. 2021, on torn black-and-gold paper. Source-of-truth artwork — use whenever a full-bleed banner is needed (page header, league home, deck title slides). |
| `cffb-logo.svg` | Compact horizontal logo (mark + CFFB wordmark). For top-bars and contexts too small for the full banner. **Generated placeholder** — replace if there's an official compact mark. |
| `cffb-mark.svg` | Shield + laces mark only. Favicon, app icon. **Generated placeholder.** |
| `cffb-wordmark.svg` | "CFFB" wordmark with tagline. **Generated placeholder.** |

## On the canonical banner

The `league-banner.png` is the **real visual identity** for the league. It establishes:

- **Trophy as hero.** Championship-cup silhouette in burnished gold/silver. This is the league's primary visual symbol — more important than any abstract mark.
- **Torn-paper transition.** A vertical ripped edge separates the gold sidebar from the black main field. Reuse this motif on hero surfaces (page titles, deck dividers) — see `preview/brand-banner.html`.
- **"EST. 2021"** appears in flat gold beside the wordmark. Use sparingly — title slides, footer.
- **Type treatment.** The wordmark uses an extra-condensed, heavyweight display face with near-vertical stems. Saira Condensed 700 is the working substitute; **flag for replacement** if the licensed face is available.
- **Warm chrome.** The wordmark is filled with a warm white-to-light-grey gradient (top-lit chrome effect), not flat white. Subtle.

## Color variants

All generated marks use the championship gold gradient:
```
linear-gradient(135deg, #E8C547 0%, #C9A227 50%, #8B6F1F 100%)
```

For monochrome contexts: use flat `--gold` `#C9A227` on dark backgrounds, or `--fg-primary` `#F5F5F5` if gold is too warm.

## Clearspace

Around the banner: clear the height of the trophy's base on all sides. Don't crop. Don't recolor. Don't overlay other graphics.

## Team logos

Not bundled (licensing). Use the `TeamLogo` component (`components/TeamLogo.html`) which renders a circular chip with the team's primary color + 2–4 letter abbreviation. Real logos would be sourced from a licensed feed.

## ⚠️ Placeholders flagged

The three SVG marks (`cffb-logo.svg`, `cffb-mark.svg`, `cffb-wordmark.svg`) are generated stand-ins built to harmonize with the canonical banner. Replace with official compact-format variants if they exist.
