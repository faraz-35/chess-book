// One timestamped line per pipeline action, in PROGRESS.log at the repo root.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG = path.join(ROOT, "PROGRESS.log");

export function log(message) {
  const line = `${new Date().toISOString()}  ${message}`;
  fs.appendFileSync(LOG, line + "\n");
  console.log(line);
}
