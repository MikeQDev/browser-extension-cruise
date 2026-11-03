const test = require("node:test");
const assert = require("node:assert");
const { parseNclUrl, bookingUrl, chartsUrl } = require("../src/parse");

test("stateroom booking page yields the sailing", () => {
  const parsed = parseNclUrl(
    "https://www.ncl.com/booking/stateroom-offers/stateroom?itineraryCode=GETAWAY7NYCWRFNYC&shipCode=GETAWAY&guestCount=1&voyageId=21571499&selectedStateroomMeta=INSIDE",
  );
  assert.deepStrictEqual(parsed, {
    kind: "sailing",
    itineraryCode: "GETAWAY7NYCWRFNYC",
    packageId: "21571499",
    sailDate: null,
    guestCount: "1",
    cabinType: "INSIDE",
  });
});

test("vacation-builder page uses packageId, guests and stateroomTypeCode", () => {
  const parsed = parseNclUrl(
    "https://www.ncl.com/vacation-builder/planning/stateroom?itineraryCode=JOY4MIANPINASMIA&packageId=23379735&guests=2&stateroomTypeCode=balcony&gateway=NONE",
  );
  assert.strictEqual(parsed.packageId, "23379735");
  assert.strictEqual(parsed.guestCount, "2");
  assert.strictEqual(parsed.cabinType, "BALCONY");
});

test("departureDate alone is enough for a sailing lookup", () => {
  const parsed = parseNclUrl(
    "https://www.ncl.com/booking/idp/cabin-picker?itineraryCode=ESCAPE7MIABZERTBCZMCMAMIA&departureDate=2025-01-25&guestCount=1",
  );
  assert.strictEqual(parsed.kind, "sailing");
  assert.strictEqual(parsed.sailDate, "2025-01-25");
});

test("itinerary page before a sail date is picked yields the itinerary", () => {
  const parsed = parseNclUrl(
    "https://www.ncl.com/vacation-builder/planning/cruiseItinerary?itineraryCode=JOY4MIANPINASMIA&guests=1&gateway=NONE",
  );
  assert.strictEqual(parsed.kind, "itinerary");
  assert.strictEqual(parsed.itineraryCode, "JOY4MIANPINASMIA");
});

test("non-sailing pages and other sites are ignored", () => {
  assert.strictEqual(parseNclUrl("https://www.ncl.com/vacations?guests=1"), null);
  assert.strictEqual(parseNclUrl("https://www.ncl.com/cruises/alaska-cruises"), null);
  // Old detail-page form; ncl.com now redirects it to /vacations?missingItinerary=true
  assert.strictEqual(
    parseNclUrl("https://www.ncl.com/cruises/4-day-bahamas-JOY4MIANPINASMIA"),
    null,
  );
  assert.strictEqual(
    parseNclUrl("https://evil.example/?itineraryCode=JOY4MIANPINASMIA"),
    null,
  );
  assert.strictEqual(parseNclUrl("not a url"), null);
});

test("malformed params are dropped, not passed through", () => {
  const parsed = parseNclUrl(
    "https://www.ncl.com/booking/x?itineraryCode=JOY4MIA&voyageId=12;drop&guestCount=12",
  );
  assert.strictEqual(parsed.packageId, null);
  assert.strictEqual(parsed.guestCount, null);
  assert.strictEqual(parsed.kind, "itinerary");
});

test("links", () => {
  assert.match(
    bookingUrl({ itineraryCode: "JOY4MIA", packageId: "1", guestCount: "1", cabinType: "INSIDE" }),
    /^https:\/\/www\.ncl\.com\/vacation-builder\/planning\/stateroom\?itineraryCode=JOY4MIA&packageId=1&guests=1&stateroomTypeCode=INSIDE/,
  );
  const url = new URL(
    chartsUrl(
      "https://cabinsaver.com/charts/",
      { shipCode: "JOY", sailDate: "2026-11-16", embarkationPortCode: "MIA", disembarkationPortCode: "MIA" },
      1,
    ),
  );
  assert.strictEqual(url.searchParams.get("ships"), "JOY");
  assert.strictEqual(url.searchParams.get("startDate"), "2026-11-16");
  assert.strictEqual(url.searchParams.get("autoLoad"), "true");
});
