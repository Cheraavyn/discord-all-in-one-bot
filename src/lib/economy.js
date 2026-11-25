import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BotError } from "./errors.js";
import { logger } from "./logger.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const ECONOMY_FILE = path.join(DATA_DIR, "economy.json");

export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const WORK_COOLDOWN_MS = 60 * 60 * 1000;
export const DAILY_AMOUNT = 250;
export const WORK_MIN = 80;
export const WORK_MAX = 200;
const MAX_AMOUNT = 1_000_000_000;

const accounts = new Map();
let loaded = false;
let saveQueue = Promise.resolve();

const key = (guildId, userId) => `${guildId}:${userId}`;

function normalize(record) {
  record.balance = Math.max(0, Math.floor(Number(record.balance) || 0));
  record.totalEarned = Math.max(record.balance, Math.floor(Number(record.totalEarned) || 0));
  record.lastDaily = Math.max(0, Number(record.lastDaily) || 0);
  record.lastWork = Math.max(0, Number(record.lastWork) || 0);
  return record;
}

export async function initEconomy() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(ECONOMY_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];

    for (const record of Array.isArray(data) ? data : []) {
      if (!record?.guildId || !record?.userId) continue;
      accounts.set(key(record.guildId, record.userId), normalize(record));
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/economy.json, mulai dengan data kosong:", error.message);
    }
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initEconomy();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${ECONOMY_FILE}.tmp`;
      await writeFile(tmpFile, JSON.stringify([...accounts.values()], null, 2), "utf8");
      await rename(tmpFile, ECONOMY_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/economy.json:", error.message));

  return saveQueue;
}

export async function closeEconomy() {
  await save();
}

function ensureAccount(guildId, userId) {
  const id = key(guildId, userId);
  let record = accounts.get(id);

  if (!record) {
    record = {
      guildId,
      userId,
      balance: 0,
      totalEarned: 0,
      lastDaily: 0,
      lastWork: 0,
      createdAt: Date.now(),
    };
    accounts.set(id, record);
  }

  return record;
}

export function getAccount(guildId, userId) {
  const record = accounts.get(key(guildId, userId));
  if (record) return record;

  return {
    guildId,
    userId,
    balance: 0,
    totalEarned: 0,
    lastDaily: 0,
    lastWork: 0,
    createdAt: null,
  };
}

export function getBalance(guildId, userId) {
  return getAccount(guildId, userId).balance;
}

export async function addBalance(guildId, userId, amount) {
  await ensureLoaded();

  const value = Math.floor(Number(amount) || 0);
  if (!value) return getAccount(guildId, userId);

  const record = ensureAccount(guildId, userId);
  record.balance = Math.max(0, record.balance + value);
  if (value > 0) record.totalEarned += value;
  await save();
  return record;
}

/** Potong saldo dengan validasi ketat; dipakai untuk gacha dan taruhan duel. */
export async function spendBalance(guildId, userId, amount) {
  await ensureLoaded();

  const value = Number(amount);
  if (!Number.isInteger(value) || value <= 0) throw new BotError("Jumlah koin harus bilangan bulat positif.");

  const record = ensureAccount(guildId, userId);
  if (record.balance < value) {
    throw new BotError(`Saldo kamu tidak cukup. Butuh **${value.toLocaleString("id-ID")}** koin, saldo sekarang **${record.balance.toLocaleString("id-ID")}** koin.`);
  }

  record.balance -= value;
  await save();
  return record;
}

export async function transfer(guildId, fromId, toId, amount) {
  await ensureLoaded();

  if (fromId === toId) throw new BotError("Kamu tidak bisa mengirim koin ke dirimu sendiri.");

  const value = Number(amount);
  if (!Number.isInteger(value) || value <= 0) throw new BotError("Jumlah koin harus bilangan bulat positif.");
  if (value > MAX_AMOUNT) throw new BotError("Jumlah koin terlalu besar.");

  const sender = getAccount(guildId, fromId);
  if (sender.balance < value) {
    throw new BotError(`Saldo kamu tidak cukup. Saldo sekarang: **${sender.balance}** koin.`);
  }

  const from = ensureAccount(guildId, fromId);
  const to = ensureAccount(guildId, toId);

  from.balance -= value;
  to.balance += value;
  to.totalEarned += value;

  await save();
  return { from, to, amount: value };
}

export async function claimDaily(guildId, userId, now = Date.now()) {
  await ensureLoaded();

  const record = getAccount(guildId, userId);
  const elapsed = now - record.lastDaily;
  if (elapsed < DAILY_COOLDOWN_MS) {
    return { claimed: false, remainingMs: DAILY_COOLDOWN_MS - elapsed };
  }

  const account = ensureAccount(guildId, userId);
  account.balance += DAILY_AMOUNT;
  account.totalEarned += DAILY_AMOUNT;
  account.lastDaily = now;
  await save();

  return { claimed: true, amount: DAILY_AMOUNT, balance: account.balance };
}

const WORK_JOBS = [
  "menjaga toko kelontong",
  "mengantar paket",
  "mencuci piring di kafe",
  "memperbaiki komputer pelanggan",
  "mengajar les matematika",
  "meracik kopi di kedai",
  "mengurus taman kota",
  "menjadi kurir makanan",
  "membantu di perpustakaan",
  "mengedit video klien",
];

export async function claimWork(guildId, userId, now = Date.now()) {
  await ensureLoaded();

  const record = getAccount(guildId, userId);
  const elapsed = now - record.lastWork;
  if (elapsed < WORK_COOLDOWN_MS) {
    return { claimed: false, remainingMs: WORK_COOLDOWN_MS - elapsed };
  }

  const amount = WORK_MIN + Math.floor(Math.random() * (WORK_MAX - WORK_MIN + 1));
  const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];

  const account = ensureAccount(guildId, userId);
  account.balance += amount;
  account.totalEarned += amount;
  account.lastWork = now;
  await save();

  return { claimed: true, amount, job, balance: account.balance };
}

export async function getRichest(guildId, limit = 10) {
  await ensureLoaded();

  return [...accounts.values()]
    .filter((record) => record.guildId === guildId && record.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, Math.max(1, Math.min(25, limit)));
}

export async function getPosition(guildId, userId) {
  await ensureLoaded();

  const position =
    [...accounts.values()]
      .filter((record) => record.guildId === guildId && record.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .findIndex((record) => record.userId === userId) + 1;

  return position || null;
}

export function formatCoins(amount) {
  return `🪙 ${Math.floor(Number(amount) || 0).toLocaleString("id-ID")}`;
}
