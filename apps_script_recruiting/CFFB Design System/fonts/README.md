# Fonts

This system uses **Google Fonts substitutions** for all three typefaces. No `.woff2` files are bundled — `colors_and_type.css` imports them at runtime via `fonts.googleapis.com`.

| Role | Family | Why |
|---|---|---|
| Display | **Saira Condensed** (500/600/700/800) | Broadcast-graphic condensed sans. Reads as ESPN/Fox lower-third. Closest free analog to United Sans / Knockout. |
| Body / UI | **Manrope** (400/500/600/700/800) | Modern geometric sans, neutral on dark backgrounds, friendly counters. |
| Mono | **JetBrains Mono** (400/500/700) | Tabular numerics for bids and time codes. |

## ⚠️ Substitution flagged

If CFFB has a licensed broadcast type system (e.g. a custom United Sans variant, or any of: Knockout, Druk, Industry Inc, Trade Gothic Next Condensed), **please ship the `.woff2` files** and we'll swap. The current substitutions get ~80% of the way to the right feel but are not the real brand voice.

## To swap in real fonts

1. Drop `.woff2` files in this folder.
2. Replace the `@import` at the top of `../colors_and_type.css` with `@font-face` blocks pointing to the local files.
3. Update the family names in the `--font-display` / `--font-body` / `--font-mono` variables if different.
