"""Build JSON payloads for the Auction Board and Copy Tracker iframes.

The Auction Board and Copy Tracker are React-via-Babel-standalone components
shipped as static HTML in ``html_components/``. This module owns the sheet →
payload transform so the components see a stable, design-shaped contract:

- Auction Board → ``build_auction_board_payload(year)``
- Copy Tracker  → ``build_copy_tracker_payload(year)``

It also owns the copy-session lifecycle helpers (``_assign_copy_sessions``,
``_resolve_winning_prices``) that were previously private to the Live Auction
tab — the tab is now a thin wrapper around these payloads.
"""

from __future__ import annotations

from typing import Optional

import pandas as pd

from data.sheets import (
    load_franchise_lookup,
    load_live_auction,
    load_recruiting_board,
)
from data.mfl_api import fetch_auction_budgets
from models.config import COPIES_PER_CONFERENCE, CONFERENCES


# ---------------------------------------------------------------------------
# Static design tokens — mirror the values in the CFFB Design System
# (``CFFB Design System/Auction Page/Auction Board/data.jsx``).
# ---------------------------------------------------------------------------

# Sheet "Conference" code → design id used by the iframe (CSS / CONF_ACCENT).
CONF_CODE_TO_ID = {
    "SEC": "sec",
    "B10": "b1g",
    "ACC": "acc",
    "B12": "big12",
    "P12": "pac",
    "AAC": "aac",
}

# Display order matches the design's CONF_ORDER constant.
CONF_DISPLAY_ORDER = ["sec", "b1g", "acc", "big12", "pac", "aac"]

CONF_NAME_BY_ID = {
    "sec": "SEC",
    "b1g": "Big Ten",
    "acc": "ACC",
    "big12": "Big 12",
    "pac": "Pac-12",
    "aac": "AAC",
}

POS_COLORS = {
    "QB": "#C9A227",
    "RB": "#3B82C4",
    "WR": "#7BA4C9",
    "TE": "#E8C547",
    "OL": "#8A8A8A",
    "DL": "#8B6F1F",
    "LB": "#B84545",
    "DB": "#6E86A8",
    "ATH": "#9A9A9A",
}

CONF_ACCENT = {
    "sec": "#C9A227",
    "b1g": "#4A6FA5",
    "acc": "#8B4A5C",
    "big12": "#B84545",
    "pac": "#5C7A6A",
    "aac": "#6B5C8B",
}

STATUS_META = {
    "open": {"label": "Available", "color": "#5A5A5A"},
    "live": {"label": "In Process", "color": "#2D7A4E"},
    "sold": {"label": "Sold", "color": "#C9A227"},
}

# Default team color fallback when the FranchiseLookup sheet has no swatch.
_DEFAULT_TEAM_BG = "#1C1C1C"
_DEFAULT_TEAM_FG = "#F5F5F5"


# ---------------------------------------------------------------------------
# Copy-session lifecycle (moved from tabs/live_auction.py so both payloads can
# call it). Kept verbatim — see the original docstring for the lifecycle rules.
# ---------------------------------------------------------------------------

_TXN_SORT_ORDER = {"AUCTION_WON": 0, "AUCTION_INIT": 1, "AUCTION_BID": 2}


