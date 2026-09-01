const { FlightProvider } = require("./flight-provider.js");

const SIMULATED_ROUTE = Object.freeze({
  departure: "CGK",
  destination: "DPS",
});

class SimulatedFlightProvider extends FlightProvider {
  constructor(scenario = "normal") {
    super();
    this.scenario = scenario;
  }

  async getFlightStatus(query) {
    const flight = { identifier: query.identifier, date: query.date };
    if (this.scenario === "unavailable") return { kind: "unavailable", flight };
    if (this.scenario === "delayed")
      return {
        kind: "delayed",
        flight,
        route: SIMULATED_ROUTE,
        delayMinutes: 45,
        scheduledTime: "14:30",
        scheduledDeparture: `${query.date}T14:30:00Z`,
        scheduledArrival: `${query.date}T16:30:00Z`,
      };
    return {
      kind: "flight",
      flight,
      route: SIMULATED_ROUTE,
      scheduledTime: "14:30",
      scheduledDeparture: `${query.date}T14:30:00Z`,
      scheduledArrival: `${query.date}T16:30:00Z`,
      status: "scheduled",
    };
  }
}

module.exports = { SimulatedFlightProvider };
