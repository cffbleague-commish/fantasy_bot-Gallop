/**
 * RECRUITING ANALYTICS - AUCTION ANALYSIS
 * Pulls historical auction data from the League Sheet's TransactionLog,
 * enriches with MFL player data, and analyzes spending patterns.
 */

// ============================================================================
// DATA IMPORT
// ============================================================================

/**
 * Import AUCTION_WON transactions from the League Sheet's TransactionLog.
 * Reads via SpreadsheetApp.openById() using the configured LEAGUE_SHEET_ID.
 * Writes raw auction data to the local AuctionData tab.
 *
 * Columns written: Year, PlayerID, PlayerName, Position, NFLTeam, DraftYear,
 *                  DraftRound, DraftPick, FranchiseID, FranchiseName, Conference, BidAmount
 */
function importTransactionLog() {
  const config = getConfig();

  if (!config.sourceSheets.leagueSheetId) {
    throw new Error("LEAGUE_SHEET_ID not configured. Run initializeScriptProperties() and set it.");
  }

  Logger.log("=== IMPORTING AUCTION DATA FROM LEAGUE SHEET ===\n");

  // Open the League Sheet
  const leagueSS = SpreadsheetApp.openById(config.sourceSheets.leagueSheetId);
  const txnSheet = leagueSS.getSheetByName(config.sourceSheetTabs.transactionLog);

  if (!txnSheet) {
    throw new Error(`TransactionLog sheet not found in League Sheet. Check LEAGUE_SHEET_ID.`);
  }

  // Read all TransactionLog data
  const txnData = txnSheet.getDataRange().getValues();
  const txnHeaders = txnData[0];
  const txnRows = txnData.slice(1);

  Logger.log(`  TransactionLog: ${txnRows.length} total rows`);

  // Find column indices
  const colIndex = {};
  txnHeaders.forEach((header, idx) => {
    colIndex[header] = idx;
  });

  // Filter to AUCTION_WON only
  const typeCol = colIndex["Type"];
  const auctionRows = txnRows.filter(row => row[typeCol] === "AUCTION_WON");
  Logger.log(`  AUCTION_WON rows: ${auctionRows.length}`);

  if (auctionRows.length === 0) {
    Logger.log("No auction data found. Ensure TransactionLog has been populated with logTransactions=true.");
    return;
  }

  // Build player lookup from MFL for enrichment
  const playerLookup = buildPlayerLookup(getLeagueYear());

  // Also try to get franchise names from FranchiseLookup
  const franchiseNames = {};
  try {
    const lookupSheet = leagueSS.getSheetByName(config.sourceSheetTabs.franchiseLookup);
    if (lookupSheet) {
      const lookupData = lookupSheet.getDataRange().getValues();
      lookupData.slice(1).forEach(row => {
        const fId = String(Number(row[0] || 0)).padStart(3, "0");
        franchiseNames[fId] = row[1] || "";
      });
    }
  } catch (e) {
    Logger.log(`  Warning: Could not read FranchiseLookup: ${e.message}`);
  }

  // Process auction rows and enrich with player data
  const enrichedRows = [];

  auctionRows.forEach(row => {
    const year = row[colIndex["Year"]];
    const playerId = String(row[colIndex["PlayerID"]] || "");
    const playerNameFromTxn = row[colIndex["PlayerName"]] || "";
    const franchiseId = String(row[colIndex["FranchiseID"]] || "");
    const conference = row[colIndex["Conference"]] || "";
    const bidAmount = row[colIndex["BidAmount"]] || "";

    // Skip rows with no player or no bid
    if (!playerId || !bidAmount) return;

    // Enrich with MFL data
    const player = playerLookup[playerId] || {};
    const playerName = player.name || playerNameFromTxn;
    const position = player.position || "";
    const nflTeam = player.team || "";
    const draftYear = player.draftYear || "";
    const draftRound = player.draftRound || "";
    const draftPick = player.draftPick || "";
    const franchiseName = franchiseNames[franchiseId] || "";

    enrichedRows.push([
      year,
      playerId,
      playerName,
      position,
      nflTeam,
      draftYear,
      draftRound,
      draftPick,
      franchiseId,
      franchiseName,
      conference,
      Number(bidAmount) || 0
    ]);
  });

  Logger.log(`  Enriched rows: ${enrichedRows.length}`);

  // Write to local AuctionData sheet
  const ss = SpreadsheetApp.getActive();
  let auctionSheet = ss.getSheetByName(config.sheets.auctionData);

  if (!auctionSheet) {
    auctionSheet = ss.insertSheet(config.sheets.auctionData);
  }

  // Clear existing data
  auctionSheet.clearContents();

  // Write headers
  const headers = [
    "AuctionYear", "PlayerID", "PlayerName", "Position", "NFLTeam",
    "DraftYear", "DraftRound", "DraftPick", "FranchiseID", "FranchiseName",
    "Conference", "BidAmount"
  ];
  auctionSheet.appendRow(headers);
  auctionSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  auctionSheet.setFrozenRows(1);

  // Write data
  if (enrichedRows.length > 0) {
    auctionSheet.getRange(2, 1, enrichedRows.length, headers.length).setValues(enrichedRows);
  }

  // Set column widths
  auctionSheet.setColumnWidth(1, 90);   // AuctionYear
  auctionSheet.setColumnWidth(2, 80);   // PlayerID
  auctionSheet.setColumnWidth(3, 180);  // PlayerName
  auctionSheet.setColumnWidth(4, 60);   // Position
  auctionSheet.setColumnWidth(5, 60);   // NFLTeam
  auctionSheet.setColumnWidth(6, 80);   // DraftYear
  auctionSheet.setColumnWidth(7, 80);   // DraftRound
  auctionSheet.setColumnWidth(8, 80);   // DraftPick
  auctionSheet.setColumnWidth(9, 90);   // FranchiseID
  auctionSheet.setColumnWidth(10, 150); // FranchiseName
  auctionSheet.setColumnWidth(11, 80);  // Conference
  auctionSheet.setColumnWidth(12, 80);  // BidAmount

  Logger.log(`\n  Wrote ${enrichedRows.length} auction records to ${config.sheets.auctionData}`);
}

