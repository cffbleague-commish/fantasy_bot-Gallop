# CFFB Auction Analytics — UI Kit

Pixel-fidelity recreation of the core CFFB product surfaces. Built as a single `index.html` with React + Babel inline, using the CFFB design tokens.

**Screens** (click-thru in the prototype):
1. **Live Auction** — on-the-clock player, live bid board, ticker, your roster + cap
2. **Player Detail** — fair-value chart, historical bids, recruiting context
3. **Class Grades** — leaderboard of all teams in the league with letter grades
4. **My Class** — your roster, composition bar, position breakdown

## How this maps to the real product

The real app is Streamlit + custom HTML injection. This UI kit is a faithful visual recreation of what those injected blocks would look like in a designed browser frame. The component files in `../../components/` are the actual Streamlit-injection templates; this UI kit uses inlined copies of the same markup for compositional flexibility.

## What's missing

- Real team logos, player photos (placeholders used).
- Bid history charts use simplified SVG sparklines, not the real data-viz library.
- Account / settings / league-creation screens — not built (out of scope).
