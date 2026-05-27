/**
 * RECRUITING ANALYTICS - DUAL-ANALYST WRITE-UPS
 * Generates narrative recruiting class summaries in two distinct analyst voices:
 *   - Kirk Herbstreit: Analytical, measured, stat-driven (weights efficiency 60%)
 *   - Lee Corso: Enthusiastic, bold, personality-driven (weights talent 80% + star bonus)
 *
 * Each analyst assigns their own prototypical grade reflecting their evaluation style.
 * Phrase variation pools prevent repetitive language across teams.
 */

// ============================================================================
// HELPERS
// ============================================================================

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function gradeTier(grade) {
  if (grade === "A+" || grade === "A" || grade === "A-") return "elite";
  if (grade === "B+" || grade === "B" || grade === "B-") return "good";
  if (grade === "C+" || grade === "C" || grade === "C-") return "mixed";
  return "poor";
}

function getTopRecruit(players) {
  var best = null;
  players.forEach(function(p) {
    if (!best || p.recruitScore > best.recruitScore) best = p;
  });
  return best;
}

function getBestValue(players) {
  var best = null;
  players.forEach(function(p) {
    if (p.savingsDollars !== null && (!best || p.savingsDollars > best.savingsDollars)) best = p;
  });
  return best && best.savingsDollars > 0 ? best : null;
}

function getWorstValue(players) {
  var worst = null;
  players.forEach(function(p) {
    if (p.savingsDollars !== null && (!worst || p.savingsDollars < worst.savingsDollars)) worst = p;
  });
  return worst && worst.savingsDollars < -3 ? worst : null;
}

function buildStarSummary(starBreakdown) {
  var labels = { 5: "five-star", 4: "four-star", 3: "three-star", 2: "two-star", 1: "one-star" };
  var parts = [];
  [5, 4, 3, 2, 1].forEach(function(s) {
    if (starBreakdown[s] > 0) parts.push(starBreakdown[s] + " " + labels[s]);
  });
  if (parts.length === 0) return "no rated";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] + " and " + parts[1];
  return parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1];
}

function starsLabel(n) {
  var labels = { 5: "5-Star", 4: "4-Star", 3: "3-Star", 2: "2-Star", 1: "1-Star" };
  return labels[n] || n + "-Star";
}

// ============================================================================
// ANALYST-SPECIFIC GRADES
// ============================================================================

function calcHerbstreitGrade(franchise) {
  var score = (franchise.talentPct || 0) * 0.40 + (franchise.efficiencyPct || 0) * 0.60;
  return applyGradeThresholds(score);
}

function calcCorsoGrade(franchise) {
  var score = (franchise.talentPct || 0) * 0.80 + (franchise.efficiencyPct || 0) * 0.20;
  var fiveStarBonus = Math.min((franchise.starBreakdown[5] || 0) * 5, 15);
  score = Math.min(score + fiveStarBonus, 100);
  return applyGradeThresholds(score);
}

function applyGradeThresholds(score) {
  var thresholds = [
    { grade: "A+", minPct: 95 },
    { grade: "A",  minPct: 90 },
    { grade: "A-", minPct: 85 },
    { grade: "B+", minPct: 75 },
    { grade: "B",  minPct: 65 },
    { grade: "B-", minPct: 55 },
    { grade: "C+", minPct: 45 },
    { grade: "C",  minPct: 35 },
    { grade: "C-", minPct: 25 },
    { grade: "D+", minPct: 15 },
    { grade: "D",  minPct: 8 },
    { grade: "D-", minPct: 3 },
    { grade: "F",  minPct: 0 }
  ];
  for (var i = 0; i < thresholds.length; i++) {
    if (score >= thresholds[i].minPct) return thresholds[i].grade;
  }
  return "F";
}

// ============================================================================
// HERBSTREIT PHRASE POOLS
// ============================================================================