// ============================================================================
// ANALYSIS
// ============================================================================

/**
 * Analyze historical auction data and produce summary statistics.
 * Reads from AuctionData (populated by importTransactionLog).
 * Writes analysis results to AuctionAnalysis tab.
 */
function analyzeAuctionHistory() {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();

  Logger.log("=== ANALYZING AUCTION HISTORY ===\n");

  // Read AuctionData
  const dataSheet = ss.getSheetByName(config.sheets.auctionData);
  if (!dataSheet) {
    throw new Error("AuctionData sheet not found. Run importTransactionLog() first.");
  }

  const data = dataSheet.getDataRange().getValues();
  if (data.length <= 1) {
    throw new Error("AuctionData is empty. Run importTransactionLog() first.");
  }

  const headers = data[0];
  const rows = data.slice(1);

  // Parse rows into objects
  const auctions = rows.map(row => ({
    auctionYear: Number(row[0]) || 0,
    playerId: String(row[1]),
    playerName: String(row[2]),
    position: String(row[3]),
    nflTeam: String(row[4]),
    draftYear: String(row[5]),
    draftRound: String(row[6]),
    draftPick: String(row[7]),
    franchiseId: String(row[8]),
    franchiseName: String(row[9]),
    conference: String(row[10]),
    bidAmount: Number(row[11]) || 0
  }));

  Logger.log(`  Total auction records: ${auctions.length}`);

  // Exclude startup/special years from analysis
  const excludeYears = config.excludeYears || [];
  const filteredAuctions = excludeYears.length > 0
    ? auctions.filter(a => !excludeYears.includes(a.auctionYear))
    : auctions;

  if (excludeYears.length > 0) {
    Logger.log(`  Excluded years: ${excludeYears.join(", ")} (${auctions.length - filteredAuctions.length} records removed)`);
  }

  // Filter to only rookie auctions (player's draft year = auction year)
  // This focuses the analysis on incoming rookies, not mid-season pickups
  const rookieAuctions = filteredAuctions.filter(a => a.draftYear === String(a.auctionYear));
  const nonRookieAuctions = filteredAuctions.filter(a => a.draftYear !== String(a.auctionYear));

  Logger.log(`  Rookie auctions (draft year = auction year): ${rookieAuctions.length}`);
  Logger.log(`  Non-rookie auctions: ${nonRookieAuctions.length}`);

  // ---- ANALYSIS SECTIONS ----

  const analysisData = [];

  // --- 1. Overall Summary ---
  analysisData.push(["OVERALL SUMMARY (excl. " + (excludeYears.length > 0 ? excludeYears.join(", ") : "none") + ")"]);
  analysisData.push(["Metric", "All Auctions", "Rookie Auctions Only"]);
  analysisData.push(["Total Records", filteredAuctions.length, rookieAuctions.length]);
  analysisData.push(["Average Bid", avg(filteredAuctions.map(a => a.bidAmount)).toFixed(2), avg(rookieAuctions.map(a => a.bidAmount)).toFixed(2)]);
  analysisData.push(["Median Bid", median(filteredAuctions.map(a => a.bidAmount)).toFixed(2), median(rookieAuctions.map(a => a.bidAmount)).toFixed(2)]);
  analysisData.push(["Max Bid", Math.max(...filteredAuctions.map(a => a.bidAmount)), rookieAuctions.length > 0 ? Math.max(...rookieAuctions.map(a => a.bidAmount)) : 0]);
  analysisData.push(["Min Bid", Math.min(...filteredAuctions.map(a => a.bidAmount)), rookieAuctions.length > 0 ? Math.min(...rookieAuctions.map(a => a.bidAmount)) : 0]);
  analysisData.push([]);

  // --- 2. By Position ---
  analysisData.push(["ROOKIE AUCTIONS BY POSITION"]);
  analysisData.push(["Position", "Count", "Avg Bid", "Median Bid", "Max Bid", "Min Bid", "Std Dev"]);

  const positions = ["QB", "RB", "WR", "TE"];
  positions.forEach(pos => {
    const posAuctions = rookieAuctions.filter(a => a.position === pos);
    if (posAuctions.length === 0) {
      analysisData.push([pos, 0, "N/A", "N/A", "N/A", "N/A", "N/A"]);
      return;
    }
    const bids = posAuctions.map(a => a.bidAmount);
    analysisData.push([
      pos,
      posAuctions.length,
      avg(bids).toFixed(2),
      median(bids).toFixed(2),
      Math.max(...bids),
      Math.min(...bids),
      stdDev(bids).toFixed(2)
    ]);
  });
  analysisData.push([]);

  // --- 3. By NFL Draft Round ---
  analysisData.push(["ROOKIE AUCTIONS BY NFL DRAFT ROUND"]);
  analysisData.push(["Draft Round", "Count", "Avg Bid", "Median Bid", "Max Bid", "Min Bid"]);

  const rounds = ["1", "2", "3", "4", "5", "6", "7"];
  rounds.forEach(round => {
    const roundAuctions = rookieAuctions.filter(a => a.draftRound === round);
    if (roundAuctions.length === 0) {
      analysisData.push([`Round ${round}`, 0, "N/A", "N/A", "N/A", "N/A"]);
      return;
    }
    const bids = roundAuctions.map(a => a.bidAmount);
    analysisData.push([
      `Round ${round}`,
      roundAuctions.length,
      avg(bids).toFixed(2),
      median(bids).toFixed(2),
      Math.max(...bids),
      Math.min(...bids)
    ]);
  });

  // UDFAs / Unknown draft round
  const udfaAuctions = rookieAuctions.filter(a => !rounds.includes(a.draftRound));
  if (udfaAuctions.length > 0) {
    const bids = udfaAuctions.map(a => a.bidAmount);
    analysisData.push([
      "UDFA/Unknown",
      udfaAuctions.length,
      avg(bids).toFixed(2),
      median(bids).toFixed(2),
      Math.max(...bids),
      Math.min(...bids)
    ]);
  }
  analysisData.push([]);

  // --- 4. By Position + Draft Round (cross-tab: avg bid) ---
  analysisData.push(["ROOKIE AVG BID: POSITION x DRAFT ROUND"]);
  analysisData.push(["Position", "Rd 1", "Rd 2", "Rd 3", "Rd 4", "Rd 5", "Rd 6", "Rd 7", "UDFA"]);

  positions.forEach(pos => {
    const row = [pos];
    rounds.forEach(round => {
      const bids = rookieAuctions
        .filter(a => a.position === pos && a.draftRound === round)
        .map(a => a.bidAmount);
      row.push(bids.length > 0 ? avg(bids).toFixed(1) : "-");
    });
    const udfaBids = rookieAuctions
      .filter(a => a.position === pos && !rounds.includes(a.draftRound))
      .map(a => a.bidAmount);
    row.push(udfaBids.length > 0 ? avg(udfaBids).toFixed(1) : "-");
    analysisData.push(row);
  });
  analysisData.push([]);

  // --- 4b. Sample size for each Position x Draft Round cell ---
  analysisData.push(["SAMPLE SIZE (n): POSITION x DRAFT ROUND"]);
  analysisData.push(["Position", "Rd 1", "Rd 2", "Rd 3", "Rd 4", "Rd 5", "Rd 6", "Rd 7", "UDFA"]);

  positions.forEach(pos => {
    const row = [pos];
    rounds.forEach(round => {
      const count = rookieAuctions
        .filter(a => a.position === pos && a.draftRound === round)
        .length;
      row.push(count > 0 ? count : "-");
    });
    const udfaCount = rookieAuctions
      .filter(a => a.position === pos && !rounds.includes(a.draftRound))
      .length;
    row.push(udfaCount > 0 ? udfaCount : "-");
    analysisData.push(row);
  });
  analysisData.push([]);

  // --- 4c. Median bid for each Position x Draft Round cell ---
  analysisData.push(["ROOKIE MEDIAN BID: POSITION x DRAFT ROUND"]);
  analysisData.push(["Position", "Rd 1", "Rd 2", "Rd 3", "Rd 4", "Rd 5", "Rd 6", "Rd 7", "UDFA"]);

  positions.forEach(pos => {
    const row = [pos];
    rounds.forEach(round => {
      const bids = rookieAuctions
        .filter(a => a.position === pos && a.draftRound === round)
        .map(a => a.bidAmount);
      row.push(bids.length > 0 ? median(bids).toFixed(1) : "-");
    });
    const udfaBids = rookieAuctions
      .filter(a => a.position === pos && !rounds.includes(a.draftRound))
      .map(a => a.bidAmount);
    row.push(udfaBids.length > 0 ? median(udfaBids).toFixed(1) : "-");
    analysisData.push(row);
  });
  analysisData.push([]);

  // --- 4d. By Position + Draft Pick Tier (granular within Round 1) ---
  const draftPickTiers = ["Top 10", "Picks 11-20", "Picks 21-32", "Round 2", "Round 3", "Day 3 (Rd 4-7)"];

  // Add overallPick and tier to each auction for this section
  // IMPORTANT: Only include players with a valid draft round (1-7) to stay
  // consistent with the round-based tables above
  const auctionsWithPick = rookieAuctions
    .filter(a => rounds.includes(a.draftRound))
    .map(a => {
      const overallPick = parseOverallPick(a.draftPick, a.draftRound);
      return { ...a, overallPick, pickTier: getDraftPickTier(overallPick, a.draftRound) };
    }).filter(a => a.pickTier !== null);

  analysisData.push(["ROOKIE AVG BID: POSITION x DRAFT PICK TIER"]);
  analysisData.push(["Position", ...draftPickTiers]);

  positions.forEach(pos => {
    const row = [pos];
    draftPickTiers.forEach(tier => {
      const bids = auctionsWithPick
        .filter(a => a.position === pos && a.pickTier === tier)
        .map(a => a.bidAmount);
      row.push(bids.length > 0 ? avg(bids).toFixed(1) : "-");
    });
    analysisData.push(row);
  });
  analysisData.push([]);

  // Sample sizes for pick tiers
  analysisData.push(["SAMPLE SIZE (n): POSITION x DRAFT PICK TIER"]);
  analysisData.push(["Position", ...draftPickTiers]);

  positions.forEach(pos => {
    const row = [pos];
    draftPickTiers.forEach(tier => {
      const count = auctionsWithPick
        .filter(a => a.position === pos && a.pickTier === tier)
        .length;
      row.push(count > 0 ? count : "-");
    });
    analysisData.push(row);
  });
  analysisData.push([]);

  // Median for pick tiers
  analysisData.push(["ROOKIE MEDIAN BID: POSITION x DRAFT PICK TIER"]);
  analysisData.push(["Position", ...draftPickTiers]);

  positions.forEach(pos => {
    const row = [pos];
    draftPickTiers.forEach(tier => {
      const bids = auctionsWithPick
        .filter(a => a.position === pos && a.pickTier === tier)
        .map(a => a.bidAmount);
      row.push(bids.length > 0 ? median(bids).toFixed(1) : "-");
    });
    analysisData.push(row);
  });
  analysisData.push([]);

  // --- 4e. By Position + Startup ADP Tier ---
  // Cross-reference rookie auctions with DLF Startup ADP data
  const adpLookup = buildADPLookupByName();
  const adpConfig = config.adpConfig || {};
  const adpTierDefs = adpConfig.tiers || [];
  const adpTierLabels = adpTierDefs.map(t => t.label);

  // Match rookie auctions to ADP data
  const auctionsWithADP = rookieAuctions.map(a => {
    const normalizedName = normalizeNameForMatch(a.playerName);
    if (!normalizedName) return { ...a, startupADP: null, adpTier: null };

    const yearKey = `${normalizedName}|${a.auctionYear}`;
    const adpEntry = adpLookup[yearKey] || adpLookup[normalizedName];

    const adp = adpEntry ? adpEntry.adp : null;
    const tier = adp ? getADPTier(adp, adpTierDefs) : null;
    return { ...a, startupADP: adp, adpTier: tier };
  });

  const adpMatchedCount = auctionsWithADP.filter(a => a.startupADP !== null).length;
  Logger.log(`  ADP matched: ${adpMatchedCount} of ${rookieAuctions.length} rookie auctions`);

  if (adpMatchedCount > 0) {
    // ADP tier summary
    analysisData.push(["ROOKIE AUCTIONS BY STARTUP ADP TIER"]);
    analysisData.push(["ADP Tier", "Count", "Avg Bid", "Median Bid", "Max Bid", "Min Bid"]);

    adpTierLabels.forEach(tier => {
      const tierAuctions = auctionsWithADP.filter(a => a.adpTier === tier);
      if (tierAuctions.length === 0) {
        analysisData.push([tier, 0, "N/A", "N/A", "N/A", "N/A"]);
        return;
      }
      const bids = tierAuctions.map(a => a.bidAmount);
      analysisData.push([
        tier,
        tierAuctions.length,
        avg(bids).toFixed(2),
        median(bids).toFixed(2),
        Math.max(...bids),
        Math.min(...bids)
      ]);
    });

    // Also show "No ADP" bucket
    const noAdpAuctions = auctionsWithADP.filter(a => a.startupADP === null);
    if (noAdpAuctions.length > 0) {
      const bids = noAdpAuctions.map(a => a.bidAmount);
      analysisData.push([
        "No ADP Data",
        noAdpAuctions.length,
        avg(bids).toFixed(2),
        median(bids).toFixed(2),
        Math.max(...bids),
        Math.min(...bids)
      ]);
    }
    analysisData.push([]);

    // Avg bid: Position x ADP Tier
    analysisData.push(["ROOKIE AVG BID: POSITION x ADP TIER"]);
    analysisData.push(["Position", ...adpTierLabels, "No ADP"]);

    positions.forEach(pos => {
      const row = [pos];
      adpTierLabels.forEach(tier => {
        const bids = auctionsWithADP
          .filter(a => a.position === pos && a.adpTier === tier)
          .map(a => a.bidAmount);
        row.push(bids.length > 0 ? avg(bids).toFixed(1) : "-");
      });
      const noAdpBids = auctionsWithADP
        .filter(a => a.position === pos && a.startupADP === null)
        .map(a => a.bidAmount);
      row.push(noAdpBids.length > 0 ? avg(noAdpBids).toFixed(1) : "-");
      analysisData.push(row);
    });
    analysisData.push([]);

    // Sample size: Position x ADP Tier
    analysisData.push(["SAMPLE SIZE (n): POSITION x ADP TIER"]);
    analysisData.push(["Position", ...adpTierLabels, "No ADP"]);

    positions.forEach(pos => {
      const row = [pos];
      adpTierLabels.forEach(tier => {
        const count = auctionsWithADP
          .filter(a => a.position === pos && a.adpTier === tier)
          .length;
        row.push(count > 0 ? count : "-");
      });
      const noAdpCount = auctionsWithADP
        .filter(a => a.position === pos && a.startupADP === null)
        .length;
      row.push(noAdpCount > 0 ? noAdpCount : "-");
      analysisData.push(row);
    });
    analysisData.push([]);

    // Median bid: Position x ADP Tier
    analysisData.push(["ROOKIE MEDIAN BID: POSITION x ADP TIER"]);
    analysisData.push(["Position", ...adpTierLabels, "No ADP"]);

    positions.forEach(pos => {
      const row = [pos];
      adpTierLabels.forEach(tier => {
        const bids = auctionsWithADP
          .filter(a => a.position === pos && a.adpTier === tier)
          .map(a => a.bidAmount);
        row.push(bids.length > 0 ? median(bids).toFixed(1) : "-");
      });
      const noAdpBids = auctionsWithADP
        .filter(a => a.position === pos && a.startupADP === null)
        .map(a => a.bidAmount);
      row.push(noAdpBids.length > 0 ? median(noAdpBids).toFixed(1) : "-");
      analysisData.push(row);
    });
    analysisData.push([]);

    // ADP vs Draft Capital comparison — shows how ADP diverges from draft position
    analysisData.push(["ADP vs DRAFT PICK: BIGGEST FANTASY RISERS AND FALLERS"]);
    analysisData.push(["Player", "Position", "Year", "Draft Pick", "Startup ADP", "ADP Tier", "Avg Bid", "Copies"]);

    // Group by player+year, compute avg bid, attach ADP and pick
    const adpPlayerGroups = {};
    auctionsWithADP.filter(a => a.startupADP !== null).forEach(a => {
      const key = `${a.playerName}|${a.auctionYear}`;
      if (!adpPlayerGroups[key]) {
        const overallPick = parseOverallPick(a.draftPick, a.draftRound);
        adpPlayerGroups[key] = {
          playerName: a.playerName, position: a.position, auctionYear: a.auctionYear,
          overallPick: overallPick, startupADP: a.startupADP, adpTier: a.adpTier,
          bids: []
        };
      }
      adpPlayerGroups[key].bids.push(a.bidAmount);
    });

    // Sort by startup ADP (best first) and take top 25
    const topByADP = Object.values(adpPlayerGroups)
      .sort((a, b) => a.startupADP - b.startupADP)
      .slice(0, 25);

    topByADP.forEach(p => {
      analysisData.push([
        p.playerName,
        p.position,
        p.auctionYear,
        p.overallPick || "-",
        p.startupADP,
        p.adpTier || "-",
        "$" + avg(p.bids).toFixed(0),
        p.bids.length
      ]);
    });
    analysisData.push([]);
  } else {
    Logger.log("  No ADP data found. Run buildADPLookupByName() requires the 'DLF Rookie Startup ADP' sheet.");
  }

  // --- 5. By Year ---
  analysisData.push(["ROOKIE AUCTIONS BY YEAR"]);
  analysisData.push(["Year", "Count", "Avg Bid", "Median Bid", "Total Spent", "Max Bid"]);

  const years = [...new Set(rookieAuctions.map(a => a.auctionYear))].sort();
  years.forEach(year => {
    const yearAuctions = rookieAuctions.filter(a => a.auctionYear === year);
    const bids = yearAuctions.map(a => a.bidAmount);
    analysisData.push([
      year,
      yearAuctions.length,
      avg(bids).toFixed(2),
      median(bids).toFixed(2),
      bids.reduce((sum, b) => sum + b, 0),
      Math.max(...bids)
    ]);
  });
  analysisData.push([]);

  // --- 6. By Conference ---
  analysisData.push(["ROOKIE AUCTIONS BY CONFERENCE"]);
  analysisData.push(["Conference", "Count", "Avg Bid", "Median Bid", "Total Spent"]);

  const conferences = [...new Set(rookieAuctions.map(a => a.conference))].sort();
  conferences.forEach(conf => {
    const confAuctions = rookieAuctions.filter(a => a.conference === conf);
    const bids = confAuctions.map(a => a.bidAmount);
    analysisData.push([
      conf,
      confAuctions.length,
      avg(bids).toFixed(2),
      median(bids).toFixed(2),
      bids.reduce((sum, b) => sum + b, 0)
    ]);
  });
  analysisData.push([]);

  // --- 7. Price Distribution (Percentiles) ---
  analysisData.push(["ROOKIE BID PRICE DISTRIBUTION"]);
  analysisData.push(["Percentile", "Bid Amount", "Suggested Star Rating"]);

  const sortedBids = rookieAuctions.map(a => a.bidAmount).sort((a, b) => a - b);
  const percentiles = [5, 10, 25, 30, 50, 55, 75, 80, 90, 95, 99];
  percentiles.forEach(pct => {
    const idx = Math.floor(sortedBids.length * pct / 100);
    const bidAtPercentile = sortedBids[Math.min(idx, sortedBids.length - 1)];

    let starSuggestion = "";
    if (pct === 95) starSuggestion = "<-- 5-Star threshold";
    if (pct === 80) starSuggestion = "<-- 4-Star threshold";
    if (pct === 55) starSuggestion = "<-- 3-Star threshold";
    if (pct === 30) starSuggestion = "<-- 2-Star threshold";

    analysisData.push([`${pct}th`, bidAtPercentile, starSuggestion]);
  });
  analysisData.push([]);

  // --- 8. Top 20 Most Expensive Rookie Acquisitions ---
  analysisData.push(["TOP 20 MOST EXPENSIVE ROOKIE ACQUISITIONS"]);
  analysisData.push(["Rank", "Player", "Position", "Year", "Draft Round", "Overall Pick", "Bid", "Franchise", "Conference"]);

  const topRookies = [...rookieAuctions].sort((a, b) => b.bidAmount - a.bidAmount).slice(0, 20);
  topRookies.forEach((a, idx) => {
    const overallPick = parseOverallPick(a.draftPick, a.draftRound);
    analysisData.push([
      idx + 1,
      a.playerName,
      a.position,
      a.auctionYear,
      a.draftRound ? `Round ${a.draftRound}` : "UDFA",
      overallPick || "-",
      a.bidAmount,
      a.franchiseName || a.franchiseId,
      a.conference
    ]);
  });
  analysisData.push([]);

  // --- 9. ESPN Grade Correlation (if ESPN data available) ---
  const espnLookup = buildESPNLookupByName();
  const espnKeys = Object.keys(espnLookup);

  if (espnKeys.length > 0) {
    Logger.log(`  ESPN data found (${espnKeys.length} entries). Adding grade correlation...`);

    // Match rookie auctions to ESPN grades by name + year
    const matchedAuctions = [];
    rookieAuctions.forEach(a => {
      const normalizedName = normalizeNameForMatch(a.playerName);
      if (!normalizedName) return;

      // Try year-specific match first, then name-only
      const yearKey = `${normalizedName}|${a.auctionYear}`;
      const espn = espnLookup[yearKey] || espnLookup[normalizedName];

      if (espn && espn.grade !== null) {
        matchedAuctions.push({
          ...a,
          espnGrade: espn.grade,
          espnOverallRank: espn.overallRank,
          espnPositionRank: espn.positionRank
        });
      }
    });

    Logger.log(`  Matched ${matchedAuctions.length} of ${rookieAuctions.length} rookie auctions to ESPN grades`);

    if (matchedAuctions.length > 0) {
      // 9a. ESPN Grade vs Auction Price by Grade Range
      analysisData.push(["ESPN GRADE vs AUCTION PRICE"]);
      analysisData.push(["Grade Range", "Count", "Avg Bid", "Median Bid", "Max Bid", "Min Bid"]);

      const gradeRanges = [
        { label: "90+ (Elite)", min: 90, max: 100 },
        { label: "80-89 (Premium)", min: 80, max: 89 },
        { label: "70-79 (Solid)", min: 70, max: 79 },
        { label: "60-69 (Average)", min: 60, max: 69 },
        { label: "Below 60", min: 0, max: 59 }
      ];

      gradeRanges.forEach(range => {
        const rangeAuctions = matchedAuctions.filter(a => a.espnGrade >= range.min && a.espnGrade <= range.max);
        if (rangeAuctions.length === 0) {
          analysisData.push([range.label, 0, "N/A", "N/A", "N/A", "N/A"]);
          return;
        }
        const bids = rangeAuctions.map(a => a.bidAmount);
        analysisData.push([
          range.label,
          rangeAuctions.length,
          avg(bids).toFixed(2),
          median(bids).toFixed(2),
          Math.max(...bids),
          Math.min(...bids)
        ]);
      });
      analysisData.push([]);

      // 9b. ESPN Grade vs Auction Price by Position
      analysisData.push(["ESPN GRADE vs AUCTION PRICE BY POSITION"]);
      analysisData.push(["Position", "90+", "80-89", "70-79", "60-69", "Below 60"]);

      positions.forEach(pos => {
        const row = [pos];
        gradeRanges.forEach(range => {
          const bids = matchedAuctions
            .filter(a => a.position === pos && a.espnGrade >= range.min && a.espnGrade <= range.max)
            .map(a => a.bidAmount);
          row.push(bids.length > 0 ? `$${avg(bids).toFixed(0)} (n=${bids.length})` : "-");
        });
        analysisData.push(row);
      });
      analysisData.push([]);

      // 9c. Sample size for grade x position
      analysisData.push(["SAMPLE SIZE: ESPN GRADE x POSITION"]);
      analysisData.push(["Position", "90+", "80-89", "70-79", "60-69", "Below 60", "Total Matched"]);

      positions.forEach(pos => {
        const posMatched = matchedAuctions.filter(a => a.position === pos);
        const row = [pos];
        gradeRanges.forEach(range => {
          const count = posMatched.filter(a => a.espnGrade >= range.min && a.espnGrade <= range.max).length;
          row.push(count > 0 ? count : "-");
        });
        row.push(posMatched.length);
        analysisData.push(row);
      });
      analysisData.push([]);

      // 9d. Top matched prospects showing ESPN grade vs actual auction price
      analysisData.push(["TOP ESPN-GRADED PROSPECTS vs ACTUAL AUCTION PRICE"]);
      analysisData.push(["Player", "Position", "Year", "ESPN Grade", "ESPN Rank", "Draft Rd", "Avg Bid (all copies)", "Bid Range", "Copies Sold"]);

      // Group matched auctions by player name + year to show average across copies
      const playerYearGroups = {};
      matchedAuctions.forEach(a => {
        const key = `${a.playerName}|${a.auctionYear}`;
        if (!playerYearGroups[key]) {
          playerYearGroups[key] = {
            playerName: a.playerName,
            position: a.position,
            auctionYear: a.auctionYear,
            espnGrade: a.espnGrade,
            espnOverallRank: a.espnOverallRank,
            draftRound: a.draftRound,
            bids: []
          };
        }
        playerYearGroups[key].bids.push(a.bidAmount);
      });

      // Sort by ESPN grade (highest first) and take top 25
      const topGraded = Object.values(playerYearGroups)
        .sort((a, b) => (b.espnGrade || 0) - (a.espnGrade || 0))
        .slice(0, 25);

      topGraded.forEach(p => {
        analysisData.push([
          p.playerName,
          p.position,
          p.auctionYear,
          p.espnGrade,
          p.espnOverallRank || "-",
          p.draftRound ? `Round ${p.draftRound}` : "UDFA",
          "$" + avg(p.bids).toFixed(0),
          `$${Math.min(...p.bids)}-$${Math.max(...p.bids)}`,
          p.bids.length
        ]);
      });
      analysisData.push([]);
    }
  } else {
    Logger.log("  No ESPN data found. Run importESPNProspects() to add ESPN grade correlation.");
  }

  // --- Write to AuctionAnalysis sheet ---
  let analysisSheet = ss.getSheetByName(config.sheets.auctionAnalysis);
  if (!analysisSheet) {
    analysisSheet = ss.insertSheet(config.sheets.auctionAnalysis);
  }
  analysisSheet.clearContents();

  // Pad rows to uniform width
  const maxCols = Math.max(...analysisData.map(row => row.length));
  const paddedData = analysisData.map(row => {
    while (row.length < maxCols) row.push("");
    return row;
  });

  analysisSheet.getRange(1, 1, paddedData.length, maxCols).setValues(paddedData);

  // Bold section headers
  paddedData.forEach((row, idx) => {
    const isSectionHeader = String(row[0]).match(/^[A-Z]{2,}/) && row.filter(c => c !== "").length === 1;
    if (isSectionHeader) {
      analysisSheet.getRange(idx + 1, 1, 1, maxCols).setFontWeight("bold").setFontSize(11);
    }
    // Bold column headers (rows right after section headers)
    const prevIsSectionHeader = idx > 0 && String(paddedData[idx - 1][0]).match(/^[A-Z]{2,}/) && paddedData[idx - 1].filter(c => c !== "").length === 1;
    if (prevIsSectionHeader) {
      analysisSheet.getRange(idx + 1, 1, 1, maxCols).setFontWeight("bold").setFontStyle("italic");
    }
  });

  analysisSheet.setFrozenRows(0);
  analysisSheet.setColumnWidth(1, 150);
  analysisSheet.setColumnWidth(2, 180);

  Logger.log(`\n  Analysis written to ${config.sheets.auctionAnalysis} (${paddedData.length} rows)`);
  Logger.log("\n=== ANALYSIS COMPLETE ===");
}

