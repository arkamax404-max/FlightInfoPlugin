const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeSettings } = require("../src/plugin/settings.js");
const { toFlightQuery } = require("../src/plugin/flight-provider.js");
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
const {
  AUTOMATIC_POLL_INTERVALS,
  automaticPollInterval,
  beginRefresh,
  finishRefresh,
  isConfiguredFlightDate,
  isLandedFlight,
  localCalendarDate,
  isNearFlightWindow,
  settingsChanged,
  shouldRefresh,
  shouldPoll,
  shouldRefreshOnContextUpdate,
} = require("../src/plugin/main.js");

const FLIGHT_TIMES = {
  scheduledDeparture: "2026-09-02T14:30:00Z",
  scheduledArrival: "2026-09-02T16:30:00Z",
};
const DISPLAY_TIME = new Date("2026-09-02T15:00:00Z");
const AIRLABS_TIMES = {
  dep_time: FLIGHT_TIMES.scheduledDeparture,
  arr_time: FLIGHT_TIMES.scheduledArrival,
};

test("normalizes persisted flight settings for the AirLabs provider", () => {
  assert.deepEqual(
    normalizeSettings({
      flightIdentifier: " ga 100 ",
      flightDate: "2026-09-02",
      airLabsApiKey: " personal-key ",
    }),
    {
      flightIdentifier: "GA100",
      flightDate: "2026-09-02",
      airLabsApiKey: "personal-key",
    },
  );
  assert.deepEqual(normalizeSettings(), {
    flightIdentifier: "GA100",
    flightDate: "2026-09-01",
    airLabsApiKey: "",
  });
});

test("builds a provider-neutral flight query", () => {
  assert.deepEqual(toFlightQuery(normalizeSettings()), {
    identifier: "GA100",
    date: "2026-09-01",
  });
});

