"""
Player Detail View — renders the full detail panel for a selected player.

Visual language mirrors the Player Ledger design system, rendered as
pure HTML (no st.expander / no st.dataframe) so it matches the auction
tool's CFFB style rather than Streamlit defaults.
"""

import streamlit as st
import pandas as pd

from components import (
    _html,
    _esc,
    render_hero_profile,
    render_copies_meter,
    render_conference_group_header,
    render_status_chip,
    render_money,
    render_pl_owner,
    render_honors_star,
    render_pl_tag,
    render_transaction_timeline,
    render_pl_row,
    render_awards_table,
    render_section_label,
)
from config import (
    TRANSACTION_TYPE_LABELS,
    AWARD_DISPLAY_NAMES,
    CONFERENCE_ACCENT_COLORS,
    CONFERENCES,
)
from data.sheets import load_transaction_log, load_awards


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def render_player_detail(
    mfl_player_id: str,
    player_name: str,
    copies_df: pd.DataFrame,
    franchise_df: pd.DataFrame,
    conference_filter: str | None = None,
):
    """Render the full player detail view."""

    player_copies = copies_df[copies_df["MFL_Player_ID"] == mfl_player_id].copy()
    if player_copies.empty:
        st.warning(f"No copy data found for {player_name}.")
        return

    fran_name_map: dict[str, str] = {}
    fran_logo_map: dict[str, str] = {}
    if not franchise_df.empty:
        fran_name_map = dict(zip(franchise_df["FranchiseID"], franchise_df["TeamName"]))
        fran_logo_map = {
            row["FranchiseID"]: row["Logo"]
            for _, row in franchise_df.iterrows()
            if row.get("Logo") and str(row["Logo"]).startswith("http")
        }

    # Pre-load transaction log ONCE, then filter per-copy at render time.
    txn_df = load_transaction_log()
    player_txns = (
        txn_df[txn_df["PlayerID"] == mfl_player_id].copy()
        if not txn_df.empty else pd.DataFrame()
    )

    # --- Hero profile ---
    _render_player_hero(player_copies, fran_name_map)

    # --- Copies meter ---
    _render_copies_meter(player_copies, fran_name_map)

    # --- Conference filter hint ---
    if conference_filter:
        st.info(
            f"Showing copies filtered to **{conference_filter}**. "
            f"Change the Conference filter above to **All** to see all 12 copies."
        )
        display_copies = player_copies[
            player_copies["Conference"] == conference_filter
        ].copy()
    else:
        display_copies = player_copies.copy()

    if display_copies.empty:
        st.info("No copies in this conference.")
        return

    # --- Ledger header ---
    _html(
        '<div class="pl-ledger" style="padding:8px 0 0;">'
        '  <div class="pl-ledger__head">'
        '    <span class="pl-ledger__title">Ledger by Conference</span>'
        '    <span class="pl-ledger__hint">Click a copy to expand its transaction history</span>'
        '  </div>'
        '</div>'
    )

    # --- Conference-grouped copies (pure HTML, no Streamlit chrome) ---
    _render_conference_groups(display_copies, player_txns, fran_name_map, fran_logo_map)

    # --- Awards section ---
    _render_awards_section(mfl_player_id, fran_logo_map)


# ---------------------------------------------------------------------------
# Status classification
# ---------------------------------------------------------------------------


def _classify_copy_status(copy: pd.Series, fran_name_map: dict) -> str:
    """Bucket a copy into rostered / redshirting / graduated / declared / fa.

    Graduation and early declaration are checked FIRST, before ownership, so
    that terminal states (player can never be acquired again) override the
    "no current owner → free agent" inference. A graduated copy typically has
    no `CurrentFranchiseID`, but should not be displayed as available FA.
    """
    elig_used = copy.get("EligibilityYearsUsed")
    retention = str(copy.get("RetentionDecision", "")).strip().lower()

    # Terminal — used up eligibility (4+ years) or explicit graduation decision.
    if (pd.notna(elig_used) and int(elig_used) >= 4) or retention in (
        "graduate", "graduated"
    ):
        return "graduated"

    # Terminal — declared for the NFL draft early, exited the college pool.
    if copy.get("DeclaredEarly"):
        return "declared"

    fid = str(copy.get("CurrentFranchiseID", ""))
    has_owner = fid and fid not in ("", "0", "nan") and fid in fran_name_map
    active = bool(copy.get("Active"))

    if not has_owner:
        return "fa"

    # Currently redshirting — RS year matches league year.
    trad_yr = copy.get("TraditionalRedshirtYear")
    med_yr = copy.get("MedicalRedshirtYear")
    try:
        from config import get_league_year
        league_year = get_league_year()
        if active and (
            (pd.notna(trad_yr) and int(trad_yr) == league_year)
            or (pd.notna(med_yr) and int(med_yr) == league_year)
        ):
            return "redshirting"
    except Exception:
        pass

    if active:
        return "rostered"
    return "fa"


