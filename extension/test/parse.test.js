const test = require("node:test");
const assert = require("node:assert");
const {
  parseUrl,
  bookingUrl,
  siteName,
  chartsUrl,
  canEstimateCabins,
  cabinCountParams,
  isNclSearchPage,
  cheapestSailing,
  guestsParam,
  cardPerNight,
  priceTint,
} = require("../src/parse");

test("stateroom booking page yields the sailing", () => {
  const parsed = parseUrl(
    "https://www.ncl.com/booking/stateroom-offers/stateroom?itineraryCode=GETAWAY7NYCWRFNYC&shipCode=GETAWAY&guestCount=1&voyageId=21571499&selectedStateroomMeta=INSIDE",
  );
  assert.deepStrictEqual(parsed, {
    line: "ncl",
    kind: "sailing",
    itineraryCode: "GETAWAY7NYCWRFNYC",
    packageId: "21571499",
    sailDate: null,
    guestCount: "1",
    cabinType: "INSIDE",
  });
});

test("vacation-builder page uses packageId, guests and stateroomTypeCode", () => {
  const parsed = parseUrl(
    "https://www.ncl.com/vacation-builder/planning/stateroom?itineraryCode=JOY4MIANPINASMIA&packageId=23379735&guests=2&stateroomTypeCode=balcony&gateway=NONE",
  );
  assert.strictEqual(parsed.packageId, "23379735");
  assert.strictEqual(parsed.guestCount, "2");
  assert.strictEqual(parsed.cabinType, "BALCONY");
});

test("departureDate alone is enough for a sailing lookup", () => {
  const parsed = parseUrl(
    "https://www.ncl.com/booking/idp/cabin-picker?itineraryCode=ESCAPE7MIABZERTBCZMCMAMIA&departureDate=2025-01-25&guestCount=1",
  );
  assert.strictEqual(parsed.kind, "sailing");
  assert.strictEqual(parsed.sailDate, "2025-01-25");
});

test("itinerary page before a sail date is picked yields the itinerary", () => {
  const parsed = parseUrl(
    "https://www.ncl.com/vacation-builder/planning/cruiseItinerary?itineraryCode=JOY4MIANPINASMIA&guests=1&gateway=NONE",
  );
  assert.strictEqual(parsed.kind, "itinerary");
  assert.strictEqual(parsed.itineraryCode, "JOY4MIANPINASMIA");
});

test("itinerary codes with underscores, dots and long names are recognised", () => {
  for (const code of ["PRIDE_AMER7HNLOGGITOKOANWKHNL", `A.B${"C".repeat(64)}`]) {
    const parsed = parseUrl(`https://www.ncl.com/booking/x?itineraryCode=${code}&voyageId=1`);
    assert.strictEqual(parsed.itineraryCode, code);
  }
});

test("non-sailing pages and other sites are ignored", () => {
  assert.strictEqual(parseUrl("https://www.ncl.com/vacations?guests=1"), null);
  assert.strictEqual(parseUrl("https://www.ncl.com/cruises/alaska-cruises"), null);
  // Old detail-page form; ncl.com now redirects it to /vacations?missingItinerary=true
  assert.strictEqual(
    parseUrl("https://www.ncl.com/cruises/4-day-bahamas-JOY4MIANPINASMIA"),
    null,
  );
  assert.strictEqual(
    parseUrl("https://evil.example/?itineraryCode=JOY4MIANPINASMIA"),
    null,
  );
  assert.strictEqual(parseUrl("not a url"), null);
});

test("malformed params are dropped, not passed through", () => {
  const parsed = parseUrl(
    "https://www.ncl.com/booking/x?itineraryCode=JOY4MIA&voyageId=12;drop&guestCount=12",
  );
  assert.strictEqual(parsed.packageId, null);
  assert.strictEqual(parsed.guestCount, null);
  assert.strictEqual(parsed.kind, "itinerary");
});

