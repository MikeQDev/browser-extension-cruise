const { MISSING, SOLD_OUT } = require("./history");

const MIN_POINTS_FOR_SCORE = 5;

function perNight(total, duration) {
  return Math.ceil(total / duration);
}

function median(sorted) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// Last priced point on or before `date`, so a gap day still has a comparison.
function priceOnOrBefore(history, date) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].date <= date && history[i].total > 0) return history[i];
  }
  return null;
}

function daysBefore(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0];
}

/**
 * Score is where the current price sits in this sailing's own tracked range:
 * 100 = at its tracked low, 0 = at its tracked high. Comparing a sailing to
 * itself avoids judging a 14-night Europe trip against a 3-night Bahamas one.
 */
function dealRating(current, min, max, points) {
  if (current == null) return { score: null, label: "No current price" };
  if (points < MIN_POINTS_FOR_SCORE) {
    return { score: null, label: "Not enough history" };
  }
  if (current <= min) return { score: 100, label: "Lowest price tracked" };
  const score = max > min ? Math.round((100 * (max - current)) / (max - min)) : 50;
  if (score >= 75) return { score, label: "Great price" };
  if (score >= 50) return { score, label: "Good price" };
  if (score >= 25) return { score, label: "Fair price" };
  return { score, label: "High price" };
}

/**
 * Price history and stats for one sailing + cabin type. Prices are totals for
 * the guest count; perNight divides by the sailing's length like charts does.
 */
function summarize(entry, cabinType, recordDates) {
  const cells = entry.prices[cabinType];
  const latestDate = recordDates[recordDates.length - 1];
  const history = [];
  if (cells) {
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === MISSING) continue;
      history.push({
        date: recordDates[i],
        total: cells[i] === SOLD_OUT ? null : cells[i],
        perNight:
          cells[i] === SOLD_OUT ? null : perNight(cells[i], entry.duration),
      });
    }
  }

  const priced = history.filter((h) => h.total > 0);
  const totals = priced.map((h) => h.total).sort((a, b) => a - b);
  const last = history[history.length - 1];
  const listedToday = Boolean(last && last.date === latestDate);
  const current = listedToday ? last.total : null;

  let status = "available";
  if (!listedToday) status = "not_listed";
  else if (current == null) status = "sold_out";

  const min = totals.length ? totals[0] : null;
  const max = totals.length ? totals[totals.length - 1] : null;
  const change = (days) => {
    if (current == null || !latestDate) return null;
    const then = priceOnOrBefore(history, daysBefore(latestDate, days));
    return then ? current - then.total : null;
  };

  return {
    cabinType,
    status,
    current:
      current == null
        ? null
        : { total: current, perNight: perNight(current, entry.duration) },
    stats: {
      points: priced.length,
      min,
      max,
      median: totals.length ? median(totals) : null,
      minPerNight: min == null ? null : perNight(min, entry.duration),
      maxPerNight: max == null ? null : perNight(max, entry.duration),
      lowestOn: priced.find((h) => h.total === min)?.date || null,
      firstTracked: history[0]?.date || null,
      change7d: change(7),
      change30d: change(30),
    },
    deal: dealRating(current, min, max, priced.length),
    history,
  };
}

function currentPrice(entry, cabinType, recordDates) {
  const cells = entry.prices[cabinType];
  if (!cells) return null;
  const value = cells[recordDates.length - 1];
  return value > 0 ? value : null;
}

module.exports = { summarize, currentPrice, dealRating, perNight };
