function presentFlightStatus(status, now = new Date()) {
  if (!status) return { state: 0, text: "LOADING" };
  if (status.kind === "unavailable") return unavailableView(status.flight);
  if (status.kind !== "flight" && status.kind !== "delayed")
    return unavailableView(status.flight);

  const departure = new Date(status.scheduledDeparture);
  const arrival = new Date(status.scheduledArrival);
  if (
    Number.isNaN(departure.getTime()) ||
    Number.isNaN(arrival.getTime()) ||
    arrival < departure
  )
    return unavailableView(status.flight);

  const lines = [
    status.flight.identifier,
    `${displayAirportCode(status.route?.departure)} ${formatTime(departure)}`,
    `${displayAirportCode(status.route?.destination)} ${formatTime(arrival)}`,
  ];
  if (status.kind === "delayed") {
    lines.push("DELAYED");
    lines.push(
      Number.isFinite(status.delayMinutes)
        ? `+${status.delayMinutes}M`
        : "CHECK STATUS",
    );
  } else if (status.status === "scheduled" || status.status === "en-route") {
    const remaining = arrival.getTime() - now.getTime();
    lines.push("TIME LEFT");
    lines.push(remaining > 0 ? formatRemaining(remaining) : "ARRIVING");
  } else if (status.status === "landed") {
    lines.push("STATUS");
    lines.push("LANDED");
  } else {
    lines.push("STATUS");
    lines.push(status.status.toUpperCase().slice(0, 12));
  }
  return { state: 1, text: lines.join("\n") };
}

function unavailableView(flight) {
  return {
    state: 3,
    text: [
      displayFlightIdentifier(flight?.identifier),
      displayFlightDate(flight?.date),
      "NO DATA",
    ].join("\n"),
  };
}

function displayFlightIdentifier(value) {
  const identifier = typeof value === "string" ? value.trim().toUpperCase() : "";
  return identifier ? identifier.slice(0, 12) : "---";
}

function displayFlightDate(value) {
  const date = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "---";
}

function displayAirportCode(value) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3,4}$/.test(code) ? code : "---";
}

function formatTime(value) {
  return value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatRemaining(milliseconds) {
  const minutes = Math.ceil(milliseconds / 60000);
  return `${Math.floor(minutes / 60)}H ${minutes % 60}M`;
}

module.exports = { presentFlightStatus };
