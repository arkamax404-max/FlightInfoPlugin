import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const source = new URL("../src/plugin/", import.meta.url);
const output = new URL("../com.ulanzi.flightinfo.ulanziPlugin/dist/", import.meta.url);
mkdirSync(output, { recursive: true });
cpSync(source, output, { recursive: true });
console.log(`Copied plugin runtime from ${fileURLToPath(source)} to package dist/.`);
