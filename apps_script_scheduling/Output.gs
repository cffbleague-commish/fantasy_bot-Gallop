/*********************************
 * LOGGING
 *********************************/

function logSchedulerEvent(e) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(LOG_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET);
  }

  // Proper header initialization
  if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() === "") {
    sheet.clear();
    sheet.appendRow([
      "Timestamp",
      "Phase",
      "Severity",
      "Type",
      "Team",
      "Week",
      "Opponent",
      "Message"
    ]);
  }

  sheet.appendRow([
    new Date(),
    e.phase || "",
    e.severity || "",
    e.type || "",
    e.team || "",
    e.week || "",
    e.opponent || "",
    e.message || ""
  ]);
}

/*********************************
 * SCHEDULE WRITING
 *********************************/

function writeScheduleFromGrid(grid) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName("Schedule");
  if (!sheet) sheet = ss.insertSheet("Schedule");

  sheet.clearContents();
  sheet.appendRow(["Week", "Home", "Away", "Type"]);

  const seen = new Set();
  let gameCount = 0;

  Object.keys(grid).forEach(teamId => {
    Object.keys(grid[teamId]).forEach(weekStr => {
      const week = Number(weekStr);
      const slot = grid[teamId][week];
      if (!slot) return;

      const oppId = slot.opponent;
      if (!oppId) return;

      // Write each matchup ONCE
      const key = [teamId, oppId, week].sort().join("-");
      if (seen.has(key)) return;
      seen.add(key);

      sheet.appendRow([
        week,
        teamId,
        oppId,
        slot.type
      ]);

      gameCount++;
    });
  });

  logSchedulerEvent({
    phase: "OUTPUT",
    severity: gameCount === 600 ? "INFO" : "WARNING",
    type: "GAME_COUNT",
    message: `Schedule written with ${gameCount} games`
  });
}

/*********************************
 * VALIDATION MATRIX
 *********************************/

function writeValidationMatrixWithTotals(grid, teams, params) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName("Validation");
  if (!sheet) sheet = ss.insertSheet("Validation");

  sheet.clearContents();
  sheet.clearFormats();

  const teamIds = teams
    .map(t => String(t.id))
    .sort((a, b) => Number(a) - Number(b));

  const confMap = {};
  teams.forEach(t => confMap[String(t.id)] = t.conference);

  // HEADER ROW
  const header = ["Team \\ Opponent"].concat(teamIds).concat([
    "Total Games",
    "Conference",
    "Non-Conference"
  ]);
  sheet.appendRow(header);

  // CONFERENCE HELPER ROW (HIDDEN)
  const confRow = ["CONF"];
  teamIds.forEach(id => confRow.push(confMap[id] || ""));
  sheet.appendRow(confRow);

  // MAIN MATRIX
  teamIds.forEach(teamId => {
    const row = [teamId];
    let total = 0;
    let confCount = 0;
    let nonConfCount = 0;

    teamIds.forEach(oppId => {
      if (teamId === oppId) {
        row.push("");
        return;
      }

      let weeks = [];

      Object.keys(grid[teamId]).forEach(w => {
        const slot = grid[teamId][w];
        if (slot && String(slot.opponent) === oppId) {
          weeks.push(w);
          total++;

          if (confMap[teamId] === confMap[oppId]) confCount++;
          else nonConfCount++;
        }
      });

      row.push(weeks.length ? weeks.join(",") : "");
    });

    row.push(total, confCount, nonConfCount);
    sheet.appendRow(row);
  });

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  // CONDITIONAL FORMATTING
  const matrixRange = sheet.getRange(3, 2, lastRow - 2, teamIds.length);
  const rules = [];

  // Conference games → blue
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(
        `=AND(B3<>"", $B$2=B$2)`
      )
      .setBackground("#cfe2f3")
      .setRanges([matrixRange])
      .build()
  );

  // Non-conference → green
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(
        `=AND(B3<>"", $B$2<>B$2)`
      )
      .setBackground("#d9ead3")
      .setRanges([matrixRange])
      .build()
  );

  sheet.setConditionalFormatRules(rules);

  // CLEANUP / UX
  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(1);
  sheet.autoResizeColumns(1, lastCol);

  // Hide helper row
  sheet.hideRows(2);

  logSchedulerEvent({
    phase: "VALIDATION",
    severity: "INFO",
    type: "MATRIX_WRITTEN",
    message: `Validation matrix generated for ${teams.length} teams`
  });
}
