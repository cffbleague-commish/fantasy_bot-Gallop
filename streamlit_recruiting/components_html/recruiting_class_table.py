"""Bidirectional iframe component for the CFFB Recruiting Class Table.

Renders the design-system table HTML in an iframe and returns the team name
the user last clicked (or None).
"""

import os
from typing import Optional, Sequence, Mapping, Any

import streamlit.components.v1 as components


_COMPONENT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "html_components",
    "recruiting_class_table",
)

_component_func = components.declare_component(
    "cffb_recruiting_class_table",
    path=os.path.abspath(_COMPONENT_DIR),
)


def render_recruiting_class_table(
    rows: Sequence[Mapping[str, Any]],
    selected_team: Optional[str] = None,
    height: int = 820,
    key: str = "cffb_recruiting_class_table",
) -> Optional[str]:
    """Render the table and return the currently-selected team (or None).

    `rows` items use the keys: rank, team, abbr, conf, year, confRank,
    s5, s4, s3, s2, total, score, grade, logo, isTop.
    """
    return _component_func(
        rows=list(rows),
        selectedTeam=selected_team,
        height=height,
        key=key,
        default=None,
    )