# ---------------------------------------------------------------------------
# Hero profile
# ---------------------------------------------------------------------------


def _render_player_hero(player_copies: pd.DataFrame, fran_name_map: dict):
    """Render the Player Ledger hero profile block."""
    first = player_copies.iloc[0]
    name = str(first.get("PlayerName", "") or "")
    position = str(first.get("Position", "") or "")
    nfl_team = str(first.get("NFLTeam", "") or "")
    created = first.get("CreatedSeason")
    created_str = str(int(created)) if pd.notna(created) else ""

    meta_parts = []
    if nfl_team:
        meta_parts.append(f"NFL: {nfl_team}")
    if created_str:
        meta_parts.append(f"Draft Class {created_str}")
    meta = " · ".join(meta_parts)

    total = len(player_copies)
    active = int(player_copies["Active"].sum())
    rostered = sum(
        1 for _, c in player_copies.iterrows()
        if _classify_copy_status(c, fran_name_map) == "rostered"
    )
    total_awards = (
        int(player_copies["NationalAwards"].fillna(0).sum())
        + int(player_copies["AllConferenceAwards"].fillna(0).sum())
    )

    stats = [
        {"label": "Active", "value": str(active), "hero": True},
        {"label": "Rostered", "value": str(rostered)},
        {"label": "Copies", "value": str(total)},
        {"label": "Honors", "value": str(total_awards)},
    ]

    rostered_by_conf = (
        player_copies[player_copies["Active"]]
        .groupby("Conference")
        .size()
        .sort_values(ascending=False)
    )
    accent_color = "#C9A227"
    if not rostered_by_conf.empty:
        top_conf = rostered_by_conf.index[0]
        accent_color = CONFERENCE_ACCENT_COLORS.get(top_conf, "#C9A227")

    _html(
        render_hero_profile(
            name=name,
            position=position,
            college="",
            meta=meta,
            composite="",
            stats=stats,
            accent_color=accent_color,
        )
    )


# ---------------------------------------------------------------------------
# Copies meter
# ---------------------------------------------------------------------------


def _render_copies_meter(player_copies: pd.DataFrame, fran_name_map: dict):
    """Render the segmented copies meter showing status distribution."""
    counts = {"rostered": 0, "redshirting": 0, "graduated": 0, "declared": 0, "fa": 0}
    for _, c in player_copies.iterrows():
        counts[_classify_copy_status(c, fran_name_map)] += 1
    _html(render_copies_meter(counts, total=len(player_copies)))


# ---------------------------------------------------------------------------
# Conference-grouped copies (pure HTML)
# ---------------------------------------------------------------------------


def _render_conference_groups(
    display_copies: pd.DataFrame,
    player_txns: pd.DataFrame,
    fran_name_map: dict,
    fran_logo_map: dict,
):
    """Emit each conference's group + copy rows as a single HTML block."""
    present_confs = list(display_copies["Conference"].unique())
    ordered = [c for c in CONFERENCES if c in present_confs]
    ordered += sorted(c for c in present_confs if c not in ordered)

    for conf in ordered:
        conf_copies = display_copies[display_copies["Conference"] == conf].copy()
        if conf_copies.empty:
            continue
        conf_copies = conf_copies.sort_values("PlayerCopyID").reset_index(drop=True)

        total = len(conf_copies)
        active = 0
        retired = 0
        fa = 0
        for _, c in conf_copies.iterrows():
            status = _classify_copy_status(c, fran_name_map)
            if status in ("rostered", "redshirting"):
                active += 1
            elif status in ("graduated", "declared"):
                retired += 1
            else:
                fa += 1

        accent_color = CONFERENCE_ACCENT_COLORS.get(conf, "#C9A227")
        header_html = render_conference_group_header(
            conf, total, active, retired, fa, accent_color
        )

        rows_html_parts = []
        for _, c in conf_copies.iterrows():
            rows_html_parts.append(
                _build_copy_row_html(c, player_txns, fran_name_map, fran_logo_map)
            )
        rows_html = "".join(rows_html_parts)

        _html(
            f'<div class="pl-confgroup" style="--accent:{accent_color};">'
            f'{header_html}'
            f'<div class="pl-confgroup__body">{rows_html}</div>'
            f'</div>'
        )


# ---------------------------------------------------------------------------
# Per-copy row + body builders (return HTML strings)
# ---------------------------------------------------------------------------


