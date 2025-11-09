import fs from "fs";
import pc from "picocolors";

export function ok(msg) { console.log(pc.green("✔"), msg); }
export function info(msg) { console.log(pc.cyan("ℹ"), msg); }
export function warn(msg) { console.log(pc.yellow("⚠"), msg); }
export function err(msg) { console.error(pc.red("✖"), msg); }

export function parseJobInput(str) {
  if (str.startsWith("@")) {
    const path = str.slice(1);
    const data = fs.readFileSync(path, "utf8");
    return JSON.parse(data);
  }
  return JSON.parse(str);
}
