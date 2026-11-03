const http = require("http");
const { buildIndex } = require("./history");
const { summarize, currentPrice } = require("./score");

const DEFAULT_CABIN_TYPE = "INSIDE";
const MAX_ALTERNATIVES = 5;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const PARAM_PATTERNS = {
  packageId: /^\d{1,12}$/,
  itineraryCode: /^[A-Z0-9]{3,40}$/,
  sailDate: /^\d{4}-\d{2}-\d{2}$/,
  cabinType: /^[A-Z]{2,20}$/,
  guestCount: /^[1-9]$/,
};

function readParams(searchParams) {
  const params = {};
  for (const [key, pattern] of Object.entries(PARAM_PATTERNS)) {
    const raw = searchParams.get(key);
    if (raw == null || raw === "") continue;
    const value = raw.trim().toUpperCase();
    if (!pattern.test(value)) throw new HttpError(400, `Invalid ${key}`);
    params[key] = value;
  }
  return params;
}

function sailingMeta(entry) {
  const { prices, ...meta } = entry;
  return meta;
}

function guestIndex(index, guestCount) {
  const count = guestCount || "1";
  const loaded = index[count];
  if (!loaded) {
    throw new HttpError(
      404,
      `No data for ${count} guests. Loaded: ${Object.keys(index).join(", ")}`,
    );
  }
  return loaded;
}

function pickCabinType(entry, requested) {
  const codes = Object.keys(entry.prices);
  if (requested && codes.includes(requested)) return requested;
  return codes.includes(DEFAULT_CABIN_TYPE) ? DEFAULT_CABIN_TYPE : codes[0];
}

function cabinOptions(entry, recordDates) {
  return Object.keys(entry.prices).map((code) => {
    const total = currentPrice(entry, code, recordDates);
    return {
      code,
      perNight: total == null ? null : Math.ceil(total / entry.duration),
    };
  });
}

function upcoming(entries, today) {
  return entries.filter((e) => e.sailDate >= today);
}

function sailingResponse(index, params, today) {
  const g = guestIndex(index, params.guestCount);
  let entry = params.packageId && g.sailings.get(params.packageId);
  if (!entry && params.itineraryCode && params.sailDate) {
    entry = g.byItineraryDate.get(`${params.itineraryCode}|${params.sailDate}`);
  }
  if (!entry) {
    if (!params.packageId && !(params.itineraryCode && params.sailDate)) {
      throw new HttpError(400, "Need packageId, or itineraryCode + sailDate");
    }
    throw new HttpError(404, "Sailing not tracked");
  }

  const cabinType = pickCabinType(entry, params.cabinType);
  const summary = summarize(entry, cabinType, g.recordDates);

  // Same itinerary on other dates, cheapest first, priced in the same cabin
  const alternatives = upcoming(g.byItinerary.get(entry.itineraryCode) || [], today)
    .filter((e) => e.packageId !== entry.packageId)
    .map((e) => ({ e, total: currentPrice(e, cabinType, g.recordDates) }))
    .filter(({ total }) => total != null)
    .sort((a, b) => a.total - b.total)
    .slice(0, MAX_ALTERNATIVES)
    .map(({ e, total }) => ({
      packageId: e.packageId,
      sailDate: e.sailDate,
      total,
      perNight: Math.ceil(total / e.duration),
    }));

  return {
    guestCount: g.guestCount,
    latestRecordDate: g.recordDates[g.recordDates.length - 1],
    sailing: sailingMeta(entry),
    cabinTypes: cabinOptions(entry, g.recordDates),
    ...summary,
    alternatives,
  };
}

function itineraryResponse(index, params, today) {
  if (!params.itineraryCode) throw new HttpError(400, "Need itineraryCode");
  const g = guestIndex(index, params.guestCount);
  const entries = upcoming(g.byItinerary.get(params.itineraryCode) || [], today);
  if (!entries.length) throw new HttpError(404, "Itinerary not tracked");

  const sailings = entries
    .sort((a, b) => a.sailDate.localeCompare(b.sailDate))
    .map((entry) => {
      const cabinType = pickCabinType(entry, params.cabinType);
      const { current, deal, status } = summarize(entry, cabinType, g.recordDates);
      return {
        packageId: entry.packageId,
        sailDate: entry.sailDate,
        cabinType,
        status,
        current,
        deal,
      };
    });

  const first = entries[0];
  return {
    guestCount: g.guestCount,
    latestRecordDate: g.recordDates[g.recordDates.length - 1],
    itinerary: {
      itineraryCode: first.itineraryCode,
      shipCode: first.shipCode,
      title: first.title,
      duration: first.duration,
      embarkationPortCode: first.embarkationPortCode,
      disembarkationPortCode: first.disembarkationPortCode,
    },
    sailings,
  };
}

const ROUTES = {
  "/api/sailing": sailingResponse,
  "/api/itinerary": itineraryResponse,
};

function createServer({ getIndex, allowedOrigins = [] }) {
  return http.createServer((req, res) => {
    const origin = req.headers.origin;
    const headers = { "Content-Type": "application/json" };
    if (
      origin &&
      (origin.startsWith("chrome-extension://") ||
        allowedOrigins.includes(origin))
    ) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers.Vary = "Origin";
    }
    const send = (status, body, extra = {}) => {
      res.writeHead(status, { ...headers, ...extra });
      res.end(JSON.stringify(body));
    };

    if (req.method === "OPTIONS") return send(204, {});
    if (req.method !== "GET") return send(405, { error: "GET only" });
    if (req.url.length > 2000) return send(414, { error: "URL too long" });

    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/health") {
      return send(200, { status: getIndex() ? "ok" : "loading" });
    }
    const handler = ROUTES[url.pathname];
    if (!handler) return send(404, { error: "Not found" });

    const index = getIndex();
    if (!index) return send(503, { error: "Price data still loading" });
    try {
      const today = new Date().toISOString().split("T")[0];
      const body = handler(index, readParams(url.searchParams), today);
      // Data changes once a day, so an hour of caching costs nothing
      send(200, body, { "Cache-Control": "public, max-age=3600" });
    } catch (error) {
      if (error instanceof HttpError) {
        return send(error.status, { error: error.message });
      }
      console.error(error);
      send(500, { error: "Internal error" });
    }
  });
}

async function main() {
  const config = {
    port: parseInt(process.env.PORT, 10) || 3000,
    dataDir: process.env.DATA_DIR || "/var/lib/cruise/sailing-data/",
    guestCounts: (process.env.GUEST_COUNTS || "1,2").split(",").map(Number),
    // charts limits anonymous users to 90 files; widening this exposes more
    // history publicly than charts does
    maxFiles: parseInt(process.env.MAX_FILES, 10) || 90,
    reloadHours: parseFloat(process.env.RELOAD_HOURS) || 6,
    allowedOrigins: (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .filter(Boolean),
  };

  let index = null;
  const load = async () => {
    try {
      index = await buildIndex({ ...config, log: console.log });
    } catch (error) {
      console.error("Index build failed; keeping previous index", error);
    }
  };

  createServer({
    getIndex: () => index,
    allowedOrigins: config.allowedOrigins,
  }).listen(config.port, () => console.log(`Listening on ${config.port}`));
  await load();
  setInterval(load, config.reloadHours * 3600 * 1000);
}

if (require.main === module) main();

module.exports = { createServer, sailingResponse, itineraryResponse };
