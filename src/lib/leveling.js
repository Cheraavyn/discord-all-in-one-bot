import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const LEVELS_FILE = path.join(DATA_DIR, "levels.json");
const XP_MIN = 15;
const XP_MAX = 25;

const levels = new Map();
let loaded = false;
let saveQueue = Promise.resolve();
let saveTimer = null;

function key(guildId, userId) {
  return `${guildId}:${userId}`;
}

export async function initLevels() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(LEVELS_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];

    for (const record of Array.isArray(data) ? data : []) {
      if (!record?.guildId || !record?.userId) continue;
      record.xp = Math.max(0, Number(record.xp) || 0);
      record.messages = Math.max(0, Number(record.messages) || 0);
      record.level = levelFromXp(record.xp);
      levels.set(key(record.guildId, record.userId), record);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/levels.json, mulai dengan data kosong:", error.message);
    }
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initLevels();
}

function scheduleSave() {
  if (saveTimer) return;

  saveTimer = setTimeout(() => {
    saveTimer = null;
    void save();
  }, 3000);
  saveTimer.unref?.();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${LEVELS_FILE}.tmp`;
      await writeFile(tmpFile, JSON.stringify([...levels.values()], null, 2), "utf8");
      await rename(tmpFile, LEVELS_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/levels.json:", error.message));

  return saveQueue;
}

export async function closeLevels() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await save();
}

/** Total XP yang dibutuhkan untuk mencapai level tertentu. */
export function xpForLevel(level) {
  return 100 * level * level;
}

export function levelFromXp(xp) {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  return Math.floor(0.1 * Math.sqrt(xp));
}

export function levelProgress(xp) {
  const level = levelFromXp(xp);
  const current = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const percent = next > current ? Math.min(100, Math.round(((xp - current) / (next - current)) * 100)) : 0;
  return { level, current, next, percent, remaining: Math.max(0, next - xp) };
}

export function getLevelRecord(guildId, userId) {
  return levels.get(key(guildId, userId)) ?? null;
}

/**
 * Tambahkan XP dari pesan. Mengembalikan null jika masih dalam cooldown.
 * @returns {{ gained: number, level: number, leveledUp: boolean, record: object }|null}
 */
export async function addMessageXp(guildId, userId, { cooldownMs = 60_000 } = {}) {
  await ensureLoaded();

  const now = Date.now();
  let record = levels.get(key(guildId, userId));

  if (!record) {
    record = {
      guildId,
      userId,
      xp: 0,
      level: 0,
      messages: 0,
      lastXpAt: 0,
    };
    levels.set(key(guildId, userId), record);
  }

  if (now - Number(record.lastXpAt ?? 0) < cooldownMs) return null;

  const gained = XP_MIN + Math.floor(Math.random() * (XP_MAX - XP_MIN + 1));
  record.xp += gained;
  record.messages += 1;
  record.lastXpAt = now;

  const nextLevel = levelFromXp(record.xp);
  const leveledUp = nextLevel > record.level;
  record.level = nextLevel;
  scheduleSave();

  return { gained, level: record.level, leveledUp, record };
}

export async function getRank(guildId, userId) {
  await ensureLoaded();

  const record = levels.get(key(guildId, userId)) ?? {
    guildId,
    userId,
    xp: 0,
    level: 0,
    messages: 0,
  };

  const position =
    [...levels.values()]
      .filter((item) => item.guildId === guildId)
      .sort((a, b) => b.xp - a.xp)
      .findIndex((item) => item.userId === userId) + 1;

  return { ...record, position: position || null };
}

export async function getLeaderboard(guildId, limit = 10) {
  await ensureLoaded();

  return [...levels.values()]
    .filter((record) => record.guildId === guildId && record.xp > 0)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, Math.max(1, Math.min(25, limit)));
}

export function progressBar(percent, size = 10) {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * size);
  return `${"█".repeat(filled)}${"░".repeat(size - filled)}`;
}
