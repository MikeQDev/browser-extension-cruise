(function () {
  const { parseUrl, bookingUrl, siteName, chartsUrl } = globalThis.RadarParse;
  const { CHARTS_URL } = globalThis.RADAR_CONFIG;
  const STORAGE_KEY = "radarCollapsed";
  const MAX_ITINERARY_ROWS = 8;

  const STYLE = `
    :host { all: initial; }
    .panel { position: fixed; right: 16px; bottom: 72px; z-index: 2147483647;
      width: 320px; max-height: 80vh; overflow: auto; background: #fff;
      color: #2c3e50; border: 1px solid #e1e8ed; border-radius: 10px;
      box-shadow: 0 6px 24px #16335433; font: 13px/1.4 system-ui, sans-serif; }
    .head { display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; background: #163354; color: #fff; cursor: pointer;
      border-radius: 10px 10px 0 0; font-weight: 600; }
    .brand { display: flex; align-items: center; gap: 8px; }
    .logo { width: 20px; height: 20px; padding: 1px; box-sizing: border-box;
      background: #fff; border-radius: 4px; flex: none; }
    .panel.collapsed .head { border-radius: 10px; }
    .panel.collapsed .body { display: none; }
    .body { padding: 10px 12px 12px; }
    .muted { color: #64748b; font-size: 12px; }
    .title { font-weight: 600; margin-bottom: 2px; }
    .price { font-size: 24px; font-weight: 700; color: #1e293b; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; margin-top: 6px; }
    .stats b { color: #1e293b; }
    select { width: 100%; margin: 8px 0; padding: 4px; font: inherit; }
    .chart { position: relative; margin-top: 8px; }
    .tip { position: absolute; pointer-events: none; padding: 4px 8px; border-radius: 6px;
      background: #163354; color: #fff; font-size: 12px; white-space: nowrap; }
    svg { display: block; }
    svg text { fill: #64748b; font-size: 10px; font-variant-numeric: tabular-nums; }
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

  function niceTicks(min, max, intervals = 3) {
    const raw = Math.max(1, (max - min || max * 0.1) / intervals);
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].find((m) => m * mag >= raw) * mag;
    let lo = Math.floor(min / step) * step;
    let hi = Math.ceil(max / step) * step;
    if (lo === hi) {
      lo -= step;
      hi += step;
    }
    const ticks = [];
    for (let v = lo; v <= hi; v += step) ticks.push(v);
    return ticks;
  }

  // Per-night line with a dot at the tracked low; sold-out days break the line
  function priceChart(history) {
    const w = 296;
    const ht = 140;
    const m = { top: 20, right: 8, bottom: 18, left: 40 };
    const right = w - m.right;
    const bottom = ht - m.bottom;
    const time = (date) => Date.parse(`${date}T00:00:00Z`);
    const pts = history.map((p) => ({
      date: p.date,
      t: time(p.date),
      v: p.perNight,
      total: p.total,
    }));
    const values = pts.filter((p) => p.v != null).map((p) => p.v);
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const yTicks = niceTicks(min, Math.max(...values));
    const yLo = yTicks[0];
    const yHi = yTicks.at(-1);
    const t0 = pts[0].t;
    const t1 = pts.at(-1).t;
    const x = (t) => m.left + ((t - t0) / (t1 - t0 || 1)) * (right - m.left);
    const y = (v) => bottom - ((v - yLo) / (yHi - yLo)) * (bottom - m.top);

    let d = "";
    let pen = false;
    for (const p of pts) {
      if (p.v == null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      pen = true;
    }
    const low = pts.find((p) => p.v === min);
    const last = pts.findLast((p) => p.v != null);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", w);
    svg.setAttribute("height", ht);
    svg.setAttribute("aria-label", "Price per night over time");
    const add = (tag, attrs, text) => {
      const el = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      if (text != null) el.textContent = text;
      svg.append(el);
      return el;
    };

    add("text", { x: 0, y: 9 }, "Per night");
    for (const v of yTicks) {
      if (v !== yLo) add("line", { x1: m.left, x2: right, y1: y(v), y2: y(v), stroke: "#eef2f6" });
      add("text", { x: m.left - 5, y: y(v) + 3.5, "text-anchor": "end" }, dollars(v));
    }

    const DAY = 86400000;
    const xTicks = [
      { t: t0, anchor: "start" },
      (t1 - t0) / DAY >= 2 && { t: t0 + Math.round((t1 - t0) / 2 / DAY) * DAY, anchor: "middle" },
      { t: t1, anchor: "end" },
    ].filter(Boolean);
    for (const { t, anchor } of xTicks) {
      add("line", { x1: x(t), x2: x(t), y1: bottom, y2: bottom + 3, stroke: "#94a3b8" });
      const label = shortDate(new Date(t).toISOString().slice(0, 10), false);
      add("text", { x: x(t), y: ht - 3, "text-anchor": anchor }, label);
    }
    add("line", { x1: m.left, x2: m.left, y1: m.top, y2: bottom, stroke: "#94a3b8" });
    add("line", { x1: m.left, x2: right, y1: bottom, y2: bottom, stroke: "#94a3b8" });

    const cross = add("line", { y1: m.top, y2: bottom, stroke: "#94a3b8", visibility: "hidden" });
    add("path", { d, fill: "none", stroke: "#3b82f6", "stroke-width": 2 });
    const marker = add("circle", {
      r: 4,
      fill: "#3b82f6",
      stroke: "#fff",
      "stroke-width": 2,
      visibility: "hidden",
    });
    add("circle", { cx: x(low.t), cy: y(low.v), r: 3.5, fill: "#15803d" });
    add("circle", { cx: x(last.t), cy: y(last.v), r: 3.5, fill: "#163354" });

    const tip = h("div", { class: "tip", hidden: "" });
    const hide = () => {
      tip.hidden = true;
      cross.setAttribute("visibility", "hidden");
      marker.setAttribute("visibility", "hidden");
    };
    svg.addEventListener("pointerleave", hide);
    svg.addEventListener("pointermove", (e) => {
      const px = e.clientX - svg.getBoundingClientRect().left;
      const p = pts.reduce((a, b) => (Math.abs(x(b.t) - px) < Math.abs(x(a.t) - px) ? b : a));
      const cx = x(p.t);
      const priced = p.v != null;
      cross.setAttribute("x1", cx);
      cross.setAttribute("x2", cx);
      cross.setAttribute("visibility", "visible");
      marker.setAttribute("visibility", priced ? "visible" : "hidden");
      if (priced) {
        marker.setAttribute("cx", cx);
        marker.setAttribute("cy", y(p.v));
      }

      const tags = [priced && p.v === min && "Lowest", p === last && "Latest"].filter(Boolean);
      const rows = priced
        ? [h("div", {}, h("b", {}, dollars(p.v)), " /night"), h("div", {}, `${dollars(p.total)} total`)]
        : [h("div", {}, h("b", {}, "No price"))];
      if (tags.length > 0) rows.push(h("div", {}, tags.join(" · ")));
      tip.replaceChildren(h("div", {}, shortDate(p.date)), ...rows);
      tip.hidden = false;

      // Keep the tooltip off the hovered point and inside the panel's overflow box
      const onRight = cx <= w / 2;
      tip.style.left = onRight ? `${cx + 8}px` : "";
      tip.style.right = onRight ? "" : `${w - cx + 8}px`;
      const nearTop = priced && y(p.v) < (m.top + bottom) / 2;
      tip.style.top = nearTop ? "" : `${m.top}px`;
      tip.style.bottom = nearTop ? `${ht - bottom}px` : "";
    });
    return h("div", { class: "chart" }, svg, tip);
  }

  // Prices come from a once-a-day snapshot, and the cruise line's booking page
  // reads a different endpoint, so the page's live price can differ either way
  function asOfNote(line, date) {
    return h(
      "div",
      { class: "muted" },
      `Price as of ${shortDate(date)}. ${siteName(line)}'s live price may differ.`,
    );
  }

  function perNightChange(total, duration) {
    if (total == null) return "–";
    const n = Math.round(total / duration);
    if (n === 0) return "no change";
    return `${n > 0 ? "+" : "−"}${dollars(Math.abs(n))}`;
  }

  function renderSailing(line, data, onCabinChange) {
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
      h("div", { class: "title" }, sailing.title || `${nights}-night sailing`),
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
      asOfNote(line, data.latestRecordDate),
      priceChart(data.history),
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
                  href: bookingUrl(line, { ...a, guestCount, cabinType: data.cabinType }),
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
          { href: chartsUrl(CHARTS_URL, line, sailing, guestCount), target: "_blank", rel: "noopener" },
          "Full price history on CabinSaver →",
        ),
      ),
    ];
  }

  function renderItinerary(line, data) {
    const { itinerary, sailings, guestCount } = data;
    return [
      h("div", { class: "title" }, itinerary.title || `${itinerary.duration}-night sailing`),
      h(
        "div",
        { class: "muted" },
        `${itinerary.shipCode} · ${itinerary.duration} nights · ${guestCount} guest${guestCount > 1 ? "s" : ""}`,
      ),
      asOfNote(line, data.latestRecordDate),
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
                href: bookingUrl(line, { ...s, guestCount }),
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
        h(
          "span",
          { class: "brand" },
          h("img", { class: "logo", src: chrome.runtime.getURL("icons/icon48.png"), alt: "" }),
          "Cruise Price History by CabinSaver",
        ),
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
      cruiseLine: parsed.line,
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
          ? renderSailing(parsed.line, result.data, (code) => load(parsed, code))
          : renderItinerary(parsed.line, result.data),
      );
    });
  }

  // Cruise line sites are single-page apps, so navigation doesn't reload this script
  let lastKey = null;
  function check() {
    const parsed = parseUrl(location.href);
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
