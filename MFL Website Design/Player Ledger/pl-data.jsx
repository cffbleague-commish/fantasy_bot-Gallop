// CFFB · Player Ledger — multi-year ownership + transaction model
// ---------------------------------------------------------------------------
// This panel is scoped to ONE player at a time and answers, across seasons:
//   "Who owns each copy of this player right now, and how did each copy change
//    hands?" — the full transaction ledger, plus the player's eligibility,
//    redshirt status, and awards.
//
// A player exists as several COPIES (Copy 1..N). Each copy is held by exactly
// one fantasy-manager team at a time (branded as a college program), or sits in
// free agency. A copy's life is a chronological LEDGER of three event types:
//
//   auction   → won at the devy/free-agent auction. Sets a new owner. Carries $.
//   redshirt  → owning team redshirted the player that season (trad or medical).
//               Does NOT change ownership — a status note on the held copy.
//   drop      → owner released the copy back to free agency. Owner → none.
//
// The CURRENT owner is whoever holds the copy after the last event. Reuses
// TEAMS / PLAYERS / CONFERENCES / CONF_ACCENT / POS_COLORS from the board data.
// ---------------------------------------------------------------------------

const CURRENT_SEASON = 2025;
const CLASS_SEQ = ['FR', 'SO', 'JR', 'SR', 'GR'];

// Derive a copy's OWN eligibility clock. The clock spans the player's full
// college career (entered → now), but each copy diverges via its own redshirts:
//   • Each enrolled season is 'used' (played), or 'rs'/'rs-med' if this copy (or
//     the player's real career, realRS) redshirted it — a preserved year.
//   • Play-seasons allowed = 4, +1 if the copy ever redshirted (a redshirt
//     grants a 5th year).
//   • remaining = allowed − play-seasons already used (before the current one).
//     A copy is out of eligibility when remaining ≤ 0.
const deriveElig = (ledger, entered, realRS) => {
  const real = new Set(realRS || []);
  const copyRS = {};
  ledger.forEach((e) => { if (e.type === 'redshirt') copyRS[e.season] = (e.rsType === 'med' ? 'rs-med' : 'rs'); });

  const first = entered != null ? entered : CURRENT_SEASON;
  const dots = [];
  let usedPast = 0, rsCount = 0;
  for (let y = first; y <= CURRENT_SEASON; y++) {
    let state;
    if (copyRS[y]) state = copyRS[y];
    else if (real.has(y)) state = 'rs';
    else state = 'used';
    dots.push(state);
    if (state === 'used' && y < CURRENT_SEASON) usedPast += 1;
    if (state !== 'used') rsCount += 1;
  }
  const allowed = 4 + (rsCount > 0 ? 1 : 0);
  const remaining = allowed - usedPast;            // includes the current season

  // class from play-seasons used (incl. current): 0→FR … 4+→GR
  const playSoFar = dots.filter((d) => d === 'used').length;
  const cls = CLASS_SEQ[Math.min(Math.max(playSoFar - 1, 0), 4)];

  // display dots: enrolled seasons + open future seasons (beyond current), cap 6
  const futureOpen = Math.max(0, remaining - 1);
  const dotsOut = dots.concat(Array.from({ length: futureOpen }, () => 'open')).slice(0, 6);

  const remain = remaining <= 0 ? 'No eligibility'
    : remaining === 1 ? 'Final year'
    : remaining + ' left';
  const rsYears = [...Object.keys(copyRS).map(Number), ...(realRS || [])].sort((a, b) => a - b);
  const hasRS = rsCount > 0;
  const rsType = Object.values(copyRS).some((v) => v === 'rs-med') ? 'med' : 'trad';
  const rsYear = rsYears.length ? rsYears[rsYears.length - 1] : null;
  return { cls, dots: dotsOut, remain, remaining, hasRS, rsType, rsYear };
};