test("AirLabs returns unavailable without a configured personal key or request", async () => {
  const query = { identifier: "GA100", date: "2026-09-01" };
  let requestCount = 0;
  const provider = new AirLabsFlightProvider("", async () => {
    requestCount += 1;
    throw new Error("A keyless provider must not make a request");
  });
  assert.deepEqual(await provider.getFlightStatus(query), {
    kind: "unavailable",
    flight: query,
    reason: "not_configured",
  });
  assert.deepEqual(await provider.getFlightStatus(), {
    kind: "unavailable",
    flight: { identifier: undefined, date: undefined },
    reason: "not_configured",
  });
  assert.equal(requestCount, 0);
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

test("uses adaptive polling only on the configured flight date", () => {
  const action = {
    active: true,
    terminal: false,
    settings: { flightDate: "2026-09-02" },
  };
  const onFlightDate = new Date(2026, 8, 2, 12);

  assert.equal(
    isConfiguredFlightDate(action.settings.flightDate, onFlightDate),
    true,
  );
  assert.equal(
    isConfiguredFlightDate(
      action.settings.flightDate,
      new Date(2026, 8, 1, 23, 59, 59),
    ),
    false,
  );
  assert.equal(
    isConfiguredFlightDate(action.settings.flightDate, new Date(2026, 8, 3)),
    false,
  );
  assert.equal(shouldPoll(action, onFlightDate), true);
  assert.equal(shouldPoll(action, new Date(2026, 8, 1, 23, 59, 59)), false);
});

test("keeps the configured local flight date active across a UTC date boundary", () => {
  const localFlightMorning = new Date("2026-09-01T23:30:00.000Z");
  localFlightMorning.getFullYear = () => 2026;
  localFlightMorning.getMonth = () => 8;
  localFlightMorning.getDate = () => 2;
  localFlightMorning.toISOString = () => "2026-09-01T23:30:00.000Z";
  const action = {
    active: true,
    terminal: false,
    settings: { flightDate: "2026-09-02" },
  };

  assert.equal(localCalendarDate(localFlightMorning), "2026-09-02");
  assert.equal(isConfiguredFlightDate("2026-09-02", localFlightMorning), true);
  assert.equal(shouldPoll(action, localFlightMorning), true);
  assert.equal(
    automaticPollInterval(action, localFlightMorning),
    AUTOMATIC_POLL_INTERVALS.default,
  );
});

test("immediately refreshes only new or changed contexts configured for today", () => {
  const action = {
    active: true,
    terminal: false,
    settings: { flightDate: "2026-09-02" },
  };
  const today = new Date(2026, 8, 2, 12);

  assert.equal(shouldRefreshOnContextUpdate(action, true, today), true);
  assert.equal(shouldRefreshOnContextUpdate(action, false, today), false);
  assert.equal(
    shouldRefreshOnContextUpdate(
      action,
      true,
      new Date(2026, 8, 1, 23, 59, 59),
    ),
    false,
  );
  assert.equal(
    shouldRefreshOnContextUpdate(action, true, new Date(2026, 8, 3)),
    false,
  );
  assert.equal(
    shouldRefreshOnContextUpdate({ ...action, refreshing: true }, true, today),
    false,
  );
  assert.equal(
    shouldRefreshOnContextUpdate({ ...action, terminal: true }, true, today),
    false,
  );
});

test("uses a 60-minute default cadence and a 15-minute near-flight cadence", () => {
  const action = {
    active: true,
    terminal: false,
    settings: { flightDate: "2026-09-02" },
  };
  const status = { kind: "flight", ...FLIGHT_TIMES, status: "scheduled" };

  assert.equal(
    isNearFlightWindow(status, new Date("2026-09-02T11:30:00Z")),
    true,
  );
  assert.equal(
    isNearFlightWindow(status, new Date("2026-09-02T19:30:00Z")),
    true,
  );
  assert.equal(
    isNearFlightWindow(status, new Date("2026-09-02T11:29:59Z")),
    false,
  );
  assert.equal(
    isNearFlightWindow(status, new Date("2026-09-02T19:30:01Z")),
    false,
  );
  assert.equal(
    automaticPollInterval(action, new Date("2026-09-02T10:00:00Z")),
    AUTOMATIC_POLL_INTERVALS.default,
  );
  action.status = status;
  assert.equal(
    automaticPollInterval(action, new Date("2026-09-02T15:00:00Z")),
    AUTOMATIC_POLL_INTERVALS.nearFlight,
  );
  assert.equal(AUTOMATIC_POLL_INTERVALS.default, 60 * 60 * 1000);
  assert.equal(AUTOMATIC_POLL_INTERVALS.nearFlight, 15 * 60 * 1000);
});

test("prevents overlapping refreshes while preserving manual override and landed stop", () => {
  const action = {
    active: true,
    terminal: true,
    settings: { flightDate: "2026-09-02" },
  };

  assert.equal(shouldRefresh(action), false);
  assert.equal(shouldRefresh(action, true), true);
  assert.equal(shouldPoll(action, new Date("2026-09-02T12:00:00Z")), false);
  action.terminal = false;
  assert.equal(beginRefresh(action), true);
  assert.equal(beginRefresh(action), false);
  finishRefresh(action);
  assert.equal(beginRefresh(action), true);
});

test("stops automatic polling after a landed flight while allowing manual refresh and settings reactivation", () => {
  const activeAction = {
    active: true,
    terminal: false,
    settings: { flightDate: "2026-09-02" },
  };
  const landedAction = { ...activeAction, terminal: true };

  assert.equal(isLandedFlight({ kind: "flight", status: "landed" }), true);
  assert.equal(isLandedFlight({ kind: "unavailable" }), false);
  assert.equal(shouldRefresh(landedAction), false);
  assert.equal(shouldRefresh(landedAction, true), true);
  assert.equal(
    shouldPoll(landedAction, new Date("2026-09-02T12:00:00Z")),
    false,
  );
  assert.equal(
    shouldPoll(activeAction, new Date("2026-09-02T12:00:00Z")),
    true,
  );
  assert.equal(shouldPoll({ active: false, terminal: false }), false);
  assert.equal(
    settingsChanged(
      {
        flightIdentifier: "GA100",
        flightDate: "2026-09-02",
        airLabsApiKey: "key",
      },
      {
        flightIdentifier: "GA200",
        flightDate: "2026-09-02",
        airLabsApiKey: "key",
      },
    ),
    true,
  );
  assert.equal(
    settingsChanged(
      {
        flightIdentifier: "GA100",
        flightDate: "2026-09-02",
        airLabsApiKey: "key",
      },
      {
        flightIdentifier: "GA100",
        flightDate: "2026-09-02",
        airLabsApiKey: "new-key",
      },
    ),
    true,
  );
  assert.equal(
    settingsChanged(
      {
        flightIdentifier: "GA100",
        flightDate: "2026-09-02",
        airLabsApiKey: "key",
      },
      {
        flightIdentifier: "GA100",
        flightDate: "2026-09-02",
        airLabsApiKey: "key",
      },
    ),
    false,
  );
});

test("renders unavailable flights as a dynamic D200 image without exposing provider credentials", () => {
  assert.deepEqual(presentFlightStatus(), { state: 0, text: "LOADING" });
  assert.equal(createFlightImage(presentFlightStatus()), null);

  const unavailable = presentFlightStatus({
    kind: "unavailable",
    flight: { identifier: " ga100 ", date: "2026-09-02" },
    airLabsApiKey: "redacted",
  });
  assert.deepEqual(unavailable, {
    state: 3,
    text: "GA100\n2026-09-02\nNO DATA",
  });

  const image = createFlightImage(unavailable);
  assert.match(image, /^data:image\/svg\+xml;base64,/);
  const svg = Buffer.from(image.split(",")[1], "base64").toString("utf8");
  assert.match(svg, /<text x="98" y="25"[^>]*text-anchor="middle">GA100<\/text>/);
  assert.match(svg, /<text x="98" y="94"[^>]*text-anchor="middle">2026-09-02<\/text>/);
  assert.match(svg, /<text x="98" y="139"[^>]*text-anchor="middle">NO DATA<\/text>/);
  assert.equal(svg.includes("redacted"), false);

  assert.deepEqual(presentFlightStatus({ kind: "unavailable" }), {
    state: 3,
    text: "---\n---\nNO DATA",
  });
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
