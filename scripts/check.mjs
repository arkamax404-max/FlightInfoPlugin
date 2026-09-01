import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginName = "com.ulanzi.flightinfo.ulanziPlugin";
const pluginRoot = new URL(`../${pluginName}/`, import.meta.url);
let manifest;
try {
  manifest = JSON.parse(
    readFileSync(new URL("manifest.json", pluginRoot), "utf8"),
  );
} catch (error) {
  throw new Error(`manifest.json must contain valid JSON: ${error.message}`);
}
for (const field of [
  "Author",
  "Name",
  "Version",
  "CodePath",
  "Type",
  "UUID",
  "Actions",
]) {
  if (!manifest[field]) throw new Error(`manifest.json is missing ${field}`);
}
if (manifest.Type !== "JavaScript" || manifest.CodePath !== "dist/main.js")
  throw new Error("Manifest must use the packaged JavaScript entry point");
if (manifest.UUID !== "com.ulanzi.ulanzistudio.flightinfo")
  throw new Error("Manifest UUID is invalid");
if (!Array.isArray(manifest.Actions) || manifest.Actions.length !== 1)
  throw new Error("Plugin must expose exactly one action");
const action = manifest.Actions[0];
if (
  action.UUID !== `${manifest.UUID}.status` ||
  action.Devices?.[0] !== "D200" ||
  action.States?.length !== 4
)
  throw new Error("Flight action is not a D200 four-state action");
for (const asset of [
  "assets/plugin.svg",
  "assets/action.svg",
  "assets/loading.svg",
  "assets/normal.svg",
  "assets/delayed.svg",
  "assets/unavailable.svg",
  "property-inspector/flight/inspector.html",
  "property-inspector/flight/inspector.js",
  "property-inspector/lib/host-api.js",
]) {
  if (!existsSync(new URL(asset, pluginRoot)))
    throw new Error(`Package file is missing: ${asset}`);
}
function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? javascriptFiles(join(directory, entry.name))
      : entry.name.endsWith(".js")
        ? [join(directory, entry.name)]
        : [],
  );
}
for (const directory of [
  fileURLToPath(new URL("../src/", import.meta.url)),
  fileURLToPath(new URL("property-inspector/", pluginRoot)),
]) {
  for (const file of javascriptFiles(directory))
    execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
console.log(`Validated ${manifest.UUID} and source/package syntax.`);
