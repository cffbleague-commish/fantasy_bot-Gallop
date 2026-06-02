"""Iframe wrapper for the CFFB Auction Board.

Renders the per-conference live auction board (topbar pool, conference filter,
On-the-Block table, Team Funds, Completed scatter + table) from a single JSON
payload built by ``data/auction_payload.py``.
"""

import os
from typing import Any, Mapping

import streamlit.components.v1 as components


_COMPONENT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "html_components",
    "auction_board",
)

_component_func = components.declare_component(
    "cffb_auction_board",
    path=os.path.abspath(_COMPONENT_DIR),
)


def render_auction_board(
    payload: Mapping[str, Any],
    height: int = 1400,
    key: str = "cffb_auction_board",
) -> None:
    """Render the Auction Board iframe. Read-only — no return value."""
    _component_func(
        data=dict(payload),
        height=height,
        key=key,
        default=None,
    )