test("links", () => {
  assert.match(
    bookingUrl("ncl", { itineraryCode: "JOY4MIA", packageId: "1", guestCount: "1", cabinType: "INSIDE" }),
    /^https:\/\/www\.ncl\.com\/vacation-builder\/planning\/stateroom\?itineraryCode=JOY4MIA&packageId=1&guests=1&stateroomTypeCode=INSIDE/,
  );
  const url = new URL(
    chartsUrl(
      "https://cabinsaver.com/charts/",
      "royal",
      { shipCode: "JOY", sailDate: "2026-11-16", embarkationPortCode: "MIA", disembarkationPortCode: "MIA" },
      1,
    ),
  );
  assert.strictEqual(url.searchParams.get("cruiseLine"), "royal");
  assert.strictEqual(url.searchParams.get("ships"), "JOY");
  assert.strictEqual(url.searchParams.get("startDate"), "2026-11-16");
  assert.strictEqual(url.searchParams.get("autoLoad"), "true");
});

const SAILING = {
  packageId: "WN4BH357",
  itineraryCode: "WN04MIA-1040267344",
  sailDate: "2026-11-16",
  shipCode: "WN",
  embarkationPortCode: "MIA",
  destinationCode: "BH",
  duration: 4,
  guestCount: 2,
};

test("each line's booking link parses back to the same sailing", () => {
  const cases = [
    ["ncl", { itineraryCode: "JOY4MIA", packageId: "100" }, { packageId: "100", guestCount: "2" }],
    ["carnival", { itineraryCode: "LXQ", packageId: "22443" }, { packageId: "22443", sailDate: "2026-11-16", guestCount: "2" }],
    ["royal", {}, { packageId: "WN4BH357", sailDate: "2026-11-16", guestCount: "2" }],
    ["celebrity", {}, { packageId: "WN4BH357", sailDate: "2026-11-16", guestCount: null }],
    ["msc", { itineraryCode: "SE20261116MIAMIA" }, { packageId: null, sailDate: "2026-11-16", guestCount: null }],
    ["cunard", { itineraryCode: "M714" }, { packageId: "M714", sailDate: null, guestCount: null }],
    ["princess", { packageId: "A716A", itineraryCode: "ZBS02A" }, { packageId: "A716A", sailDate: null, guestCount: "2" }],
  ];
  for (const [line, overrides, expected] of cases) {
    const parsed = parseUrl(bookingUrl(line, { ...SAILING, ...overrides }));
    assert.strictEqual(parsed.line, line);
    assert.strictEqual(parsed.kind, "sailing", line);
    for (const [key, value] of Object.entries(expected)) {
      assert.strictEqual(parsed[key], value, `${line} ${key}`);
    }
  }
});

test("a reused package without a date is only an itinerary", () => {
  for (const url of [
    "https://www.royalcaribbean.com/room-selection/rooms-and-guests?groupId=WN04MIA-1040267344&packageCode=WN4BH357",
    "https://www.celebritycruises.com/booking-cruise/selectRoom/stateroomQuantity?groupId=RF03FLL-327727776&pID=RF3BH290",
  ]) {
    const parsed = parseUrl(url);
    assert.strictEqual(parsed.kind, "itinerary");
    assert.strictEqual(parsed.packageId, null);
  }
});

test("itinerary pages without a chosen sailing", () => {
  assert.strictEqual(parseUrl("https://www.carnival.com/itinerary/x?itinCode=LXQ").kind, "itinerary");
});

test("other lines' non-sailing pages are ignored, and lookalike hosts too", () => {
  for (const url of [
    "https://www.carnival.com/cruise-search?port=MIA",
    "https://www.royalcaribbean.com/cruises",
    "https://www.princess.com/",
    "https://www.cunard.com/en-us/find-a-cruise",
    "https://www.msccruisesusa.com/Booking?CruiseID=bad;code",
    "https://www.virginvoyages.com/book/voyage-planner/choose-a-cabin/insider?packageCode=7NSJRP&voyageId=SC1",
    "https://notcarnival.com/booking?itinCode=LXQ",
    "https://carnival.com.evil.example/booking?itinCode=LXQ",
  ]) {
    assert.strictEqual(parseUrl(url), null, url);
  }
});

