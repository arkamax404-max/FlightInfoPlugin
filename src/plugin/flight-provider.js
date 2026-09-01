/**
 * Provider-neutral boundary. Adapters return one normalized result for a flight query.
 * Future providers (including AirLabs) implement getFlightStatus(query).
 */
class FlightProvider {
 async getFlightStatus(_query) {
  throw new Error("FlightProvider#getFlightStatus must be implemented");
 }
}

function toFlightQuery(settings) {
 return { identifier: settings.flightIdentifier, date: settings.flightDate };
}

module.exports = { FlightProvider, toFlightQuery };
