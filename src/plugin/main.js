const { HostClient } = require("./host-client.js");
const { FlightStatusService } = require("./flight-status-service.js");
const { SimulatedFlightProvider } = require("./simulated-flight-provider.js");
const { AirLabsFlightProvider } = require("./airlabs-flight-provider.js");
const { normalizeSettings } = require("./settings.js");
const { presentFlightStatus } = require("./presentation.js");
const { createFlightImage } = require("./flight-image-renderer.js");

const PLUGIN_UUID = "com.ulanzi.ulanzistudio.flightinfo";
const contexts = new Map();
const host = new HostClient();
const service = new FlightStatusService((settings) =>
  settings.providerMode === "airlabs"
    ? new AirLabsFlightProvider(settings.airLabsApiKey)
    : new SimulatedFlightProvider(settings.simulationScenario),
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
  refresh(message.context);
});
host.onClear((message) => {
  for (const item of message.param || []) contexts.delete(item.context);
  ensurePolling();
});

function updateContext(message, refreshAfter) {
  const action = contexts.get(message.context) || { active: true };
  action.settings = normalizeSettings({ ...action.settings, ...message.param });
  contexts.set(message.context, action);
  ensurePolling();
  if (refreshAfter) refresh(message.context);
}

async function refresh(context) {
  const action = contexts.get(context);
  if (!action?.active) return;
  host.setStateIcon(context, 0);
  action.status = await service.refresh(action.settings);
  if (action.active) {
    const view = presentFlightStatus(action.status);
    const image = createFlightImage(view);
    if (image) host.setBaseDataIcon(context, image);
    else host.setStateIcon(context, view.state);
  }
}

function refreshActive() {
  for (const [context, action] of contexts) if (action.active) refresh(context);
}

function ensurePolling() {
  const hasActiveContext = [...contexts.values()].some(
    (action) => action.active,
  );
  if (hasActiveContext && !pollTimer)
    pollTimer = setInterval(refreshActive, 30000);
  if (!hasActiveContext && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

process.once("SIGTERM", () => process.exit(0));
process.once("SIGINT", () => process.exit(0));
