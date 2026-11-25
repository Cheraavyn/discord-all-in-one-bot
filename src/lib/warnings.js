import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BotError } from "./errors.js";
import { logger } from "./logger.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const WARNINGS_FILE = path.join(DATA_DIR, "warnings.json");

let warnings = [];
let loaded = false;
let saveQueue = Promise.resolve();

export async function initWarnings() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(WARNINGS_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];
    warnings = Array.isArray(data)
      ? data.filter((warning) => warning?.id && warning?.guildId && warning?.userId)
      : [];
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/warnings.json, mulai dengan data kosong:", error.message);
    }
    warnings = [];
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initWarnings();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${WARNINGS_FILE}.tmp`;
      await writeFile(tmpFile, JSON.stringify(warnings, null, 2), "utf8");
      await rename(tmpFile, WARNINGS_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/warnings.json:", error.message));

  return saveQueue;
}

export async function addWarning({ guildId, userId, moderatorId, reason }) {
  await ensureLoaded();

  const warning = {
    id: randomBytes(4).toString("hex"),
    guildId,
    userId,
    moderatorId,
    reason: String(reason || "Tidak ada alasan").slice(0, 512),
    createdAt: Date.now(),
  };

  warnings.push(warning);
  await save();
  return warning;
}

export async function listWarnings(guildId, userId) {
  await ensureLoaded();
  return warnings
    .filter((warning) => warning.guildId === guildId && warning.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function countWarnings(guildId, userId) {
  await ensureLoaded();
  return warnings.filter((warning) => warning.guildId === guildId && warning.userId === userId).length;
}

export async function removeWarning(guildId, userId, id) {
  await ensureLoaded();

  const index = warnings.findIndex(
    (warning) => warning.guildId === guildId && warning.userId === userId && warning.id === id,
  );
  if (index === -1) throw new BotError(`Peringatan dengan ID \`${id}\` tidak ditemukan.`);

  const [removed] = warnings.splice(index, 1);
  await save();
  return removed;
}

export async function clearWarnings(guildId, userId) {
  await ensureLoaded();

  const before = warnings.length;
  warnings = warnings.filter((warning) => !(warning.guildId === guildId && warning.userId === userId));
  const removed = before - warnings.length;
  if (removed) await save();
  return removed;
}
