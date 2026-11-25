import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const LOCKDOWNS_FILE = path.join(DATA_DIR, "lockdowns.json");

let lockdowns = [];
let loaded = false;
let saveQueue = Promise.resolve();

export async function initLockdowns() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(LOCKDOWNS_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];
    lockdowns = Array.isArray(data)
      ? data.filter((lock) => lock?.guildId && lock?.channelId && lock?.previous)
      : [];
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/lockdowns.json, mulai dengan data kosong:", error.message);
    }
    lockdowns = [];
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initLockdowns();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${LOCKDOWNS_FILE}.tmp`;
      await writeFile(tmpFile, JSON.stringify(lockdowns, null, 2), "utf8");
      await rename(tmpFile, LOCKDOWNS_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/lockdowns.json:", error.message));

  return saveQueue;
}

export async function getLockdown(guildId, channelId) {
  await ensureLoaded();
  return lockdowns.find((lock) => lock.guildId === guildId && lock.channelId === channelId) ?? null;
}

export async function listLockdowns(guildId) {
  await ensureLoaded();
  return lockdowns
    .filter((lock) => lock.guildId === guildId)
    .sort((a, b) => a.lockedAt - b.lockedAt);
}

export async function addLockdown({ guildId, channelId, previous, lockedBy }) {
  await ensureLoaded();

  lockdowns = lockdowns.filter((lock) => !(lock.guildId === guildId && lock.channelId === channelId));
  const lock = { guildId, channelId, previous, lockedBy, lockedAt: Date.now() };
  lockdowns.push(lock);
  await save();
  return lock;
}

export async function removeLockdown(guildId, channelId) {
  await ensureLoaded();

  const index = lockdowns.findIndex((lock) => lock.guildId === guildId && lock.channelId === channelId);
  if (index === -1) return null;

  const [removed] = lockdowns.splice(index, 1);
  await save();
  return removed;
}
