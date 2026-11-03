const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildIndex } = require("../src/history");
const { dealRating } = require("../src/score");
const { sailingResponse, itineraryResponse } = require("../src/server");

const TODAY = "2026-10-30";

function cruise(sailings) {
  return {
    code: "JOY4MIANPINASMIA",
    bundleType: "cruise",
    fullTitle: "4-Day Bahamas",
    shipCode: "JOY",
    duration: 4,
    embarkationPortCode: "MIA",
    disembarkationPortCode: "MIA",
    sailings,
  };
}

function sailing(packageId, date, inside) {
  return {
    packageId,
    sailStartDate: Date.parse(`${date}T05:00:00Z`),
    pricing: [{ code: "INSIDE", combinedPrice: inside }, { code: "HAVEN" }],
  };
}

// Six days of 1-guest files; sailing 100 drifts down to its low on the last day
const DAYS = [
  ["2026-10-25", 400],
  ["2026-10-26", 480],
  ["2026-10-27", 440],
  ["2026-10-28", undefined],
  ["2026-10-29", 420],
  ["2026-10-30", 360],
];

async function fixtureIndex() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-"));
  for (const [date, price] of DAYS) {
    const data = [
      cruise([sailing("100", "2026-11-16", price), sailing("101", "2026-11-30", 200)]),
      { ...cruise([sailing("900", "2026-12-01", 50)]), bundleType: "cruiselandtour" },
    ];
    fs.writeFileSync(path.join(dir, `1g-itineraries-${date}-00:00.json`), JSON.stringify(data));
  }
  // A partial write sorts after the real file and must not replace it
  fs.writeFileSync(
    path.join(dir, "1g-itineraries-2026-10-30-00:00.json.tmp"),
    "not json",
  );
  return buildIndex({ dataDir: dir, guestCounts: [1], maxFiles: 90 });
}

test("sailing lookup by packageId returns history, stats and deal", async () => {
  const index = await fixtureIndex();
  const res = sailingResponse(index, { packageId: "100" }, TODAY);
  assert.strictEqual(res.cabinType, "INSIDE");
  assert.strictEqual(res.status, "available");
  assert.deepStrictEqual(res.current, { total: 360, perNight: 90 });
  assert.strictEqual(res.history.length, 6);
  assert.strictEqual(res.history[3].total, null); // sold-out day kept as a gap
  assert.strictEqual(res.stats.min, 360);
  assert.strictEqual(res.stats.max, 480);
  assert.strictEqual(res.stats.points, 5);
  assert.deepStrictEqual(res.deal, { score: 100, label: "Lowest price tracked" });
  assert.deepStrictEqual(res.alternatives.map((a) => a.packageId), ["101"]);
});

test("sailing lookup falls back to itinerary + date and ignores land tours", async () => {
  const index = await fixtureIndex();
  const res = sailingResponse(
    index,
    { itineraryCode: "JOY4MIANPINASMIA", sailDate: "2026-11-30" },
    TODAY,
  );
  assert.strictEqual(res.sailing.packageId, "101");
  assert.throws(() => sailingResponse(index, { packageId: "900" }, TODAY), { status: 404 });
});

test("unpriced cabin reports sold out; unknown cabin falls back to INSIDE", async () => {
  const index = await fixtureIndex();
  assert.strictEqual(
    sailingResponse(index, { packageId: "100", cabinType: "HAVEN" }, TODAY).status,
    "sold_out",
  );
  assert.strictEqual(
    sailingResponse(index, { packageId: "100", cabinType: "SPA" }, TODAY).cabinType,
    "INSIDE",
  );
});

test("missing params, unknown guest count and past sailings are rejected", async () => {
  const index = await fixtureIndex();
  assert.throws(() => sailingResponse(index, {}, TODAY), { status: 400 });
  assert.throws(() => sailingResponse(index, { packageId: "100", guestCount: "3" }, TODAY), {
    status: 404,
  });
  assert.throws(
    () => itineraryResponse(index, { itineraryCode: "JOY4MIANPINASMIA" }, "2027-01-01"),
    { status: 404 },
  );
});

test("itinerary lists upcoming sailings by date", async () => {
  const index = await fixtureIndex();
  const res = itineraryResponse(index, { itineraryCode: "JOY4MIANPINASMIA" }, TODAY);
  assert.deepStrictEqual(res.sailings.map((s) => s.sailDate), ["2026-11-16", "2026-11-30"]);
});

test("deal rating bands", () => {
  assert.strictEqual(dealRating(null, 1, 2, 10).label, "No current price");
  assert.strictEqual(dealRating(100, 100, 200, 4).label, "Not enough history");
  assert.strictEqual(dealRating(120, 100, 200, 10).label, "Great price");
  assert.strictEqual(dealRating(150, 100, 200, 10).label, "Good price");
  assert.strictEqual(dealRating(170, 100, 200, 10).label, "Fair price");
  assert.strictEqual(dealRating(200, 100, 200, 10).label, "High price");
});
