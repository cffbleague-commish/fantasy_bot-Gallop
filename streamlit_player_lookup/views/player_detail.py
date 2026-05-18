"""
Player Detail View — renders the full detail panel for a selected player.

Shows: player header, KPI summary, copies table (selectable),
copy detail + transaction history, and awards section.
"""

import streamlit as st
import pandas as pd

from components import (
    render_kpi_row,
    render_conference_badge,
    render_redshirt_indicator,
    render_eligibility_bar,
    render_transaction_type_badge,
    render_award_badge,
    position_badge_url,
    _html,
    _esc,
)
from config import (
    TRANSACTION_TYPE_LABELS,
    AWARD_DISPLAY_NAMES,
)
from data.sheets import load_transaction_log, load_awards, load_franchise_lookup


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

    # Filter copies for this player
    player_copies = copies_df[copies_df["MFL_Player_ID"] == mfl_player_id].copy()
    if player_copies.empty:
        st.warning(f"No copy data found for {player_name}.")
        return

    # Build franchise lookup dicts
    fran_name_map: dict[str, str] = {}
    fran_logo_map: dict[str, str] = {}
    if not franchise_df.empty:
        fran_name_map = dict(zip(franchise_df["FranchiseID"], franchise_df["TeamName"]))
        fran_logo_map = {
            row["FranchiseID"]: row["Logo"]
            for _, row in franchise_df.iterrows()
            if row.get("Logo") and str(row["Logo"]).startswith("http")
        }

    # --- Player header ---
    _render_player_header(player_copies)

    # --- KPI row ---
    _render_kpi_summary(player_copies, fran_name_map)

    st.markdown("")

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

    # --- Copy detail placeholder (renders above the table on selection) ---
    copy_detail_slot = st.empty()

    # --- Copies table ---
    display_copies = display_copies.sort_values(
        ["Conference", "PlayerCopyID"]
    ).reset_index(drop=True)

    copy_ids = display_copies["PlayerCopyID"].tolist()

    table_rows = _build_copy_table(display_copies, fran_name_map, fran_logo_map)
    table_df = pd.DataFrame(table_rows)

    column_config = {
        "Logo": st.column_config.ImageColumn("", width="small"),
    }

    selection = st.dataframe(
        table_df,
        column_config=column_config,
        hide_index=True,
        use_container_width=True,
        on_select="rerun",
        selection_mode="single-row",
        key="copy_table",
    )

    # --- Copy detail panel (on row selection) ---
    selected = selection.selection.rows if selection and selection.selection else []
    if selected:
        sel_idx = selected[0]
        if sel_idx < len(copy_ids):
            sel_copy_id = copy_ids[sel_idx]
            with copy_detail_slot.container():
                _render_copy_detail(
                    sel_copy_id, display_copies, fran_name_map, fran_logo_map
                )

    st.markdown("---")

    # --- Awards section ---
    _render_awards_section(mfl_player_id, fran_name_map)


# ---------------------------------------------------------------------------
# Player header
# ---------------------------------------------------------------------------


def _render_player_header(player_copies: pd.DataFrame):
    """Render position badge + player name + metadata line."""
    first = player_copies.iloc[0]
    name = first.get("PlayerName", "")
    position = first.get("Position", "")
    nfl_team = first.get("NFLTeam", "")
    created = first.get("CreatedSeason", "")
    mfl_id = first.get("MFL_Player_ID", "")

    pos_badge = ""
    if position:
        badge_url = position_badge_url(position)
        if badge_url:
            pos_badge = (
                f'<img src="{badge_url}" '
                f'style="height:32px;width:32px;margin-right:12px;" />'
            )

    _html(
        f'<div style="display:flex;align-items:center;margin-bottom:4px;">'
        f"  {pos_badge}"
        f'  <span class="cffb-display-2" style="margin:0;">{_esc(name)}</span>'
        f"</div>"
        f'<div style="display:flex;gap:16px;font-size:13px;'
        f'color:var(--fg-secondary);margin-bottom:16px;'
        f'font-family:var(--font-body);">'
        f"  <span>NFL: {_esc(nfl_team) if nfl_team else 'N/A'}</span>"
        f"  <span>|</span>"
        f"  <span>Draft Class: {_esc(str(created)) if created else 'N/A'}</span>"
        f"  <span>|</span>"
        f'  <span style="font-family:var(--font-mono);font-size:12px;">'
        f"MFL: {_esc(mfl_id)}</span>"
        f"</div>"
    )


