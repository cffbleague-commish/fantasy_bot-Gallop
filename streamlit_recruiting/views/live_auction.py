"""
Live Auction tab — real-time view of auction transactions from MFL.
Reads from the LiveAuction sheet (populated by Apps Script timed trigger).
"""

import streamlit as st
import pandas as pd
import plotly.express as px

from data.sheets import load_live_auction
from models.config import POSITIONS, COLORS


def render_live_auction_tab():
    """Render the Live Auction tab."""
    df = load_live_auction()

    if df.empty:
        st.info(
            "No live auction data available. "
            "Run **Start Live Auction Sync** from the Google Sheets Recruiting Analytics menu to begin importing."
        )
        return

    st.markdown("### Live Auction Transactions")
    st.caption(f"{len(df)} transactions loaded. Data refreshes every 5 minutes (sheet syncs hourly).")

    # Summary metrics
    metric_cols = st.columns(5)
    metric_cols[0].metric("Total Transactions", len(df))
    metric_cols[1].metric("Total Spent", f"${df['BidAmount'].sum():,.0f}")
    metric_cols[2].metric("Avg Bid", f"${df['BidAmount'].mean():.1f}")
    metric_cols[3].metric("Highest Bid", f"${df['BidAmount'].max():.0f}")

    rookie_count = int(df["IsRookie"].sum())
    metric_cols[4].metric("Rookie Auctions", rookie_count)

    st.markdown("---")

    # Filters
    col_filter1, col_filter2 = st.columns(2)
    pos_filter = col_filter1.selectbox(
        "Filter Position", ["All"] + POSITIONS, key="auction_pos_filter"
    )
    rookie_filter = col_filter2.selectbox(
        "Filter Type", ["All", "Rookies Only", "Veterans Only"], key="auction_type_filter"
    )

    filtered = df.copy()
    if pos_filter != "All":
        filtered = filtered[filtered["Position"] == pos_filter]
    if rookie_filter == "Rookies Only":
        filtered = filtered[filtered["IsRookie"]]
    elif rookie_filter == "Veterans Only":
        filtered = filtered[~filtered["IsRookie"]]

    if filtered.empty:
        st.info("No transactions match the current filters.")
        return

    # Recent transactions
    st.markdown("#### Recent Transactions")

    recent = filtered.sort_values("Timestamp", ascending=False).head(50)

    display_cols = ["Timestamp", "PlayerName", "Position", "NFLTeam",
                    "FranchiseName", "Conference", "BidAmount", "IsRookie"]
    available = [c for c in display_cols if c in recent.columns]
    display = recent[available].copy()
    display.rename(columns={
        "PlayerName": "Player",
        "NFLTeam": "Team",
        "FranchiseName": "Franchise",
        "Conference": "Conf",
        "BidAmount": "Bid",
        "IsRookie": "Rookie",
    }, inplace=True)
    display["Bid"] = display["Bid"].apply(lambda x: f"${x:.0f}")
    display["Rookie"] = display["Rookie"].apply(lambda x: "Yes" if x else "No")

    st.dataframe(display, hide_index=True, use_container_width=True, height=500)

    st.markdown("---")

    # By-team spending summary
    st.markdown("#### Team Spending Summary")

    team_summary = filtered.groupby("FranchiseName").agg(
        Transactions=("BidAmount", "count"),
        TotalSpent=("BidAmount", "sum"),
        AvgBid=("BidAmount", "mean"),
        MaxBid=("BidAmount", "max"),
        Rookies=("IsRookie", "sum"),
    ).reset_index()
    team_summary = team_summary.sort_values("TotalSpent", ascending=False)
    team_summary.columns = ["Team", "Txns", "Total", "Avg", "Max", "Rookies"]

    team_display = team_summary.copy()
    for col in ["Total", "Avg", "Max"]:
        team_display[col] = team_display[col].apply(lambda x: f"${x:.0f}")
    team_display["Rookies"] = team_display["Rookies"].astype(int)

    st.dataframe(team_display, hide_index=True, use_container_width=True)

    st.markdown("---")

    # By-position spending chart
    st.markdown("#### Spending by Position")

    pos_summary = filtered.groupby("Position").agg(
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
                title="Average Bid by Position",
            )
            fig.update_layout(
                template="plotly_dark",
                paper_bgcolor=COLORS["background"],
                plot_bgcolor=COLORS["surface"],
                height=350,
                showlegend=False,
            )
            st.plotly_chart(fig, use_container_width=True)

    # Top acquisitions
    st.markdown("---")
    st.markdown("#### Top Acquisitions")

    top = filtered.nlargest(20, "BidAmount")
    top_display = top[["PlayerName", "Position", "NFLTeam", "FranchiseName",
                        "BidAmount", "IsRookie"]].copy()
    top_display.rename(columns={
        "PlayerName": "Player", "NFLTeam": "Team",
        "FranchiseName": "Franchise", "BidAmount": "Bid",
        "IsRookie": "Rookie",
    }, inplace=True)
    top_display["Bid"] = top_display["Bid"].apply(lambda x: f"${x:.0f}")
    top_display["Rookie"] = top_display["Rookie"].apply(lambda x: "Yes" if x else "No")

    st.dataframe(top_display, hide_index=True, use_container_width=True)
