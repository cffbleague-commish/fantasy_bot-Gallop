// CFFB · Copy Tracker — copy ledger + bid histories
// ---------------------------------------------------------------------------
// This component sits BELOW the live auction board. It is scoped to ONE recruit
// at a time and answers: "Where can I still get a copy of this player, and what
// is each copy going for across the conferences?"
//
// Model (per the brief):
//   • A recruit is offered in a subset of conferences.
//   • Each offering conference holds exactly TWO copies (Copy 1 / Copy 2).
//   • Each copy has a status:
//       open    → "Available"   — not yet nominated, no bids
//       live    → "In Process"  — on the block right now, bids accruing
//       sold    → "Sold"        — hammer fell, last bidder won
//   • Each nominated copy carries a bid history (chronological). The FIRST entry
//     is the nomination (the team that put the player up + opening bid).
//
// Bids are authored compactly as [teamId, amount, gapSeconds] and expanded at
// load into { team, owner, amount, ts(clock), gap, delta, idx } with the running
// timeline computed. Reuses TEAMS / PLAYERS / CONFERENCES from the board's data.
// ---------------------------------------------------------------------------

// Draft wall-clock start. Each copy's bids accumulate gaps from its own seed.
const fmtClock = (totalSec) => {
  let h = Math.floor(totalSec / 3600) % 12; if (h === 0) h = 12;
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
const fmtRel = (secAgo) => {
  if (secAgo < 60) return `${secAgo}s ago`;
  const m = Math.floor(secAgo / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
};

// Expand a compact copy into a rich object.
// seedSec = wall-clock seconds the nomination landed (PM, since noon baseline).
// nowSec  = "current" draft clock used for relative timestamps.
const NOW_SEC = 21 * 3600 + 47 * 60 + 30; // 9:47:30 PM draft clock

const makeCopy = (confId, n, raw) => {
  const out = {
    id: `${confId}-${n}`, conf: confId, n, status: raw.status,
    bids: [], maxBid: null, leader: null, hammer: null,
  };
  if (!raw.bids || !raw.bids.length) return out; // open / available
  let t = raw.seed;
  let prev = null;
  raw.bids.forEach(([team, amount, gap, opts], i) => {
    t += gap;
    const entry = {
      idx: i, team, owner: (TEAMS[team] || {}).owner || '@—',
      amount, ts: fmtClock(t), tsSec: t,
      rel: fmtRel(Math.max(1, NOW_SEC - t)),
      delta: prev == null ? null : amount - prev,
      nomination: i === 0,
      by: opts && opts.by ? opts.by : null,    // team that pushed the proxy up
      note: opts && opts.note ? opts.note : null, // commentary on the push
    };
    out.bids.push(entry);
    prev = amount;
  });
  const last = out.bids[out.bids.length - 1];
  out.maxBid = last.amount;
  out.leader = last.team;
  if (raw.status === 'sold') out.hammer = last.team;
  return out;
};

// ---------------------------------------------------------------------------
// COPY LEDGER — authored per recruit. confs maps conferenceId → [copy1, copy2].
// Bidders are drawn from teams inside that conference (its auction room).
// ---------------------------------------------------------------------------
const RAW_LEDGER = {
  // ===== Arch Manning — QB1, the marquee lot. Hot across the board. =========
  arch: {
    sec: [
      { status: 'sold', seed: 19 * 3600 + 4 * 60, bids: [
        ['UF', 95, 0], ['UGA', 104, 38],
        ['TEX', 112, 51, { by: 'UGA', note: 'Georgia kept nudging — Texas had to climb to $112 to answer.' }],
        ['BAMA', 120, 44],
        ['UF', 132, 62, { by: 'TEX', note: "Texas ran it up late; Florida's $132 max proxy barely held on." }] ] },
      { status: 'live', seed: 21 * 3600 + 40 * 60 + 12, bids: [
        ['BAMA', 88, 0], ['LSU', 96, 40],
        ['TEX', 108, 55, { by: 'LSU', note: "LSU's raise forced Texas to commit at $108 to take the lead." }],
        ['TEX', 118, 71, { by: 'BAMA', note: 'Bama re-entered and pushed Texas to $118 to keep the top spot.' }] ] },
    ],
    b1g: [
      { status: 'sold', seed: 19 * 3600 + 22 * 60, bids: [
        ['OSU', 90, 0], ['USC', 99, 47], ['MICH', 107, 39], ['USC', 116, 58] ] },
      { status: 'live', seed: 21 * 3600 + 38 * 60, bids: [
        ['PSU', 72, 0], ['ORE', 84, 52], ['OSU', 96, 64] ] },
    ],
    acc: [
      { status: 'sold', seed: 18 * 3600 + 51 * 60, bids: [
        ['CLEM', 74, 0], ['MIA', 83, 41], ['FSU', 91, 55], ['CLEM', 97, 49] ] },
      { status: 'open' },
    ],
    big12: [
      { status: 'live', seed: 21 * 3600 + 44 * 60 + 6, bids: [
        ['UTAH', 61, 0], ['TCU', 70, 48], ['UTAH', 78, 60] ] },
      { status: 'open' },
    ],
    aac: [
      { status: 'open' },
      { status: 'open' },
    ],
  },

  // ===== Jeremiah Smith — WR1, sophomore phenom. ============================
  smith: {
    sec: [
      { status: 'sold', seed: 19 * 3600 + 12 * 60, bids: [
        ['UGA', 70, 0], ['BAMA', 79, 44], ['TEX', 88, 51],
        ['UGA', 94, 66, { by: 'TEX', note: 'Texas pushed it to $88 — Georgia answered at $94 to close it out.' }] ] },
      { status: 'live', seed: 21 * 3600 + 41 * 60 + 30, bids: [
        ['LSU', 52, 0], ['UF', 61, 49],
        ['BAMA', 67, 58, { by: 'UF', note: 'Florida ran the proxy up; Bama jumped in at $67 to grab the lead.' }] ] },
    ],
    b1g: [
      { status: 'sold', seed: 19 * 3600 + 30 * 60, bids: [
        ['MICH', 74, 0], ['OSU', 82, 40], ['MICH', 88, 55] ] },
      { status: 'live', seed: 21 * 3600 + 43 * 60, bids: [
        ['OSU', 80, 0], ['ORE', 89, 47], ['OSU', 96, 61] ] },
    ],
    acc: [
      { status: 'sold', seed: 18 * 3600 + 58 * 60, bids: [
        ['MIA', 56, 0], ['CLEM', 64, 43], ['LOU', 71, 50] ] },
      { status: 'open' },
    ],
    big12: [
      { status: 'open' },
      { status: 'open' },
    ],
  },

  // ===== Travis Hunter — ATH, two-way unicorn. =============================
  hunter: {
    acc: [
      { status: 'sold', seed: 19 * 3600 + 2 * 60, bids: [
        ['CLEM', 78, 0], ['MIA', 87, 45], ['FSU', 94, 52],
        ['CLEM', 97, 60, { by: 'FSU', note: 'FSU forced the issue at $94 — Clemson re-took it for $97.' }] ] },
      { status: 'live', seed: 21 * 3600 + 45 * 60, bids: [
        ['MIA', 84, 0], ['UNC', 93, 41],
        ['MIA', 102, 58, { by: 'UNC', note: 'UNC pushed Miami past $100 — Miami held the lead at $102.' }] ] },
    ],
    sec: [
      { status: 'sold', seed: 19 * 3600 + 19 * 60, bids: [
        ['LSU', 81, 0], ['UGA', 90, 49], ['TEX', 99, 55], ['UGA', 108, 63] ] },
      { status: 'open' },
    ],
    b1g: [
      { status: 'live', seed: 21 * 3600 + 39 * 60, bids: [
        ['USC', 70, 0], ['ORE', 79, 50], ['OSU', 88, 64] ] },
      { status: 'open' },
    ],
    big12: [
      { status: 'open' },
      { status: 'open' },
    ],
  },

  // ===== Ryan Williams — WR, explosive sophomore. ==========================
  will: {
    sec: [
      { status: 'sold', seed: 19 * 3600 + 8 * 60, bids: [
        ['BAMA', 50, 0], ['UGA', 57, 42], ['TEX', 61, 55] ] },
      { status: 'live', seed: 21 * 3600 + 42 * 60, bids: [
        ['BAMA', 58, 0], ['LSU', 64, 47], ['BAMA', 67, 59] ] },
    ],
    b1g: [
      { status: 'live', seed: 21 * 3600 + 40 * 60, bids: [
        ['ORE', 41, 0], ['USC', 48, 51], ['ORE', 53, 60] ] },
      { status: 'open' },
    ],
    acc: [
      { status: 'open' },
      { status: 'open' },
    ],
  },

  // ===== Caleb Downs — DB1, do-it-all safety. ==============================
  downs: {
    sec: [
      { status: 'sold', seed: 19 * 3600 + 15 * 60, bids: [
        ['TEX', 39, 0], ['UGA', 44, 46], ['TEX', 47, 58] ] },
      { status: 'open' },
    ],
    b1g: [
      { status: 'sold', seed: 19 * 3600 + 33 * 60, bids: [
        ['OSU', 35, 0], ['MICH', 39, 44], ['OSU', 41, 57] ] },
      { status: 'live', seed: 21 * 3600 + 46 * 60, bids: [
        ['PSU', 30, 0], ['MICH', 36, 49], ['USC', 42, 62] ] },
    ],
    pac: [
      { status: 'live', seed: 21 * 3600 + 44 * 60, bids: [
        ['ORST', 33, 0], ['WSU', 41, 53], ['WSU', 49, 61] ] },
      { status: 'open' },
    ],
  },

  // ===== Lighter ledgers so search has depth ==============================
  uw: {
    b1g: [
      { status: 'sold', seed: 19 * 3600 + 25 * 60, bids: [
        ['ORE', 32, 0], ['MICH', 38, 45] ] },
      { status: 'live', seed: 21 * 3600 + 43 * 60, bids: [
        ['MICH', 38, 0], ['PSU', 44, 52] ] },
    ],
    sec: [ { status: 'open' }, { status: 'open' } ],
  },
  golden: {
    big12: [
      { status: 'sold', seed: 19 * 3600 + 28 * 60, bids: [
        ['BYU', 60, 0], ['UTAH', 66, 47], ['UTAH', 71, 55] ] },
      { status: 'live', seed: 21 * 3600 + 45 * 60, bids: [
        ['UTAH', 65, 0], ['TCU', 71, 50] ] },
    ],
    acc: [ { status: 'sold', seed: 19 * 3600 + 5 * 60, bids: [ ['LOU', 62, 0], ['CLEM', 69, 48] ] }, { status: 'open' } ],
  },
  love: {
    b1g: [
      { status: 'live', seed: 21 * 3600 + 41 * 60, bids: [ ['ORE', 44, 0], ['OSU', 52, 53] ] },
      { status: 'open' },
    ],
    sec: [ { status: 'sold', seed: 19 * 3600 + 10 * 60, bids: [ ['LSU', 48, 0], ['UGA', 52, 49] ] }, { status: 'open' } ],
  },
  egbuka: {
    b1g: [
      { status: 'sold', seed: 19 * 3600 + 20 * 60, bids: [ ['OSU', 40, 0], ['USC', 44, 46] ] },
      { status: 'live', seed: 21 * 3600 + 44 * 60, bids: [ ['USC', 51, 0], ['ORE', 58, 55] ] },
    ],
    sec: [ { status: 'open' }, { status: 'open' } ],
  },
  moore: {
    b1g: [
      { status: 'sold', seed: 19 * 3600 + 31 * 60, bids: [ ['PSU', 28, 0], ['ORE', 35, 48] ] },
      { status: 'open' },
    ],
  },
  beck: {
    sec: [
      { status: 'live', seed: 21 * 3600 + 46 * 60, bids: [ ['UGA', 48, 0], ['LSU', 54, 52] ] },
      { status: 'open' },
    ],
  },
};

// Conference display order in the summary.
const CONF_ORDER = ['sec', 'b1g', 'acc', 'big12', 'pac', 'aac'];

// Build the full per-recruit ledger: { recruitId: { confs:[{conf, copies:[...]}], roll } }
const COPY_LEDGER = {};
Object.entries(RAW_LEDGER).forEach(([pid, byConf]) => {
  const confs = CONF_ORDER.filter((c) => byConf[c]).map((cid) => {
    const copies = byConf[cid].map((raw, i) => makeCopy(cid, i + 1, raw));
    return { conf: cid, copies };
  });
  // roll-up stats across all copies
  let sold = 0, live = 0, open = 0, total = 0;
  const soldPrices = [];
  confs.forEach((c) => c.copies.forEach((cp) => {
    total += 1;
    if (cp.status === 'sold') { sold += 1; soldPrices.push(cp.maxBid); }
    else if (cp.status === 'live') live += 1;
    else open += 1;
  }));
  const avg = soldPrices.length ? Math.round(soldPrices.reduce((a, b) => a + b, 0) / soldPrices.length) : null;
  const high = soldPrices.length ? Math.max(...soldPrices) : null;
  COPY_LEDGER[pid] = { confs, roll: { sold, live, open, total, avg, high } };
});

// Recruits available to the search, ordered by marquee value (score).
const TRACKED = Object.keys(COPY_LEDGER)
  .map((id) => ({ id, ...PLAYERS[id], roll: COPY_LEDGER[id].roll }))
  .sort((a, b) => b.score - a.score);

const CONF_NAME = Object.fromEntries(CONFERENCES.map((c) => [c.id, c.name]));
const CONF_LOGO = Object.fromEntries(CONFERENCES.map((c) => [c.id, c.logo]));

const STATUS_META = {
  open: { label: 'Available',  color: '#5A5A5A' },
  live: { label: 'In Process', color: '#2D7A4E' },
  sold: { label: 'Sold',       color: '#C9A227' },
};

Object.assign(window, {
  COPY_LEDGER, TRACKED, CONF_ORDER, CONF_NAME, CONF_LOGO, STATUS_META, fmtRel,
});
