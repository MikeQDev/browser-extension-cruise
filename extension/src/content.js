(function () {
  const {
    parseUrl,
    bookingUrl,
    chartsUrl,
    canEstimateCabins,
    canChangeGuests,
    cabinCountParams,
    isNclSearchPage,
    cheapestSailing,
    guestsParam,
    cardPerNight,
    priceTint,
  } = globalThis.RadarParse;
  const { CHARTS_URL, DEALS_URL, FEATURES } = globalThis.RADAR_CONFIG;
  const STORAGE_KEY = "radarCollapsed";
  const MAX_ITINERARY_ROWS = 8;
  const DEFAULT_GUESTS = 2;
  const GUEST_OPTIONS = ["1", "2", "3", "4"];
  const CARD_NOTE = "Showing this itinerary's cheapest upcoming date.";

  const STYLE = `
    :host { all: initial; }
    .panel { position: fixed; right: 16px; bottom: 72px; z-index: 2147483647;
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
    select.guests { width: auto; margin: 0; padding: 0 2px; font-size: 12px; }
    .estimate { width: 100%; margin-top: 8px; padding: 5px 8px; font: inherit; color: #163354;
      background: #fff; border: 1px solid #163354; border-radius: 6px; cursor: pointer; }
    .estimate:disabled { cursor: default; opacity: 0.7; }
    .deals { display: block; box-sizing: border-box; width: 100%; margin-top: 10px; padding: 5px 8px;
      color: #fff; background: #163354; border-radius: 6px; font-weight: 600; text-align: center; }
    .deals:hover { text-decoration: none; opacity: 0.9; }
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
  function asOfNote(date) {
    return h(
      "div",
      { class: "muted" },
      `Price as of ${shortDate(date)}. Live price may differ.`,
    );
  }

  function guestPicker(line, guestCount, onChange) {
    const current = String(guestCount);
    const noun = current === "1" ? "guest" : "guests";
    if (!canChangeGuests(line)) return `${current} ${noun}`;
    // A URL can ask for more guests than the data covers, and the picker must still show it
    const options = GUEST_OPTIONS.includes(current) ? GUEST_OPTIONS : [...GUEST_OPTIONS, current];
    return h(
      "span",
      {},
      h(
        "select",
        { class: "guests", "aria-label": "Guests", onchange: (e) => onChange(e.target.value) },
        options.map((n) => h("option", { value: n, selected: n === current ? "" : null }, n)),
      ),
      ` ${noun}`,
    );
  }

  function pastGuestNote(line) {
    if (line !== "ncl") return null;
    return h(
      "div",
      { class: "muted" },
      "Prices shown are past guest prices. Log in to your NCL Latitudes account to see them.",
    );
  }

  function dealsButton() {
    return h(
      "a",
      { class: "deals", href: DEALS_URL, target: "_blank", rel: "noopener" },
      "See today's best deals",
    );
  }

  function affiliationNote() {
    return h(
      "div",
      { class: "muted foot" },
      "Not affiliated with or endorsed by any cruise line or travel agency.",
    );
  }

  function perNightChange(total, duration) {
    if (total == null) return "–";
    const n = Math.round(total / duration);
    if (n === 0) return "no change";
    return `${n > 0 ? "+" : "−"}${dollars(Math.abs(n))}`;
  }

  function cabinEstimateError(result) {
    if (result?.status === 429) return "Too many lookups. Try again in a minute.";
    if (result?.status === 400) return "No estimate for this cabin type.";
    return "Couldn't get an estimate. Try again.";
  }

  function cabinEstimate(data) {
    const note = h("div", { class: "muted" });
    const button = h(
      "button",
      {
        type: "button",
        class: "estimate",
        onclick: () => {
          button.disabled = true;
          button.textContent = "Estimating…";
          note.textContent = "";
          chrome.runtime.sendMessage(
            { type: "cabinCounts", params: cabinCountParams(data) },
            (result) => {
              const count = result?.ok
                ? result.data.results?.[data.cabinType]?.["cabin_count.total"]
                : null;
              if (count != null) {
                button.textContent = `Estimated remaining ${data.cabinNames[data.cabinType] || data.cabinType} cabins: ${count}`;
                return;
              }
              button.disabled = false;
              button.textContent = "Estimate remaining cabins";
              note.textContent = cabinEstimateError(result);
            },
          );
        },
      },
      "Estimate remaining cabins",
    );
    return [button, note];
  }

  function renderSailing(line, data, onCabinChange, picker) {
    const { sailing, current, stats, guestCount } = data;
    const nights = sailing.duration;

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
        `${data.shipName} · ${shortDate(sailing.sailDate)} · ${nights} nights · `,
        picker,
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
            `${data.cabinNames[c.code]} · ${c.perNight == null ? "no price" : `${dollars(c.perNight)}/night`}`,
          ),
        ),
      ),
      headline,
      asOfNote(data.latestRecordDate),
      pastGuestNote(line),
      FEATURES.cabinAvailability && canEstimateCabins(line, data) && cabinEstimate(data),
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
      dealsButton(),
      affiliationNote(),
    ];
  }

  function renderItinerary(line, data, picker) {
    const { itinerary, sailings, guestCount } = data;
    return [
      h("div", { class: "title" }, itinerary.title || `${itinerary.duration}-night sailing`),
      h(
        "div",
        { class: "muted" },
        `${data.shipName} · ${itinerary.duration} nights · `,
        picker,
      ),
      asOfNote(data.latestRecordDate),
      pastGuestNote(line),
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
      dealsButton(),
      affiliationNote(),
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

  // The picker stays up on failure, since a guest count with no data would otherwise strand the panel
  function showFailure(result, picker) {
    show(
      h("div", { class: "muted" }, result ? errorText(result) : "Can't reach CabinSaver right now."),
      picker && h("div", { class: "muted" }, picker),
    );
  }

  let requestSeq = 0;
  // The user's pick beats the page's guest count until the booking URL changes
  let guestChoice = null;

  function load(parsed, cabinType) {
    const seq = ++requestSeq;
    show(h("div", { class: "muted" }, "Checking price history…"));
    const type = parsed.kind === "sailing" ? "sailing" : "itinerary";
    const guestCount = guestChoice || parsed.guestCount || DEFAULT_GUESTS;
    const picker = guestPicker(parsed.line, guestCount, (n) => {
      guestChoice = n;
      if (parsed.reopen) parsed.reopen();
      else load(parsed, cabinType);
    });
    const params = {
      cruiseLine: parsed.line,
      itineraryCode: parsed.itineraryCode,
      packageId: parsed.packageId,
      sailDate: parsed.sailDate,
      guestCount,
      cabinType: cabinType || parsed.cabinType,
    };
    chrome.runtime.sendMessage({ type, params }, (result) => {
      // A newer navigation or cabin switch already replaced this request
      if (seq !== requestSeq) return;
      if (!result?.ok) return showFailure(result, picker);
      show(
        parsed.note && h("div", { class: "muted" }, parsed.note),
        type === "sailing"
          ? renderSailing(parsed.line, result.data, (code) => load(parsed, code), picker)
          : renderItinerary(parsed.line, result.data, picker),
      );
    });
  }

  // Path of the search page a card opened the panel on, since no URL backs that panel
  let cardPanelPath = null;

  function openFromCard(link) {
    const parsed = parseUrl(link.href);
    if (!parsed) return;
    chrome.storage.local.set({ [STORAGE_KEY]: false });
    ensurePanel();
    panel.classList.remove("collapsed");
    cardPanelPath = location.pathname;
    const seq = ++requestSeq;
    show(h("div", { class: "muted" }, "Checking price history…"));
    const guestCount = guestChoice || guestsParam(location.href) || DEFAULT_GUESTS;
    // Reopen rather than reload, since the cheapest date can differ per guest count
    const reopen = () => openFromCard(link);
    const picker = guestPicker(parsed.line, guestCount, (n) => {
      guestChoice = n;
      reopen();
    });
    const params = {
      cruiseLine: parsed.line,
      itineraryCode: parsed.itineraryCode,
      guestCount,
    };
    chrome.runtime.sendMessage({ type: "itinerary", params }, (result) => {
      if (seq !== requestSeq) return;
      if (!result?.ok) return showFailure(result, picker);
      const sailing = cheapestSailing(result.data.sailings);
      if (!sailing) return show(renderItinerary(parsed.line, result.data, picker));
      load({
        line: parsed.line,
        kind: "sailing",
        itineraryCode: parsed.itineraryCode,
        packageId: sailing.packageId,
        sailDate: sailing.sailDate,
        guestCount,
        note: CARD_NOTE,
        reopen,
      });
    });
  }

  // NCL renders its cards inside shadow roots, which querySelectorAll doesn't enter
  function cardLinks(root) {
    const links = [...root.querySelectorAll('a[href^="/vacation-builder?itineraryCode="]')];
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) links.push(...cardLinks(el.shadowRoot));
    }
    return links;
  }

  function addCardButtons() {
    if (!isNclSearchPage(location.href)) return;
    const app = document.querySelector("ncl-vacations-app")?.shadowRoot;
    if (!app) return;
    for (const link of cardLinks(app)) {
      const card = link.closest(".card-itinerary__summary");
      const actions = card?.querySelector(".card-itinerary__summary__body__ctas");
      if (!actions) continue;
      let wrapper = actions.nextElementSibling;
      if (!wrapper?.hasAttribute("data-cabinsaver-card")) {
        wrapper = h(
          "div",
          { "data-cabinsaver-card": "" },
          h(
            "button",
            {
              type: "button",
              class: "nds-btn_secondary-outline nds-btn_block nds-btn_size-sm nds-btn",
              onclick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                openFromCard(link);
              },
            },
            "CabinSaver Price History",
          ),
        );
        actions.after(wrapper);
      }
      // Set every pass, since filters can change a card's price in place. The fixed text
      // color keeps NCL's hover style from turning the label white on a light tint.
      const tint = priceTint(
        cardPerNight(
          card.querySelector(".price__spotlight__value")?.textContent,
          card.querySelector(".card-itinerary__summary__header__title")?.textContent,
        ),
      );
      const button = wrapper.firstElementChild;
      button.style.backgroundColor = tint || "";
      button.style.color = tint ? "#163354" : "";
    }
  }

  // Cruise line sites are single-page apps, so navigation doesn't reload this script
  let lastKey = null;
  function check() {
    addCardButtons();
    const parsed = parseUrl(location.href);
    const key = parsed ? JSON.stringify(parsed) : null;
    if (!parsed && cardPanelPath && location.pathname !== cardPanelPath) {
      cardPanelPath = null;
      requestSeq++;
      host?.remove();
    }
    if (key === lastKey) return;
    lastKey = key;
    guestChoice = null;
    cardPanelPath = null;
    if (!parsed) {
      host?.remove();
      return;
    }
    load(parsed);
  }

  check();
  setInterval(check, 1000);
})();