test("site names", () => {
  assert.strictEqual(siteName("royal"), "royalcaribbean.com");
});

test("cabin estimates are offered only for available NCL sailings with a count", () => {
  const data = { status: "available", cabinType: "INSIDE", sailing: { packageId: "23379735" } };
  assert.strictEqual(canEstimateCabins("ncl", data), true);
  assert.strictEqual(canEstimateCabins("carnival", data), false);
  assert.strictEqual(canEstimateCabins("ncl", { ...data, status: "sold_out" }), false);
  assert.strictEqual(canEstimateCabins("ncl", { ...data, status: "not_listed" }), false);
  assert.strictEqual(canEstimateCabins("ncl", { ...data, cabinType: "HAVEN" }), false);
  assert.strictEqual(canEstimateCabins("ncl", { ...data, sailing: {} }), false);
});

test("cabin count params carry the deal finder's fallback codes", () => {
  const sailing = { shipCode: "JOY", packageId: "23379735" };
  assert.deepStrictEqual(cabinCountParams({ sailing, cabinType: "INSIDE", guestCount: 2 }), {
    shipCode: "JOY",
    packageId: "23379735",
    cabinTypes: "INSIDE",
    guests: 2,
    insideCodes: "IT,IF,IX",
  });
  assert.deepStrictEqual(cabinCountParams({ sailing, cabinType: "STUDIO", guestCount: 1 }), {
    shipCode: "JOY",
    packageId: "23379735",
    cabinTypes: "STUDIO",
    guests: 1,
  });
});

test("only NCL's search page gets card buttons", () => {
  assert.strictEqual(isNclSearchPage("https://www.ncl.com/vacations"), true);
  assert.strictEqual(isNclSearchPage("https://www.ncl.com/vacations?ships=JOY"), true);
  assert.strictEqual(isNclSearchPage("https://www.ncl.com/vacation-builder"), false);
  assert.strictEqual(isNclSearchPage("https://www.carnival.com/vacations"), false);
});

test("a card opens on its cheapest priced sailing", () => {
  const sailing = (sailDate, total) => ({ sailDate, current: total && { total } });
  const sailings = [sailing("2026-11-16", 259), sailing("2026-11-23", null), sailing("2026-11-30", 199)];
  assert.strictEqual(cheapestSailing(sailings).sailDate, "2026-11-30");
  assert.strictEqual(cheapestSailing([sailing("2026-11-23", null)]), null);
});

test("a card link parses to its itinerary", () => {
  const parsed = parseUrl("https://www.ncl.com/vacation-builder?itineraryCode=JOY4MIANPINASMIA");
  assert.strictEqual(parsed.kind, "itinerary");
  assert.strictEqual(parsed.itineraryCode, "JOY4MIANPINASMIA");
});

test("card per-night price comes from the card's text", () => {
  assert.strictEqual(cardPerNight("From $209 PP/USD", "4-Day Bahamas Round-Trip Miami"), 53);
  assert.strictEqual(cardPerNight("From $1,919", "12-Day Panama Canal"), 160);
  assert.strictEqual(cardPerNight("Call for price", "4-Day Bahamas"), null);
  assert.strictEqual(cardPerNight("From $209", "Bahamas"), null);
});

test("price tints follow the per-night bands", () => {
  const green = priceTint(100);
  const yellow = priceTint(101);
  const orange = priceTint(125);
  const red = priceTint(150);
  assert.strictEqual(new Set([green, yellow, orange, red]).size, 4);
  assert.strictEqual(priceTint(1), green);
  assert.strictEqual(priceTint(124), yellow);
  assert.strictEqual(priceTint(149), orange);
  assert.strictEqual(priceTint(400), red);
  assert.strictEqual(priceTint(null), null);
});

test("the guests param is read from the search page URL", () => {
  assert.strictEqual(guestsParam("https://www.ncl.com/vacations?guests=3"), "3");
  assert.strictEqual(guestsParam("https://www.ncl.com/vacations"), null);
  assert.strictEqual(guestsParam("https://www.ncl.com/vacations?guests=abc"), null);
});
