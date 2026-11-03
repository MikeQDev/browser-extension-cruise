// Works as a content script (global) and under node --test (module.exports).
(function (root) {
  const ITINERARY = /^[A-Za-z0-9._-]{3,80}$/;
  const PACKAGE = /^[A-Za-z0-9]{1,20}$/;
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const GUESTS = /^[1-9]$/;
  const CABIN = /^[A-Za-z]{1,20}$/;

  function first(params, keys, pattern) {
    for (const key of keys) {
      const value = params.get(key);
      if (value && pattern.test(value)) return value;
    }
    return null;
  }

  // Royal, Celebrity and MSC reuse a package across dates, so it needs a date
  function datedPackage(packageId, sailDate) {
    return packageId && sailDate ? { packageId, sailDate } : { sailDate };
  }

  const qs = (params) => new URLSearchParams(params).toString();
  const usDate = (iso) => `${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(0, 4)}`;

  // read pulls a sailing out of the page URL, using the same parameters the
  // cheapest-ncl booking links carry. A page with neither an itinerary nor a
  // package isn't about a sailing.
  const LINES = {
    ncl: {
      host: /(^|\.)ncl\.com$/i,
      site: "ncl.com",
      read: (q) => ({
        itineraryCode: first(q, ["itineraryCode"], ITINERARY),
        packageId: first(q, ["voyageId", "packageId"], PACKAGE),
        sailDate: first(q, ["departureDate"], ISO_DATE),
        guestCount: first(q, ["guestCount", "guests"], GUESTS),
        cabinType: first(
          q,
          ["selectedStateroomMeta", "stateroomTypeCode", "selectedMetaCategory"],
          CABIN,
        ),
      }),
      booking: (s) =>
        `https://www.ncl.com/vacation-builder/planning/stateroom?${qs({
          itineraryCode: s.itineraryCode,
          packageId: s.packageId,
          guests: s.guestCount || "1",
          stateroomTypeCode: s.cabinType || "INSIDE",
          gateway: "NONE",
        })}`,
    },
    carnival: {
      host: /(^|\.)carnival\.com$/i,
      site: "carnival.com",
      read: (q) => {
        const date = first(q, ["sailDate"], /^\d{8}$/);
        return {
          itineraryCode: first(q, ["itinCode"], ITINERARY),
          packageId: first(q, ["sailingID"], PACKAGE),
          sailDate: date && `${date.slice(4)}-${date.slice(0, 2)}-${date.slice(2, 4)}`,
          guestCount: first(q, ["numGuests"], GUESTS),
        };
      },
      booking: (s) =>
        `https://www.carnival.com/booking?${qs({
          embkCode: s.embarkationPortCode,
          itinCode: s.itineraryCode,
          durDays: s.duration,
          shipCode: s.shipCode,
          subRegionCode: s.destinationCode || "",
          sailingID: s.packageId,
          sailDate: usDate(s.sailDate),
          numGuests: s.guestCount || "1",
        })}`,
    },
    royal: {
      host: /(^|\.)royalcaribbean\.com$/i,
      site: "royalcaribbean.com",
      read: (q) => ({
        itineraryCode: first(q, ["groupId"], ITINERARY),
        ...datedPackage(first(q, ["packageCode"], PACKAGE), first(q, ["sailDate"], ISO_DATE)),
        guestCount: first(q, ["r0a"], GUESTS),
        cabinType: first(q, ["cabinClassType"], CABIN),
      }),
      booking: (s) =>
        `https://www.royalcaribbean.com/room-selection/rooms-and-guests?${qs({
          groupId: s.itineraryCode,
          packageCode: s.packageId,
          sailDate: s.sailDate,
          country: "USA",
          selectedCurrencyCode: "USD",
          shipCode: s.shipCode,
          cabinClassType: (s.cabinType || "I").toLowerCase(),
          r0a: s.guestCount || "1",
        })}`,
    },
    celebrity: {
      host: /(^|\.)celebritycruises\.com$/i,
      site: "celebritycruises.com",
      read: (q) => ({
        itineraryCode: first(q, ["groupId"], ITINERARY),
        ...datedPackage(
          first(q, ["pID", "packageCode"], PACKAGE),
          first(q, ["sDT", "sailDate"], ISO_DATE),
        ),
      }),
      // No guest count: Celebrity says "This ship has sailed!" when there's no cabin for that many
      booking: (s) =>
        `https://www.celebritycruises.com/booking-cruise/selectRoom/stateroomQuantity?${qs({
          groupId: s.itineraryCode,
          pID: s.packageId,
          sDT: s.sailDate,
          sCD: s.shipCode,
          sCT: "CO",
          country: "USA",
        })}`,
    },
    msc: {
      host: /(^|\.)msccruisesusa\.com$/i,
      site: "msccruisesusa.com",
      read: (q) => {
        const itineraryCode = first(q, ["CruiseID"], ITINERARY);
        // One code per sailing, with the date inside it: SE20261116MIAMIA
        const date = itineraryCode?.match(/^[A-Za-z0-9]{2}(\d{4})(\d{2})(\d{2})/);
        return {
          itineraryCode,
          sailDate: date && `${date[1]}-${date[2]}-${date[3]}`,
        };
      },
      booking: (s) => `https://www.msccruisesusa.com/Booking?${qs({ CruiseID: s.itineraryCode })}#/pricing`,
    },
    cunard: {
      host: /(^|\.)cunard\.com$/i,
      site: "cunard.com",
      // One code per sailing, used as both the itinerary and the package
      read: (_q, url) => {
        const code = url.pathname.match(/\/find-a-cruise\/([A-Za-z0-9]{1,20})(\/|$)/)?.[1];
        return { itineraryCode: code || null, packageId: code || null };
      },
      booking: (s) => `https://www.cunard.com/en-us/find-a-cruise/${s.itineraryCode}/${s.itineraryCode}`,
    },
    princess: {
      host: /(^|\.)princess\.com$/i,
      site: "princess.com",
      read: (q) => ({
        packageId: first(q, ["voyageCode"], PACKAGE),
        guestCount: first(q, ["guestCount"], GUESTS),
      }),
      booking: (s) =>
        `https://www.princess.com/itinerary-details/?${qs({
          voyageCode: s.packageId,
          guestCount: s.guestCount || "1",
        })}`,
    },
  };

  /**
   * Pull the sailing a cruise line's page is about out of its URL. A chosen
   * sailing has a package or a date on top of the itinerary. Returns null for
   * any other page.
   */
  function parseUrl(href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return null;
    }
    const line = Object.keys(LINES).find((key) => LINES[key].host.test(url.hostname));
    if (!line) return null;

    const { itineraryCode, packageId, sailDate, guestCount, cabinType } = LINES[line].read(
      url.searchParams,
      url,
    );
    if (!itineraryCode && !packageId) return null;

    return {
      line,
      kind: packageId || sailDate ? "sailing" : "itinerary",
      itineraryCode: itineraryCode ? itineraryCode.toUpperCase() : null,
      packageId: packageId ? packageId.toUpperCase() : null,
      sailDate: sailDate || null,
      guestCount: guestCount || null,
      cabinType: cabinType ? cabinType.toUpperCase() : null,
    };
  }

  const bookingUrl = (line, sailing) => LINES[line].booking(sailing);
  const siteName = (line) => LINES[line].site;

  // Same link shape charts' own search UI builds for "price history"
  function chartsUrl(base, line, sailing, guestCount) {
    const params = new URLSearchParams({
      cruiseLine: line,
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

  // count-cabins has no category code for HAVEN, so it can only answer with an error
  const canEstimateCabins = (line, data) =>
    line === "ncl" &&
    data.status === "available" &&
    Boolean(data.sailing.packageId) &&
    data.cabinType !== "HAVEN";

  // Same fallback category codes as the deal finder's "Estimate cabin counts" button
  const CABIN_CODE_PARAMS = {
    INSIDE: { insideCodes: "IT,IF,IX" },
    OCEANVIEW: { oceanviewCodes: "OT,OX" },
    BALCONY: { balconyCodes: "BT,BF,BX" },
  };

  const cabinCountParams = ({ sailing, cabinType, guestCount }) => ({
    shipCode: sailing.shipCode,
    packageId: sailing.packageId,
    cabinTypes: cabinType,
    guests: guestCount,
    ...CABIN_CODE_PARAMS[cabinType],
  });

  const api = { parseUrl, bookingUrl, siteName, chartsUrl, canEstimateCabins, cabinCountParams };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RadarParse = api;
})(globalThis);
