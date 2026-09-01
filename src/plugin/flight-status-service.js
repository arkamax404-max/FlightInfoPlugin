const { toFlightQuery } = require("./flight-provider.js");

class FlightStatusService {
  constructor(providerFactory) {
    this.providerFactory = providerFactory;
  }

  async refresh(settings) {
    const provider = this.providerFactory(settings);
    try {
      return await provider.getFlightStatus(toFlightQuery(settings));
    } catch (_error) {
      return { kind: "unavailable", flight: toFlightQuery(settings) };
    }
  }
}

module.exports = { FlightStatusService };