def _build_copy_row_html(
    copy: pd.Series,
    player_txns: pd.DataFrame,
    fran_name_map: dict,
    fran_logo_map: dict,
) -> str:
    """Build a single pl-row HTML block for one copy (summary + collapsed body)."""
    status = _classify_copy_status(copy, fran_name_map)
    fid = str(copy.get("CurrentFranchiseID", ""))
    owner_name = (
        fran_name_map.get(fid, "")
        if fid and fid not in ("", "0", "nan")
        else ""
    )
    owner_logo = fran_logo_map.get(fid, "") if fid and fid not in ("", "0", "nan") else ""
    owner_html = render_pl_owner(owner_name, "", owner_logo, stacked=False, size="md")

    elig_used = copy.get("EligibilityYearsUsed")
    elig_short = f"{int(elig_used)}/4 yrs" if pd.notna(elig_used) else ""

    # Money in the summary: most recent AUCTION_WON BidAmount for this copy.
    copy_id = str(copy.get("PlayerCopyID", ""))
    money_html = _latest_auction_money_html(player_txns, copy_id)

    nat = int(copy.get("NationalAwards") or 0)
    conf_aw = int(copy.get("AllConferenceAwards") or 0)
    honors = nat + conf_aw

    body_html = _build_copy_body_html(
        copy, status, player_txns, fran_name_map, fran_logo_map
    )

    return render_pl_row(
        card_id=copy_id or f"copy-{_extract_copy_number(copy_id)}",
        copy_n=_extract_copy_number(copy_id),
        status=status,
        owner_html=owner_html,
        elig_short=elig_short,
        money_html=money_html,
        honors=honors,
        body_html=body_html,
    )


def _latest_auction_money_html(player_txns: pd.DataFrame, copy_id: str) -> str:
    """Return the most recent auction bid amount as a money pill, or ''."""
    if player_txns.empty:
        return ""
    rows = player_txns[
        (player_txns["CopyAssigned"] == copy_id)
        & (player_txns["Type"] == "AUCTION_WON")
    ]
    if rows.empty:
        return ""
    rows = rows.copy()
    rows["_sort_ts"] = pd.to_datetime(rows["Timestamp"], errors="coerce")
    rows = rows.sort_values("_sort_ts", ascending=False)
    bid = rows.iloc[0].get("BidAmount")
    if pd.isna(bid) or float(bid) <= 0:
        return ""
    return render_money(float(bid))


def _extract_copy_number(copy_id: str) -> int:
    """Extract a small integer copy number from the PlayerCopyID for display."""
    if not copy_id:
        return 0
    digits = []
    for ch in reversed(copy_id):
        if ch.isdigit():
            digits.append(ch)
        elif digits:
            break
    if not digits:
        return 0
    try:
        return int("".join(reversed(digits)))
    except ValueError:
        return 0


