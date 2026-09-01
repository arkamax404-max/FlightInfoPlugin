const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeSettings } = require("../src/plugin/settings.js");
const { toFlightQuery } = require("../src/plugin/flight-provider.js");
const {
  SimulatedFlightProvider,
} = require("../src/plugin/simulated-flight-provider.js");
const {
  AirLabsFlightProvider,
  normalizeAirLabsFlight,
} = require("../src/plugin/airlabs-flight-provider.js");
const {
  FlightStatusService,
} = require("../src/plugin/flight-status-service.js");
const { presentFlightStatus } = require("../src/plugin/presentation.js");
const { createFlightImage } = require("../src/plugin/flight-image-renderer.js");
const { HostClient } = require("../src/plugin/host-client.js");

const FLIGHT_TIMES = {
  scheduledDeparture: "2026-09-02T14:30:00Z",
  scheduledArrival: "2026-09-02T16:30:00Z",
};
const DISPLAY_TIME = new Date("2026-09-02T15:00:00Z");
const AIRLABS_TIMES = {
  dep_time: FLIGHT_TIMES.scheduledDeparture,
  arr_time: FLIGHT_TIMES.scheduledArrival,
};

test("normalizes persisted flight settings including explicit provider mode", () => {
  assert.deepEqual(
    normalizeSettings({
      flightIdentifier: " ga 100 ",
      flightDate: "2026-09-02",
      providerMode: "airlabs",
      simulationScenario: "delayed",
    }),
    {
      flightIdentifier: "GA100",
      flightDate: "2026-09-02",
      providerMode: "airlabs",
      simulationScenario: "delayed",
      airLabsApiKey: "",
    },
  );
  assert.equal(
    normalizeSettings({ providerMode: "remote" }).providerMode,
    "simulation",
  );
});

test("builds a provider-neutral flight query", () => {
  assert.deepEqual(toFlightQuery(normalizeSettings()), {
    identifier: "GA100",
    date: "2026-09-01",
  });
});

test("simulator has deterministic configured outcomes and route", async () => {
  const query = { identifier: "GA100", date: "2026-09-01" };
  assert.deepEqual(
    await new SimulatedFlightProvider("normal").getFlightStatus(query),
    {
      kind: "flight",
      flight: query,
      route: { departure: "CGK", destination: "DPS" },
      scheduledTime: "14:30",
      scheduledDeparture: "2026-09-01T14:30:00Z",
      scheduledArrival: "2026-09-01T16:30:00Z",
      status: "scheduled",
    },
  );
  assert.deepEqual(
    await new SimulatedFlightProvider("delayed").getFlightStatus(query),
    {
      kind: "delayed",
      flight: query,
      route: { departure: "CGK", destination: "DPS" },
      delayMinutes: 45,
      scheduledTime: "14:30",
      scheduledDeparture: "2026-09-01T14:30:00Z",
      scheduledArrival: "2026-09-01T16:30:00Z",
    },
  );
  assert.deepEqual(
    await new SimulatedFlightProvider("unavailable").getFlightStatus(query),
    { kind: "unavailable", flight: query },
  );
});

test("AirLabs returns a typed unavailable outcome when no personal key is configured", async () => {
  const query = { identifier: "GA100", date: "2026-09-01" };
  assert.deepEqual(await new AirLabsFlightProvider("").getFlightStatus(query), {
    kind: "unavailable",
    flight: query,
    reason: "not_configured",
  });
  assert.deepEqual(await new AirLabsFlightProvider("").getFlightStatus(), {
    kind: "unavailable",
    flight: { identifier: undefined, date: undefined },
    reason: "not_configured",
  });
});

test("AirLabs normalizes IATA routes and safely falls back to ICAO or placeholders", () => {
  const flight = { identifier: "GA100", date: "2026-09-01" };
  assert.deepEqual(
    normalizeAirLabsFlight(
      {
        response: {
          flight_iata: "ga100",
          dep_iata: " cgk ",
          dep_icao: "WIII",
          arr_iata: "dps",
          arr_icao: "WADD",
          ...AIRLABS_TIMES,
          duration: "02:00",
          status: "en-route",
        },
      },
      flight,
    ),
    {
      kind: "flight",
      flight: { identifier: "GA100", date: "2026-09-01" },
      route: { departure: "CGK", destination: "DPS" },
      ...FLIGHT_TIMES,
      duration: "02:00",
      status: "en-route",
      isLive: true,
    },
  );
  assert.deepEqual(
    normalizeAirLabsFlight(
      {
        response: {
          flight_iata: "ga100",
          dep_icao: "WIII",
          ...AIRLABS_TIMES,
          duration: "02:00",
          status: "scheduled",
        },
      },
      flight,
    ).route,
    { departure: "WIII", destination: "---" },
  );
  assert.equal(normalizeAirLabsFlight({}, flight).reason, "malformed_response");
});

