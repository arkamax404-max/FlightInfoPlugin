const { FlightProvider } = require("./flight-provider.js");

const AIRLABS_FLIGHT_URL = "https://airlabs.co/api/v9/flight";
const LIVE_STATUSES = new Set(["scheduled", "en-route"]);

class AirLabsFlightProvider extends FlightProvider {
  constructor(apiKey, fetchImpl = globalThis.fetch) {
    super();
    this.apiKey = typeof apiKey === "string" ? apiKey.trim() : "";
    this.fetchImpl = fetchImpl;
  }

  async getFlightStatus(query) {
    const flight = { identifier: query?.identifier, date: query?.date };
    if (!this.apiKey || typeof this.fetchImpl !== "function")
      return unavailable(flight, "not_configured");

    const requestUrl = new URL(AIRLABS_FLIGHT_URL);
    requestUrl.searchParams.set("flight_iata", query.identifier);
    requestUrl.searchParams.set("api_key", this.apiKey);

    let response;
    try {
      response = await this.fetchImpl(requestUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        // Do not log this request: the URL contains the personal API key.
        // The endpoint intentionally returns the closest matching flight, not a date-exact lookup.
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return unavailable(flight, "request_failed");
    }

    if (response.status === 429) return unavailable(flight, "rate_limited");
    if (!response.ok) return unavailable(flight, "request_failed");

    let payload;
    try {
      payload = await response.json();
    } catch {
      return unavailable(flight, "malformed_response");
    }
    return normalizeAirLabsFlight(payload, flight);
  }
}

function normalizeAirLabsFlight(payload, flight) {
  const record = payload?.response || payload;
  const flightIata = record?.flight_iata;
  const scheduledDeparture = record?.dep_time;
  const scheduledArrival = record?.arr_time;
  const duration = record?.duration;
  const status =
    typeof record?.status === "string" ? record.status.toLowerCase() : "";

  if (
    typeof flightIata !== "string" ||
    !isTimestamp(scheduledDeparture) ||
    !isTimestamp(scheduledArrival) ||
    !isDuration(duration) ||
    !status
  )
    return unavailable(flight, "malformed_response");

  return {
    kind: "flight",
    flight: { identifier: flightIata.trim().toUpperCase(), date: flight.date },
    route: {
      departure: airportCode(record?.dep_iata, record?.dep_icao),
      destination: airportCode(record?.arr_iata, record?.arr_icao),
    },
    scheduledDeparture,
    scheduledArrival,
    duration,
    status,
    isLive: LIVE_STATUSES.has(status),
  };
}

function airportCode(iata, icao) {
  const normalizedIata = normalizeAirportCode(iata, 3);
  return normalizedIata || normalizeAirportCode(icao, 4) || "---";
}

function normalizeAirportCode(value, length) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return new RegExp(`^[A-Z]{${length}}$`).test(code) ? code : "";
}

function unavailable(flight, reason) {
  return { kind: "unavailable", flight, reason };
}

function isTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isDuration(value) {
  return (
    (typeof value === "string" && value.trim() !== "") || Number.isFinite(value)
  );
}

module.exports = { AirLabsFlightProvider, normalizeAirLabsFlight };