// Expand one compact copy authoring into a rich object.
// events: chronological list. Shapes:
//   ['auction',  season, teamId, price, note?]
//   ['redshirt', season, teamId, 'trad'|'med', note?]
//   ['drop',     season, teamId, note?]
// awards: the player's career awards; any won while THIS copy was held get
// injected into its ledger as 'award' events, attributed to the holding team.
// entered/realRS describe the player's college career (for the eligibility clock).
// declareAt: award count at which a copy "declares early" (terminal, NFL-bound).
const makeCopy = (pid, conf, n, events, awards, entered, realRS) => {
  let holder = null;
  let acquired = null; // the auction event that set the current holder
  let redshirtingNow = false;

  const ledger = events.map((ev) => {
    const [type, season] = ev;
    if (type === 'auction') {
      const [, , team, price, note] = ev;
      holder = team;
      acquired = { team, price, season };
      return { type, season, team, owner: (TEAMS[team] || {}).owner || '@—',
        price, note: note || null, label: 'WON', tag: 'won' };
    }
    if (type === 'redshirt') {
      const [, , team, rsType, note] = ev;
      if (season === CURRENT_SEASON && holder === team) redshirtingNow = true;
      return { type, season, team, owner: (TEAMS[team] || {}).owner || '@—',
        rsType, note: note || null,
        label: rsType === 'med' ? 'MEDICAL RS' : 'REDSHIRT',
        tag: rsType === 'med' ? 'rs-med' : 'rs' };
    }
    // drop
    const [, , team, note] = ev;
    holder = null;
    acquired = null;
    redshirtingNow = false;
    return { type, season, team, owner: (TEAMS[team] || {}).owner || '@—',
      note: note || null, label: 'RELEASED', tag: 'drop' };
  });

  // Ownership intervals (team-held season spans), used to attribute awards.
  const intervals = [];
  { let o = null, s = null;
    events.forEach((ev) => {
      const [type, season] = ev;
      if (type === 'auction') { if (o != null) intervals.push({ team: o, start: s, end: season - 1 }); o = ev[2]; s = season; }
      else if (type === 'drop') { intervals.push({ team: o, start: s, end: season - 1 }); o = null; s = null; }
    });
    if (o != null) intervals.push({ team: o, start: s, end: CURRENT_SEASON });
  }
  // Inject player awards won while this copy was held by some team.
  (awards || []).forEach((a) => {
    const iv = intervals.find((v) => a.year >= v.start && a.year <= v.end);
    if (!iv) return;
    const tm = TEAMS[iv.team] || {};
    ledger.push({ type: 'award', season: a.year, team: iv.team, owner: tm.owner || '@—',
      award: a, label: 'HONOR', tag: 'award',
      note: `${a.name} ${a.year} — earned while rostered by ${tm.name || iv.team} (${tm.owner || '@—'}).` });
  });
  // Order: by season, then auction → redshirt → award → drop within a season.
  const ORDER = { auction: 0, redshirt: 1, award: 2, drop: 3 };
  ledger.sort((x, y) => (x.season - y.season) || (ORDER[x.type] - ORDER[y.type]));

  const elig = deriveElig(ledger, entered, realRS);
  const honors = ledger.filter((e) => e.type === 'award').length;
  const DECLARE_AT = 2;             // 2+ awards → likely to declare for the draft
  const base = holder == null ? 'fa' : (redshirtingNow ? 'redshirting' : 'rostered');
  // Eligibility exhausted → graduated; else enough hardware → declared early.
  const status = elig.remaining <= 0 ? 'graduated'
    : (honors >= DECLARE_AT ? 'declared' : base);
  const terminal = status === 'graduated' || status === 'declared';
  return {
    id: `${pid}-${conf}-${n}`, n, conf, owner: holder, status, acquired,
    graduated: terminal,            // terminal = retired / not available
    declared: status === 'declared',
    honors, elig,
    seasonsHeld: acquired ? (CURRENT_SEASON - acquired.season + 1) : 0,
    ledger,
  };
};