test("service normalizes provider failures as unavailable", async () => {
  const service = new FlightStatusService(() => ({
    getFlightStatus: async () => {
      throw new Error("offline");
    },
  }));
  assert.deepEqual(await service.refresh(normalizeSettings()), {
    kind: "unavailable",
    flight: { identifier: "GA100", date: "2026-09-01" },
  });
});

test("presents separate departure and arrival schedule rows with state-appropriate label/value pairs", () => {
  const normal = presentFlightStatus(
    {
      kind: "flight",
      flight: { identifier: "GA100" },
      route: { departure: "CGK", destination: "DPS" },
      ...FLIGHT_TIMES,
      status: "en-route",
    },
    DISPLAY_TIME,
  );
  assert.match(
    normal.text,
    /^GA100\nCGK \d{2}:\d{2}\nDPS \d{2}:\d{2}\nTIME LEFT\n1H 30M$/,
  );

  const delayed = presentFlightStatus(
    {
      kind: "delayed",
      flight: { identifier: "GA100" },
      route: { departure: "CGK", destination: "DPS" },
      delayMinutes: 45,
      ...FLIGHT_TIMES,
    },
    DISPLAY_TIME,
  );
  assert.match(
    delayed.text,
    /^GA100\nCGK \d{2}:\d{2}\nDPS \d{2}:\d{2}\nDELAYED\n\+45M$/,
  );

  const missing = presentFlightStatus(
    {
      kind: "flight",
      flight: { identifier: "GA100" },
      ...FLIGHT_TIMES,
      status: "landed",
    },
    DISPLAY_TIME,
  );
  assert.match(missing.text, /^GA100\n--- \d{2}:\d{2}\n--- \d{2}:\d{2}/);
  assert.match(missing.text, /\nSTATUS\nLANDED$/);
});

test("renders five-line D200 SVG images with bold schedule rows and a dominant value line", () => {
  const views = [
    presentFlightStatus(
      {
        kind: "flight",
        flight: { identifier: "GA100" },
        route: { departure: "CGK", destination: "DPS" },
        ...FLIGHT_TIMES,
        status: "en-route",
      },
      DISPLAY_TIME,
    ),
    presentFlightStatus(
      {
        kind: "delayed",
        flight: { identifier: "GA100" },
        route: { departure: "CGK", destination: "DPS" },
        delayMinutes: 45,
        ...FLIGHT_TIMES,
      },
      DISPLAY_TIME,
    ),
    presentFlightStatus(
      {
        kind: "flight",
        flight: { identifier: "GA100" },
        ...FLIGHT_TIMES,
        status: "landed",
      },
      DISPLAY_TIME,
    ),
  ];

  for (const view of views) {
    const image = createFlightImage(view);
    assert.match(image, /^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(image.split(",")[1], "base64").toString("utf8");
    assert.match(svg, /<svg /);
    assert.equal(svg.match(/<text /g).length, 5);
    for (const line of view.text.split("\n"))
      assert.equal(svg.includes(line), true);
    assert.match(svg, /font-size="20"[^>]*>GA100/);
    assert.match(svg, /font-size="22"[^>]*>(CGK|---) \d{2}:\d{2}/);
    assert.match(svg, /font-size="22"[^>]*>(DPS|---) \d{2}:\d{2}/);
    assert.match(svg, /font-size="17"[^>]*>(TIME LEFT|DELAYED|STATUS)/);
    assert.match(
      svg,
      /font-size="36" font-weight="700"[^>]*>(1H 30M|\+45M|LANDED)/,
    );
  }
});

test("keeps loading and unavailable presentations on manifest icons", () => {
  assert.deepEqual(presentFlightStatus(), { state: 0, text: "LOADING" });
  assert.deepEqual(presentFlightStatus({ kind: "unavailable" }), {
    state: 3,
    text: "NO DATA",
  });
  assert.equal(createFlightImage(presentFlightStatus()), null);
  assert.equal(
    createFlightImage(presentFlightStatus({ kind: "unavailable" })),
    null,
  );
});

test("sends generated images through the Ulanzi type 1 custom-image payload", () => {
  const host = new HostClient();
  let sent;
  host.send = (cmd, parameters) => {
    sent = { cmd, parameters };
  };
  host.setBaseDataIcon(
    "plugin___key___action",
    "data:image/svg+xml;base64,PHN2Zy8+",
  );

  assert.deepEqual(sent, {
    cmd: "state",
    parameters: {
      param: {
        statelist: [
          {
            uuid: "plugin",
            key: "key",
            actionid: "action",
            type: 1,
            data: "data:image/svg+xml;base64,PHN2Zy8+",
            textData: "",
            showtext: false,
          },
        ],
      },
    },
  });
});
