/**
 * ROOKIE INGESTION
 * Imports rookie players from MFL each season
 */

/**
 * Ingest all rookies for a given year
 * Should be run once per year after NFL draft
 */
function ingestRookiesForYear(year) {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();

  // Get or create RookieLedger sheet
  let sheet = ss.getSheetByName(config.sheets.rookieLedger);

  if (!sheet) {
    sheet = ss.insertSheet(config.sheets.rookieLedger);
    sheet.appendRow([
      "MFL_Player_ID",
      "PlayerName",
      "Position",
      "RookieLeagueYear",
      "NFLTeam",
      "CapturedAt"
    ]);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
  }

  // Get existing rookie IDs to avoid duplicates
  const existingData = sheet.getDataRange().getValues();
  const existingIds = new Set(
    existingData.slice(1).map(row => String(row[0]))
  );

  // Fetch rookies from MFL
  const rookies = fetchRookies(year);

  const rowsToAdd = [];
  const now = new Date();

  rookies.forEach(player => {
    const playerId = String(player.id);

    if (existingIds.has(playerId)) return;

    rowsToAdd.push([
      playerId,
      player.name || "",
      player.position || "",
      year,
      player.team || "",
      now
    ]);

    existingIds.add(playerId);
  });

  if (rowsToAdd.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, 6)
      .setValues(rowsToAdd);
  }

  Logger.log(`✅ Ingested ${rowsToAdd.length} rookies for ${year}`);

  // Automatically create player copies for these rookies
  if (rowsToAdd.length > 0) {
    createPlayerCopiesForRookies(year);
  }

  return rowsToAdd.length;
}
