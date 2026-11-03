const fs = require("fs").promises;
const path = require("path");

const RECORD_DATE_PATTERN = /(\d{4}-\d{2}-\d{2})/;

// Int32Array cell values. A positive value is the sailing's total cabin price.
const MISSING = -1; // sailing absent from that day's file
const SOLD_OUT = 0; // sailing listed, cabin type has no price

function toIsoDate(ms) {
  return new Date(ms).toISOString().split("T")[0];
}

/**
 * Newest file per record date for one guest count, oldest first, capped at
 * maxFiles dates. A day scraped twice keeps its later file.
 */
async function listDataFiles(dataDir, guestCount, maxFiles) {
  const prefix = `${guestCount}g-itin`;
  const fileByDate = new Map();
  for (const file of (await fs.readdir(dataDir))
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort()) {
    const match = file.match(RECORD_DATE_PATTERN);
    if (match) fileByDate.set(match[1], path.join(dataDir, file));
  }
  return [...fileByDate].sort(([a], [b]) => a.localeCompare(b)).slice(-maxFiles);
}

/**
 * Build a compact price index for one guest count. Raw files are ~1.2MB each
 * and only per-cabin totals are needed, so each file is reduced to Int32Array
 * cells and dropped before the next one is read.
 */
async function buildGuestIndex(dataDir, guestCount, maxFiles, log = () => {}) {
  const files = await listDataFiles(dataDir, guestCount, maxFiles);
  const recordDates = files.map(([date]) => date);
  const sailings = new Map();

  for (let i = 0; i < files.length; i++) {
    let itineraries;
    try {
      itineraries = JSON.parse(await fs.readFile(files[i][1], "utf8"));
    } catch (error) {
      log(`Skipping unreadable file ${files[i][1]}: ${error.message}`);
      continue;
    }
    for (const cruise of itineraries) {
      if (cruise.bundleType !== "cruise") continue;
      for (const sailing of cruise.sailings || []) {
        const id = String(sailing.packageId);
        let entry = sailings.get(id);
        if (!entry) {
          entry = {
            packageId: id,
            itineraryCode: cruise.code,
            shipCode: cruise.shipCode,
            title: cruise.fullTitle,
            duration: cruise.duration,
            embarkationPortCode: cruise.embarkationPortCode,
            disembarkationPortCode: cruise.disembarkationPortCode,
            sailDate: toIsoDate(sailing.sailStartDate),
            prices: {},
          };
          sailings.set(id, entry);
        }
        for (const p of sailing.pricing || []) {
          const code = String(p.code).toUpperCase();
          if (!entry.prices[code]) {
            entry.prices[code] = new Int32Array(files.length).fill(MISSING);
          }
          entry.prices[code][i] =
            p.combinedPrice > 0 ? Math.round(p.combinedPrice) : SOLD_OUT;
        }
      }
    }
  }

  const byItinerary = new Map();
  const byItineraryDate = new Map();
  for (const entry of sailings.values()) {
    if (!byItinerary.has(entry.itineraryCode)) {
      byItinerary.set(entry.itineraryCode, []);
    }
    byItinerary.get(entry.itineraryCode).push(entry);
    byItineraryDate.set(`${entry.itineraryCode}|${entry.sailDate}`, entry);
  }

  return { guestCount, recordDates, sailings, byItinerary, byItineraryDate };
}

async function buildIndex({ dataDir, guestCounts, maxFiles, log }) {
  const index = {};
  for (const guestCount of guestCounts) {
    const start = Date.now();
    index[guestCount] = await buildGuestIndex(
      dataDir,
      guestCount,
      maxFiles,
      log,
    );
    log?.(
      `Indexed ${guestCount}g: ${index[guestCount].recordDates.length} files, ` +
        `${index[guestCount].sailings.size} sailings in ${Date.now() - start}ms`,
    );
  }
  return index;
}

module.exports = { buildIndex, buildGuestIndex, MISSING, SOLD_OUT };
