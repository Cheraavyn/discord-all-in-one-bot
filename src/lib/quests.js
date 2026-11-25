import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DAILY_QUEST_COUNT,
  DAILY_QUESTS,
  WEEKLY_QUEST_COUNT,
  WEEKLY_QUESTS,
  pickQuests,
} from "./questCatalog.js";
import { addBalance, getBalance } from "./economy.js";
import { logger } from "./logger.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const QUESTS_FILE = path.join(DATA_DIR, "quests.json");

const boards = new Map();
let loaded = false;
let saveQueue = Promise.resolve();

const key = (guildId, userId) => `${guildId}:${userId}`;

/* ------------------------------- Periode ----------------------------------- */

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Kunci harian memakai tanggal lokal bot, berganti di tengah malam. */
function dailyPeriod(now) {
  return dateKey(new Date(now));
}

/** Kunci mingguan memakai tanggal Senin lokal, berganti Senin 00:00. */
function weeklyPeriod(now) {
  const date = new Date(now);
  const weekday = date.getDay();
  const backToMonday = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + backToMonday);
  return dateKey(date);
}

function nextDailyReset(now) {
  const date = new Date(now);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

function nextWeeklyReset(now) {
  const date = new Date(now);
  const weekday = date.getDay();
  const toNextMonday = weekday === 0 ? 1 : 8 - weekday;
  date.setDate(date.getDate() + toNextMonday);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function poolFor(type) {
  return type === "weekly"
    ? { pool: WEEKLY_QUESTS, count: WEEKLY_QUEST_COUNT }
    : { pool: DAILY_QUESTS, count: DAILY_QUEST_COUNT };
}

function periodFor(type, now) {
  return type === "weekly" ? weeklyPeriod(now) : dailyPeriod(now);
}

function resetAtFor(type, now) {
  return type === "weekly" ? nextWeeklyReset(now) : nextDailyReset(now);
}

function boardFor(type) {
  return type === "weekly"
    ? { period: "", progress: {}, claimed: {} }
    : { period: "", progress: {}, claimed: {} };
}

function blankRecord(guildId, userId) {
  return {
    guildId,
    userId,
    daily: boardFor("daily"),
    weekly: boardFor("weekly"),
    createdAt: Date.now(),
  };
}

function normalizeBoard(value) {
  const board = boardFor();
  if (!value || typeof value !== "object") return board;

  board.period = typeof value.period === "string" ? value.period : "";
  board.progress = {};
  board.claimed = {};

  const progress = value.progress && typeof value.progress === "object" ? value.progress : {};
  for (const [questId, amount] of Object.entries(progress)) {
    const numeric = Math.floor(Number(amount) || 0);
    if (numeric > 0) board.progress[questId] = numeric;
  }

  const claimed = value.claimed && typeof value.claimed === "object" ? value.claimed : {};
  for (const [questId, flag] of Object.entries(claimed)) {
    if (flag) board.claimed[questId] = true;
  }

  return board;
}

function normalize(record) {
  return {
    guildId: String(record.guildId),
    userId: String(record.userId),
    daily: normalizeBoard(record.daily),
    weekly: normalizeBoard(record.weekly),
    createdAt: Number(record.createdAt) || Date.now(),
  };
}

/* ------------------------------ Persistensi -------------------------------- */

export async function initQuests() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(QUESTS_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];
    for (const record of Array.isArray(data) ? data : []) {
      if (!record?.guildId || !record?.userId) continue;
      boards.set(key(record.guildId, record.userId), normalize(record));
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/quests.json, mulai dengan data kosong:", error.message);
    }
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initQuests();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${QUESTS_FILE}.tmp`;
      await writeFile(tmpFile, JSON.stringify([...boards.values()], null, 2), "utf8");
      await rename(tmpFile, QUESTS_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/quests.json:", error.message));

  return saveQueue;
}

export async function closeQuests() {
  await save();
}

function ensureRecord(guildId, userId) {
  const id = key(guildId, userId);
  let record = boards.get(id);
  if (!record) {
    record = blankRecord(guildId, userId);
    boards.set(id, record);
  }
  return record;
}

/** Pastikan state periode sudah sesuai sebelum dibaca/ditulis. */
function syncPeriod(record, type, now) {
  const state = record[type];
  const period = periodFor(type, now);
  if (state.period !== period) {
    state.period = period;
    state.progress = {};
    state.claimed = {};
    return true;
  }
  return false;
}

/** Ambil papan quest yang siap ditampilkan. Tidak menulis ke disk. */
export function getQuestBoard(guildId, userId, type = "daily", now = Date.now()) {
  const record = boards.get(key(guildId, userId)) ?? blankRecord(guildId, userId);
  syncPeriod(record, type, now);

  const { pool, count } = poolFor(type);
  const period = periodFor(type, now);
  const quests = pickQuests(pool, count, `${guildId}:${userId}:${type}:${period}`).map((quest) => {
    const progress = Math.min(quest.target, Math.max(0, Math.floor(Number(record[type].progress[quest.id]) || 0)));
    const claimed = Boolean(record[type].claimed[quest.id]);
    return { ...quest, progress, claimed, completed: progress >= quest.target };
  });

  return {
    type,
    period,
    resetAt: resetAtFor(type, now),
    quests,
    completed: quests.filter((quest) => quest.completed).length,
    claimable: quests.filter((quest) => quest.completed && !quest.claimed).length,
    totalReward: quests.reduce((sum, quest) => sum + quest.reward, 0),
  };
}

/* ------------------------------- Progres ------------------------------------ */

/**
 * Catat progres dari aksi gameplay. Menerima string event atau object
 * `{ event: jumlah }`. Fungsi ini TIDAK pernah melempar error supaya mini game
 * tetap jalan kalau sistem quest bermasalah.
 */
export async function recordQuestProgress(guildId, userId, events, now = Date.now()) {
  try {
    await ensureLoaded();

    const map = typeof events === "string" ? { [events]: 1 } : events;
    if (!map || typeof map !== "object") return;

    const entries = Object.entries(map)
      .map(([event, amount]) => [event, Math.floor(Number(amount) || 0)])
      .filter(([, amount]) => amount > 0);
    if (!entries.length) return;

    const record = ensureRecord(guildId, userId);
    let changed = false;

    for (const type of ["daily", "weekly"]) {
      if (syncPeriod(record, type, now)) changed = true;

      const { pool, count } = poolFor(type);
      const period = periodFor(type, now);
      const selected = pickQuests(pool, count, `${guildId}:${userId}:${type}:${period}`);
      const state = record[type];

      for (const quest of selected) {
        for (const [event, amount] of entries) {
          if (quest.event !== event) continue;
          const before = Math.floor(Number(state.progress[quest.id]) || 0);
          const after = Math.min(quest.target, before + amount);
          if (after !== before) {
            state.progress[quest.id] = after;
            changed = true;
          }
        }
      }
    }

    if (changed) await save();
  } catch (error) {
    logger.warn("Gagal mencatat progres quest:", error.message);
  }
}

/* --------------------------------- Klaim ----------------------------------- */

/** Klaim semua quest yang selesai. `type` bisa "daily", "weekly", atau "all". */
export async function claimQuests(guildId, userId, type = "all", now = Date.now()) {
  await ensureLoaded();

  const types = type === "all" ? ["daily", "weekly"] : type === "weekly" ? ["weekly"] : ["daily"];
  const record = ensureRecord(guildId, userId);
  const claimed = [];
  let total = 0;

  for (const boardType of types) {
    const board = getQuestBoard(guildId, userId, boardType, now);
    const state = record[boardType];

    for (const quest of board.quests) {
      if (!quest.completed || quest.claimed) continue;
      state.claimed[quest.id] = true;
      claimed.push({ ...quest, type: boardType });
      total += quest.reward;
    }
  }

  if (!claimed.length) {
    return { claimed: false, quests: [], total: 0, balance: getBalance(guildId, userId) };
  }

  await save();
  await addBalance(guildId, userId, total);

  return { claimed: true, quests: claimed, total, balance: getBalance(guildId, userId) };
}
