import os from "os";
import path from "path";
import fs from "fs";

const home = os.homedir();
export const DATA_DIR = path.join(home, ".queuectl");
export const DB_PATH = path.join(DATA_DIR, "queuectl.db");
export const PID_DIR = path.join(DATA_DIR, "pids");
export const LOG_DIR = path.join(DATA_DIR, "logs");

for (const p of [DATA_DIR, PID_DIR, LOG_DIR]) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
