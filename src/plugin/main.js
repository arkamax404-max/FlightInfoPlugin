const { HostClient } = require("./host-client.js");
const { FlightStatusService } = require("./flight-status-service.js");
const { AirLabsFlightProvider } = require("./airlabs-flight-provider.js");
const { normalizeSettings } = require("./settings.js");
const { presentFlightStatus } = require("./presentation.js");
const { createFlightImage } = require("./flight-image-renderer.js");

const PLUGIN_UUID = "com.ulanzi.ulanzistudio.flightinfo";

function isLandedFlight(status) {
  return status?.kind === "flight" && status.status === "landed";
}

function shouldRefresh(action, manual = false) {
  return action?.active && (manual || !action.terminal);
}

function shouldPoll(action) {
  return shouldRefresh(action);
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
  host.onAdd((message) => updateContext(message, true));
  host.onParamFromApp((message) => updateContext(message, true));
  host.onParamFromPlugin((message) => updateContext(message, true));
  host.onSetActive((message) => {
    const action = contexts.get(message.context);
    if (!action) return;
    action.active = message.active === true || message.active === "true";
    if (action.active) refresh(message.context);
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

  function updateContext(message, refreshAfter) {
    const action = contexts.get(message.context) || { active: true };
    const settings = normalizeSettings({
      ...action.settings,
      ...message.param,
    });
    if (action.settings && settingsChanged(action.settings, settings))
      action.terminal = false;
    action.settings = settings;
    contexts.set(message.context, action);
    ensurePolling();
    if (refreshAfter) refresh(message.context);
  }

  async function refresh(context, manual = false) {
    const action = contexts.get(context);
    if (!shouldRefresh(action, manual)) return;
    const settings = action.settings;
    host.setStateIcon(context, 0);
    const status = await service.refresh(settings);
    if (action.settings !== settings) return;
    action.status = status;
    action.terminal = isLandedFlight(status);
    ensurePolling();
    if (action.active) {
      const view = presentFlightStatus(action.status);
      const image = createFlightImage(view);
      if (image) host.setBaseDataIcon(context, image);
      else host.setStateIcon(context, view.state);
    }
  }

  function refreshActive() {
    for (const [context, action] of contexts)
      if (shouldPoll(action)) refresh(context);
  }

  function ensurePolling() {
    const hasPollableContext = [...contexts.values()].some(shouldPoll);
    if (hasPollableContext && !pollTimer)
      pollTimer = setInterval(refreshActive, 30000);
    if (!hasPollableContext && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }

  process.once("SIGTERM", () => process.exit(0));
  process.once("SIGINT", () => process.exit(0));
}

if (require.main === module) start();

module.exports = { isLandedFlight, settingsChanged, shouldRefresh, shouldPoll };
