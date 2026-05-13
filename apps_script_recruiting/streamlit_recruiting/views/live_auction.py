"""
Live Auction tab — real-time view of auction transactions from MFL.
Reads from the LiveAuction sheet (populated by Apps Script timed trigger).
Shows nominations, bids, and completed auctions with bid history per player.
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from data.sheets import load_live_auction, load_franchise_lookup
from models.config import POSITIONS, COLORS, CONFERENCES, COPIES_PER_CONFERENCE

# Human-readable labels for MFL transaction types
TRANS_TYPE_LABELS = {
    "AUCTION_INIT": "Nomination",
    "AUCTION_BID": "Bid",
    "AUCTION_WON": "Won",
}

TRANS_TYPE_COLORS = {
    "Nomination": "#f1c40f",
    "Bid": "#3498db",
    "Won": "#2ecc71",
}

CONFERENCE_LIST = sorted(CONFERENCES.keys())


def _label_type(raw_type: str) -> str:
    """Convert MFL transaction type to display label."""
    return TRANS_TYPE_LABELS.get(raw_type, raw_type)


def _build_logo_lookup() -> dict:
    """Build FranchiseName -> Logo URL mapping from FranchiseLookup sheet."""
    fl = load_franchise_lookup()
    if fl.empty:
        return {}
    return {
        row["TeamName"]: row["Logo"]
        for _, row in fl.iterrows()
        if row.get("Logo") and str(row["Logo"]).startswith("http")
    }


def _resolve_winning_prices(df: pd.DataFrame) -> pd.DataFrame:
    """Resolve AUCTION_WON prices from AUCTION_BID history.

    MFL stores $0 in AUCTION_WON records — the actual winning price is the
    highest AUCTION_BID for the same player+franchise (the winning team's max bid).
    """
    bids = df[df["TransactionType"] == "AUCTION_BID"]
    if bids.empty:
        return df

    # For each player+franchise combo, find the max bid amount
    max_bids = bids.groupby(["PlayerID", "FranchiseID"])["BidAmount"].max()

    def _resolve(row):
        if row["TransactionType"] != "AUCTION_WON" or row["BidAmount"] > 0:
            return row["BidAmount"]
        key = (row["PlayerID"], row["FranchiseID"])
        if key in max_bids.index:
            return max_bids[key]
        # Fallback: max bid from any franchise for this player
        player_bids = bids[bids["PlayerID"] == row["PlayerID"]]
        if not player_bids.empty:
            return player_bids["BidAmount"].max()
        return row["BidAmount"]

    df = df.copy()
    won_mask = df["TransactionType"] == "AUCTION_WON"
    df.loc[won_mask, "BidAmount"] = df.loc[won_mask].apply(_resolve, axis=1)
    return df


def _assign_copy_sessions(df: pd.DataFrame) -> pd.DataFrame:
    """Assign a CopySession number to every row based on AUCTION_INIT boundaries.

    For each player, transactions are sorted by timestamp.  Each AUCTION_INIT
    marks the start of a new copy's auction cycle.  All subsequent BID/WON rows
    belong to that session until the next INIT appears.
    """
    if df.empty:
        return df

    df = df.copy()
    df["CopySession"] = 0

    for player_id, group in df.groupby("PlayerID"):
        idx_sorted = group.sort_values("Timestamp", ascending=True).index
        counter = 0
        for i in idx_sorted:
            if df.at[i, "TransactionType"] == "AUCTION_INIT":
                counter += 1
            elif counter == 0:
                # BID or WON before any INIT — assign to session 1
                counter = 1
            df.at[i, "CopySession"] = counter

    return df


def render_live_auction_tab():
    """Render the Live Auction tab."""
    df = load_live_auction()

    if df.empty:
        st.info(
            "No live auction data available. "
            "Run **Start Live Auction Sync** from the Google Sheets Recruiting Analytics menu to begin importing."
        )
        return

    # Resolve winning prices from bid history (MFL stores $0 in AUCTION_WON)
    df = _resolve_winning_prices(df)
    df["BidAmount"] = pd.to_numeric(df["BidAmount"], errors="coerce").fillna(0)

    # Add display-friendly type label
    df["Type"] = df["TransactionType"].apply(_label_type)

    # Merge franchise logos
    logo_lookup = _build_logo_lookup()
    df["FranchiseLogo"] = df["FranchiseName"].map(logo_lookup).fillna("")

    # Assign copy session numbers to all transactions (not just WON)
    df = _assign_copy_sessions(df)

    st.markdown("### Live Auction Transactions")
    st.caption(f"{len(df)} transactions loaded. Data refreshes every 5 minutes (sheet syncs hourly).")

    # Summary metrics — split by transaction type
    won_df = df[df["TransactionType"] == "AUCTION_WON"]

    metric_cols = st.columns(6)
    metric_cols[0].metric("Total Events", len(df))
    metric_cols[1].metric("Completed", len(won_df))
    metric_cols[2].metric("Total Spent", f"${won_df['BidAmount'].sum():,.0f}" if not won_df.empty else "$0")
    metric_cols[3].metric("Avg Win", f"${won_df['BidAmount'].mean():.1f}" if not won_df.empty else "$0")
    metric_cols[4].metric("Highest Win", f"${won_df['BidAmount'].max():.0f}" if not won_df.empty else "$0")

    rookie_won = int(won_df["IsRookie"].sum()) if not won_df.empty else 0
    metric_cols[5].metric("Rookie Wins", rookie_won)

    st.markdown("---")

    # Filters
    col_f1, col_f2, col_f3, col_f4 = st.columns(4)
    type_filter = col_f1.selectbox(
        "Transaction Type",
        ["All", "Nomination", "Bid", "Won"],
        key="auction_trans_type_filter",
    )
    pos_filter = col_f2.selectbox(
        "Position", ["All"] + POSITIONS, key="auction_pos_filter"
    )
    conf_filter = col_f3.selectbox(
        "Conference", ["All"] + CONFERENCE_LIST, key="auction_conf_filter"
    )
    rookie_filter = col_f4.selectbox(
        "Player Type", ["All", "Rookies Only", "Veterans Only"], key="auction_rookie_filter"
    )

    filtered = df.copy()
    if type_filter != "All":
        filtered = filtered[filtered["Type"] == type_filter]
    if pos_filter != "All":
        filtered = filtered[filtered["Position"] == pos_filter]
    if conf_filter != "All":
        filtered = filtered[filtered["Conference"] == conf_filter]
    if rookie_filter == "Rookies Only":
        filtered = filtered[filtered["IsRookie"]]
    elif rookie_filter == "Veterans Only":
        filtered = filtered[~filtered["IsRookie"]]

    if filtered.empty:
        st.info("No transactions match the current filters.")
        return

    # Auction timeline
    st.markdown("#### Auction Timeline")
    _render_auction_timeline(filtered)

    st.markdown("---")

    # Recent transactions
    st.markdown("#### Recent Transactions")

    recent = filtered.sort_values("Timestamp", ascending=False).head(50)

    display_cols = ["Timestamp", "Type", "PlayerName", "Position", "NFLTeam",
                    "FranchiseLogo", "Conference", "BidAmount", "CopySession", "Note", "IsRookie"]
    available = [c for c in display_cols if c in recent.columns]
    display = recent[available].copy()
    display.rename(columns={
        "PlayerName": "Player",
        "NFLTeam": "Team",
        "FranchiseLogo": "Franchise",
        "Conference": "Conf",
        "BidAmount": "Bid",
        "CopySession": "Copy #",
        "IsRookie": "Rookie",
    }, inplace=True)
    if "Note" in display.columns:
        display["Note"] = display["Note"].fillna("")
    display["Bid"] = display["Bid"].apply(lambda x: f"${x:.0f}")
    display["Rookie"] = display["Rookie"].apply(lambda x: "Yes" if x else "No")
    if "Copy #" in display.columns:
        display["Copy #"] = display["Copy #"].apply(
            lambda x: f"#{int(x)}" if x > 0 else ""
        )

    col_config = {"Franchise": st.column_config.ImageColumn("Franchise", width="small")}
    st.dataframe(display, column_config=col_config, hide_index=True, use_container_width=True, height=500)

    st.markdown("---")

    # Unified player deep dive — copy tracker + bid history + per-copy timeline
    st.markdown("#### Player Deep Dive")
    st.caption("Search for a player to see copy availability, per-copy auction summaries, bid history, and timeline.")

    won_df = filtered[filtered["TransactionType"] == "AUCTION_WON"]
    won_players = sorted(won_df["PlayerName"].unique().tolist()) if not won_df.empty else []
    all_players = sorted(df["PlayerName"].unique().tolist())
    remaining = [p for p in all_players if p not in won_players]
    player_deep_dive_list = won_players + remaining

    player_select = st.selectbox(
        "Search player",
        ["-- Select a player --"] + player_deep_dive_list,
        key="auction_deep_dive_player",
    )

    if player_select != "-- Select a player --":
        _render_player_deep_dive(player_select, df, logo_lookup)

    st.markdown("---")

    # By-team spending summary (AUCTION_WON only)
    st.markdown("#### Team Spending Summary")
    st.caption("Based on completed auctions (Won) only.")

    won_filtered = filtered[filtered["TransactionType"] == "AUCTION_WON"]
    if won_filtered.empty:
        st.info("No completed auctions match the current filters.")
    else:
        team_summary = won_filtered.groupby("FranchiseName").agg(
            Wins=("BidAmount", "count"),
            TotalSpent=("BidAmount", "sum"),
            AvgBid=("BidAmount", "mean"),
            MaxBid=("BidAmount", "max"),
            Rookies=("IsRookie", "sum"),
        ).reset_index()
        team_summary = team_summary.sort_values("TotalSpent", ascending=False)
        team_summary["Logo"] = team_summary["FranchiseName"].map(logo_lookup).fillna("")
        team_summary = team_summary[["Logo", "FranchiseName", "Wins", "TotalSpent", "AvgBid", "MaxBid", "Rookies"]]
        team_summary.columns = ["Logo", "Team", "Wins", "Total", "Avg", "Max", "Rookies"]

        team_display = team_summary.copy()
        for col in ["Total", "Avg", "Max"]:
            team_display[col] = team_display[col].apply(lambda x: f"${x:.0f}")
        team_display["Rookies"] = team_display["Rookies"].astype(int)

        team_col_config = {"Logo": st.column_config.ImageColumn("", width="small")}
        st.dataframe(team_display, column_config=team_col_config, hide_index=True, use_container_width=True)

    st.markdown("---")

    # By-position spending charts (AUCTION_WON only)
    st.markdown("#### Spending by Position")

    if won_filtered.empty:
        st.info("No completed auctions to chart.")
    else:
        pos_summary = won_filtered.groupby("Position").agg(
            Count=("BidAmount", "count"),
            Total=("BidAmount", "sum"),
            Avg=("BidAmount", "mean"),
        ).reset_index()
        pos_summary = pos_summary[pos_summary["Position"].isin(POSITIONS)]

        if not pos_summary.empty:
            col_chart1, col_chart2 = st.columns(2)

            with col_chart1:
                fig = px.bar(
                    pos_summary, x="Position", y="Total",
                    color="Position",
                    color_discrete_map=COLORS["positions"],
                    title="Total Spending by Position",
                )
                fig.update_layout(
                    template="plotly_dark",
                    paper_bgcolor=COLORS["background"],
                    plot_bgcolor=COLORS["surface"],
                    height=350,
                    showlegend=False,
                )
                st.plotly_chart(fig, use_container_width=True)

            with col_chart2:
                fig = px.bar(
                    pos_summary, x="Position", y="Avg",
                    color="Position",
                    color_discrete_map=COLORS["positions"],
                    title="Average Win by Position",
                )
                fig.update_layout(
                    template="plotly_dark",
                    paper_bgcolor=COLORS["background"],
                    plot_bgcolor=COLORS["surface"],
                    height=350,
                    showlegend=False,
                )
                st.plotly_chart(fig, use_container_width=True)

    # Transaction type breakdown chart
    st.markdown("---")
    st.markdown("#### Transaction Activity")

    type_counts = filtered.groupby("Type").size().reset_index(name="Count")
    if not type_counts.empty:
        fig = px.pie(
            type_counts, names="Type", values="Count",
            color="Type",
            color_discrete_map=TRANS_TYPE_COLORS,
            title="Transaction Breakdown",
        )
        fig.update_layout(
            template="plotly_dark",
            paper_bgcolor=COLORS["background"],
            plot_bgcolor=COLORS["surface"],
            height=350,
        )
        st.plotly_chart(fig, use_container_width=True)

    # Top acquisitions
    st.markdown("---")
    st.markdown("#### Top Acquisitions")

    top_won = filtered[filtered["TransactionType"] == "AUCTION_WON"]
    if top_won.empty:
        st.info("No completed auctions to display.")
    else:
        top = top_won.nlargest(20, "BidAmount")
        top_display = top[["PlayerName", "Position", "NFLTeam",
                            "FranchiseLogo", "BidAmount",
                            "CopySession", "IsRookie"]].copy()
        top_display.rename(columns={
            "PlayerName": "Player", "NFLTeam": "Team",
            "FranchiseLogo": "Franchise",
            "BidAmount": "Bid", "CopySession": "Copy #",
            "IsRookie": "Rookie",
        }, inplace=True)
        top_display["Bid"] = top_display["Bid"].apply(lambda x: f"${x:.0f}")
        top_display["Rookie"] = top_display["Rookie"].apply(lambda x: "Yes" if x else "No")
        if "Copy #" in top_display.columns:
            top_display["Copy #"] = top_display["Copy #"].apply(
                lambda x: f"#{int(x)}" if x > 0 else ""
            )

        top_col_config = {"Franchise": st.column_config.ImageColumn("Franchise", width="small")}
        st.dataframe(top_display, column_config=top_col_config, hide_index=True, use_container_width=True)


def _render_auction_timeline(filtered: pd.DataFrame):
    """Render an interactive auction timeline with a time-range slider."""
    # Parse timestamps into datetime for plotting
    timeline_df = filtered.copy()
    timeline_df["DateTime"] = pd.to_datetime(timeline_df["Timestamp"], errors="coerce")
    timeline_df = timeline_df.dropna(subset=["DateTime"])

    if timeline_df.empty:
        st.info("No timestamped transactions to plot.")
        return

    min_dt = timeline_df["DateTime"].min()
    max_dt = timeline_df["DateTime"].max()

    # Only show slider if there's a meaningful time range
    if min_dt == max_dt:
        time_filtered = timeline_df
    else:
        date_range = st.slider(
            "Time range",
            min_value=min_dt.to_pydatetime(),
            max_value=max_dt.to_pydatetime(),
            value=(min_dt.to_pydatetime(), max_dt.to_pydatetime()),
            format="MM/DD HH:mm",
            key="auction_timeline_slider",
        )
        time_filtered = timeline_df[
            (timeline_df["DateTime"] >= date_range[0])
            & (timeline_df["DateTime"] <= date_range[1])
        ]

    if time_filtered.empty:
        st.info("No transactions in the selected time range.")
        return

    # Build hover text
    time_filtered = time_filtered.copy()
    time_filtered["HoverText"] = time_filtered.apply(
        lambda r: (
            f"<b>{r['PlayerName']}</b> ({r['Position']})<br>"
            f"Franchise: {r['FranchiseName']}<br>"
            f"Bid: ${r['BidAmount']:.0f}<br>"
            f"Type: {r['Type']}<br>"
            + (f"Copy #{int(r['CopySession'])}<br>" if r.get("CopySession", 0) > 0 else "")
            + (f"Note: {r['Note']}" if pd.notna(r.get("Note")) and str(r.get("Note", "")).strip() else "")
        ),
        axis=1,
    )

    fig = px.scatter(
        time_filtered,
        x="DateTime",
        y="BidAmount",
        color="Type",
        color_discrete_map=TRANS_TYPE_COLORS,
        hover_name="PlayerName",
        custom_data=["HoverText"],
        title="Auction Activity Over Time",
    )
    fig.update_traces(
        hovertemplate="%{customdata[0]}<extra></extra>",
        marker=dict(size=8, opacity=0.7),
    )
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor=COLORS["background"],
        plot_bgcolor=COLORS["surface"],
        height=400,
        xaxis_title="Time",
        yaxis_title="Bid Amount ($)",
        legend_title_text="Type",
    )
    st.plotly_chart(fig, use_container_width=True)

    # Show count in selected range
    range_counts = time_filtered["Type"].value_counts()
    st.caption(
        f"Showing {len(time_filtered)} transactions in range: "
        + ", ".join(f"{t}: {c}" for t, c in range_counts.items())
    )


def _render_copy_timeline(player_name: str, player_txns: pd.DataFrame, logo_lookup: dict):
    """Render per-copy timeline showing bid escalation for each copy session."""
    st.markdown("**Copy Auction Timeline**")

    timeline_df = player_txns.copy()
    timeline_df["DateTime"] = pd.to_datetime(timeline_df["Timestamp"], errors="coerce")
    timeline_df = timeline_df.dropna(subset=["DateTime"])
    timeline_df = timeline_df[timeline_df["CopySession"] > 0]

    if timeline_df.empty:
        st.info("No timestamped auction data to plot.")
        return

    # Create copy label for color grouping
    timeline_df["Copy"] = timeline_df["CopySession"].apply(lambda x: f"Copy #{int(x)}")

    # Build hover text
    timeline_df["HoverText"] = timeline_df.apply(
        lambda r: (
            f"<b>{r['Type']}</b><br>"
            f"Franchise: {r['FranchiseName']}<br>"
            f"Bid: ${r['BidAmount']:.0f}<br>"
            + (f"Note: {r['Note']}" if pd.notna(r.get("Note")) and str(r.get("Note", "")).strip() else "")
        ),
        axis=1,
    )

    fig = go.Figure()

    # Plot each copy session as a connected line + scatter
    sessions = sorted(timeline_df["CopySession"].unique())
    # Color palette for copy sessions
    copy_colors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6",
                   "#1abc9c", "#e67e22", "#2980b9", "#27ae60", "#c0392b",
                   "#8e44ad", "#16a085"]

    for i, session_num in enumerate(sessions):
        session_data = timeline_df[timeline_df["CopySession"] == session_num].sort_values("DateTime")
        color = copy_colors[i % len(copy_colors)]
        copy_label = f"Copy #{int(session_num)}"

        # Line connecting events in this copy session
        fig.add_trace(go.Scatter(
            x=session_data["DateTime"],
            y=session_data["BidAmount"],
            mode="lines+markers",
            name=copy_label,
            line=dict(color=color, width=2),
            marker=dict(
                size=10,
                color=color,
                symbol=[
                    "diamond" if t == "Nomination"
                    else "star" if t == "Won"
                    else "circle"
                    for t in session_data["Type"]
                ],
            ),
            customdata=session_data["HoverText"].values,
            hovertemplate="%{customdata}<extra></extra>",
        ))

    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor=COLORS["background"],
        plot_bgcolor=COLORS["surface"],
        height=400,
        title=f"{player_name} — Bid Escalation by Copy",
        xaxis_title="Time",
        yaxis_title="Bid Amount ($)",
        legend_title_text="Copy",
    )
    st.plotly_chart(fig, use_container_width=True)
    st.caption("Diamond = Nomination, Circle = Bid, Star = Won")


def _render_player_deep_dive(player_name: str, df: pd.DataFrame, logo_lookup: dict):
    """Unified player view: copy availability, per-copy auction summary, bid history, and timeline."""
    player_txns = df[df["PlayerName"] == player_name].copy()
    if player_txns.empty:
        st.info(f"No data found for {player_name}.")
        return

    player_txns = player_txns.sort_values("Timestamp", ascending=True)

    # Player info header
    first = player_txns.iloc[0]
    pos = first.get("Position", "")
    team = first.get("NFLTeam", "")
    st.markdown(f"**{player_name}** — {pos} | {team}")

    # --- Copy Availability Summary ---
    total_copies = len(CONFERENCE_LIST) * COPIES_PER_CONFERENCE
    player_won = player_txns[player_txns["TransactionType"] == "AUCTION_WON"]
    sold_count = len(player_won)
    available_count = total_copies - sold_count
    total_bids = len(player_txns[player_txns["TransactionType"] == "AUCTION_BID"])
    total_sessions = player_txns["CopySession"].max() if not player_txns.empty else 0

    m1, m2, m3, m4, m5 = st.columns(5)
    m1.metric("Total Copies", total_copies)
    m2.metric("Sold", sold_count)
    m3.metric("Available", available_count)
    m4.metric("Copies Nominated", int(total_sessions))
    if sold_count > 0:
        m5.metric("Avg Price", f"${player_won['BidAmount'].mean():.0f}")
    else:
        m5.metric("Total Bids", total_bids)

    # --- Per-Conference Availability ---
    conf_sold = player_won.groupby("Conference").size().to_dict() if not player_won.empty else {}
    conf_rows = []
    for conf in CONFERENCE_LIST:
        sold = conf_sold.get(conf, 0)
        avail = COPIES_PER_CONFERENCE - sold
        status = "Available" if avail > 0 else "Full"
        conf_rows.append({
            "Conference": conf,
            "Teams": CONFERENCES[conf],
            "Sold": sold,
            "Available": avail,
            "Status": status,
        })
    conf_df = pd.DataFrame(conf_rows)
    st.dataframe(conf_df, hide_index=True, use_container_width=True)

    # --- Per-Copy Auction Summary ---
    st.markdown("**Copy Auction Summary**")

    if total_sessions == 0:
        st.info("No auction sessions found for this player.")
    else:
        copy_summary_rows = []
        for session_num in range(1, int(total_sessions) + 1):
            session = player_txns[player_txns["CopySession"] == session_num]
            if session.empty:
                continue

            init_rows = session[session["TransactionType"] == "AUCTION_INIT"]
            bid_rows = session[session["TransactionType"] == "AUCTION_BID"]
            won_rows = session[session["TransactionType"] == "AUCTION_WON"]

            nominated_by = init_rows.iloc[0]["FranchiseName"] if not init_rows.empty else ""
            opening_bid = init_rows.iloc[0]["BidAmount"] if not init_rows.empty else 0
            num_bids = len(bid_rows)
            max_bid = bid_rows["BidAmount"].max() if not bid_rows.empty else 0

            if not won_rows.empty:
                winner = won_rows.iloc[0]
                won_by = winner["FranchiseName"]
                won_logo = logo_lookup.get(won_by, "")
                winning_price = winner["BidAmount"]
                conference = winner.get("Conference", "")
                status = "Sold"
            else:
                won_by = ""
                won_logo = ""
                winning_price = 0
                conference = ""
                status = "In Progress"

            # Duration: INIT to WON (or INIT to latest transaction)
            start_time = pd.to_datetime(session["Timestamp"].iloc[0], errors="coerce")
            end_time = pd.to_datetime(session["Timestamp"].iloc[-1], errors="coerce")
            if pd.notna(start_time) and pd.notna(end_time) and start_time != end_time:
                delta = end_time - start_time
                total_seconds = int(delta.total_seconds())
                hours, remainder = divmod(total_seconds, 3600)
                minutes, _ = divmod(remainder, 60)
                duration = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"
            else:
                duration = ""

            copy_summary_rows.append({
                "Copy #": f"#{session_num}",
                "Status": status,
                "Nominated By": nominated_by,
                "Opening Bid": f"${opening_bid:.0f}",
                "# Bids": num_bids,
                "Max Bid": f"${max_bid:.0f}" if max_bid > 0 else "",
                "Won By Logo": won_logo,
                "Won By": won_by,
                "Winning Price": f"${winning_price:.0f}" if winning_price > 0 else "",
                "Conference": conference,
                "Duration": duration,
            })

        if copy_summary_rows:
            summary_df = pd.DataFrame(copy_summary_rows)
            summary_col_config = {
                "Won By Logo": st.column_config.ImageColumn("Winner", width="small"),
            }
            st.dataframe(summary_df, column_config=summary_col_config,
                          hide_index=True, use_container_width=True)

    # --- Per-Copy Bid History ---
    st.markdown("**Bid History by Copy**")

    for session_num in range(1, int(total_sessions) + 1):
        session = player_txns[player_txns["CopySession"] == session_num].copy()
        if session.empty:
            continue

        init_rows = session[session["TransactionType"] == "AUCTION_INIT"]
        won_rows = session[session["TransactionType"] == "AUCTION_WON"]

        # Build header
        header_parts = [f"**Copy #{session_num}**"]
        if not init_rows.empty:
            header_parts.append(f"Nominated by {init_rows.iloc[0]['FranchiseName']} at ${init_rows.iloc[0]['BidAmount']:.0f}")
        if not won_rows.empty:
            header_parts.append(f"Won by {won_rows.iloc[0]['FranchiseName']} at ${won_rows.iloc[0]['BidAmount']:.0f}")
        else:
            header_parts.append("In Progress")

        with st.expander(" — ".join(header_parts)):
            hist = session[["Timestamp", "Type", "FranchiseLogo", "FranchiseName",
                             "BidAmount", "Note"]].copy()
            hist.rename(columns={
                "FranchiseLogo": "Franchise",
                "FranchiseName": "Team",
                "BidAmount": "Bid",
            }, inplace=True)
            hist["Bid"] = hist["Bid"].apply(lambda x: f"${x:.0f}")
            hist["Note"] = hist["Note"].fillna("")

            hist_col_config = {"Franchise": st.column_config.ImageColumn("Franchise", width="small")}
            st.dataframe(hist, column_config=hist_col_config, hide_index=True, use_container_width=True)

    # --- Per-Copy Timeline ---
    _render_copy_timeline(player_name, player_txns, logo_lookup)
