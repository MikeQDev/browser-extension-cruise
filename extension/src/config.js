// Shared by the service worker (importScripts) and the content scripts.
globalThis.RADAR_CONFIG = {
  // Must also be listed in manifest.json host_permissions
  API_BASE: "https://cabinsaver.com/charts",
  CHARTS_URL: "https://cabinsaver.com/charts/",
  CABIN_COUNTS_URL: "https://cabinsaver.com/cabinCounts",
  METADATA_BASE_URL: "https://cabinsaver.com/shared/data/",
  DEALS_URL:
    "https://cabinsaver.com/deals/?utm_source=browser_extension&utm_medium=extension&utm_campaign=best_deals",

  // Future scope: each needs a change in another project, so it stays off
  // until that change ships. See README "Future scope".
  FEATURES: {
    watchSailing: false, // deal-alerts: per-sailing subscribe endpoint
    cabinAvailability: true,
  },
};