// ---------------------------------------------------------------------------
// PLAYER LEDGERS — copies authored per player.
// ---------------------------------------------------------------------------
const RAW_COPIES = {
  // ===== Arch Manning — QB1, the marquee devy lot. 12 copies in play. ======
  // ===== Arch Manning — QB1, the marquee devy lot. 2 copies × 6 conferences. =
  arch: {
    sec: [
      [ ['auction', 2023, 'TEX', 78, 'Inaugural devy auction — Texas landed the franchise QB for $78.'],
        ['redshirt', 2023, 'TEX', 'trad', 'Sat the year behind Quinn Ewers. Traditional redshirt — eligibility preserved.'] ],
      [ ['auction', 2024, 'UF', 132, 'Record devy price. Florida went all-in on the post-Ewers starter.'] ] ],
    b1g: [
      [ ['auction', 2023, 'OSU', 70, 'Ohio State bet early on the bloodline.'],
        ['redshirt', 2024, 'OSU', 'trad', 'Banked a year mid-career to extend the keeper window.'] ],
      [ ['auction', 2024, 'MICH', 66],
        ['redshirt', 2025, 'MICH', 'trad', 'Stashing this season — Michigan redshirts the copy to stretch its value.'] ] ],
    acc: [
      [ ['auction', 2023, 'CLEM', 61],
        ['drop', 2025, 'CLEM', 'Clemson freed the cap mid-rebuild and let the copy walk.'] ],
      [ ['auction', 2024, 'MIA', 71, 'Miami added QB depth late on auction night.'] ] ],
    big12: [
      [ ['auction', 2023, 'UTAH', 48],
        ['redshirt', 2023, 'UTAH', 'trad', 'Utah redshirted immediately and has held ever since.'] ],
      [ ['auction', 2023, 'BYU', 54],
        ['drop', 2024, 'BYU', 'BYU flipped out after one season.'],
        ['auction', 2024, 'TCU', 44, 'TCU took a flier on the discounted copy.'] ] ],
    aac: [
      [ ['auction', 2024, 'ARMY', 36, 'Army grabbed value below the marquee tier.'] ],
      [ ['auction', 2023, 'NAVY', 40],
        ['drop', 2025, 'NAVY', 'Navy cleared the cap and let the copy hit the wire.'] ] ],
    pac: [
      [ ['auction', 2024, 'ORST', 33, 'Oregon State grabbed depth at a discount.'] ],
      [ ['auction', 2023, 'WSU', 38],
        ['redshirt', 2025, 'WSU', 'med', 'Shoulder cleanup — Washington State files a medical redshirt.'] ] ],
  },

  // ===== Jeremiah Smith — WR1, sophomore phenom. Award copies declare early. =
  smith: {
    b1g: [
      [ ['auction', 2024, 'OSU', 96, 'Ohio State drafted the hometown phenom as a true freshman.'] ],
      [ ['auction', 2024, 'MICH', 88],
        ['drop', 2025, 'MICH', 'Michigan freed cap for a QB run — released a top-5 asset.'],
        ['auction', 2025, 'PSU', 94, 'Penn State pounced the moment the copy hit the wire.'] ] ],
    sec: [
      [ ['auction', 2024, 'UGA', 92, 'Georgia spent big on the sophomore phenom.'] ],
      [ ['auction', 2025, 'TEX', 90, 'Texas paid a premium to add a WR1 ceiling after the award run.'] ] ],
  },

  // ===== Travis Hunter — ATH Heisman unicorn. Award copies declared early. =
  hunter: {
    acc: [
      [ ['auction', 2023, 'CLEM', 97, 'Clemson invested in the two-way unicorn before the Heisman run.'] ],
      [ ['auction', 2023, 'UNC', 84],
        ['drop', 2024, 'UNC', 'UNC released the copy late in the title window for cap relief.'] ] ],
    big12: [
      [ ['auction', 2024, 'TCU', 102, 'TCU paid the post-Heisman premium — priciest copy on the board.'] ],
      [ ['auction', 2023, 'UTAH', 88],
        ['drop', 2025, 'UTAH', 'Utah cashed out the aging star for cap space.'] ] ],
  },

  // ===== Caleb Downs — DB1, do-it-all safety ===============================
  downs: {
    b1g: [
      [ ['auction', 2024, 'OSU', 41, 'Ohio State reunited Downs with the Buckeye fantasy room.'] ],
      [ ['auction', 2024, 'MICH', 38],
        ['redshirt', 2024, 'MICH', 'trad', 'Stashed a year behind a senior safety.'] ] ],
    sec: [
      [ ['auction', 2024, 'UGA', 44, 'Georgia added the do-it-all safety at home.'] ],
      [ ['auction', 2024, 'TEX', 47],
        ['redshirt', 2024, 'TEX', 'trad', 'Banked eligibility as a true freshman.'] ] ],
  },

  // ===== Jeremiyah Love — RB, explosive sophomore =========================
  love: {
    b1g: [
      [ ['auction', 2024, 'OSU', 52, 'Ohio State bet early on the breakout back.'] ],
      [ ['auction', 2024, 'ORE', 48],
        ['drop', 2025, 'ORE', 'Logjam at RB — Oregon waived the third back.'] ] ],
    sec: [
      [ ['auction', 2024, 'LSU', 50, 'LSU added explosive backfield depth.'] ],
      [ ['auction', 2024, 'UGA', 46],
        ['drop', 2025, 'UGA', 'Georgia freed cap mid-season.'] ] ],
  },

  // ===== Tetairoa McMillan — WR. Award copies declared early. =============
  golden: {
    big12: [
      [ ['auction', 2023, 'UTAH', 71, 'Utah locked the big-bodied WR for three seasons running.'] ],
      [ ['auction', 2023, 'BYU', 66],
        ['redshirt', 2024, 'BYU', 'trad', 'Preserved a year while buried on a veteran depth chart.'] ] ],
    pac: [
      [ ['auction', 2023, 'ORST', 64, 'Oregon State grabbed the boundary target early.'] ],
      [ ['auction', 2025, 'WSU', 69, 'Washington State added a proven WR1 for the title push.'] ] ],
  },

  // ===== Carson Beck — QB. Played-out copies graduate; redshirts survive. =
  beck: {
    sec: [
      [ ['auction', 2023, 'UGA', 54],
        ['redshirt', 2024, 'UGA', 'med', 'Lost the season to an elbow injury — medical hardship granted.'] ],
      [ ['auction', 2023, 'LSU', 39, 'Veteran insurance — LSU has held him since the rebuild began.'] ] ],
    acc: [
      [ ['auction', 2023, 'MIA', 44, 'Miami rode the veteran arm straight through to the end.'] ],
      [ ['auction', 2023, 'CLEM', 41],
        ['redshirt', 2024, 'CLEM', 'med', 'Clemson redshirted the injury year to preserve eligibility.'] ] ],
  },

  // ===== Ryan Williams — WR, true-frosh fireworks =========================
  will: {
    sec: [
      [ ['auction', 2024, 'BAMA', 61, 'Alabama drafted the in-state freshman to a home room.'] ],
      [ ['auction', 2024, 'LSU', 57],
        ['drop', 2025, 'LSU', 'Salary-cap casualty after a busy auction night.'],
        ['auction', 2025, 'UF', 58, 'Florida grabbed the discounted upside at $58.'] ] ],
    b1g: [
      [ ['auction', 2024, 'OSU', 55, 'Ohio State added explosive perimeter speed.'] ],
      [ ['auction', 2024, 'USC', 52, 'USC bet on the freshman ceiling.'] ] ],
  },
};