def _build_copy_body_html(
    copy: pd.Series,
    status: str,
    player_txns: pd.DataFrame,
    fran_name_map: dict,
    fran_logo_map: dict,
) -> str:
    """Build the inner panel HTML (facts grid + transaction timeline)."""
    fid = str(copy.get("CurrentFranchiseID", ""))
    owner_name = (
        fran_name_map.get(fid, "")
        if fid and fid not in ("", "0", "nan")
        else ""
    )
    owner_logo = fran_logo_map.get(fid, "") if fid and fid not in ("", "0", "nan") else ""
    copy_n = _extract_copy_number(str(copy.get("PlayerCopyID", "")))

    status_chip = render_status_chip(status)
    owner_block = render_pl_owner(owner_name, "", owner_logo, stacked=False, size="md")

    # Facts
    elig_used = copy.get("EligibilityYearsUsed")
    elig_val = f"{int(elig_used)}/4 yrs" if pd.notna(elig_used) else "—"

    trad_yr = copy.get("TraditionalRedshirtYear")
    med_yr = copy.get("MedicalRedshirtYear")
    rs_tags = []
    if copy.get("TraditionalRedshirtUsed"):
        yr = f" {int(trad_yr)}" if pd.notna(trad_yr) else ""
        rs_tags.append(render_pl_tag(f"RS{yr}", "rs"))
    if copy.get("MedicalRedshirtUsed"):
        yr = f" {int(med_yr)}" if pd.notna(med_yr) else ""
        rs_tags.append(render_pl_tag(f"MED RS{yr}", "rs-med"))
    if copy.get("DeclaredEarly"):
        dec_year = copy.get("DeclarationYear")
        dec_str = f" {int(dec_year)}" if pd.notna(dec_year) else ""
        rs_tags.append(render_pl_tag(f"DECLARED{dec_str}", "declared"))
    rs_val_html = " ".join(rs_tags) if rs_tags else '<span style="color:var(--fg-tertiary);">None</span>'

    retention = str(copy.get("RetentionDecision", "")).strip()
    if retention and retention.lower() != "nan":
        ret_date = str(copy.get("RetentionDecisionDate", "")).strip()
        ret_val = retention + (f" ({ret_date})" if ret_date and ret_date != "nan" else "")
    else:
        ret_val = "—"

    ret_path = str(copy.get("RetentionPath", "")).strip()
    ret_path_val = ret_path if ret_path and ret_path != "nan" else "—"

    ret_count = copy.get("RetentionCount")
    ret_count_val = str(int(ret_count)) if pd.notna(ret_count) else "—"

    nat = int(copy.get("NationalAwards") or 0)
    conf_aw = int(copy.get("AllConferenceAwards") or 0)
    honors_total = nat + conf_aw
    honors_val = (
        f"{honors_total} ({nat} national, {conf_aw} all-conf)" if honors_total else "—"
    )

    facts = [
        {"label": "Eligibility", "value_html": _esc(elig_val)},
        {"label": "Status Tags", "value_html": rs_val_html},
        {"label": "Retention", "value_html": _esc(ret_val)},
        {"label": "Path", "value_html": _esc(ret_path_val)},
        {"label": "Decision Count", "value_html": _esc(ret_count_val)},
        {"label": "Honors", "value_html": _esc(honors_val)},
    ]
    facts_html = "".join(
        (
            f'<div class="pl-fact">'
            f'  <span class="pl-fact__label">{_esc(f["label"])}</span>'
            f'  <span class="pl-fact__val">{f["value_html"]}</span>'
            f'</div>'
        )
        for f in facts
    )

    timeline_html = _build_timeline_html(
        copy_id=str(copy.get("PlayerCopyID", "")),
        player_txns=player_txns,
        fran_name_map=fran_name_map,
        fran_logo_map=fran_logo_map,
    )

    return (
        f'<div class="pl-copy-detail">'
        f'  <div class="pl-copy-detail__head">'
        f'    <span class="pl-copy-detail__copy">Copy {copy_n}</span>'
        f'    {status_chip}'
        f'    <span class="pl-copy-detail__owner">{owner_block}</span>'
        f'    {render_honors_star(honors_total)}'
        f'  </div>'
        f'  <div class="pl-copy-detail__facts">{facts_html}</div>'
        f'  {timeline_html}'
        f'</div>'
    )


# ---------------------------------------------------------------------------
# Transaction timeline builder (returns HTML)
# ---------------------------------------------------------------------------


_TXN_VARIANT_MAP = {
    "AUCTION_WON": "won",
    "FREE_AGENT": "fa",
    "IR": "drop",
    "TAXI": "rs",
}


def _build_timeline_html(
    copy_id: str,
    player_txns: pd.DataFrame,
    fran_name_map: dict,
    fran_logo_map: dict,
) -> str:
    """Filter the pre-loaded transaction log for one copy and return timeline HTML."""
    if player_txns.empty:
        return render_transaction_timeline([])

    copy_txns = player_txns[player_txns["CopyAssigned"] == copy_id].copy()
    if copy_txns.empty:
        return render_transaction_timeline([])

    copy_txns["_sort_ts"] = pd.to_datetime(copy_txns["Timestamp"], errors="coerce")
    copy_txns = copy_txns.sort_values("_sort_ts", ascending=True).drop(columns=["_sort_ts"])

    events: list[dict] = []
    for _, t in copy_txns.iterrows():
        txn_type = str(t.get("Type", "") or "")
        variant = _TXN_VARIANT_MAP.get(txn_type, "won")

        season = t.get("Year")
        if pd.notna(season):
            season_str = str(int(season))
        else:
            ts = str(t.get("Timestamp", ""))
            season_str = ts[:4] if len(ts) >= 4 else ""

        fid = str(t.get("FranchiseID", ""))
        fname = (
            fran_name_map.get(fid, t.get("FranchiseName", "") or "")
            if fid not in ("", "0", "nan")
            else ""
        )
        flogo = fran_logo_map.get(fid, "") if fid not in ("", "0", "nan") else ""
        owner_html = render_pl_owner(fname, "", flogo, stacked=False, size="md")

        bid = t.get("BidAmount")
        bid_html = ""
        if pd.notna(bid) and float(bid) > 0:
            bid_html = render_money(float(bid))

        type_label = TRANSACTION_TYPE_LABELS.get(txn_type, txn_type or "Event")
        tag_variant = {
            "AUCTION_WON": "won",
            "FREE_AGENT": "rs",
            "IR": "drop",
            "TAXI": "rs",
        }.get(txn_type, "graduate")
        tag_html = render_pl_tag(type_label, tag_variant)

        detail_html = f"{bid_html} {tag_html}".strip()
        action = str(t.get("Action", "") or "")
        note = action if action and action.lower() not in ("", "nan", type_label.lower()) else ""

        events.append(
            {
                "variant": variant,
                "season": season_str,
                "owner_html": owner_html,
                "detail_html": detail_html,
                "note": note,
            }
        )

    return render_transaction_timeline(events)


