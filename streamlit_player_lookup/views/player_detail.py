"""
Player Detail View — renders the full detail panel for a selected player.

Visual language mirrors the Player Ledger design system:
- Hero profile (portrait + name + stats rail)
- Copies meter (segmented status bar)
- Conference-grouped expandable copy rows
- Vertical transaction timeline inside each copy
- Awards section with section labels
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
    render_copy_row_label_md,
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
    fran_conf_map: dict[str, str] = {}
    if not franchise_df.empty:
        fran_name_map = dict(zip(franchise_df["FranchiseID"], franchise_df["TeamName"]))
        fran_logo_map = {
            row["FranchiseID"]: row["Logo"]
            for _, row in franchise_df.iterrows()
            if row.get("Logo") and str(row["Logo"]).startswith("http")
        }
        fran_conf_map = dict(zip(franchise_df["FranchiseID"], franchise_df["Conference"]))

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

    # --- Conference-grouped copies ---
    _render_conference_groups(display_copies, fran_name_map, fran_logo_map)

    st.markdown("---")

    # --- Awards section ---
    _render_awards_section(mfl_player_id, fran_logo_map)


# ---------------------------------------------------------------------------
# Status classification (drives the copies meter + status chips)
# ---------------------------------------------------------------------------


def _classify_copy_status(copy: pd.Series, fran_name_map: dict) -> str:
    """Bucket a copy into rostered / redshirting / graduated / declared / fa."""
    fid = str(copy.get("CurrentFranchiseID", ""))
    has_owner = fid and fid not in ("", "0", "nan") and fid in fran_name_map
    active = bool(copy.get("Active"))

    if not has_owner:
        return "fa"

    # Graduated: inactive + eligibility exhausted (or explicit retention decision)
    elig_used = copy.get("EligibilityYearsUsed")
    retention = str(copy.get("RetentionDecision", "")).strip().lower()
    if not active and (
        (pd.notna(elig_used) and int(elig_used) >= 4)
        or retention in ("graduate", "graduated")
    ):
        return "graduated"

    # Declared early
    if copy.get("DeclaredEarly"):
        return "declared"

    # Currently redshirting — use most recent RS year matching the current
    # league year as a heuristic. If RS years aren't trackable, treat any
    # RS-used + active copy as rostered (RS will surface in the timeline).
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

    # Build stats for the rail — same data as the original KPI row.
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

    # Pick the dominant conference's accent color as the hero accent, if any
    # one conference holds rostered copies. Otherwise fall back to gold.
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
# Conference-grouped copies
# ---------------------------------------------------------------------------


def _render_conference_groups(
    display_copies: pd.DataFrame,
    fran_name_map: dict,
    fran_logo_map: dict,
):
    """Render each conference as its own group with expandable copy rows."""
    # Sort conferences in the canonical order, then anything else alphabetically.
    present_confs = list(display_copies["Conference"].unique())
    ordered = [c for c in CONFERENCES if c in present_confs]
    ordered += sorted(c for c in present_confs if c not in ordered)

    for conf in ordered:
        conf_copies = display_copies[display_copies["Conference"] == conf].copy()
        if conf_copies.empty:
            continue
        conf_copies = conf_copies.sort_values("PlayerCopyID").reset_index(drop=True)

        # Roll-up counts for this conference's header chips
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

        # Open the conference group wrapper (sets --accent on descendants).
        _html(
            f'<div class="pl-confgroup" style="--accent:{accent_color};">'
            f'{render_conference_group_header(conf, total, active, retired, fa, accent_color)}'
            f'<div class="pl-confgroup__body">'
        )

        for _, c in conf_copies.iterrows():
            _render_copy_expander(c, fran_name_map, fran_logo_map)

        _html("</div></div>")


def _render_copy_expander(
    copy: pd.Series,
    fran_name_map: dict,
    fran_logo_map: dict,
):
    """Render one copy as a Streamlit expander row with timeline inside."""
    status = _classify_copy_status(copy, fran_name_map)
    fid = str(copy.get("CurrentFranchiseID", ""))
    owner_name = (
        fran_name_map.get(fid, "")
        if fid and fid not in ("", "0", "nan")
        else ""
    )

    # Eligibility short form e.g. "FR 1/4"
    elig_used = copy.get("EligibilityYearsUsed")
    elig_short = ""
    if pd.notna(elig_used):
        elig_short = f"{int(elig_used)}/4 yrs"

    # Honors (national + all-conference) for this specific copy.
    nat = int(copy.get("NationalAwards") or 0)
    conf_aw = int(copy.get("AllConferenceAwards") or 0)
    honors = nat + conf_aw

    # Parse copy index out of the PlayerCopyID for the label
    copy_id = str(copy.get("PlayerCopyID", ""))
    copy_n = _extract_copy_number(copy_id)

    label = render_copy_row_label_md(
        copy_n=copy_n,
        status=status,
        owner=owner_name or "Free agent",
        elig_short=elig_short,
        price=None,  # Acquired price needs transaction lookup; omit from label
        since_year=None,
        honors=honors,
    )

    with st.expander(label, expanded=False):
        _render_copy_detail_inner(copy, status, fran_name_map, fran_logo_map)


def _extract_copy_number(copy_id: str) -> int:
    """Extract a small integer copy number from the PlayerCopyID for display.

    PlayerCopyIDs vary in format; we try to find the last numeric segment.
    """
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


# ---------------------------------------------------------------------------
# Copy detail (inside each expander)
# ---------------------------------------------------------------------------


def _render_copy_detail_inner(
    copy: pd.Series,
    status: str,
    fran_name_map: dict,
    fran_logo_map: dict,
):
    """Render the copy detail block + vertical transaction timeline."""
    fid = str(copy.get("CurrentFranchiseID", ""))
    owner_name = (
        fran_name_map.get(fid, "")
        if fid and fid not in ("", "0", "nan")
        else ""
    )
    owner_logo = fran_logo_map.get(fid, "") if fid and fid not in ("", "0", "nan") else ""
    copy_n = _extract_copy_number(str(copy.get("PlayerCopyID", "")))

    # --- Header row: copy #, status, owner ---
    status_chip = render_status_chip(status)
    owner_html = render_pl_owner(owner_name, "", owner_logo, stacked=False, size="md")

    # --- Facts grid ---
    facts = []

    elig_used = copy.get("EligibilityYearsUsed")
    elig_val = f"{int(elig_used)}/4 yrs" if pd.notna(elig_used) else "—"
    facts.append({"label": "Eligibility", "value": elig_val})

    trad_yr = copy.get("TraditionalRedshirtYear")
    med_yr = copy.get("MedicalRedshirtYear")
    rs_tags = []
    if copy.get("TraditionalRedshirtUsed"):
        yr = f" {int(trad_yr)}" if pd.notna(trad_yr) else ""
        rs_tags.append(render_pl_tag(f"RS{yr}", "rs"))
    if copy.get("MedicalRedshirtUsed"):
        yr = f" {int(med_yr)}" if pd.notna(med_yr) else ""
        rs_tags.append(render_pl_tag(f"MED RS{yr}", "rs-med"))
    rs_val_html = " ".join(rs_tags) if rs_tags else '<span style="color:var(--fg-tertiary);">None</span>'

    if copy.get("DeclaredEarly"):
        dec_year = copy.get("DeclarationYear")
        dec_str = f" {int(dec_year)}" if pd.notna(dec_year) else ""
        rs_val_html += " " + render_pl_tag(f"DECLARED{dec_str}", "declared")

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

    facts.extend(
        [
            {"label": "Redshirt", "value_html": rs_val_html},
            {"label": "Retention", "value": ret_val},
            {"label": "Path", "value": ret_path_val},
            {"label": "Count", "value": ret_count_val},
            {"label": "Honors", "value": honors_val},
        ]
    )

    facts_html = "".join(
        (
            f'<div class="pl-fact">'
            f'  <span class="pl-fact__label">{_esc(f["label"])}</span>'
            f'  <span class="pl-fact__val">{f.get("value_html") or _esc(f.get("value", "—"))}</span>'
            f'</div>'
        )
        for f in facts
    )

    _html(
        f'<div class="pl-copy-detail">'
        f'  <div class="pl-copy-detail__head">'
        f'    <span class="pl-copy-detail__copy">Copy {copy_n}</span>'
        f'    {status_chip}'
        f'    <span class="pl-copy-detail__owner">{owner_html}</span>'
        f'    {render_honors_star(honors_total)}'
        f'  </div>'
        f'  <div class="pl-copy-detail__facts">{facts_html}</div>'
        f'</div>'
    )

    # --- Vertical transaction timeline ---
    _render_copy_timeline(
        mfl_player_id=str(copy.get("MFL_Player_ID", "")),
        copy_id=str(copy.get("PlayerCopyID", "")),
        fran_name_map=fran_name_map,
        fran_logo_map=fran_logo_map,
    )


# ---------------------------------------------------------------------------
# Transaction timeline (vertical) for a copy
# ---------------------------------------------------------------------------


_TXN_VARIANT_MAP = {
    "AUCTION_WON": "won",
    "FREE_AGENT": "fa",
    "IR": "drop",
    "TAXI": "rs",
}


def _render_copy_timeline(
    mfl_player_id: str,
    copy_id: str,
    fran_name_map: dict,
    fran_logo_map: dict,
):
    """Pull TransactionLog rows for this copy and render the vertical timeline."""
    txn_df = load_transaction_log()
    if txn_df.empty:
        _html(render_transaction_timeline([]))
        return

    copy_txns = txn_df[
        (txn_df["PlayerID"] == mfl_player_id)
        & (txn_df["CopyAssigned"] == copy_id)
    ].copy()
    if copy_txns.empty:
        _html(render_transaction_timeline([]))
        return

    # Sort chronological (oldest → newest) for top-to-bottom timeline
    copy_txns["_sort_ts"] = pd.to_datetime(copy_txns["Timestamp"], errors="coerce")
    copy_txns = copy_txns.sort_values("_sort_ts", ascending=True).drop(columns=["_sort_ts"])

    events: list[dict] = []
    for _, t in copy_txns.iterrows():
        txn_type = str(t.get("Type", "") or "")
        variant = _TXN_VARIANT_MAP.get(txn_type, "won")

        # Year — fall back to first 4 chars of timestamp if Year col is blank.
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

        # Detail: money tag + transaction-type tag.
        bid = t.get("BidAmount")
        bid_html = ""
        if pd.notna(bid) and float(bid) > 0:
            bid_html = render_money(float(bid))

        type_label = TRANSACTION_TYPE_LABELS.get(txn_type, txn_type or "Event")
        tag_variant = {
            "AUCTION_WON": "won",
            "FREE_AGENT": "rs",  # subdued
            "IR": "drop",
            "TAXI": "rs",
        }.get(txn_type, "won")
        # Use plain label color, not "won" gold bg, for non-auction events:
        if txn_type != "AUCTION_WON":
            tag_variant = "rs" if txn_type == "TAXI" else (
                "drop" if txn_type == "IR" else "graduate"
            )
        tag_html = render_pl_tag(type_label, tag_variant)

        detail_html = f"{bid_html} {tag_html}".strip()
        action = str(t.get("Action", "") or "")
        # Only show 'action' as note if it adds real info beyond the type label
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

    _html(render_transaction_timeline(events))


# ---------------------------------------------------------------------------
# Awards section
# ---------------------------------------------------------------------------


def _render_awards_section(mfl_player_id: str, fran_logo_map: dict):
    """Render awards across all copies for this player."""
    awards_df = load_awards()
    if awards_df.empty:
        return

    player_awards = awards_df[awards_df["MFL_Player_ID"] == mfl_player_id].copy()
    if player_awards.empty:
        return

    _html(render_section_label("Awards"))

    award_col_config = {
        "Team": st.column_config.ImageColumn("Team", width="small"),
        "Score": st.column_config.NumberColumn("Score", format="%.2f"),
        "Points": st.column_config.NumberColumn("Points", format="%.2f"),
    }

    national = player_awards[
        ~player_awards["AwardType"].str.startswith("AllConf_", na=False)
    ].copy()
    all_conf = player_awards[
        player_awards["AwardType"].str.startswith("AllConf_", na=False)
    ].copy()

    national = national[national["Rank"] == 1]

    if not national.empty:
        _html(render_section_label("National Awards"))
        nat_display = national[
            ["Year", "AwardType", "Conference", "AwardScore", "StarterPoints"]
        ].copy()
        nat_display["AwardType"] = nat_display["AwardType"].map(
            AWARD_DISPLAY_NAMES
        ).fillna(nat_display["AwardType"])
        if "FranchiseID" in national.columns:
            nat_display["Team"] = national["FranchiseID"].map(fran_logo_map).fillna("")
        nat_display.rename(
            columns={
                "AwardType": "Award",
                "AwardScore": "Score",
                "StarterPoints": "Points",
                "Conference": "Conf",
            },
            inplace=True,
        )
        st.dataframe(
            nat_display,
            column_config=award_col_config,
            hide_index=True,
            use_container_width=True,
        )

    if not all_conf.empty:
        _html(render_section_label("All-Conference Awards"))
        ac_display = all_conf[
            ["Year", "AwardType", "Conference", "Rank", "AwardScore", "StarterPoints"]
        ].copy()
        ac_display["AwardType"] = ac_display["AwardType"].apply(_format_allconf_award)
        if "FranchiseID" in all_conf.columns:
            ac_display["Team"] = all_conf["FranchiseID"].map(fran_logo_map).fillna("")
        ac_display.rename(
            columns={
                "AwardType": "Award",
                "AwardScore": "Score",
                "StarterPoints": "Points",
                "Conference": "Conf",
            },
            inplace=True,
        )
        st.dataframe(
            ac_display,
            column_config=award_col_config,
            hide_index=True,
            use_container_width=True,
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
