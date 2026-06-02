"""Bidirectional iframe component for the CFFB Team Class Detail.

Renders the full team-class deep-dive (header band, KPI rail, composition,
and player acquisition cards) in a single iframe and returns the user's last
action: a year switch or a "back" click.
"""

import os
from typing import Any, Mapping, Optional

import streamlit.components.v1 as components


_COMPONENT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "html_components",
    "team_class_detail",
)

_component_func = components.declare_component(
    "cffb_team_class_detail",
    path=os.path.abspath(_COMPONENT_DIR),
)


def render_team_class_detail(
    data: Mapping[str, Any],
    height: int = 1200,
    key: str = "cffb_team_class_detail",
) -> Optional[dict]:
    """Render the team class detail and return the last action.

    Returns one of:
        {"action": "year",  "value": <int>, "ts": <ms>}   user clicked a year tab
        {"action": "back",  "ts": <ms>}                   user clicked "All Classes"
        None                                              no interaction yet
    """
    return _component_func(
        data=dict(data),
        height=height,
        key=key,
        default=None,
    )
