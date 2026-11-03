# Cruise Price History by CabinSaver

Chrome extension that shows a sailing's price history on ncl.com, using the `/api/sailing` and `/api/itinerary` endpoints of the deployed charts service. This repo has no server of its own.

## Layout

- `extension/`: Manifest V3 extension. The content script reads the sailing from the ncl.com URL, and the service worker calls charts.

## Run locally

1. Chrome → `chrome://extensions` → Developer mode → Load unpacked → `extension/`
2. Open an ncl.com booking page, e.g. `https://www.ncl.com/vacation-builder/planning/stateroom?itineraryCode=JOY4MIANPINASMIA&packageId=23379735&guests=1&stateroomTypeCode=INSIDE&gateway=NONE`

To test against a local charts server, set `API_BASE` in `extension/src/config.js` and add that origin to `host_permissions` in `extension/manifest.json`.

Tests: `node --test extension/test/`

## API

Documented at `GET https://cabinsaver.com/charts/api` and implemented in `charts/src/sailing.js`.

| Endpoint | Params | Returns |
|---|---|---|
| `GET /charts/api/sailing` | `packageId`, or `itineraryCode` + `sailDate`; optional `guestCount`, `cabinType` | History, low/high/median, 7/30-day change, up to 5 cheapest other dates on the same itinerary |
| `GET /charts/api/itinerary` | `itineraryCode`; optional `guestCount`, `cabinType` | Upcoming sailings with current price |

History covers the last 90 record dates, the same window charts gives anonymous users.

## Pages recognised

| ncl.com page | Shows |
|---|---|
| URL has `itineraryCode` + `voyageId`/`packageId` (booking and vacation-builder flows) | Sailing panel |
| URL has `itineraryCode` + `departureDate` | Sailing panel |
| URL has `itineraryCode` only (itinerary page before a date is picked) | Itinerary panel |

## Deploy

1. Deploy charts with the new endpoints
2. Add the `/charts/api/(sailing|itinerary)` nginx block from the charts README
3. Publish `extension/`

## Future scope

Off in `extension/src/config.js` `FEATURES` because each one needs a change in another project:

| Flag | Feature | Needs |
|---|---|---|
| `watchSailing` | "Watch this sailing" button that creates a price-drop alert | deal-alerts: per-sailing subscribe endpoint |
| `cabinAvailability` | Live cabins-left count | count-cabins: CORS and a JSON response the panel can read |

Not built yet: other cruise lines (extend the charts lookups and add a URL parser per site) and badges on ncl.com search results.
