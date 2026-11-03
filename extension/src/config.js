// Shared by the service worker (importScripts) and the content scripts.
globalThis.RADAR_CONFIG = {
  // Must also be listed in manifest.json host_permissions
  API_BASE: "http://localhost:8131",
  CHARTS_URL: "https://cabinsaver.com/charts/",

  // Future scope: each needs a change in another project, so it stays off
  // until that change ships. See README "Future scope".
  FEATURES: {
    watchSailing: false, // deal-alerts: per-sailing subscribe endpoint
    cabinAvailability: false, // count-cabins: CORS + a JSON response the panel can read
  },
};
