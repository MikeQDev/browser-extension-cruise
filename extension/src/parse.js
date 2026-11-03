// Works as a content script (global) and under node --test (module.exports).
(function (root) {
  const CABIN_KEYS = [
    "selectedStateroomMeta",
    "stateroomTypeCode",
    "selectedMetaCategory",
  ];

  function first(params, keys, pattern) {
    for (const key of keys) {
      const value = params.get(key);
      if (value && pattern.test(value)) return value;
    }
    return null;
  }

  /**
   * Pull the sailing an ncl.com page is about out of its URL. Every
   * vacation-builder and booking page carries itineraryCode; a chosen sailing
   * adds voyageId/packageId or departureDate. Returns null for any other page.
   */
  function parseNclUrl(href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return null;
    }
    if (!/(^|\.)ncl\.com$/i.test(url.hostname)) return null;
    const q = url.searchParams;

    const itineraryCode = first(q, ["itineraryCode"], /^[A-Za-z0-9._]{3,80}$/);
    if (!itineraryCode) return null;

    const packageId = first(q, ["voyageId", "packageId"], /^\d{1,12}$/);
    const sailDate = first(q, ["departureDate"], /^\d{4}-\d{2}-\d{2}$/);
    const guestCount = first(q, ["guestCount", "guests"], /^[1-9]$/);
    const cabinType = first(q, CABIN_KEYS, /^[A-Za-z]{2,20}$/);

    return {
      kind: packageId || sailDate ? "sailing" : "itinerary",
      itineraryCode: itineraryCode.toUpperCase(),
      packageId,
      sailDate,
      guestCount,
      cabinType: cabinType ? cabinType.toUpperCase() : null,
    };
  }

  function bookingUrl({ itineraryCode, packageId, guestCount, cabinType }) {
    const params = new URLSearchParams({
      itineraryCode,
      packageId,
      guests: guestCount || "1",
      stateroomTypeCode: cabinType || "INSIDE",
      gateway: "NONE",
    });
    return `https://www.ncl.com/vacation-builder/planning/stateroom?${params}`;
  }

  // Same link shape charts' own search UI builds for "price history"
  function chartsUrl(base, sailing, guestCount) {
    const params = new URLSearchParams({
      cruiseLine: "ncl",
      ships: sailing.shipCode,
      startDate: sailing.sailDate,
      endDate: sailing.sailDate,
      embarkCodes: sailing.embarkationPortCode,
      debarkCodes: sailing.disembarkationPortCode,
      guestCount: String(guestCount),
      autoLoad: "true",
    });
    return `${base}?${params}`;
  }

  const api = { parseNclUrl, bookingUrl, chartsUrl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RadarParse = api;
})(globalThis);
