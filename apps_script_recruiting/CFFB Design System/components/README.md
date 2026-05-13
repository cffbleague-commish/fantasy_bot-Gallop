# CFFB Streamlit Component Library

Each file in this folder is a **self-contained HTML+CSS block** designed to be injected into a Streamlit app via `st.markdown(html, unsafe_allow_html=True)`.

## Usage pattern (Python)

```python
import streamlit as st
from pathlib import Path

CFFB_TOKENS = Path("colors_and_type.css").read_text()
st.markdown(f"<style>{CFFB_TOKENS}</style>", unsafe_allow_html=True)

# Then for each component, read a template + format with data:
def player_card(name, pos, team, bid, delta):
    tmpl = Path("components/PlayerCardCompact.html").read_text()
    st.markdown(tmpl.format(name=name, pos=pos, team=team, bid=bid, delta=delta),
                unsafe_allow_html=True)
```

Inject the **token CSS once** at app start. Each component file scopes all class names with the `cffb-` prefix so they don't collide with Streamlit's own DOM.

## Components

| Component | File | Purpose |
|---|---|---|
| **PlayerCard (compact)** | `PlayerCardCompact.html` | Row-density player card for boards and lists. |
| **PlayerCard (expanded)** | `PlayerCardExpanded.html` | Detail card with stats, projections, action row. |
| **StarRating** | `StarRating.html` | 1–5 stars, half-stars, tier-colored. |
| **TeamLogo** | `TeamLogo.html` | Circular team chip with primary-color background + abbreviation. |
| **GradeBadge** | `GradeBadge.html` | Letter grade pill. A-tier uses gold gradient. |
| **ValueDelta** | `ValueDelta.html` | Signed dollar delta with arrow. |
| **CommitCompositionBar** | `CommitCompositionBar.html` | Horizontal stacked bar broken out by star tier. |
| **RankBadge** | `RankBadge.html` | Numeric rank (#1, #12) with eyebrow context. |
| **ConferenceBadge** | `ConferenceBadge.html` | Conference name on conference accent. |
| **LiveIndicator** | `LiveIndicator.html` | Pulsing green dot inside a thin gold gradient ring, with LIVE wordmark. |
| **KpiTile** | `KpiTile.html` | Label + big value; hero variant uses gold-gradient on value. |

## Placeholders

Templates use Python `str.format()` placeholders (`{name}`, `{bid}`, etc.). Any `{` / `}` that aren't placeholders are escaped as `{{` / `}}` — keep that in mind when editing.

## Tabular numerics

Anything that displays a number carries `class="cffb-num"` (or is inside a parent that does). This enables `font-variant-numeric: tabular-nums` so dollar columns and stat lines line up across rows.

## Live indicator note

`LiveIndicator.html` uses a green dot pulsing inside a slowly-rotating gold gradient ring (the ring is a CSS `conic-gradient` masked to an annulus). The dot uses `--live` (`#2D7A4E`), and the ring uses the metallic gold gradient. Use exactly once per page — it's an attention magnet.