var HERBIE = {
  openers: {
    elite: [
      "When you look at {team}'s class,",
      "If you break down what {team} did in this auction,",
      "Let's talk about {team} —",
      "{team} is one of the stories of this draft class.",
      "You have to be impressed with what {team} put together here.",
      "This is a class that jumps off the page for {team}."
    ],
    good: [
      "When you look at {team}'s class,",
      "{team} put together a solid class here.",
      "If you break down {team}'s haul,",
      "There's a lot to like about what {team} did.",
      "{team} is an interesting case study this year.",
      "Credit to {team} for putting together a quality class."
    ],
    mixed: [
      "{team} is a bit of a mixed bag when you break it down.",
      "When you look at {team}'s class, there are some questions.",
      "{team}'s class has some highs and lows worth discussing.",
      "It's hard to get a clear read on {team}'s class.",
      "There are things to like and things to question about {team}'s haul.",
      "{team} had an up-and-down auction this year."
    ],
    poor: [
      "{team} is going to have to answer some questions about this class.",
      "When you look at {team}'s numbers, it's hard to feel great about this class.",
      "{team} has some work to do after this auction.",
      "This is a class that raises some concerns for {team}.",
      "I think {team} would probably like a do-over on parts of this auction.",
      "{team} struggled to find their footing in this auction."
    ]
  },
  gradeIntro: [
    "I'm giving this class a {grade}.",
    "This is a {grade} in my book.",
    "I've got them at a {grade}.",
    "My grade here is a {grade}.",
    "I'm putting a {grade} on this class."
  ],
  rankContext: [
    "They rank {rank} out of {total} teams and {confRank} in the {conf}.",
    "That puts them at {rank} overall out of {total} and {confRank} in the {conf}.",
    "That's good for {rank} out of {total} league-wide and {confRank} in the {conf}.",
    "Slotting in at {rank} of {total} overall, {confRank} in the {conf}."
  ],
  talentLine: [
    "They posted a class score of {score}, coming away with {stars} across {count} selections.",
    "With a class score of {score}, they landed {stars} in {count} total picks.",
    "A class score of {score} — they brought in {stars} across {count} picks.",
    "Their {count} selections produced a class score of {score}, featuring {stars}."
  ],
  headliner: [
    "The headliner is {player} ({pos}, {star}) with a recruit score of {rs} — earning a {grade} player grade.",
    "Their top prospect is {player} ({pos}, {star}), carrying a recruit score of {rs} and a {grade} player grade.",
    "At the top of the class you've got {player} ({pos}, {star}) — recruit score of {rs}, {grade} player grade.",
    "Leading the way is {player} ({pos}, {star}), graded at {rs} with a {grade} from us."
  ],
  valueLead: [
    "The numbers tell you they were disciplined too —",
    "When you dig into the value,",
    "From a cost standpoint,",
    "The efficiency numbers are telling —",
    "Looking at the value side of things,"
  ],
  bestValueLine: [
    "{player} was their best pickup at {savings} saved versus expected cost.",
    "their best value was {player}, saving {savings} against projections.",
    "{player} stands out as the steal of the class at {savings} in savings.",
    "the biggest bargain was {player} at {savings} below expected price."
  ],
  overpayLead: [
    "Their biggest overpay was {player} at {savings},",
    "The one miss was {player} at {savings},",
    "Where they got hurt was {player} at {savings},",
    "The overpay to watch was {player} at {savings},"
  ],
  overpayFollow: {
    elite: [
      "but that's a manageable miss in an otherwise excellent class.",
      "but in the context of this haul, that's a minor blemish.",
      "though the overall value more than makes up for it."
    ],
    good: [
      "but that didn't derail what was a solid overall effort.",
      "which is something to watch, but the class still grades out well.",
      "though the rest of the class offsets that."
    ],
    mixed: [
      "and that's the kind of thing that drags a class down.",
      "which is part of why this class is hard to evaluate.",
      "and that hurt their overall efficiency numbers."
    ],
    poor: [
      "and that's emblematic of the issues with this class.",
      "and unfortunately that wasn't the only miss.",
      "which really hurt their bottom line."
    ]
  },
  efficiencyLine: [
    "At {savings} per player on ${total} total spent, that's {grade} efficiency.",
    "They averaged {savings} per player across ${total} in spending — {grade} efficiency.",
    "The efficiency comes in at {savings} per player on ${total} spent, earning a {grade}.",
    "Spending ${total} total with {savings} average savings per pick — that's {grade} efficiency."
  ],
  closings: {
    elite: [
      "This class checks both boxes — talent and discipline. That's how you build a program.",
      "This is a textbook auction performance. You can't ask for much more than that.",
      "When you put it all together, this is one of the best classes in the league.",
      "Everything came together here. This is an elite recruiting effort.",
      "Top to bottom, this is exactly what you want to see from a front office."
    ],
    good: [
      "This is a solid foundation to build on. Good work by the front office.",
      "Not a perfect class, but a good one. They should feel good about this.",
      "There's real value here. This class should contribute early and often.",
      "A well-rounded effort that gives them pieces to work with going forward.",
      "Good class. Not flashy, but the kind of steady work that wins over time."
    ],
    mixed: [
      "There's talent here, but the inconsistency is a concern going forward.",
      "It's a class with upside, but also some real questions to answer.",
      "They'll need some of these picks to develop to justify the investment.",
      "A class that could look better or worse depending on how these players pan out.",
      "Some good pieces, but the overall picture is uneven."
    ],
    poor: [
      "This class needs development, and it's going to take patience.",
      "It's a tough grade, but the numbers don't lie. They need to be better here.",
      "There's a lot of ground to make up. This class needs some wins to turn things around.",
      "Frankly, this is a class that's behind the curve. They'll need to find value elsewhere.",
      "A disappointing effort. You have to wonder if a different approach was available."
    ]
  }
};

