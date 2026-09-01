const { HostClient } = require("./host-client.js");
const { FlightStatusService } = require("./flight-status-service.js");
const { AirLabsFlightProvider } = require("./airlabs-flight-provider.js");
const { normalizeSettings } = require("./settings.js");
const { presentFlightStatus } = require("./presentation.js");
const { createFlightImage } = require("./flight-image-renderer.js");

const PLUGIN_UUID = "com.ulanzi.ulanzistudio.flightinfo";
const AUTOMATIC_POLL_INTERVALS = {
  default: 60 * 60 * 1000,
  nearFlight: 15 * 60 * 1000,
};
const NEAR_FLIGHT_WINDOW_MS = 3 * 60 * 60 * 1000;

function isLandedFlight(status) {
  return status?.kind === "flight" && status.status === "landed";
}

function localCalendarDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isConfiguredFlightDate(flightDate, now = new Date()) {
  return (
    typeof flightDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(flightDate) &&
    flightDate === localCalendarDate(now)
  );
}

function isNearFlightWindow(status, now = new Date()) {
  if (status?.kind !== "flight" || isLandedFlight(status)) return false;
  const departure = Date.parse(status.scheduledDeparture);
  const arrival = Date.parse(status.scheduledArrival);
  if (Number.isNaN(departure) || Number.isNaN(arrival)) return false;
  const currentTime = now.getTime();
  return (
    currentTime >= departure - NEAR_FLIGHT_WINDOW_MS &&
    currentTime <= arrival + NEAR_FLIGHT_WINDOW_MS
  );
}

function automaticPollInterval(action, now = new Date()) {
  if (
    !action?.active ||
    action.terminal ||
    !isConfiguredFlightDate(action.settings?.flightDate, now)
  )
    return undefined;
  return isNearFlightWindow(action.status, now)
    ? AUTOMATIC_POLL_INTERVALS.nearFlight
    : AUTOMATIC_POLL_INTERVALS.default;
}

function shouldRefresh(action, manual = false) {
  return action?.active && !action.refreshing && (manual || !action.terminal);
}

function shouldPoll(action, now) {
  return automaticPollInterval(action, now) !== undefined;
}

function shouldRefreshOnContextUpdate(action, contextChanged, now) {
  return contextChanged && !action?.refreshing && shouldPoll(action, now);
}

function beginRefresh(action) {
  if (!action || action.refreshing) return false;
  action.refreshing = true;
  return true;
}

function finishRefresh(action) {
  if (action) action.refreshing = false;
}

function settingsChanged(current, next) {
  return (
    current.flightIdentifier !== next.flightIdentifier ||
    current.flightDate !== next.flightDate ||
    current.airLabsApiKey !== next.airLabsApiKey
  );
}

function start() {
  const contexts = new Map();
  const host = new HostClient();
  const service = new FlightStatusService(
    (settings) => new AirLabsFlightProvider(settings.airLabsApiKey),
  );
  let pollTimer;

  host.connect(PLUGIN_UUID);
  host.on("error", (error) => console.error(`[Ulanzi host] ${error.message}`));
  host.onAdd((message) => updateContext(message));
  host.onParamFromApp((message) => updateContext(message));
  host.onParamFromPlugin((message) => updateContext(message));
  host.onSetActive((message) => {
    const action = contexts.get(message.context);
    if (!action) return;
    action.active = message.active === true || message.active === "true";
    ensurePolling();
  });
  host.onRun((message) => {
    if (!contexts.has(message.context)) updateContext(message, false);
    refresh(message.context, true);
  });
  host.onClear((message) => {
    for (const item of message.param || []) contexts.delete(item.context);
    ensurePolling();
  });

  function updateContext(message) {
    const isNew = !contexts.has(message.context);
    const action = contexts.get(message.context) || { active: true };
    const settings = normalizeSettings({
      ...action.settings,
      ...message.param,
    });
    const changed =
      action.settings && settingsChanged(action.settings, settings);
    if (changed) {
      action.terminal = false;
      action.status = undefined;
      action.nextPollAt = undefined;
    }
    action.settings = settings;
    contexts.set(message.context, action);
    if ((isNew || changed) && shouldPoll(action))
      action.pendingAutomaticRefresh = true;
    if (shouldRefreshOnContextUpdate(action, isNew || changed)) {
      action.pendingAutomaticRefresh = false;
      refresh(message.context);
    }
    ensurePolling();
  }

  async function refresh(context, manual = false) {
    const action = contexts.get(context);
    if (!shouldRefresh(action, manual) || !beginRefresh(action)) return;
    const settings = action.settings;
    host.setStateIcon(context, 0);
    try {
      const status = await service.refresh(settings);
      if (action.settings !== settings) return;
      action.status = status;
      action.terminal = isLandedFlight(status);
      const interval = automaticPollInterval(action);
      action.nextPollAt = interval ? Date.now() + interval : undefined;
      if (action.active) {
        const view = presentFlightStatus(action.status);
        const image = createFlightImage(view);
        if (image) host.setBaseDataIcon(context, image);
        else host.setStateIcon(context, view.state);
      }
    } finally {
      finishRefresh(action);
      if (action.pendingAutomaticRefresh && shouldPoll(action)) {
        action.pendingAutomaticRefresh = false;
        refresh(context);
      } else {
        action.pendingAutomaticRefresh = false;
        ensurePolling();
      }
    }
  }

  function refreshActive() {
    const now = Date.now();
    for (const [context, action] of contexts) {
      if (
        shouldPoll(action) &&
        !action.refreshing &&
        action.nextPollAt !== undefined &&
        action.nextPollAt <= now
      )
        refresh(context);
    }
    ensurePolling();
  }

  function ensurePolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = undefined;
    const now = Date.now();
    let nextPollAt;
    for (const action of contexts.values()) {
      const interval = automaticPollInterval(action);
      if (!interval || action.refreshing) continue;
      if (action.nextPollAt === undefined) action.nextPollAt = now + interval;
      nextPollAt = Math.min(nextPollAt ?? Infinity, action.nextPollAt);
    }
    if (nextPollAt !== undefined)
      pollTimer = setTimeout(refreshActive, Math.max(0, nextPollAt - now));
  }

  process.once("SIGTERM", () => process.exit(0));
  process.once("SIGINT", () => process.exit(0));
}

if (require.main === module) start();

module.exports = {
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
};
