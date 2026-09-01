const DEFAULT_SETTINGS = Object.freeze({
  flightIdentifier: "GA100",
  flightDate: "2026-09-01",
  providerMode: "simulation",
  simulationScenario: "normal",
  airLabsApiKey: "",
});

const SCENARIOS = new Set(["normal", "delayed", "unavailable"]);
const PROVIDER_MODES = new Set(["simulation", "airlabs"]);

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
    providerMode: PROVIDER_MODES.has(value.providerMode)
      ? value.providerMode
      : DEFAULT_SETTINGS.providerMode,
    simulationScenario: SCENARIOS.has(value.simulationScenario)
      ? value.simulationScenario
      : DEFAULT_SETTINGS.simulationScenario,
    airLabsApiKey: normalizeApiKey(value.airLabsApiKey),
  };
}

module.exports = { DEFAULT_SETTINGS, normalizeSettings };