// ---------------------------------------------------------------------------
// PLAYER PROFILE AUGMENTATION — bio, eligibility, redshirt, awards.
// elig.dots: 'used' | 'rs' | 'rs-med' | 'open'  (5 dots, NCAA eligibility)
// eligTimeline rows feed the hero season-by-season strip.
// awards.kind: 'heisman' | 'obrien' | 'walker' | 'biletnikoff' | 'allamerican'
// ---------------------------------------------------------------------------
const PLAYER_AUG = {
  arch: {
    college: 'Texas', conf: 'sec', ht: "6'4\"", wt: 215, home: 'New Orleans, LA',
    composite: '.9842', recruitNote: '#1 QB · 2023', entered: 2023,
    elig: { cls: 'JR', dots: ['rs', 'used', 'used', 'open', 'open'], remain: '2 left' },
    eligTimeline: [
      { year: 2022, dot: 'pre',     lbl: 'HS Senior', sub: 'Not enrolled' },
      { year: 2023, dot: 'rs',      lbl: 'RS Freshman', sub: '2 games · year preserved' },
      { year: 2024, dot: 'used',    lbl: 'RS Soph', sub: 'Backup · 4 starts' },
      { year: 2025, dot: 'current', lbl: 'RS Junior', sub: 'Current · QB1' },
      { year: 2026, dot: 'open',    lbl: 'RS Senior', sub: 'Eligible · option' },
    ],
    awards: [{ kind: 'allamerican', name: 'SEC All-American', year: 2024, conf: 'sec' }],
  },
  smith: {
    college: 'Ohio State', conf: 'b1g', ht: "6'3\"", wt: 215, home: 'Miami Gardens, FL',
    composite: '.9971', recruitNote: '#1 WR · 2024', entered: 2024,
    elig: { cls: 'SO', dots: ['used', 'used', 'open', 'open', 'open'], remain: '3 left' },
    eligTimeline: [
      { year: 2023, dot: 'pre',     lbl: 'HS Senior', sub: 'Not enrolled' },
      { year: 2024, dot: 'used',    lbl: 'True Frosh', sub: '1,315 yds · 15 TD' },
      { year: 2025, dot: 'current', lbl: 'Sophomore', sub: 'Current · WR1' },
      { year: 2026, dot: 'open',    lbl: 'Junior', sub: 'Eligible' },
      { year: 2027, dot: 'open',    lbl: 'Senior', sub: 'Eligible' },
    ],
    awards: [
      { kind: 'biletnikoff', name: 'Biletnikoff', year: 2024 },
      { kind: 'allamerican', name: 'Big Ten All-American', year: 2024, conf: 'b1g' },
    ],
  },
  hunter: {
    college: 'Colorado', conf: 'big12', ht: "6'1\"", wt: 185, home: 'West Palm Beach, FL',
    composite: '.9911', recruitNote: '#1 ATH · 2022', entered: 2022,
    elig: { cls: 'SR', dots: ['used', 'used', 'used', 'used', 'open'], remain: '1 left' },
    eligTimeline: [
      { year: 2022, dot: 'used',    lbl: 'True Frosh', sub: 'Two-way debut' },
      { year: 2023, dot: 'used',    lbl: 'Sophomore', sub: 'Lost time to injury' },
      { year: 2024, dot: 'used',    lbl: 'Junior', sub: 'Heisman season' },
      { year: 2025, dot: 'current', lbl: 'Senior', sub: 'Current · CB/WR' },
      { year: 2026, dot: 'open',    lbl: 'Super Senior', sub: 'Eligible · option' },
    ],
    awards: [
      { kind: 'heisman', name: 'Heisman', year: 2024 },
      { kind: 'biletnikoff', name: 'Biletnikoff', year: 2024 },
      { kind: 'allamerican', name: 'Big 12 All-American', year: 2024, conf: 'big12' },
    ],
  },
  downs: {
    college: 'Ohio State', conf: 'b1g', ht: "6'0\"", wt: 205, home: 'Hoschton, GA',
    composite: '.9899', recruitNote: '#1 S · 2023', entered: 2024,
    elig: { cls: 'JR', dots: ['rs', 'used', 'used', 'open', 'open'], remain: '2 left' },
    eligTimeline: [
      { year: 2022, dot: 'pre',     lbl: 'HS Senior', sub: 'Not enrolled' },
      { year: 2023, dot: 'rs',      lbl: 'RS Freshman', sub: 'Redshirt banked' },
      { year: 2024, dot: 'used',    lbl: 'RS Soph', sub: 'All-American' },
      { year: 2025, dot: 'current', lbl: 'RS Junior', sub: 'Current · FS' },
      { year: 2026, dot: 'open',    lbl: 'RS Senior', sub: 'Eligible' },
    ],
    awards: [{ kind: 'allamerican', name: 'Big Ten All-American', year: 2024, conf: 'b1g' }],
  },
  love: {
    college: 'Notre Dame', conf: 'ind', ht: "6'0\"", wt: 206, home: 'St. Louis, MO',
    composite: '.9421', recruitNote: '#3 RB · 2023', entered: 2024,
    elig: { cls: 'SO', dots: ['used', 'used', 'open', 'open', 'open'], remain: '3 left' },
    eligTimeline: [
      { year: 2023, dot: 'used',    lbl: 'True Frosh', sub: 'Rotational back' },
      { year: 2024, dot: 'used',    lbl: 'Sophomore', sub: '1,125 yds · 17 TD' },
      { year: 2025, dot: 'current', lbl: 'Junior', sub: 'Current · RB1' },
      { year: 2026, dot: 'open',    lbl: 'Senior', sub: 'Eligible' },
      { year: 2027, dot: 'open',    lbl: 'Super Senior', sub: 'Eligible' },
    ],
    awards: [{ kind: 'walker', name: 'Doak Walker', year: 2024 }],
  },
  golden: {
    college: 'Arizona', conf: 'big12', ht: "6'5\"", wt: 212, home: 'Waianae, HI',
    composite: '.9588', recruitNote: '#5 WR · 2022', entered: 2022,
    elig: { cls: 'JR', dots: ['used', 'used', 'used', 'open', 'open'], remain: '2 left' },
    eligTimeline: [
      { year: 2022, dot: 'used',    lbl: 'True Frosh', sub: '702 yds' },
      { year: 2023, dot: 'used',    lbl: 'Sophomore', sub: '1,402 yds · 10 TD' },
      { year: 2024, dot: 'used',    lbl: 'Junior', sub: 'Biletnikoff finalist' },
      { year: 2025, dot: 'current', lbl: 'Senior', sub: 'Current · WR1' },
      { year: 2026, dot: 'open',    lbl: 'Super Senior', sub: 'Eligible' },
    ],
    awards: [
      { kind: 'biletnikoff', name: 'Biletnikoff', year: 2023 },
      { kind: 'allamerican', name: 'Big 12 All-American', year: 2023, conf: 'big12' },
    ],
  },
  beck: {
    college: 'Miami', conf: 'acc', ht: "6'4\"", wt: 220, home: 'Jacksonville, FL',
    composite: '.9102', recruitNote: '#7 QB · 2020', entered: 2021,
    elig: { cls: 'SR', dots: ['used', 'used', 'rs-med', 'used', 'open'], remain: '1 left' },
    eligTimeline: [
      { year: 2022, dot: 'used',    lbl: 'Junior', sub: 'Backup reps' },
      { year: 2023, dot: 'used',    lbl: 'Senior', sub: 'Davey O\u2019Brien' },
      { year: 2024, dot: 'rs-med',  lbl: 'Medical RS', sub: 'Elbow · season lost' },
      { year: 2025, dot: 'current', lbl: 'Super Senior', sub: 'Current · transfer' },
      { year: 2026, dot: 'open',    lbl: 'Final Year', sub: 'Eligible · option' },
    ],
    awards: [{ kind: 'obrien', name: 'Davey O\u2019Brien', year: 2023 }],
  },
  will: {
    college: 'Alabama', conf: 'sec', ht: "6'0\"", wt: 175, home: 'Saraland, AL',
    composite: '.9802', recruitNote: '#2 WR · 2024', entered: 2024,
    elig: { cls: 'SO', dots: ['used', 'used', 'open', 'open', 'open'], remain: '3 left' },
    eligTimeline: [
      { year: 2023, dot: 'pre',     lbl: 'HS Junior', sub: 'Reclassified up' },
      { year: 2024, dot: 'used',    lbl: 'True Frosh', sub: '865 yds · 8 TD' },
      { year: 2025, dot: 'current', lbl: 'Sophomore', sub: 'Current · WR1' },
      { year: 2026, dot: 'open',    lbl: 'Junior', sub: 'Eligible' },
      { year: 2027, dot: 'open',    lbl: 'Senior', sub: 'Eligible' },
    ],
    awards: [{ kind: 'allamerican', name: 'SEC All-American', year: 2024, conf: 'sec' }],
  },
};

