import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { logger } from "../lib/logger.js";

const EVENTS_DIR = fileURLToPath(new URL("../events/", import.meta.url));

/** Memuat setiap file di src/events dan mendaftarkannya ke client. */
export async function loadEvents(client) {
  const entries = await readdir(EVENTS_DIR);
  let loaded = 0;

  for (const entry of entries) {
    if (!entry.endsWith(".js")) continue;

    const module = await import(pathToFileURL(path.join(EVENTS_DIR, entry)).href);
    const event = module.default;

    if (!event?.name || typeof event.execute !== "function") {
      logger.warn(`Lewati event ${entry}: tidak mengekspor { name, execute }.`);
      continue;
    }

    if (event.once) client.once(event.name, (...args) => event.execute(...args));
    else client.on(event.name, (...args) => event.execute(...args));

    loaded += 1;
  }

  logger.info(`${loaded} event dimuat.`);
}