def assign_copy_sessions(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    df = df.copy()
    df["CopySession"] = 0
    df["_txn_sort"] = df["TransactionType"].map(_TXN_SORT_ORDER).fillna(1)
    for (_, conference), group in df.groupby(["PlayerID", "Conference"]):
        if not conference or str(conference) == "nan":
            continue
        idx_sorted = group.sort_values(
            ["Timestamp", "_txn_sort"], ascending=[True, True]
        ).index
        counter = 0
        session_closed = True
        for i in idx_sorted:
            if session_closed:
                counter += 1
                session_closed = False
            df.at[i, "CopySession"] = counter
            if df.at[i, "TransactionType"] == "AUCTION_WON":
                session_closed = True
    df.drop(columns=["_txn_sort"], inplace=True)
    return df


def resolve_winning_prices(df: pd.DataFrame) -> pd.DataFrame:
    bids = df[df["TransactionType"] == "AUCTION_BID"]
    if bids.empty:
        return df

    has_sessions = "CopySession" in df.columns and (df["CopySession"] > 0).any()

    if has_sessions:
        max_bids = bids.groupby(
            ["PlayerID", "FranchiseID", "Conference", "CopySession"]
        )["BidAmount"].max()
    else:
        max_bids = bids.groupby(["PlayerID", "FranchiseID"])["BidAmount"].max()

    def _resolve(row):
        if row["TransactionType"] != "AUCTION_WON" or row["BidAmount"] > 0:
            return row["BidAmount"]
        if has_sessions:
            key = (
                row["PlayerID"],
                row["FranchiseID"],
                row["Conference"],
                row["CopySession"],
            )
        else:
            key = (row["PlayerID"], row["FranchiseID"])
        if key in max_bids.index:
            return max_bids[key]
        if has_sessions:
            session_bids = bids[
                (bids["PlayerID"] == row["PlayerID"])
                & (bids["Conference"] == row["Conference"])
                & (bids["CopySession"] == row["CopySession"])
            ]
            if not session_bids.empty:
                return session_bids["BidAmount"].max()
        conf_bids = bids[
            (bids["PlayerID"] == row["PlayerID"])
            & (bids["Conference"] == row["Conference"])
        ]
        if not conf_bids.empty:
            return conf_bids["BidAmount"].max()
        player_bids = bids[bids["PlayerID"] == row["PlayerID"]]
        if not player_bids.empty:
            return player_bids["BidAmount"].max()
        return row["BidAmount"]

    df = df.copy()
    won_mask = df["TransactionType"] == "AUCTION_WON"
    df.loc[won_mask, "BidAmount"] = df.loc[won_mask].apply(_resolve, axis=1)
    return df


def prepare_data(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize raw LiveAuction rows: numeric bids, copy sessions, resolved prices."""
    if df.empty:
        return df
    df = df.copy()
    df["BidAmount"] = pd.to_numeric(df["BidAmount"], errors="coerce").fillna(0)
    has_precomputed = "CopySession" in df.columns and (df["CopySession"] > 0).any()
    if not has_precomputed:
        df = assign_copy_sessions(df)
    df = resolve_winning_prices(df)
    return df


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------

def _safe_str(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value)


def _safe_int(value, default: int = 0) -> int:
    try:
        if value is None or value == "" or pd.isna(value):
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _safe_float(value, default: float = 0.0) -> float:
    try:
        if value is None or value == "" or pd.isna(value):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _board_lookup(year: Optional[int]) -> dict:
    """Map PlayerName → recruit metadata (score, stars, posRank, headshot)."""
    board = load_recruiting_board(year)
    if board.empty:
        return {}
    out: dict = {}
    for _, row in board.iterrows():
        name = _safe_str(row.get("Player"))
        if not name:
            continue
        out[name] = {
            "score": _safe_float(row.get("RecruitScore"), 0.0),
            "stars": _safe_int(row.get("Rating"), 0),
            "posRank": _safe_int(row.get("PosRank"), 0),
            "headshot": _safe_str(row.get("HeadshotURL")),
            "position": _safe_str(row.get("Position")),
        }
    return out


def _franchise_lookup_indexed() -> dict:
    fl = load_franchise_lookup()
    if fl.empty:
        return {}
    out: dict = {}
    for _, row in fl.iterrows():
        fid = _safe_str(row.get("FranchiseID"))
        if not fid:
            continue
        out[fid] = {
            "name": _safe_str(row.get("TeamName")),
            "conf_code": _safe_str(row.get("Conference")),
            "abbr": _safe_str(row.get("Abbreviation")),
            "logo": _safe_str(row.get("Logo")),
        }
    return out


# ---------------------------------------------------------------------------
# Conferences / Teams / Players
# ---------------------------------------------------------------------------

def build_conferences() -> list:
    """Return the design's conference list (no logo URLs — names render as text)."""
    return [{"id": cid, "name": CONF_NAME_BY_ID[cid]} for cid in CONF_DISPLAY_ORDER]


def build_teams(
    franchises: dict,
    budgets: dict,
    spent_by_fid: dict,
) -> dict:
    """Build TEAMS dict keyed by FranchiseID.

    ``budgets`` and ``spent_by_fid`` are both keyed by normalized FranchiseID.
    """
    teams = {}
    for fid, info in franchises.items():
        conf_code = info.get("conf_code", "")
        conf_id = CONF_CODE_TO_ID.get(conf_code, "")
        logo = info.get("logo", "")
        team = {
            "name": info.get("name") or info.get("abbr") or f"Team {fid}",
            "abbr": info.get("abbr") or fid,
            "owner": "",
            "conf": conf_id,
            "bg": _DEFAULT_TEAM_BG,
            "fg": _DEFAULT_TEAM_FG,
            "budget": float(budgets.get(fid, 0) or 0),
            "spent": float(spent_by_fid.get(fid, 0) or 0),
        }
        if logo.startswith("http"):
            team["pill"] = logo
        teams[fid] = team
    return teams


def build_players(df: pd.DataFrame, board: dict) -> dict:
    """Build PLAYERS dict keyed by PlayerID, sourced from auction rows + board."""
    players: dict = {}
    if df.empty:
        return players
    seen = set()
    for _, row in df.iterrows():
        pid = _safe_str(row.get("PlayerID"))
        if not pid or pid in seen:
            continue
        seen.add(pid)
        name = _safe_str(row.get("PlayerName")) or pid
        position = _safe_str(row.get("Position")) or "ATH"
        meta = board.get(name, {})
        players[pid] = {
            "name": name,
            "pos": position,
            "cls": "",
            "stars": meta.get("stars", 0),
            "posRank": meta.get("posRank", 0),
            "score": float(meta.get("score", 0.0) or 0.0),
            "headshot": meta.get("headshot", ""),
        }
    return players


# ---------------------------------------------------------------------------
# Auction Board payload
# ---------------------------------------------------------------------------

def _conf_id_for_row(row) -> str:
    return CONF_CODE_TO_ID.get(_safe_str(row.get("Conference")), "")


def _build_lots(df: pd.DataFrame) -> tuple[list, list]:
    """Split prepared LiveAuction rows into LIVE_LOTS and COMPLETED lots.

    Each (PlayerID, Conference, CopySession) group is one auction lot. A lot
    is COMPLETED when it contains an AUCTION_WON row; otherwise it's LIVE
    (open INIT + any BIDs without a WON yet).
    """
    if df.empty or "CopySession" not in df.columns:
        return [], []

    live_lots: list = []
    completed: list = []

    scoped = df[df["CopySession"] > 0]
    if scoped.empty:
        return [], []

    for (pid, conf_code, session), group in scoped.groupby(
        ["PlayerID", "Conference", "CopySession"], sort=False
    ):
        conf_id = CONF_CODE_TO_ID.get(_safe_str(conf_code), "")
        if not conf_id:
            continue

        group = group.sort_values("Timestamp")
        won_rows = group[group["TransactionType"] == "AUCTION_WON"]
        bid_rows = group[group["TransactionType"] == "AUCTION_BID"]
        init_rows = group[group["TransactionType"] == "AUCTION_INIT"]

        copies_of = COPIES_PER_CONFERENCE
        lot_id = f"{pid}-{conf_id}-{int(session)}"
        copy_n = int(session) if int(session) <= copies_of else copies_of

        if not won_rows.empty:
            win = won_rows.iloc[-1]
            completed.append({
                "id": lot_id,
                "conf": conf_id,
                "player": _safe_str(pid),
                "copy": {"n": copy_n, "of": copies_of},
                "price": float(win.get("BidAmount", 0) or 0),
                "winner": _safe_str(win.get("FranchiseID")),
            })
        else:
            high_row = None
            high_bid = 0.0
            if not bid_rows.empty:
                high_row = bid_rows.loc[bid_rows["BidAmount"].idxmax()]
                high_bid = float(high_row.get("BidAmount", 0) or 0)
            elif not init_rows.empty:
                high_row = init_rows.iloc[-1]
                high_bid = float(high_row.get("BidAmount", 0) or 0)
            if high_row is None:
                continue
            live_lots.append({
                "id": lot_id,
                "conf": conf_id,
                "player": _safe_str(pid),
                "copy": {"n": copy_n, "of": copies_of},
                "highBid": high_bid,
                "bidder": _safe_str(high_row.get("FranchiseID")),
                "bids": int(len(bid_rows)),
            })

    return live_lots, completed


def build_auction_board_payload(year: Optional[int]) -> dict:
    """Build the full Auction Board iframe payload from sheets + MFL."""
    raw = load_live_auction()
    if not raw.empty and year is not None and "AuctionYear" in raw.columns:
        raw = raw[raw["AuctionYear"] == year].copy()
    if not raw.empty and "IsRookie" in raw.columns:
        raw = raw[raw["IsRookie"]].copy()

    df = prepare_data(raw)
    board = _board_lookup(year)
    franchises = _franchise_lookup_indexed()

    won_df = df[df["TransactionType"] == "AUCTION_WON"] if not df.empty else df
    spent_by_fid = {}
    if not won_df.empty:
        agg = won_df.groupby("FranchiseID")["BidAmount"].sum()
        spent_by_fid = {str(k): float(v) for k, v in agg.items()}

    budgets = fetch_auction_budgets(year) if year else {}

    teams = build_teams(franchises, budgets, spent_by_fid)
    players = build_players(df, board)
    live_lots, completed = _build_lots(df)

    return {
        "CONFERENCES": build_conferences(),
        "TEAMS": teams,
        "PLAYERS": players,
        "POS_COLORS": POS_COLORS,
        "CONF_ACCENT": CONF_ACCENT,
        "LIVE_LOTS": live_lots,
        "COMPLETED": completed,
        "year": year,
    }


# ---------------------------------------------------------------------------
# Copy Tracker payload
# ---------------------------------------------------------------------------

def _build_copy_ledger(df: pd.DataFrame, players: dict) -> dict:
    """Build COPY_LEDGER keyed by PlayerID.

    For each (player, conf), iterate copy sessions in order. Each session is a
    copy with status:
      - 'sold' if any AUCTION_WON
      - 'live' if AUCTION_INIT or AUCTION_BID present but no WON
      - 'open' otherwise (no rows for that copy in that conf yet)
    """
    ledger: dict = {}
    if df.empty or "CopySession" not in df.columns:
        return ledger

    scoped = df[df["CopySession"] > 0]
    if scoped.empty:
        return ledger

    for pid, p_group in scoped.groupby("PlayerID", sort=False):
        confs_payload = []
        roll_sold = roll_live = roll_open = 0
        sold_prices = []

        present_confs = (
            p_group.groupby("Conference")["CopySession"]
            .apply(lambda s: sorted(set(int(x) for x in s)))
            .to_dict()
        )

        ordered_conf_ids = [
            cid for cid in CONF_DISPLAY_ORDER
            if any(
                CONF_CODE_TO_ID.get(_safe_str(code), "") == cid
                for code in present_confs.keys()
            )
        ]

        for conf_id in ordered_conf_ids:
            conf_code = next(
                code for code in present_confs.keys()
                if CONF_CODE_TO_ID.get(_safe_str(code), "") == conf_id
            )
            sessions = present_confs[conf_code]
            copies = []
            seen_sessions = set()
            for session in sessions:
                seen_sessions.add(int(session))
                group = scoped[
                    (scoped["PlayerID"] == pid)
                    & (scoped["Conference"] == conf_code)
                    & (scoped["CopySession"] == session)
                ].sort_values("Timestamp")
                copy = _build_copy_record(conf_id, int(session), group)
                copies.append(copy)
                if copy["status"] == "sold":
                    roll_sold += 1
                    if copy["maxBid"] is not None:
                        sold_prices.append(copy["maxBid"])
                elif copy["status"] == "live":
                    roll_live += 1
                else:
                    roll_open += 1

            # Fill any remaining design slots up to COPIES_PER_CONFERENCE as
            # 'open' so the UI always shows the full copy count per conf.
            n = max(seen_sessions) if seen_sessions else 0
            while len(copies) < COPIES_PER_CONFERENCE:
                n += 1
                copies.append({
                    "id": f"{conf_id}-{n}",
                    "conf": conf_id,
                    "n": n,
                    "status": "open",
                    "bids": [],
                    "maxBid": None,
                    "leader": None,
                })
                roll_open += 1

            confs_payload.append({"conf": conf_id, "copies": copies})

        total = roll_sold + roll_live + roll_open
        avg = (
            int(round(sum(sold_prices) / len(sold_prices)))
            if sold_prices else None
        )
        high = int(max(sold_prices)) if sold_prices else None

        ledger[str(pid)] = {
            "confs": confs_payload,
            "roll": {
                "sold": roll_sold,
                "live": roll_live,
                "open": roll_open,
                "total": total,
                "avg": avg,
                "high": high,
            },
        }
    return ledger


def _build_copy_record(conf_id: str, session: int, group: pd.DataFrame) -> dict:
    """Build one copy record (status + bid history) from its event rows."""
    won_rows = group[group["TransactionType"] == "AUCTION_WON"]
    bid_rows = group[group["TransactionType"] == "AUCTION_BID"]
    init_rows = group[group["TransactionType"] == "AUCTION_INIT"]

    status = "sold" if not won_rows.empty else "live" if (
        not bid_rows.empty or not init_rows.empty
    ) else "open"

    bids: list = []
    prev_amount = None
    timeline = pd.concat([init_rows, bid_rows]).sort_values("Timestamp")
    for i, (_, row) in enumerate(timeline.iterrows()):
        amount = float(row.get("BidAmount", 0) or 0)
        ts_raw = _safe_str(row.get("Timestamp"))
        bids.append({
            "team": _safe_str(row.get("FranchiseID")),
            "owner": "",
            "amount": amount,
            "ts": ts_raw,
            "rel": "",
            "delta": None if prev_amount is None else amount - prev_amount,
            "nomination": row.get("TransactionType") == "AUCTION_INIT",
        })
        prev_amount = amount

    leader = None
    max_bid = None
    if bids:
        leader = bids[-1]["team"]
        max_bid = bids[-1]["amount"]
    if status == "sold" and not won_rows.empty:
        win = won_rows.iloc[-1]
        leader = _safe_str(win.get("FranchiseID"))
        max_bid = float(win.get("BidAmount", 0) or 0)

    return {
        "id": f"{conf_id}-{session}",
        "conf": conf_id,
        "n": session,
        "status": status,
        "bids": bids,
        "maxBid": max_bid,
        "leader": leader,
    }


def _build_tracked_list(players: dict, ledger: dict) -> list:
    """Build the searchable recruit list ordered by recruit score, descending."""
    rows = []
    for pid, ledger_entry in ledger.items():
        p = players.get(pid)
        if not p:
            continue
        rows.append({
            "id": pid,
            "name": p["name"],
            "pos": p["pos"],
            "posRank": p["posRank"],
            "stars": p["stars"],
            "score": p["score"],
            "roll": ledger_entry["roll"],
        })
    rows.sort(key=lambda r: r.get("score") or 0, reverse=True)
    return rows


def build_copy_tracker_payload(year: Optional[int]) -> dict:
    """Build the full Copy Tracker iframe payload."""
    raw = load_live_auction()
    if not raw.empty and year is not None and "AuctionYear" in raw.columns:
        raw = raw[raw["AuctionYear"] == year].copy()
    if not raw.empty and "IsRookie" in raw.columns:
        raw = raw[raw["IsRookie"]].copy()

    df = prepare_data(raw)
    board = _board_lookup(year)
    franchises = _franchise_lookup_indexed()

    won_df = df[df["TransactionType"] == "AUCTION_WON"] if not df.empty else df
    spent_by_fid = {}
    if not won_df.empty:
        agg = won_df.groupby("FranchiseID")["BidAmount"].sum()
        spent_by_fid = {str(k): float(v) for k, v in agg.items()}
    budgets = fetch_auction_budgets(year) if year else {}

    teams = build_teams(franchises, budgets, spent_by_fid)
    players = build_players(df, board)
    ledger = _build_copy_ledger(df, players)
    tracked = _build_tracked_list(players, ledger)

    conf_name = {cid: CONF_NAME_BY_ID[cid] for cid in CONF_DISPLAY_ORDER}

    return {
        "TEAMS": teams,
        "PLAYERS": players,
        "POS_COLORS": POS_COLORS,
        "CONF_ACCENT": CONF_ACCENT,
        "CONF_NAME": conf_name,
        "CONF_ORDER": CONF_DISPLAY_ORDER,
        "COPY_LEDGER": ledger,
        "TRACKED": tracked,
        "STATUS_META": STATUS_META,
        "year": year,
    }
