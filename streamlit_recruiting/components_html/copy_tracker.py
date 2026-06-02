"""Iframe wrapper for the CFFB Copy Tracker.

Renders the per-recruit copy ledger (search, profile, per-conference rows with
expandable bid timeline) from a single JSON payload built by
``data/auction_payload.py``. Returns the last picked PlayerID so the caller can
remember the user's selection across reruns.
"""

import os
from typing import Any, Mapping, Optional

import streamlit.components.v1 as components


_COMPONENT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "html_components",
    "copy_tracker",
)

_component_func = components.declare_component(
    "cffb_copy_tracker",
    path=os.path.abspath(_COMPONENT_DIR),
)


def render_copy_tracker(
    payload: Mapping[str, Any],
    height: int = 1100,
    key: str = "cffb_copy_tracker",
) -> Optional[dict]:
    """Render the Copy Tracker iframe.

    Returns ``{"action": "pick", "value": <player_id>, "ts": <ms>}`` when the
    user picks a recruit; ``None`` otherwise.
    """
    return _component_func(
        data=dict(payload),
        height=height,
        key=key,
        default=None,
    )