# ---------------------------------------------------------------------------
# Awards section (pure HTML, no st.dataframe)
# ---------------------------------------------------------------------------


def _render_awards_section(mfl_player_id: str, fran_logo_map: dict):
    """Render awards across all copies for this player as HTML tables."""
    awards_df = load_awards()
    if awards_df.empty:
        return

    player_awards = awards_df[awards_df["MFL_Player_ID"] == mfl_player_id].copy()
    if player_awards.empty:
        return

    _html(render_section_label("Awards"))

    national = player_awards[
        ~player_awards["AwardType"].str.startswith("AllConf_", na=False)
    ].copy()
    all_conf = player_awards[
        player_awards["AwardType"].str.startswith("AllConf_", na=False)
    ].copy()

    national = national[national["Rank"] == 1]

    if not national.empty:
        _html(render_section_label("National Awards"))
        rows = []
        for _, a in national.sort_values("Year", ascending=False).iterrows():
            award_name = AWARD_DISPLAY_NAMES.get(a["AwardType"], a["AwardType"])
            fid = str(a.get("FranchiseID", ""))
            logo = fran_logo_map.get(fid, "")
            rows.append(
                {
                    "Year": int(a["Year"]) if pd.notna(a["Year"]) else "",
                    "Award": award_name,
                    "Conf": a.get("Conference", ""),
                    "Team": logo,
                    "Score": f"{a['AwardScore']:.2f}" if pd.notna(a.get("AwardScore")) else "",
                    "Points": f"{a['StarterPoints']:.2f}" if pd.notna(a.get("StarterPoints")) else "",
                }
            )
        _html(
            render_awards_table(
                rows,
                [
                    {"key": "Year", "label": "Year", "type": "year"},
                    {"key": "Award", "label": "Award", "type": "text"},
                    {"key": "Conf", "label": "Conf", "type": "text"},
                    {"key": "Team", "label": "Team", "type": "logo"},
                    {"key": "Score", "label": "Score", "type": "num"},
                    {"key": "Points", "label": "Points", "type": "num"},
                ],
            )
        )

    if not all_conf.empty:
        _html(render_section_label("All-Conference Awards"))
        rows = []
        for _, a in all_conf.sort_values(["Year", "Rank"], ascending=[False, True]).iterrows():
            award_name = _format_allconf_award(a["AwardType"])
            fid = str(a.get("FranchiseID", ""))
            logo = fran_logo_map.get(fid, "")
            rows.append(
                {
                    "Year": int(a["Year"]) if pd.notna(a["Year"]) else "",
                    "Award": award_name,
                    "Conf": a.get("Conference", ""),
                    "Rank": str(int(a["Rank"])) if pd.notna(a.get("Rank")) else "",
                    "Team": logo,
                    "Score": f"{a['AwardScore']:.2f}" if pd.notna(a.get("AwardScore")) else "",
                    "Points": f"{a['StarterPoints']:.2f}" if pd.notna(a.get("StarterPoints")) else "",
                }
            )
        _html(
            render_awards_table(
                rows,
                [
                    {"key": "Year", "label": "Year", "type": "year"},
                    {"key": "Award", "label": "Award", "type": "text"},
                    {"key": "Conf", "label": "Conf", "type": "text"},
                    {"key": "Rank", "label": "Rank", "type": "num"},
                    {"key": "Team", "label": "Team", "type": "logo"},
                    {"key": "Score", "label": "Score", "type": "num"},
                    {"key": "Points", "label": "Points", "type": "num"},
                ],
            )
        )


def _format_allconf_award(award_type: str) -> str:
    """Parse 'AllConf_SEC,1st' into '1st Team All-SEC'."""
    if not award_type.startswith("AllConf_"):
        return award_type
    remainder = award_type.replace("AllConf_", "")
    parts = remainder.split(",")
    conf = parts[0] if parts else ""
    team = parts[1].strip() if len(parts) > 1 else ""
    return f"{team} Team All-{conf}"
