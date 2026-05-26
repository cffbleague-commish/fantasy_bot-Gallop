"""
Option 3: Replacement-Level Surplus Value pricing.
Prices players based on their value above a replacement-level baseline.
Includes both static (pre-auction) and dynamic (live-adjusted) modes.
"""

import pandas as pd
from typing import Optional

from models.config import (
    POSITIONS, ADP_SCORE_DECAY_RATE, DEFAULT_ADP,
    COPIES_PER_CONFERENCE, COPY_DISCOUNT_BINS,
)
from models.scoring import calc_adp_score
from models.current_model import get_copy_discount_ratio


# Fixed replacement-level ADP for all positions (end of startup ADP range).
REPLACEMENT_ADP = 240


def calc_var_score(
    adp: Optional[float],
    position: str,
) -> float:
    """
    Calculate Value Above Replacement (VAR) score for a player.

    VAR = max(0, playerADPScore - replacementADPScore)
    Players at or below replacement level get VAR = 0.
    Uses a fixed replacement threshold of ADP 240 for all positions.
    """
    effective_adp = adp if adp else DEFAULT_ADP
    player_score = calc_adp_score(effective_adp, ADP_SCORE_DECAY_RATE)
    replacement_score = calc_adp_score(REPLACEMENT_ADP, ADP_SCORE_DECAY_RATE)

    return max(0.0, player_score - replacement_score)


def calc_replacement_prices(
    board_df: pd.DataFrame,
    conference_budgets: dict,
    copy_discount_curve: dict,
    is_pre_draft: bool = False,
) -> pd.DataFrame:
    """
    Calculate replacement-level surplus value prices.

    For each player:
    1. Compute VAR = max(0, adpScore - replacementScore)
    2. Total VAR across all players × 2 copies
    3. Player's share = (VAR × 2 / totalVAR) × budget
    4. Split into Copy 1/Copy 2 using discount curve

    Returns DataFrame with: Player, var_score, copy1_16, copy2_16, copy1_20, copy2_20
    """
    if not conference_budgets:
        return pd.DataFrame()

    # Compute VAR for each player
    players = []
    for _, row in board_df.iterrows():
        name = row.get("Player") or row.get("name", "")
        position = row.get("Position") or row.get("position", "")
        adp = row.get("StartupADP") or row.get("startupADP")

        if is_pre_draft:
            # Use recruit score as proxy when no ADP available
            score = row.get("RecruitScore") or row.get("recruitScore") or 0
            var = max(0, score - 10)  # floor at 2-star threshold
        else:
            var = calc_var_score(adp, position)

        players.append({"name": name, "position": position, "var": var})

    # Total VAR across all copies
    total_var = sum(p["var"] * COPIES_PER_CONFERENCE for p in players)
    if total_var <= 0:
        return pd.DataFrame()

    results = []
    sizes = sorted(int(s) for s in conference_budgets.keys())

    for p in players:
        entry = {"Player": p["name"], "var_score": round(p["var"], 2)}

        for size_str, budget in conference_budgets.items():
            size = int(size_str)
            if budget <= 0:
                continue

            if p["var"] <= 0:
                # Replacement-level players get $0
                if size == sizes[0]:
                    entry["copy1_16"] = 0
                    entry["copy2_16"] = 0
                if size == sizes[-1]:
                    entry["copy1_20"] = 0
                    entry["copy2_20"] = 0
                continue

            player_share = (p["var"] * COPIES_PER_CONFERENCE / total_var) * budget
            avg_copy_price = player_share / COPIES_PER_CONFERENCE

            ratio = get_copy_discount_ratio(avg_copy_price, copy_discount_curve, COPY_DISCOUNT_BINS)
            copy1 = player_share / (1 + ratio)
            copy2 = player_share * ratio / (1 + ratio)

            if size == sizes[0]:
                entry["copy1_16"] = max(0, round(copy1))
                entry["copy2_16"] = max(0, round(copy2))
            if size == sizes[-1]:
                entry["copy1_20"] = max(0, round(copy1))
                entry["copy2_20"] = max(0, round(copy2))

        results.append(entry)

    return pd.DataFrame(results)


# ---------------------------------------------------------------------------
# Live-adjusted dynamic pricing
# ---------------------------------------------------------------------------