// ============================================================================
// CORSO PHRASE POOLS
// ============================================================================

var CORSO = {
  openers: {
    elite: [
      "WHOA! {team} absolutely CRUSHED this auction, folks!",
      "Let me tell you something — {team} came to PLAY!",
      "Baby!! {team} put on a SHOW in this auction!",
      "Hold on, hold on — {team}?! This class is UNBELIEVABLE!",
      "OH MY! {team} went out and got it DONE, sweetheart!",
      "Folks, {team} just put together a CLASS! And I mean a CLASS!"
    ],
    good: [
      "Hey hey hey! {team} put together a nice class here!",
      "I like what {team} did! This is a SOLID class, folks!",
      "You know what? {team} did their homework on this one!",
      "Give {team} some credit here — this is a good-looking class!",
      "Alright alright alright! {team} showed up to the auction!",
      "{team} came ready! I like this class, baby!"
    ],
    mixed: [
      "Not so fast, my friend! {team}'s class has some questions...",
      "Ehhh, I don't know about {team}'s class, folks...",
      "Look, {team} had some good moments, but also some head-scratchers.",
      "{team}... I want to like this class, but I'm not sure yet!",
      "Hmm, {team}. There's some good and some not-so-good here, sweetheart.",
      "I'll tell you what — {team}'s class is ALL over the place!"
    ],
    poor: [
      "Uh oh! {team}'s got some work to do, sweetheart!",
      "Oh boy... {team}, what happened here?!",
      "Not so fast, my friend! {team}'s class is in TROUBLE!",
      "Yikes! {team} is going to want to forget this auction!",
      "I hate to say it, but {team}... this ain't it, baby!",
      "Woof! {team} had a ROUGH day at the auction!"
    ]
  },
  gradeIntro: {
    elite: [
      "Corso's giving this class an {grade}!",
      "That's an {grade} from me, baby!",
      "I'm slapping an {grade} on this class!",
      "You KNOW this is an {grade}!",
      "An {grade} — and they EARNED it!"
    ],
    good: [
      "I've got them at a {grade} — and I feel good about it!",
      "That's a {grade} from Corso!",
      "I'm giving this class a {grade}. Solid work!",
      "A {grade} for this class — not bad at all!",
      "Corso says {grade}! I can live with that!"
    ],
    mixed: [
      "I'm giving them a {grade}... and that might be generous.",
      "That's a {grade} from me. Could go either way, folks.",
      "A {grade}. I wanted to go higher, but the numbers won't let me.",
      "Corso's at a {grade} here. It is what it is, sweetheart.",
      "I'll give them a {grade}, but they gotta do better than that."
    ],
    poor: [
      "I hate to do it, but that's a {grade}.",
      "A {grade}. Ouch. That's tough, sweetheart.",
      "Corso's giving this a {grade}... and I'm not happy about it.",
      "That's a {grade} from me. I wish I could go higher, baby.",
      "A {grade}. Not what anybody wants to hear."
    ]
  },
  rankLine: [
    "{rank} in the whole league and number {confRank} in the {conf}!",
    "Coming in at {rank} overall and {confRank} in the {conf}!",
    "That's {rank} in the league and {confRank} in the {conf}, folks!",
    "Ranking {rank} out of {total} and {confRank} in the {conf}!"
  ],
  starHype: {
    hasFiveStars: [
      "They landed {fiveCount} five-star recruits! That's BIG TIME talent right there!",
      "{fiveCount} FIVE-STAR prospects! Are you KIDDING me?!",
      "{fiveCount} five-stars in ONE class! That's how you do it!",
      "FIVE-STAR talent, baby! {fiveCount} of them! I LOVE it!"
    ],
    hasFourStars: [
      "They grabbed {fourCount} four-star recruits — that's GOOD talent!",
      "{fourCount} four-stars! Those are PLAYERS, folks!",
      "With {fourCount} four-star picks, they've got some DUDES!",
      "{fourCount} four-star prospects! That's what I'm talking about!"
    ],
    lowStars: [
      "Not a lot of star power here — just {summary} to work with.",
      "The star ratings aren't jumping off the page — {summary}.",
      "They're rolling with {summary}. Gonna need some of those guys to develop!",
      "The talent haul was modest — {summary}. They'll need some hits."
    ]
  },
  topRecruit: {
    elite: [
      "{player}? Are you kidding me?! A {star} {pos} with a {grade} grade — I LOVE that pick!",
      "{player}! A {star} {pos}! {grade} grade! That is a FRANCHISE player, baby!",
      "And they got {player} — a {star} {pos}, {grade} grade! What a GET!",
      "{player}! {star} {pos}! That's the kind of pick that MAKES a class!"
    ],
    good: [
      "{player} leads the way — {star} {pos}, {grade} grade. Nice pickup!",
      "I like {player} at {star} {pos} with a {grade} grade. That's a good one!",
      "{player} ({star} {pos}, {grade} grade) is a solid headliner for this class!",
      "Their top guy is {player} — {star} {pos}, {grade} grade. I can work with that!"
    ],
    mixed: [
      "{player} is the headliner at {star} {pos}, {grade} grade. Could go either way.",
      "The top pick is {player} ({star} {pos}, {grade} grade)... I need to see more.",
      "{player} leads the class at {star} {pos} with a {grade}. We'll see, folks.",
      "They're counting on {player} ({star} {pos}, {grade}) to lead the way. Hmm."
    ],
    poor: [
      "{player} is the best they got — {star} {pos}, {grade} grade. That's tough.",
      "The headliner is {player} ({star} {pos}, {grade} grade)... not ideal, sweetheart.",
      "{player} at {star} {pos} with a {grade}. When that's your top guy, you're in trouble.",
      "Leading the class is {player} ({star} {pos}, {grade}). They need more than that."
    ]
  },
  bestValueReaction: [
    "And they got {player} for a steal, saving {savings}!",
    "{player} at {savings} below cost?! That's SMART shopping, baby!",
    "STEAL ALERT! {player} at {savings} savings! I LOVE that value!",
    "{player} for {savings} under price?! That's a BARGAIN, sweetheart!"
  ],
  overpayReaction: [
    "Now, they did pay a little too much for {player} at {savings}...",
    "Ooooh, {player} at {savings}? That's gonna sting a little.",
    "Not so fast on {player} — overpaid by {savings} there.",
    "The {player} pick at {savings}? Ehhh, that's a head-scratcher."
  ],
  efficiencyLine: {
    good: [
      "At {savings} savings per player? That's smart shopping, sweetheart!",
      "Averaging {savings} in savings per pick! They know what they're doing!",
      "{savings} per player in savings on ${total} spent! Efficient AND talented!",
      "And get this — {savings} saved per player! The front office did their job!"
    ],
    bad: [
      "But at {savings} per player on ${total} spent... they gotta tighten up the spending.",
      "{savings} per pick on ${total}? They need to be smarter with the budget, baby.",
      "The spending was a little loose at {savings} per player on ${total} total.",
      "At {savings} per player... the checkbook got away from them a little bit."
    ]
  },
  closings: {
    elite: [
      "Put the headgear on — this class is a WINNER!",
      "I'm taking {team} ALL DAY, baby!",
      "This class is the REAL DEAL, sweetheart!",
      "TOUCHDOWN {team}! What a class!",
      "That's a CHAMPIONSHIP-caliber haul right there, folks!",
      "{team} is LOADED! Watch out, league!"
    ],
    good: [
      "I like what they did here. Solid class, folks!",
      "{team}'s gonna be just fine with this class!",
      "Good class! I'd tip my hat to {team} on this one!",
      "Not bad, not bad at all! {team} did their thing!",
      "{team} should feel good about this one, sweetheart!"
    ],
    mixed: [
      "Ehhh, it's a mixed bag. Could go either way, folks!",
      "I want to believe in {team}, but they gotta prove it!",
      "Some good, some bad. The jury's still out on this one!",
      "Not the worst, not the best. {team}'s got work to do!",
      "This class could surprise people... or it could disappoint. We'll see!"
    ],
    poor: [
      "Not so fast, {team}... this class needs some HELP!",
      "Oof. {team} is gonna need a bounce-back next year, baby.",
      "I'm not putting the headgear on for this one, sweetheart.",
      "{team}'s got an uphill climb after this auction.",
      "Tough day at the office for {team}. Back to the drawing board!"
    ]
  }
};

