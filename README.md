# Cruise Price History by CabinSaver

Chrome extension that shows a sailing's price history and a deal rating on ncl.com, backed by a small API over the NCL data the scrapers already write to `/var/lib/cruise/sailing-data/`. Reads that data only and changes no other project.

## Layout

- `api/`: dependency-free Node server. Builds a compact in-memory price index (~80MB for 90 days × 1 and 2 guests, ~4s to build) and rebuilds it every `RELOAD_HOURS`.
- `extension/`: Manifest V3 extension. The content script reads the sailing from the ncl.com URL, and the service worker calls the API.

## Run locally

1. `cd api && PORT=8131 npm start`
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → `extension/`
3. Open an ncl.com booking page, e.g. `https://www.ncl.com/vacation-builder/planning/stateroom?itineraryCode=JOY4MIANPINASMIA&packageId=23379735&guests=1&stateroomTypeCode=INSIDE&gateway=NONE`

Tests: `node --test api/test/ extension/test/`

## API

| Endpoint | Params | Returns |
|---|---|---|
| `GET /api/sailing` | `packageId`, or `itineraryCode` + `sailDate`; optional `guestCount`, `cabinType` | History, low/high/median, 7/30-day change, deal rating, up to 5 cheaper dates on the same itinerary |
| `GET /api/itinerary` | `itineraryCode`; optional `guestCount`, `cabinType` | Upcoming sailings with current price and deal rating |
| `GET /api/health` | | `ok` or `loading` |

Env: `PORT` (3000), `DATA_DIR`, `GUEST_COUNTS` (`1,2`), `MAX_FILES` (90), `RELOAD_HOURS` (6), `ALLOWED_ORIGINS` (extra CORS origins; `chrome-extension://` is always allowed).

`MAX_FILES` defaults to 90 to match the history charts gives anonymous users. Raising it to 365 gives longer trends but makes that history public.

### Deal rating

Where today's price sits in this sailing's own tracked range: 100 at its tracked low, 0 at its tracked high. Fewer than 5 priced days gives "Not enough history".

| Score | Label |
|---|---|
| at tracked low | Lowest price tracked |
| ≥ 75 | Great price |
| ≥ 50 | Good price |
| ≥ 25 | Fair price |
| < 25 | High price |

## Pages recognised

| ncl.com page | Shows |
|---|---|
| URL has `itineraryCode` + `voyageId`/`packageId` (booking and vacation-builder flows) | Sailing panel |
| URL has `itineraryCode` + `departureDate` | Sailing panel |
| URL has `itineraryCode` only (itinerary page before a date is picked) | Itinerary panel |

## Deploy (not done)

1. `cd api && docker compose up -d --build`
2. Proxy a public path to port 8131 in nginx
3. Set `API_BASE` in `extension/src/config.js` and add that origin to `host_permissions` in `extension/manifest.json`

## Future scope

Off in `extension/src/config.js` `FEATURES` because each one needs a change in another project:

| Flag | Feature | Needs |
|---|---|---|
| `watchSailing` | "Watch this sailing" button that creates a price-drop alert | deal-alerts: per-sailing subscribe endpoint |
| `cabinAvailability` | Live cabins-left count | count-cabins: CORS and a JSON response the panel can read |

Not built yet (no other project involved): other cruise lines (index their data dirs and add a URL parser per site) and badges on ncl.com search results.