def calc_conference_budget_remaining(
    live_auction_df: pd.DataFrame,
    conference: str,
    auction_budgets: dict,
    franchise_lookup_df: pd.DataFrame,
) -> tuple:
    """Calculate remaining budget for a conference from live auction state.

    Accounts for both completed spending (WON) and money currently allocated
    as the high bidder on active auctions. Uses all transactions (rookies +
    upperclassmen) since the budget is a single shared pool.

    Parameters
    ----------
    live_auction_df : DataFrame with TransactionType, Conference, BidAmount,
                      FranchiseName, PlayerID, CopySession, etc.
    conference : Conference code (e.g. "SEC")
    auction_budgets : mapping franchise_name -> starting budget
    franchise_lookup_df : DataFrame with TeamName, Conference columns

    Returns
    -------
    (conference_total, conference_remaining, per_franchise_remaining)
    per_franchise_remaining is a dict: franchise_name -> remaining budget
    """
    # Total conference budget from all franchises
    if not franchise_lookup_df.empty:
        conf_teams = franchise_lookup_df[
            franchise_lookup_df["Conference"] == conference
        ]["TeamName"].tolist()
    else:
        conf_teams = []

    conf_total = sum(auction_budgets.get(name, 0) for name in conf_teams)

    # Filter live data to this conference
    conf_df = live_auction_df[live_auction_df["Conference"] == conference]

    # Spent = sum of all AUCTION_WON amounts
    won_df = conf_df[conf_df["TransactionType"] == "AUCTION_WON"]
    conf_spent = won_df["BidAmount"].sum() if not won_df.empty else 0.0

    # Allocated = current high bids on open auctions (not yet won)
    # An open auction = player+copy session with INIT/BID but no WON
    allocated_by_team: dict = {}
    if not conf_df.empty:
        won_keys = set()
        if not won_df.empty:
            for _, w in won_df.iterrows():
                won_keys.add((w["PlayerID"], w.get("CopySession", 0)))

        # Find active auctions and their highest bid per player+copy
        bids_df = conf_df[conf_df["TransactionType"] == "AUCTION_BID"]
        if not bids_df.empty:
            for (pid, cs), group in bids_df.groupby(["PlayerID", "CopySession"]):
                if (pid, cs) in won_keys:
                    continue  # Already closed
                # Highest bid is the current high bidder
                top_bid_row = group.loc[group["BidAmount"].idxmax()]
                team = top_bid_row["FranchiseName"]
                bid = top_bid_row["BidAmount"]
                allocated_by_team[team] = allocated_by_team.get(team, 0) + bid

    conf_allocated = sum(allocated_by_team.values())
    conf_remaining = conf_total - conf_spent - conf_allocated

    # Per-franchise breakdown
    per_franchise = {}
    for name in conf_teams:
        team_budget = auction_budgets.get(name, 0)
        team_won = won_df[won_df["FranchiseName"] == name]
        team_spent = team_won["BidAmount"].sum() if not team_won.empty else 0.0
        team_allocated = allocated_by_team.get(name, 0)
        per_franchise[name] = team_budget - team_spent - team_allocated

    return conf_total, conf_remaining, per_franchise


def calc_dynamic_replacement_prices(
    board_df: pd.DataFrame,
    live_auction_df: pd.DataFrame,
    conference: str,
    conference_budget_remaining: float,
    copy_discount_curve: dict,
) -> pd.DataFrame:
    """Calculate live-adjusted replacement-level prices for a specific conference.

    Adjusts the static model by:
    - Removing already-won copies from the VAR pool
    - Distributing only the remaining conference budget
    - Marking players as on_board / taken based on live state

    Parameters
    ----------
    board_df : Full recruiting board (all players).
    live_auction_df : Live auction transactions (all types) already filtered
                      to current year. Must have CopySession assigned.
    conference : Conference code to calculate prices for.
    conference_budget_remaining : Remaining budget for this conference.
    copy_discount_curve : Empirical copy discount ratios.

    Returns
    -------
    DataFrame with columns: Player, var_score, live_price, copies_remaining, status
    """
    if conference_budget_remaining <= 0:
        return pd.DataFrame()

    # Filter live data to this conference
    conf_df = live_auction_df[live_auction_df["Conference"] == conference]
    won_df = conf_df[conf_df["TransactionType"] == "AUCTION_WON"]

    # Count copies won per player (by PlayerName since board uses name-based keys)
    copies_won = {}
    if not won_df.empty:
        copies_won = won_df.groupby("PlayerName")["CopySession"].nunique().to_dict()

    # Identify players currently on the board (open auction session: has INIT/BID
    # but no WON yet in the current copy session for this conference)
    on_board_players = set()
    if not conf_df.empty:
        for player_name, group in conf_df.groupby("PlayerName"):
            # Check if there's an open session (last transaction isn't WON)
            sorted_group = group.sort_values("Timestamp", ascending=True)
            last_txn = sorted_group["TransactionType"].iloc[-1]
            if last_txn in ("AUCTION_INIT", "AUCTION_BID"):
                on_board_players.add(player_name)

    # Compute VAR and remaining copies for each player
    players = []
    for _, row in board_df.iterrows():
        name = row.get("Player") or row.get("name", "")
        position = row.get("Position") or row.get("position", "")
        adp = row.get("StartupADP") or row.get("startupADP")

        var = calc_var_score(adp, position)
        won_count = copies_won.get(name, 0)
        remaining = max(0, COPIES_PER_CONFERENCE - won_count)

        if remaining == 0:
            status = "taken"
        elif name in on_board_players:
            status = "on_board"
        else:
            status = "available"

        players.append({
            "name": name,
            "var": var,
            "copies_remaining": remaining,
            "status": status,
        })

    # Total remaining VAR (weighted by copies still available)
    total_remaining_var = sum(p["var"] * p["copies_remaining"] for p in players)
    if total_remaining_var <= 0:
        return pd.DataFrame()

    # Distribute remaining budget across remaining VAR
    results = []
    for p in players:
        if p["var"] <= 0 or p["copies_remaining"] == 0:
            results.append({
                "Player": p["name"],
                "var_score": round(p["var"], 2),
                "live_price": 0,
                "copies_remaining": p["copies_remaining"],
                "status": p["status"],
            })
            continue

        player_share = (
            (p["var"] * p["copies_remaining"]) / total_remaining_var
        ) * conference_budget_remaining

        # If both copies remain, split using discount curve
        if p["copies_remaining"] == COPIES_PER_CONFERENCE:
            avg_price = player_share / COPIES_PER_CONFERENCE
            ratio = get_copy_discount_ratio(
                avg_price, copy_discount_curve, COPY_DISCOUNT_BINS
            )
            copy1_price = player_share / (1 + ratio)
        else:
            # Only one copy remains — full share goes to that copy
            copy1_price = player_share

        results.append({
            "Player": p["name"],
            "var_score": round(p["var"], 2),
            "live_price": max(0, round(copy1_price)),
            "copies_remaining": p["copies_remaining"],
            "status": p["status"],
        })

    return pd.DataFrame(results)