// ============================================================================
// STAT HELPERS
// ============================================================================

/**
 * Parse MFL draft pick into an overall pick number.
 * MFL formats vary: "1.05" (round.pick), plain "15" (overall pick), etc.
 *
 * For "round.pick" format: uses the pick-within-round number directly
 * combined with round info to calculate overall pick.
 * Accounts for compensatory picks (rounds can have 33-40+ picks).
 *
 * @param {String} draftPick - Raw draft_pick from MFL
 * @param {String} draftRound - Raw draft_round from MFL
 * @returns {Number|null} - Overall pick number, or null if unparseable
 */
function parseOverallPick(draftPick, draftRound) {
  if (!draftPick) return null;

  const pickStr = String(draftPick).trim();

  // Format: "1.05" (round.pick within round)
  if (pickStr.includes(".")) {
    const parts = pickStr.split(".");
    const round = Number(parts[0]);
    const pickInRound = Number(parts[1]);
    if (!isNaN(round) && !isNaN(pickInRound) && round > 0) {
      // For tier purposes, we only care about pick within round 1
      // For rounds 2+, the exact overall pick doesn't affect tiering
      // Use pickInRound directly for round 1 tiering
      if (round === 1) return pickInRound;
      // For other rounds, estimate overall pick (comp picks make this imprecise
      // but it doesn't matter since tiers are by round for rounds 2+)
      return (round - 1) * 32 + pickInRound;
    }
  }

  // Plain number — if draftRound is known and > 1, this is pick-within-round
  // (MFL sometimes stores just the pick number without the "round." prefix)
  const num = Number(pickStr);
  if (!isNaN(num) && num > 0) {
    const round = Number(draftRound);
    if (!isNaN(round) && round > 1) {
      return (round - 1) * 32 + num;
    }
    return num;
  }

  return null;
}

