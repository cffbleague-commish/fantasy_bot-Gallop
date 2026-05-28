"""Viewport detection helpers for responsive layouts."""

import streamlit as st
from streamlit_js_eval import streamlit_js_eval

_PHONE_BREAKPOINT = 480
_TABLET_BREAKPOINT = 768


def get_viewport_width() -> int:
    """Returns viewport width in pixels.

    First call evaluates window.innerWidth via JS and triggers one rerun.
    Result is cached in session_state thereafter. Defaults to 1200 (desktop)
    before the JS value arrives, so first paint matches desktop.
    """
    if "viewport_width" not in st.session_state:
        w = streamlit_js_eval(js_expressions="window.innerWidth", key="vw")
        if w:
            st.session_state.viewport_width = int(w)
        else:
            return 1200
    return st.session_state.viewport_width


def is_mobile() -> bool:
    return get_viewport_width() <= _PHONE_BREAKPOINT


def is_tablet() -> bool:
    return get_viewport_width() <= _TABLET_BREAKPOINT


def responsive_columns(desktop_spec, **kwargs):
    """st.columns wrapper that collapses widths on tablet/phone.

    Always returns the same number of column slots as desktop_spec implies,
    so callers can unpack the result the same way regardless of viewport.
    On mobile, uses equal weights so the CSS-driven stack looks even when
    the @media rule forces each slot to width: 100%.
    """
    if is_tablet():
        n = desktop_spec if isinstance(desktop_spec, int) else len(desktop_spec)
        return st.columns(n, **kwargs)
    return st.columns(desktop_spec, **kwargs)
