const DEFAULT_SETTINGS = Object.freeze({
  flightIdentifier: "GA100",
  flightDate: "2026-09-01",
  airLabsApiKey: "",
});

function normalizeFlightIdentifier(value) {
  const identifier =
    typeof value === "string"
      ? value.trim().toUpperCase().replace(/\s+/g, "")
      : "";
  return /^[A-Z0-9]{2,8}$/.test(identifier)
    ? identifier
    : DEFAULT_SETTINGS.flightIdentifier;
}

function normalizeFlightDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : DEFAULT_SETTINGS.flightDate;
}

function normalizeApiKey(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSettings(value = {}) {
  return {
    flightIdentifier: normalizeFlightIdentifier(value.flightIdentifier),
    flightDate: normalizeFlightDate(value.flightDate),
    airLabsApiKey: normalizeApiKey(value.airLabsApiKey),
  };
}

module.exports = { DEFAULT_SETTINGS, normalizeSettings };