// ============================================================================
// HERBSTREIT WRITE-UP GENERATOR
// ============================================================================

function generateHerbstreitWriteup(franchise, totalTeams) {
  var tier = gradeTier(franchise.herbstreitGrade);
  var team = franchise.franchiseName;
  var parts = [];

  // Opening + grade + rank
  var opener = pickRandom(HERBIE.openers[tier]).replace("{team}", team);
  var gradeIntro = pickRandom(HERBIE.gradeIntro)
    .replace("{grade}", franchise.herbstreitGrade);
  var rankLine = pickRandom(HERBIE.rankContext)
    .replace("{rank}", ordinal(franchise.classRank))
    .replace("{total}", String(totalTeams))
    .replace("{confRank}", ordinal(franchise.confRank))
    .replace("{conf}", franchise.conference);
  parts.push(opener + " " + gradeIntro + " " + rankLine);

  // Talent breakdown
  var starSummary = buildStarSummary(franchise.starBreakdown);
  var talentLine = pickRandom(HERBIE.talentLine)
    .replace("{score}", (Math.round(franchise.classScore * 10) / 10).toString())
    .replace("{stars}", starSummary)
    .replace("{count}", String(franchise.totalPlayers));
  parts.push(talentLine);

  // Top recruit spotlight
  var top = getTopRecruit(franchise.players);
  if (top) {
    var headliner = pickRandom(HERBIE.headliner)
      .replace("{player}", top.playerName)
      .replace("{pos}", top.position)
      .replace("{star}", starsLabel(top.stars))
      .replace("{rs}", (Math.round(top.recruitScore * 10) / 10).toString())
      .replace("{grade}", top.playerGrade || "N/A");
    parts.push(headliner);
  }

  // Value analysis
  var bestVal = getBestValue(franchise.players);
  var worstVal = getWorstValue(franchise.players);

  if (bestVal) {
    var valueLead = pickRandom(HERBIE.valueLead);
    var bestLine = pickRandom(HERBIE.bestValueLine)
      .replace("{player}", bestVal.playerName)
      .replace("{savings}", formatDollarSavings(bestVal.savingsDollars));
    parts.push(valueLead + " " + bestLine);
  }

  if (worstVal) {
    var overpayLine = pickRandom(HERBIE.overpayLead)
      .replace("{player}", worstVal.playerName)
      .replace("{savings}", formatDollarSavings(worstVal.savingsDollars));
    var overpayFollow = pickRandom(HERBIE.overpayFollow[tier]);
    parts.push(overpayLine + " " + overpayFollow);
  }

  // Efficiency line
  if (franchise.avgSavings !== null) {
    var effLine = pickRandom(HERBIE.efficiencyLine)
      .replace("{savings}", formatDollarSavings(franchise.avgSavings))
      .replace("{total}", String(franchise.totalSpent))
      .replace("{grade}", franchise.efficiencyGrade);
    parts.push(effLine);
  }

  // Closing
  parts.push(pickRandom(HERBIE.closings[tier]));

  return parts.join(" ");
}