// ---------------------------------------------------------------------------
// Build the player ledger: copies + roll-up stats.
// ---------------------------------------------------------------------------
const CONF_ORDER = ['sec', 'b1g', 'acc', 'big12', 'pac', 'aac'];
const LEDGER = {};
Object.entries(RAW_COPIES).forEach(([pid, byConf]) => {
  const aug = PLAYER_AUG[pid] || {};
  const confs = CONF_ORDER.filter((c) => byConf[c]).map((conf) => ({
    conf,
    copies: byConf[conf].map((events, i) => makeCopy(pid, conf, i + 1, events, aug.awards, aug.entered, aug.realRS)),
  }));
  const copies = confs.flatMap((c) => c.copies);
  let rostered = 0, redshirting = 0, fa = 0, graduated = 0, declared = 0, txns = 0;
  const heldPrices = [];
  copies.forEach((c) => {
    txns += c.ledger.length;
    if (c.status === 'graduated') graduated += 1;
    else if (c.status === 'declared') declared += 1;
    else if (c.status === 'fa') fa += 1;
    else if (c.status === 'redshirting') redshirting += 1;
    else rostered += 1;
    if (c.acquired && c.status !== 'fa') heldPrices.push(c.acquired.price);
  });
  const avg = heldPrices.length ? Math.round(heldPrices.reduce((a, b) => a + b, 0) / heldPrices.length) : null;
  const high = heldPrices.length ? Math.max(...heldPrices) : null;
  LEDGER[pid] = {
    confs, copies,
    roll: { total: copies.length, confs: confs.length, rostered, redshirting, fa, graduated, declared, txns, avg, high },
  };
});

