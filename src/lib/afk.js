import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const AFK_FILE = path.join(DATA_DIR, "afk.json");
const MAX_REASON_LENGTH = 200;

let afkList = [];
let loaded = false;
let saveQueue = Promise.resolve();

export async function initAfk() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(AFK_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];
    afkList = Array.isArray(data) ? data.filter((entry) => entry?.guildId && entry?.userId) : [];
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/afk.json, mulai dengan data kosong:", error.message);
    }
    afkList = [];
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initAfk();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${AFK_FILE}.tmp`;
      await writeFile(tmpFile, JSON.stringify(afkList, null, 2), "utf8");
      await rename(tmpFile, AFK_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/afk.json:", error.message));

  return saveQueue;
}

export function getAfk(guildId, userId) {
  return afkList.find((entry) => entry.guildId === guildId && entry.userId === userId) ?? null;
}

export async function setAfk(guildId, userId, reason) {
  await ensureLoaded();

  const entry = {
    guildId,
    userId,
    reason: String(reason || "AFK").trim().slice(0, MAX_REASON_LENGTH) || "AFK",
    since: Date.now(),
  };

  afkList = afkList.filter((item) => !(item.guildId === guildId && item.userId === userId));
  afkList.push(entry);
  await save();
  return entry;
}

export async function clearAfk(guildId, userId) {
  await ensureLoaded();

  const index = afkList.findIndex((entry) => entry.guildId === guildId && entry.userId === userId);
  if (index === -1) return null;

  const [removed] = afkList.splice(index, 1);
  await save();
  return removed;
}

export async function listAfk(guildId) {
  await ensureLoaded();
  return afkList.filter((entry) => entry.guildId === guildId).sort((a, b) => b.since - a.since);
}
