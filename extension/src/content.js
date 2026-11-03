(function () {
  const { parseNclUrl, bookingUrl, chartsUrl } = globalThis.RadarParse;
  const { CHARTS_URL } = globalThis.RADAR_CONFIG;
  const STORAGE_KEY = "radarCollapsed";
  const MAX_ITINERARY_ROWS = 8;

  const STYLE = `
    :host { all: initial; }
    .panel { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      width: 320px; max-height: 80vh; overflow: auto; background: #fff;
      color: #2c3e50; border: 1px solid #e1e8ed; border-radius: 10px;
      box-shadow: 0 6px 24px #16335433; font: 13px/1.4 system-ui, sans-serif; }
    .head { display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; background: #163354; color: #fff; cursor: pointer;
      border-radius: 10px 10px 0 0; font-weight: 600; }
    .panel.collapsed .head { border-radius: 10px; }
    .panel.collapsed .body { display: none; }
    .body { padding: 10px 12px 12px; }
    .muted { color: #64748b; font-size: 12px; }
    .title { font-weight: 600; margin-bottom: 2px; }
    .price { font-size: 24px; font-weight: 700; color: #1e293b; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; margin-top: 6px; }
    .stats b { color: #1e293b; }
    select { width: 100%; margin: 8px 0; padding: 4px; font: inherit; }
    svg { display: block; margin-top: 8px; }
    h4 { margin: 12px 0 4px; font-size: 12px; text-transform: uppercase; color: #475569; }
    a { color: #2d5ec0; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 3px 0; white-space: nowrap; }
    .foot { margin-top: 10px; }
  `;

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null) continue;
      if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value);
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      el.append(child instanceof Node ? child : String(child));
    }
    return el;
  }

  const dollars = (n) => (n == null ? "–" : `$${n.toLocaleString("en-US")}`);
  const shortDate = (iso, withYear = true) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: withYear ? "numeric" : undefined,
      timeZone: "UTC",
    });

  // Per-night line with a dot at the tracked low; sold-out days break the line
  function sparkline(history) {
    const w = 296;
    const ht = 60;
    const pts = history.map((p, i) => ({ i, v: p.perNight }));
    const values = pts.filter((p) => p.v != null).map((p) => p.v);
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const x = (i) => (pts.length === 1 ? 0 : (i / (pts.length - 1)) * (w - 8) + 4);
    const y = (v) => (max === min ? ht / 2 : ht - 6 - ((v - min) / (max - min)) * (ht - 12));

    let d = "";
    let pen = false;
    for (const p of pts) {
      if (p.v == null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`;
      pen = true;
    }
    const low = pts.find((p) => p.v === min);
    const last = [...pts].reverse().find((p) => p.v != null);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", w);
    svg.setAttribute("height", ht);
    svg.setAttribute("aria-label", "Price per night over time");
    const add = (tag, attrs) => {
      const el = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      svg.append(el);
    };
    add("path", { d, fill: "none", stroke: "#3b82f6", "stroke-width": 2 });
    add("circle", { cx: x(low.i), cy: y(low.v), r: 3.5, fill: "#15803d" });
    add("circle", { cx: x(last.i), cy: y(last.v), r: 3.5, fill: "#163354" });
    return svg;
  }

  // Prices come from a once-a-day NCL snapshot, and ncl.com's booking page
  // reads a different endpoint, so the page's live price can differ either way
  function asOfNote(date) {
    return h(
      "div",
      { class: "muted" },
      `Price as of ${shortDate(date)}. ncl.com's live price may differ.`,
    );
  }

  function perNightChange(total, duration) {
    if (total == null) return "–";
    const n = Math.round(total / duration);
    if (n === 0) return "no change";
    return `${n > 0 ? "+" : "−"}${dollars(Math.abs(n))}`;
  }

  function renderSailing(data, onCabinChange) {
    const { sailing, current, stats, guestCount } = data;
    const nights = sailing.duration;
    const guests = `${guestCount} guest${guestCount > 1 ? "s" : ""}`;

    let headline;
    if (data.status === "sold_out") headline = h("div", { class: "price" }, "Sold out");
    else if (data.status === "not_listed")
      headline = h("div", { class: "price" }, "Not listed");
    else
      headline = h(
        "div",
        {},
        h("span", { class: "price" }, `${dollars(current.perNight)}`),
        h("span", { class: "muted" }, ` /night · ${dollars(current.total)} total`),
      );

    const cheaper = data.alternatives.filter(
      (a) => !current || a.perNight < current.perNight,
    );

    return [
      h("div", { class: "title" }, sailing.title),
      h(
        "div",
        { class: "muted" },
        `${sailing.shipCode} · ${shortDate(sailing.sailDate)} · ${nights} nights · ${guests}`,
      ),
      h(
        "select",
        {
          "aria-label": "Cabin type",
          onchange: (e) => onCabinChange(e.target.value),
        },
        data.cabinTypes.map((c) =>
          h(
            "option",
            { value: c.code, selected: c.code === data.cabinType ? "" : null },
            `${c.code} · ${c.perNight == null ? "no price" : `${dollars(c.perNight)}/night`}`,
          ),
        ),
      ),
      headline,
      asOfNote(data.latestRecordDate),
      sparkline(data.history),
      h(
        "div",
        { class: "stats" },
        h("span", {}, "Low ", h("b", {}, dollars(stats.minPerNight))),
        h("span", {}, "High ", h("b", {}, dollars(stats.maxPerNight))),
        h("span", {}, "7 days ", h("b", {}, perNightChange(stats.change7d, nights))),
        h("span", {}, "30 days ", h("b", {}, perNightChange(stats.change30d, nights))),
      ),
      h(
        "div",
        { class: "muted" },
        stats.lowestOn ? `Low on ${shortDate(stats.lowestOn)} · ` : "",
        stats.firstTracked ? `tracked since ${shortDate(stats.firstTracked)}` : "",
      ),
      cheaper.length > 0 && [
        h("h4", {}, "Cheaper dates, same itinerary"),
        h(
          "ul",
          {},
          cheaper.map((a) =>
            h(
              "li",
              {},
              h(
                "a",
                {
                  href: bookingUrl({
                    itineraryCode: a.itineraryCode,
                    packageId: a.packageId,
                    guestCount,
                    cabinType: data.cabinType,
                  }),
                },
                shortDate(a.sailDate),
              ),
              h("span", {}, `${dollars(a.perNight)}/night`),
            ),
          ),
        ),
      ],
      h(
        "div",
        { class: "foot" },
        h(
          "a",
          { href: chartsUrl(CHARTS_URL, sailing, guestCount), target: "_blank", rel: "noopener" },
          "Full price history on CabinSaver →",
        ),
      ),
    ];
  }

  function renderItinerary(data) {
    const { itinerary, sailings, guestCount } = data;
    return [
      h("div", { class: "title" }, itinerary.title),
      h(
        "div",
        { class: "muted" },
        `${itinerary.shipCode} · ${itinerary.duration} nights · ${guestCount} guest${guestCount > 1 ? "s" : ""}`,
      ),
      asOfNote(data.latestRecordDate),
      h("h4", {}, "Upcoming sailings"),
      h(
        "ul",
        {},
        sailings.slice(0, MAX_ITINERARY_ROWS).map((s) =>
          h(
            "li",
            {},
            h(
              "a",
              {
                href: bookingUrl({
                  itineraryCode: s.itineraryCode,
                  packageId: s.packageId,
                  guestCount,
                  cabinType: s.cabinType,
                }),
              },
              shortDate(s.sailDate, false),
            ),
            h("span", {}, s.current ? `${dollars(s.current.perNight)}/night` : "sold out"),
          ),
        ),
      ),
      sailings.length > MAX_ITINERARY_ROWS &&
        h("div", { class: "muted" }, `+${sailings.length - MAX_ITINERARY_ROWS} more`),
    ];
  }

  function errorText(result) {
    if (result.status === 404) return "CabinSaver isn't tracking this sailing yet.";
    if (result.status === 0) return "Can't reach CabinSaver right now.";
    if (result.status === 429) return "Too many lookups. Try again in a minute.";
    return result.error || "Something went wrong.";
  }

  let host;
  let body;
  let panel;

  function ensurePanel() {
    if (host?.isConnected) return;
    host = h("div", { id: "cabinsaver-radar" });
    const shadow = host.attachShadow({ mode: "closed" });
    body = h("div", { class: "body" });
    panel = h(
      "div",
      { class: "panel" },
      h(
        "div",
        {
          class: "head",
          title: "Collapse or expand",
          onclick: () => {
            const collapsed = panel.classList.toggle("collapsed");
            chrome.storage.local.set({ [STORAGE_KEY]: collapsed });
          },
        },
        "Cruise Price History by CabinSaver",
        h("span", { "aria-hidden": "true" }, "▾"),
      ),
      body,
    );
    shadow.append(h("style", {}, STYLE), panel);
    chrome.storage.local.get(STORAGE_KEY, (stored) => {
      if (stored[STORAGE_KEY]) panel.classList.add("collapsed");
    });
    document.documentElement.append(host);
  }

  function show(...children) {
    ensurePanel();
    body.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
  }

  let requestSeq = 0;

  function load(parsed, cabinType) {
    const seq = ++requestSeq;
    show(h("div", { class: "muted" }, "Checking price history…"));
    const type = parsed.kind === "sailing" ? "sailing" : "itinerary";
    const params = {
      itineraryCode: parsed.itineraryCode,
      packageId: parsed.packageId,
      sailDate: parsed.sailDate,
      guestCount: parsed.guestCount,
      cabinType: cabinType || parsed.cabinType,
    };
    chrome.runtime.sendMessage({ type, params }, (result) => {
      // A newer navigation or cabin switch already replaced this request
      if (seq !== requestSeq) return;
      if (!result) return show(h("div", { class: "muted" }, "Can't reach CabinSaver right now."));
      if (!result.ok) return show(h("div", { class: "muted" }, errorText(result)));
      show(
        type === "sailing"
          ? renderSailing(result.data, (code) => load(parsed, code))
          : renderItinerary(result.data),
      );
    });
  }

  // ncl.com is a single-page app, so navigation doesn't reload this script
  let lastKey = null;
  function check() {
    const parsed = parseNclUrl(location.href);
    const key = parsed ? JSON.stringify(parsed) : null;
    if (key === lastKey) return;
    lastKey = key;
    if (!parsed) {
      host?.remove();
      return;
    }
    load(parsed);
  }

  check();
  setInterval(check, 1000);
})();