// Players available to search, ordered by recruit score.
const ROSTER = Object.keys(LEDGER)
  .map((id) => ({ id, ...PLAYERS[id], ...PLAYER_AUG[id], roll: LEDGER[id].roll }))
  .sort((a, b) => b.score - a.score);

const STATUS_META = {
  rostered:    { label: 'Rostered',     color: '#2D7A4E' },
  redshirting: { label: 'Redshirting',  color: '#C9A227' },
  declared:    { label: 'Declared',     color: '#B8902F' },
  graduated:   { label: 'Graduated',    color: '#8B6F1F' },
  fa:          { label: 'Free Agent',   color: '#5A5A5A' },
};

// Transaction-type display metadata for the ledger timeline.
const TXN_META = {
  won:    { color: '#C9A227' },
  rs:     { color: '#C9A227' },
  'rs-med': { color: '#D17575' },
  award:  { color: '#E8C547' },
  drop:   { color: '#B84545' },
  graduate: { color: '#8B6F1F' },
};

const CONF_NAME = Object.fromEntries(CONFERENCES.map((c) => [c.id, c.name]));
const CONF_LOGO = Object.fromEntries(CONFERENCES.map((c) => [c.id, c.logo]));

Object.assign(window, {
  CURRENT_SEASON, LEDGER, ROSTER, PLAYER_AUG, STATUS_META, TXN_META,
  CONF_NAME, CONF_LOGO, CONF_ORDER,
});
