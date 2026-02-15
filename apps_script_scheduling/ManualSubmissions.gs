/***********************
 * DISCORD WEBHOOK HANDLER
 * Handles manual game submissions from Discord bot
 ***********************/

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.action !== "submit") {
      return jsonResponse({ error: "Invalid action" });
    }

    const result = submitManualGame(payload);

    // Attempt reciprocal confirmation
    tryConfirmManualGame(result.matchKey);

    return jsonResponse(result);

  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

/*************************
 * SUBMIT MANUAL GAME
 *************************/

function submitManualGame(payload) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName("Manual Submissions");

  const week = Number(payload.week);
  const teamA = payload.teamA;
  const teamB = payload.teamB;
  const discordId = payload.discordId;

  if (!week || !teamA || !teamB) {
    throw new Error("Missing required fields");
  }

  if (teamA === teamB) {
    throw new Error("Teams must be different");
  }

  const matchKey = buildMatchKey(week, teamA, teamB);

  // Prevent duplicate submission from same team
  const data = sheet.getDataRange().getValues();
  const header = data[0];

  const weekCol = header.indexOf("Week");
  const teamACol = header.indexOf("Team A");
  const keyCol = header.indexOf("Match Key");

  const duplicate = data.some((r, i) =>
    i > 0 &&
    r[weekCol] === week &&
    r[teamACol] === teamA &&
    r[keyCol] === matchKey
  );

  if (duplicate) {
    throw new Error("You have already submitted this matchup");
  }

  sheet.appendRow([
    new Date(),
    week,
    teamA,
    teamB,
    discordId,
    "PENDING",
    matchKey
  ]);

  return {
    status: "PENDING",
    matchKey,
    waitingOn: teamB
  };
}

/********************************
 * RECIPROCAL CONFIRMATION LOGIC
 ********************************/

function tryConfirmManualGame(matchKey) {
  const ss = SpreadsheetApp.getActive();
  const subSheet = ss.getSheetByName("Manual Submissions");
  const gameSheet = ss.getSheetByName("ManualGames");

  const data = subSheet.getDataRange().getValues();
  const header = data[0];

  const keyCol = header.indexOf("Match Key");
  const statusCol = header.indexOf("Status");
  const weekCol = header.indexOf("Week");
  const teamACol = header.indexOf("Team A");
  const teamBCol = header.indexOf("Team B");

  const matches = data
    .map((r, i) => ({ row: i + 1, r }))
    .filter(x => x.r[keyCol] === matchKey);

  if (matches.length < 2) return;

  const teams = [...new Set(matches.map(m => m.r[teamACol]))];
  if (teams.length !== 2) return;

  const week = matches[0].r[weekCol];
  const [team1, team2] = teams;

  // Prevent duplicate confirmed games
  const existing = gameSheet.getDataRange().getValues().some((r, i) =>
    i > 0 &&
    r[0] === week &&
    (
      (r[1] === team1 && r[2] === team2) ||
      (r[1] === team2 && r[2] === team1)
    )
  );

  if (existing) return;

  // Write confirmed game
  gameSheet.appendRow([
    week,
    team1,
    team2,
    "MANUAL",
    new Date()
  ]);

  // Mark submissions confirmed
  matches.forEach(m => {
    subSheet
      .getRange(m.row, statusCol + 1)
      .setValue("CONFIRMED");
  });
}

/********************
 * HELPERS
 ********************/

function buildMatchKey(week, teamA, teamB) {
  const ordered = [teamA, teamB].sort();
  return `${week}|${ordered[0]}|${ordered[1]}`;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