// ============================================================================
// CORSO WRITE-UP GENERATOR
// ============================================================================

function generateCorsoWriteup(franchise, totalTeams) {
  var tier = gradeTier(franchise.corsoGrade);
  var team = franchise.franchiseName;
  var parts = [];

  // Opening exclamation
  var opener = pickRandom(CORSO.openers[tier]).replace("{team}", team);
  parts.push(opener);

  // Grade intro
  var gradeIntro = pickRandom(CORSO.gradeIntro[tier])
    .replace("{grade}", franchise.corsoGrade);
  var rankLine = pickRandom(CORSO.rankLine)
    .replace("{rank}", ordinal(franchise.classRank))
    .replace("{total}", String(totalTeams))
    .replace("{confRank}", ordinal(franchise.confRank))
    .replace("{conf}", franchise.conference);
  parts.push(gradeIntro + " " + rankLine);

  // Star hype
  var fiveCount = franchise.starBreakdown[5] || 0;
  var fourCount = franchise.starBreakdown[4] || 0;
  if (fiveCount > 0) {
    parts.push(pickRandom(CORSO.starHype.hasFiveStars)
      .replace("{fiveCount}", String(fiveCount)));
  }
  if (fourCount > 0 && fiveCount <= 1) {
    parts.push(pickRandom(CORSO.starHype.hasFourStars)
      .replace("{fourCount}", String(fourCount)));
  }
  if (fiveCount === 0 && fourCount === 0) {
    parts.push(pickRandom(CORSO.starHype.lowStars)
      .replace("{summary}", buildStarSummary(franchise.starBreakdown)));
  }

  // Top recruit reaction
  var top = getTopRecruit(franchise.players);
  if (top) {
    var topTier = gradeTier(top.playerGrade || "C");
    var topLine = pickRandom(CORSO.topRecruit[topTier])
      .replace("{player}", top.playerName)
      .replace("{pos}", top.position)
      .replace("{star}", starsLabel(top.stars))
      .replace("{grade}", top.playerGrade || "N/A");
    parts.push(topLine);
  }

  // Best value reaction
  var bestVal = getBestValue(franchise.players);
  if (bestVal) {
    parts.push(pickRandom(CORSO.bestValueReaction)
      .replace("{player}", bestVal.playerName)
      .replace("{savings}", formatDollarSavings(bestVal.savingsDollars)));
  }

  // Overpay reaction
  var worstVal = getWorstValue(franchise.players);
  if (worstVal) {
    parts.push(pickRandom(CORSO.overpayReaction)
      .replace("{player}", worstVal.playerName)
      .replace("{savings}", formatDollarSavings(Math.abs(worstVal.savingsDollars))));
  }

  // Efficiency line (simplified for Corso)
  if (franchise.avgSavings !== null) {
    var effTier = franchise.avgSavings >= 0 ? "good" : "bad";
    parts.push(pickRandom(CORSO.efficiencyLine[effTier])
      .replace("{savings}", formatDollarSavings(franchise.avgSavings))
      .replace("{total}", String(franchise.totalSpent)));
  }

  // Closing
  parts.push(pickRandom(CORSO.closings[tier]).replace("{team}", team));

  return parts.join(" ");
}

