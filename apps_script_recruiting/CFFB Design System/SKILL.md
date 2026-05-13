---
name: cffb-design
description: Use this skill to generate well-branded interfaces and assets for CFFB (College Fantasy Football League), a fantasy college football recruiting auction analytics product. Contains the design tokens, colors, typography, fonts, brand assets, Streamlit-injection-ready HTML components, and a React UI kit. Use for production code (Streamlit + custom HTML) or throwaway prototypes, mocks, decks.
user-invocable: true
---

# CFFB Design Skill

Read **`README.md`** first — it has the full content rules, visual foundations, iconography guidance, and color/type spec.

## What's here

| File / folder | Purpose |
|---|---|
| `README.md` | Brand context, voice, visual foundations, iconography |
| `colors_and_type.css` | Single import — CSS variables, font imports, element classes |
| `assets/` | League banner (canonical), generated marks, brand README |
| `components/` | Self-contained HTML+CSS blocks ready for `st.markdown(..., unsafe_allow_html=True)` |
| `preview/` | Per-token / per-component preview cards (for the Design System tab) |
| `ui_kits/auction-app/` | Interactive React recreation of the four core screens |
| `fonts/` | Font substitution notes |

## When the user invokes this skill

Ask what they want to build. Then act as an expert designer for CFFB, producing either:

- **Static HTML / slides / mocks / throwaway prototypes** — copy the assets out, write self-contained HTML, lean on the `components/` snippets and the colors_and_type.css tokens. Open the result with the appropriate viewer.
- **Production Streamlit code** — read `components/README.md` for the injection pattern. Inject `colors_and_type.css` once at app start, then use the component templates as `str.format()`-able strings. The React UI kit shows what the composed screens should look like.

## Key things to remember

1. **Two fonts: Saira Condensed (display) + Inter (body).** Saira for H1/H2/KPIs/player names, Inter for everything else. Numbers always get `font-variant-numeric: tabular-nums`.
2. **8px spacing base.** All padding and margins are multiples of 8.
3. **Use the metallic gold gradient sparingly.** Max 1–2 elements per page, for the hero value (top KPI, page rank, the one important number). Flat gold `#C9A227` is for active states, accents, less hero contexts.
4. **No emoji.** Use Lucide stroke icons + a small set of unicode symbols (`▲`, `▼`, `★`, `●`, `·`, `−`).
5. **Dark only.** True matte black canvas `#0A0A0A`. Surfaces `#141414` / `#1C1C1C`. Borders `#2A2A2A`. No light mode.
6. **Voice is broadcast color-commentary.** Confident, numerical, insider. No hedging. No handholding.
7. **The league banner (`assets/league-banner.png`) is the canonical visual identity.** Use it whenever a full-bleed brand surface is needed.
8. **No CFP trademarks.** Inspiration only. Don't use real CFP logos, wordmarks, or trademarked assets.

## If a user provides Streamlit code

Look for places where `st.markdown(..., unsafe_allow_html=True)` is being used. Replace ad-hoc HTML with the corresponding template from `components/`. Keep numerics tabular and labels uppercase.

## If a user provides a screenshot of the current product

Look at the existing density, color use, and layout grid. Match it. Don't reinvent — extend.
