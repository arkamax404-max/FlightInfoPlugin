const ACTION_UUID = "com.ulanzi.ulanzistudio.flightinfo.status";
const form = document.querySelector("#settings");
const status = document.querySelector("#status");
const keyStatus = document.querySelector("#key-status");
const clearApiKey = document.querySelector("#clear-api-key");
let settings = {
  flightIdentifier: "GA100",
  flightDate: "2026-09-01",
  airLabsApiKey: "",
};

$UD.on("connected", () => {
  status.textContent = "Settings are stored with this key.";
});
for (const event of ["add", "paramfromapp", "didReceiveSettings"]) {
  $UD.on(event, (message) => {
    const incoming = message.param || message.settings;
    if (!incoming) return;
    settings = { ...settings, ...incoming };
    applySettings();
  });
}
form.addEventListener("change", () => saveSettings());
clearApiKey.addEventListener("click", () => {
  settings.airLabsApiKey = "";
  form.elements.airLabsApiKey.value = "";
  saveSettings();
  status.textContent = "Saved API key cleared.";
});

function saveSettings() {
  const enteredKey = form.elements.airLabsApiKey.value.trim();
  settings = {
    ...settings,
    flightIdentifier: form.elements.flightIdentifier.value.trim().toUpperCase(),
    flightDate: form.elements.flightDate.value,
    airLabsApiKey: enteredKey || settings.airLabsApiKey,
  };
  $UD.sendParamFromPlugin(settings);
  form.elements.airLabsApiKey.value = "";
  renderKeyStatus();
  status.textContent = "Saved. Press the key to refresh.";
}

function applySettings() {
  form.elements.flightIdentifier.value = settings.flightIdentifier;
  form.elements.flightDate.value = settings.flightDate;
  form.elements.airLabsApiKey.value = "";
  renderKeyStatus();
}

function renderKeyStatus() {
  keyStatus.textContent = settings.airLabsApiKey
    ? "API key configured (masked)."
    : "No API key configured.";
}

$UD.connect(ACTION_UUID);