// ============================================================================
// ORDINAL HELPER
// ============================================================================

function ordinal(n) {
  var s = ["th", "st", "nd", "rd"];
  var v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ============================================================================
// OUTPUT
// ============================================================================

function writeRecruitingWriteups(yearStr, franchises, config) {
  var ss = SpreadsheetApp.getActive();
  var totalTeams = franchises.length;

  // Compute analyst-specific grades and generate write-ups
  franchises.forEach(function(f) {
    f.herbstreitGrade = calcHerbstreitGrade(f);
    f.corsoGrade = calcCorsoGrade(f);
    f.herbstreitWriteup = generateHerbstreitWriteup(f, totalTeams);
    f.corsoWriteup = generateCorsoWriteup(f, totalTeams);
  });

  var sheetName = config.sheets.recruitingWriteups;
  var sheet = ss.getSheetByName(sheetName);
  var isNew = !sheet;

  if (isNew) {
    sheet = ss.insertSheet(sheetName);
  } else {
    var existing = sheet.getDataRange().getValues();
    for (var i = existing.length - 1; i >= 1; i--) {
      if (String(existing[i][0]) === yearStr) {
        sheet.deleteRow(i + 1);
      }
    }
  }

  var headers = [
    "DraftYear", "Franchise", "Conference", "Overall Grade",
    "Herbstreit Grade", "Corso Grade",
    "Herbstreit Analysis", "Corso Analysis"
  ];

  if (isNew) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  var rows = franchises.map(function(f) {
    return [
      Number(yearStr),
      f.franchiseName,
      f.conference,
      f.overallGrade,
      f.herbstreitGrade,
      f.corsoGrade,
      f.herbstreitWriteup,
      f.corsoWriteup
    ];
  });

  if (rows.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);

    // Wrap text on write-up columns
    sheet.getRange(startRow, 7, rows.length, 2).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  }

  if (isNew) {
    sheet.setColumnWidth(1, 75);    // DraftYear
    sheet.setColumnWidth(2, 180);   // Franchise
    sheet.setColumnWidth(3, 80);    // Conference
    sheet.setColumnWidth(4, 100);   // Overall Grade
    sheet.setColumnWidth(5, 115);   // Herbstreit Grade
    sheet.setColumnWidth(6, 95);    // Corso Grade
    sheet.setColumnWidth(7, 450);   // Herbstreit Analysis
    sheet.setColumnWidth(8, 450);   // Corso Analysis
  }

  Logger.log("  Wrote " + rows.length + " team write-ups to " + sheetName);
}