/**
 * Get draft pick tier label.
 * For Round 1: splits into Top 10, Picks 11-20, Picks 21-32+
 * For Rounds 2+: uses round number directly (avoids comp pick math issues)
 *
 * @param {Number|null} overallPick - Overall pick number
 * @param {String} draftRound - Draft round from MFL ("1", "2", etc.)
 * @returns {String|null} - Tier label
 */
function getDraftPickTier(overallPick, draftRound) {
  const round = Number(draftRound);
  if (!round || round < 1) return null;

  // Round 1: break into sub-tiers based on pick position
  if (round === 1 && overallPick !== null) {
    if (overallPick <= 10) return "Top 10";
    if (overallPick <= 20) return "Picks 11-20";
    return "Picks 21-32";
  }

  // Rounds 2-3: own tiers
  if (round === 2) return "Round 2";
  if (round === 3) return "Round 3";

  // Rounds 4-7: grouped as Day 3
  if (round >= 4 && round <= 7) return "Day 3 (Rd 4-7)";

  return null;
}

function avg(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(arr) {
  if (arr.length === 0) return 0;
  const mean = avg(arr);
  const squaredDiffs = arr.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(avg(squaredDiffs));
}

function percentile(arr, pct) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * pct / 100);
  return sorted[Math.min(idx, sorted.length - 1)];
}