# ---------------------------------------------------------------------------
# KPI summary
# ---------------------------------------------------------------------------


def _render_kpi_summary(player_copies: pd.DataFrame, fran_name_map: dict):
    """Render KPI row summarizing all copies."""
    total = len(player_copies)
    active = int(player_copies["Active"].sum())

    rostered = 0
    free_agent = 0
    for _, c in player_copies.iterrows():
        fid = str(c.get("CurrentFranchiseID", ""))
        if fid and fid not in ("", "0", "nan") and fid in fran_name_map:
            rostered += 1
        else:
            free_agent += 1

    total_awards = (
        int(player_copies["NationalAwards"].fillna(0).sum())
        + int(player_copies["AllConferenceAwards"].fillna(0).sum())
    )

    render_kpi_row(
        [
            {"label": "Total Copies", "value": str(total)},
            {"label": "Active", "value": str(active), "hero": True},
            {"label": "Rostered", "value": str(rostered)},
            {"label": "Free Agent", "value": str(free_agent)},
            {"label": "Awards", "value": str(total_awards)},
        ]
    )


# ---------------------------------------------------------------------------
# Copies table builder
# ---------------------------------------------------------------------------


def _build_copy_table(
    copies: pd.DataFrame,
    fran_name_map: dict,
    fran_logo_map: dict,
) -> list[dict]:
    """Build display rows for the copies table."""
    rows = []
    for _, c in copies.iterrows():
        fid = str(c.get("CurrentFranchiseID", ""))
        owner = fran_name_map.get(fid, "Free Agent") if fid not in ("", "0", "nan") else "Free Agent"
        logo = fran_logo_map.get(fid, "")

        elig = c.get("EligibilityYearsUsed")
        elig_str = f"{int(elig)}/4" if pd.notna(elig) else "--"

        trad_rs = "--"
        if c.get("TraditionalRedshirtUsed"):
            trad_yr = c.get("TraditionalRedshirtYear")
            trad_rs = str(int(trad_yr)) if pd.notna(trad_yr) else "Yes"

        med_rs = "--"
        if c.get("MedicalRedshirtUsed"):
            med_yr = c.get("MedicalRedshirtYear")
            med_rs = str(int(med_yr)) if pd.notna(med_yr) else "Yes"

        status = "Active" if c.get("Active") else "Inactive"

        nat_awards = int(c.get("NationalAwards") or 0)
        conf_awards = int(c.get("AllConferenceAwards") or 0)
        total_awards = nat_awards + conf_awards

        retention = c.get("RetentionDecision", "")
        retention = retention if retention and retention != "nan" else "--"

        rows.append(
            {
                "Conference": c.get("Conference", ""),
                "Logo": logo,
                "Owner": owner,
                "Status": status,
                "Elig": elig_str,
                "Trad RS": trad_rs,
                "Med RS": med_rs,
                "Awards": total_awards,
                "Retention": retention,
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Copy detail panel
# ---------------------------------------------------------------------------


def _render_copy_detail(
    copy_id: str,
    copies_df: pd.DataFrame,
    fran_name_map: dict,
    fran_logo_map: dict,
):
    """Render detailed info for a selected copy + its transaction history."""
    copy_row = copies_df[copies_df["PlayerCopyID"] == copy_id]
    if copy_row.empty:
        return
    c = copy_row.iloc[0]

    col_left, col_right = st.columns([45, 55], gap="medium")

    with col_left:
        conf = c.get("Conference", "")
        _html(
            f'<div class="cffb-display-3" style="margin-bottom:12px;">'
            f"Copy Detail: {render_conference_badge(conf)}</div>"
        )

        # Owner
        fid = str(c.get("CurrentFranchiseID", ""))
        owner = fran_name_map.get(fid, "Free Agent") if fid not in ("", "0", "nan") else "Free Agent"
        logo = fran_logo_map.get(fid, "")
        owner_html = _esc(owner)
        if logo:
            owner_html = (
                f'<img src="{logo}" '
                f'style="height:20px;width:20px;border-radius:50%;'
                f'vertical-align:middle;margin-right:6px;" />'
                f"{owner_html}"
            )
        _html(
            f'<div style="font-family:var(--font-body);font-size:14px;'
            f'margin-bottom:12px;">'
            f'<span style="color:var(--fg-secondary);font-size:11px;'
            f'text-transform:uppercase;letter-spacing:0.08em;font-weight:600;'
            f'display:block;margin-bottom:2px;">Owner</span>'
            f"{owner_html}</div>"
        )

        # Redshirt indicator
        _html(render_redshirt_indicator(
            c.get("TraditionalRedshirtUsed", False),
            c.get("MedicalRedshirtUsed", False),
            c.get("TraditionalRedshirtYear"),
            c.get("MedicalRedshirtYear"),
        ))

        # Eligibility bar
        elig_used = int(c.get("EligibilityYearsUsed") or 0)
        _html(render_eligibility_bar(elig_used))

        # Retention info
        retention = c.get("RetentionDecision", "")
        retention = retention if retention and retention != "nan" else "N/A"
        ret_path = c.get("RetentionPath", "")
        ret_path = ret_path if ret_path and ret_path != "nan" else "N/A"
        ret_count = c.get("RetentionCount")
        ret_count_str = str(int(ret_count)) if pd.notna(ret_count) else "N/A"
        ret_date = c.get("RetentionDecisionDate", "")
        ret_date = ret_date if ret_date and ret_date != "nan" else ""

        _html(
            f'<div style="margin-top:12px;font-family:var(--font-body);font-size:13px;">'
            f'<span style="color:var(--fg-secondary);font-size:11px;'
            f'text-transform:uppercase;letter-spacing:0.08em;font-weight:600;'
            f'display:block;margin-bottom:6px;">Retention</span>'
            f'<div style="color:var(--fg-primary);margin-bottom:3px;">'
            f"Decision: {_esc(retention)}"
            f"{f' ({_esc(ret_date)})' if ret_date else ''}</div>"
            f'<div style="color:var(--fg-primary);margin-bottom:3px;">'
            f"Path: {_esc(ret_path)}</div>"
            f'<div style="color:var(--fg-primary);">'
            f"Count: {_esc(ret_count_str)}</div>"
            f"</div>"
        )

        # Early declaration
        if c.get("DeclaredEarly"):
            dec_year = c.get("DeclarationYear")
            dec_str = str(int(dec_year)) if pd.notna(dec_year) else "N/A"
            _html(
                f'<div style="margin-top:12px;font-family:var(--font-body);'
                f'font-size:13px;color:var(--fg-primary);">'
                f'<span style="color:var(--fg-secondary);font-size:11px;'
                f'text-transform:uppercase;letter-spacing:0.08em;font-weight:600;'
                f'display:block;margin-bottom:2px;">Early Declaration</span>'
                f"Year: {_esc(dec_str)}</div>"
            )

    with col_right:
        _html(
            '<div class="cffb-display-3" style="margin-bottom:12px;">'
            "Transaction History</div>"
        )
        _render_copy_transactions(
            c.get("MFL_Player_ID", ""),
            c.get("Conference", ""),
            copy_id,
            fran_logo_map,
        )


# ---------------------------------------------------------------------------
# Transaction history for a copy
# ---------------------------------------------------------------------------


def _render_copy_transactions(
    mfl_player_id: str,
    conference: str,
    copy_id: str,
    fran_logo_map: dict,
):
    """Render transaction history for a specific player copy."""
    txn_df = load_transaction_log()
    if txn_df.empty:
        st.caption("No transaction data available.")
        return

    # Filter by player ID and specific copy
    copy_txns = txn_df[
        (txn_df["PlayerID"] == mfl_player_id)
        & (txn_df["CopyAssigned"] == copy_id)
    ].copy()

    if copy_txns.empty:
        st.caption("No transactions found for this copy.")
        return

    # Sort newest first
    copy_txns = copy_txns.sort_values("Timestamp", ascending=False)

    # Build display table
    display = copy_txns[
        ["Timestamp", "Type", "Action", "FranchiseID", "BidAmount"]
    ].copy()
    display["Logo"] = display["FranchiseID"].map(fran_logo_map).fillna("")
    display["Type"] = display["Type"].map(TRANSACTION_TYPE_LABELS).fillna(display["Type"])
    display["BidAmount"] = display["BidAmount"].apply(
        lambda x: f"${x:.0f}" if pd.notna(x) and x > 0 else ""
    )
    display.drop(columns=["FranchiseID"], inplace=True)
    display.rename(
        columns={
            "Type": "Transaction",
            "BidAmount": "Amount",
        },
        inplace=True,
    )
    # Reorder so Logo comes before Action
    display = display[["Timestamp", "Transaction", "Logo", "Action", "Amount"]]

    st.dataframe(
        display,
        column_config={
            "Logo": st.column_config.ImageColumn("Team", width="small"),
        },
        hide_index=True,
        use_container_width=True,
        height=min(len(display) * 35 + 38, 400),
    )


# ---------------------------------------------------------------------------
# Awards section
# ---------------------------------------------------------------------------


def _render_awards_section(mfl_player_id: str, fran_name_map: dict):
    """Render awards across all copies for this player."""
    awards_df = load_awards()
    if awards_df.empty:
        return

    player_awards = awards_df[awards_df["MFL_Player_ID"] == mfl_player_id].copy()
    if player_awards.empty:
        return

    _html(
        '<div class="cffb-display-3" style="margin-bottom:12px;">Awards</div>'
    )

    # Split into national and all-conference
    national = player_awards[
        ~player_awards["AwardType"].str.startswith("AllConf_", na=False)
    ].copy()
    all_conf = player_awards[
        player_awards["AwardType"].str.startswith("AllConf_", na=False)
    ].copy()

    if not national.empty:
        st.markdown("**National Awards**")
        nat_display = national[
            ["Year", "AwardType", "Conference", "Rank", "AwardScore", "StarterPoints"]
        ].copy()
        nat_display["AwardType"] = nat_display["AwardType"].map(
            AWARD_DISPLAY_NAMES
        ).fillna(nat_display["AwardType"])
        # Resolve franchise name
        if "FranchiseID" in national.columns:
            nat_display["Team"] = national["FranchiseID"].map(fran_name_map).fillna("--")
        nat_display.rename(
            columns={
                "AwardType": "Award",
                "AwardScore": "Score",
                "StarterPoints": "Points",
                "Conference": "Conf",
            },
            inplace=True,
        )
        st.dataframe(nat_display, hide_index=True, use_container_width=True)

    if not all_conf.empty:
        st.markdown("**All-Conference Awards**")
        ac_display = all_conf[
            ["Year", "AwardType", "Conference", "Rank", "AwardScore", "StarterPoints"]
        ].copy()
        ac_display["AwardType"] = ac_display["AwardType"].apply(_format_allconf_award)
        if "FranchiseID" in all_conf.columns:
            ac_display["Team"] = all_conf["FranchiseID"].map(fran_name_map).fillna("--")
        ac_display.rename(
            columns={
                "AwardType": "Award",
                "AwardScore": "Score",
                "StarterPoints": "Points",
                "Conference": "Conf",
            },
            inplace=True,
        )
        st.dataframe(ac_display, hide_index=True, use_container_width=True)


def _format_allconf_award(award_type: str) -> str:
    """Parse 'AllConf_SEC,1st' into '1st Team All-SEC'."""
    if not award_type.startswith("AllConf_"):
        return award_type
    remainder = award_type.replace("AllConf_", "")
    parts = remainder.split(",")
    conf = parts[0] if parts else ""
    team = parts[1].strip() if len(parts) > 1 else ""
    return f"{team} Team All-{conf}"
