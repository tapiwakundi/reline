import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Load `apps/api/.env` regardless of process cwd. Render env vars still win. */
config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env"),
});
