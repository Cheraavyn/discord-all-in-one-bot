import { randomInt } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BAITS,
  BAIT_ORDER,
  FISH_COOLDOWN_MS,
  FISH_RARITIES,
  FISH_RARITY_ORDER,
  FISH_RARITY_RANK,
  FREE_BAIT_AMOUNT,
  FREE_BAIT_COOLDOWN_MS,
  MAX_BAIT,
  RODS,
  ROD_ORDER,
  STARTING_WORMS,
  fishesOfRarity,
  getFish,
} from "./fishCatalog.js";
import { addBalance, formatCoins, getBalance, spendBalance } from "./economy.js";
import { BotError } from "./errors.js";
import { logger } from "./logger.js";
import { recordQuestProgress } from "./quests.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const FISHING_FILE = path.join(DATA_DIR, "fishing.json");

const accounts = new Map();
let loaded = false;
let saveQueue = Promise.resolve();

const key = (guildId, userId) => `${guildId}:${userId}`;
const isPositiveInt = (value) => Number.isInteger(value) && value > 0;

function blankAccount(guildId, userId) {
  return {
    guildId,
    userId,
    fish: {},
    rods: ["bamboo"],
    rod: "bamboo",
    baits: { worm: STARTING_WORMS },
    bait: "worm",
    lastCast: 0,
    lastSupply: 0,
    casts: 0,
    fishEarned: 0,
    bestCatch: null,
    createdAt: Date.now(),
  };
}

function normalize(record) {
  const rawFish = record.fish && typeof record.fish === "object" ? record.fish : {};
  record.fish = {};
  for (const [fishId, entry] of Object.entries(rawFish)) {
    if (!getFish(fishId) || !entry || typeof entry !== "object") continue;
    const count = Math.floor(Number(entry.count) || 0);
    const value = Math.floor(Number(entry.value) || 0);
    if (count > 0) record.fish[fishId] = { count, value: Math.max(0, value) };
  }

  const rawRods = Array.isArray(record.rods) ? record.rods.filter((id) => RODS[id]) : [];
  record.rods = [...new Set([...rawRods, "bamboo"])];
  record.rod = RODS[record.rod] && record.rods.includes(record.rod) ? record.rod : "bamboo";

  const rawBaits = record.baits && typeof record.baits === "object" ? record.baits : {};
  record.baits = {};
  for (const [baitId, amount] of Object.entries(rawBaits)) {
    if (!BAITS[baitId]) continue;
    const value = Math.floor(Number(amount) || 0);
    if (value > 0) record.baits[baitId] = Math.min(MAX_BAIT, value);
  }
  record.bait =
    BAITS[record.bait] && (record.baits[record.bait] ?? 0) > 0
      ? record.bait
      : (BAIT_ORDER.find((id) => (record.baits[id] ?? 0) > 0) ?? "worm");

  record.lastCast = Math.max(0, Number(record.lastCast) || 0);
  record.lastSupply = Math.max(0, Number(record.lastSupply) || 0);
  record.casts = Math.max(0, Math.floor(Number(record.casts) || 0));
  record.fishEarned = Math.max(0, Math.floor(Number(record.fishEarned) || 0));
  record.bestCatch =
    record.bestCatch && typeof record.bestCatch === "object" && getFish(record.bestCatch.fishId)
      ? {
          fishId: record.bestCatch.fishId,
          sizeCm: Math.max(0, Math.floor(Number(record.bestCatch.sizeCm) || 0)),
          value: Math.max(0, Math.floor(Number(record.bestCatch.value) || 0)),
          caughtAt: Math.max(0, Number(record.bestCatch.caughtAt) || 0),
        }
      : null;
  record.createdAt = Number(record.createdAt) || Date.now();

  return record;
}

export async function initFishing() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(FISHING_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];
    for (const record of Array.isArray(data) ? data : []) {
      if (!record?.guildId || !record?.userId) continue;
      accounts.set(key(record.guildId, record.userId), normalize(record));
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/fishing.json, mulai dengan data kosong:", error.message);
    }
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initFishing();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${FISHING_FILE}.tmp`;
      await writeFile(tmpFile, JSON.stringify([...accounts.values()], null, 2), "utf8");
      await rename(tmpFile, FISHING_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/fishing.json:", error.message));

  return saveQueue;
}

export async function closeFishing() {
  await save();
}

function ensureAccount(guildId, userId) {
  const id = key(guildId, userId);
  let record = accounts.get(id);
  if (!record) {
    record = normalize({ ...blankAccount(guildId, userId), createdAt: Date.now() });
    accounts.set(id, record);
  }
  return record;
}

export function getFishingAccount(guildId, userId) {
  return accounts.get(key(guildId, userId)) ?? blankAccount(guildId, userId);
}

/** Sisa cooldown cast dalam ms (0 kalau boleh cast). Tidak menulis data. */
export async function getCastCooldownRemaining(guildId, userId, now = Date.now()) {
  await ensureLoaded();
  const record = getFishingAccount(guildId, userId);
  const elapsed = now - record.lastCast;
  return elapsed < FISH_COOLDOWN_MS ? FISH_COOLDOWN_MS - elapsed : 0;
}

/* ------------------------------ Mekanik cast ------------------------------- */

/** Bobot rarity setelah dipengaruhi rod + bait. Rare+ naik, Common/Uncommon turun. */
export function fishRarityWeights(luck = 0) {
  const bonus = Math.max(0, Number(luck) || 0);
  const lowFactor = 1 / (1 + bonus);
  const highFactor = 1 + bonus * 0.75;

  return Object.fromEntries(
    FISH_RARITY_ORDER.map((rarity) => {
      const base = FISH_RARITIES[rarity].weight;
      const factor = FISH_RARITY_RANK[rarity] <= 1 ? lowFactor : highFactor;
      return [rarity, base * factor];
    }),
  );
}

export function rollFishRarity(luck = 0, random = randomInt) {
  const weights = fishRarityWeights(luck);
  const scaled = Object.fromEntries(
    FISH_RARITY_ORDER.map((rarity) => [rarity, Math.max(1, Math.round(weights[rarity] * 10))]),
  );
  const total = FISH_RARITY_ORDER.reduce((sum, rarity) => sum + scaled[rarity], 0);
  let roll = random(1, total + 1);

  for (const rarity of FISH_RARITY_ORDER) {
    roll -= scaled[rarity];
    if (roll <= 0) return rarity;
  }
  return FISH_RARITY_ORDER[FISH_RARITY_ORDER.length - 1];
}

/** Satu cast: pakai 1 bait, tentukan ikan + ukuran + nilai, lalu simpan ke tas. */
export async function castLine(guildId, userId, now = Date.now()) {
  await ensureLoaded();

  const record = ensureAccount(guildId, userId);
  const elapsed = now - record.lastCast;
  if (elapsed < FISH_COOLDOWN_MS) {
    return { ok: false, remainingMs: FISH_COOLDOWN_MS - elapsed };
  }

  const bait = BAITS[record.bait] ?? BAITS.worm;
  if ((record.baits[bait.id] ?? 0) < 1) {
    throw new BotError(
      `Bait **${bait.name}** kamu habis. Beli di \`/fish shop\` lalu \`/fish buy jenis:bait\`, atau ambil bait gratis lewat \`/fish supply\`.`,
    );
  }
  const rod = RODS[record.rod] ?? RODS.bamboo;
  const luck = rod.luck + bait.luck;

  const rarity = rollFishRarity(luck);
  const fish = fishesOfRarity(rarity)[randomInt(fishesOfRarity(rarity).length)];
  const sizeCm = randomInt(fish.minCm, fish.maxCm + 1);
  const averageCm = (fish.minCm + fish.maxCm) / 2;
  const sizeFactor = Math.min(1.4, Math.max(0.7, sizeCm / averageCm));
  const valueBonus = rod.valueBonus + bait.valueBonus;
  const value = Math.max(1, Math.round(fish.price * sizeFactor * (1 + valueBonus)));

  record.baits[bait.id] -= 1;
  if (record.baits[bait.id] <= 0) delete record.baits[bait.id];
  record.lastCast = now;
  record.casts += 1;

  const entry = record.fish[fish.id] ?? { count: 0, value: 0 };
  entry.count += 1;
  entry.value += value;
  record.fish[fish.id] = entry;

  const isNewBest = !record.bestCatch || value > record.bestCatch.value;
  if (isNewBest) {
    record.bestCatch = { fishId: fish.id, sizeCm, value, caughtAt: now };
  }

  await save();

  await recordQuestProgress(guildId, userId, {
    fish_cast: 1,
    ...(FISH_RARITY_RANK[rarity] >= FISH_RARITY_RANK.rare ? { fish_rare: 1 } : {}),
  });

  return {
    ok: true,
    fish,
    rarity,
    rarityMeta: FISH_RARITIES[rarity],
    sizeCm,
    value,
    valueBonus,
    luck,
    rod,
    bait,
    isNewBest,
    baitLeft: record.baits[bait.id] ?? 0,
    nextCastAt: record.lastCast + FISH_COOLDOWN_MS,
  };
}

/* --------------------------------- Inventory -------------------------------- */

export function getFishBag(guildId, userId) {
  const account = getFishingAccount(guildId, userId);
  return Object.entries(account.fish)
    .map(([fishId, entry]) => {
      const fish = getFish(fishId);
      if (!fish || entry.count <= 0) return null;
      return {
        fish,
        count: entry.count,
        value: entry.value,
        unitValue: Math.max(1, Math.round(entry.value / entry.count)),
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        FISH_RARITY_RANK[b.fish.rarity] - FISH_RARITY_RANK[a.fish.rarity] ||
        b.unitValue - a.unitValue ||
        a.fish.name.localeCompare(b.fish.name),
    );
}

export async function sellFish(guildId, userId, { fishId = null, amount = null } = {}) {
  await ensureLoaded();

  if (amount !== null && !fishId) {
    throw new BotError("Tentukan ikannya dulu kalau mau menjual sejumlah tertentu.");
  }

  const record = ensureAccount(guildId, userId);
  const entries = fishId ? [[fishId, record.fish[fishId]]] : Object.entries(record.fish);
  const selected = [];

  for (const [id, entry] of entries) {
    if (!entry || !isPositiveInt(entry.count)) {
      if (fishId) throw new BotError(`Kamu tidak punya ikan **${getFish(fishId)?.name ?? fishId}** di tas.`);
      continue;
    }
    const count = amount === null ? entry.count : Math.floor(Number(amount));
    if (!isPositiveInt(count) || count > entry.count) {
      throw new BotError(
        `Kamu hanya punya **${entry.count}** salinan **${getFish(id)?.name ?? id}**.`,
      );
    }
    const coins = Math.round((entry.value * count) / entry.count);
    selected.push({ id, count, coins, remaining: entry.count - count });
  }

  if (!selected.length) throw new BotError("Tas ikan kamu masih kosong. Jual hasil tangkapan setelah memancing.");

  let total = 0;
  for (const item of selected) {
    total += item.coins;
    const entry = record.fish[item.id];
    if (item.remaining <= 0) delete record.fish[item.id];
    else {
      entry.count = item.remaining;
      entry.value = Math.max(0, entry.value - item.coins);
    }
  }

  record.fishEarned += total;
  await save();
  await addBalance(guildId, userId, total);

  await recordQuestProgress(guildId, userId, {
    fish_sell: selected.reduce((sum, item) => sum + item.count, 0),
    fish_earn: total,
  });

  return {
    items: selected.map((item) => ({ ...item, fish: getFish(item.id) })),
    total,
    balance: getBalance(guildId, userId),
    remaining: getFishBag(guildId, userId),
  };
}

/* ---------------------------------- Toko ----------------------------------- */

export async function buyFishingItem(guildId, userId, type, itemId, amount = 1) {
  await ensureLoaded();
  const record = ensureAccount(guildId, userId);

  if (type === "rod") {
    const rod = RODS[itemId];
    if (!rod) throw new BotError("Rod tidak ditemukan.");
    if (record.rods.includes(rod.id)) throw new BotError(`Kamu sudah punya **${rod.name}**.`);
    if (getBalance(guildId, userId) < rod.cost) {
      throw new BotError(`Koin tidak cukup untuk **${rod.name}**. Butuh ${formatCoins(rod.cost)}.`);
    }
    await spendBalance(guildId, userId, rod.cost);
    record.rods.push(rod.id);
    record.rod = rod.id;
    await save();
    return { kind: "rod", rod, bait: null, amount: 1, cost: rod.cost, balance: getBalance(guildId, userId) };
  }

  if (type === "bait") {
    const bait = BAITS[itemId];
    if (!bait) throw new BotError("Bait tidak ditemukan.");
    const count = Math.floor(Number(amount));
    if (!isPositiveInt(count) || count > 100) throw new BotError("Jumlah bait harus antara 1 sampai 100.");
    const cost = bait.cost * count;
    if (getBalance(guildId, userId) < cost) {
      throw new BotError(`Koin tidak cukup untuk **${count}x ${bait.name}**. Butuh ${formatCoins(cost)}.`);
    }
    if ((record.baits[bait.id] ?? 0) + count > MAX_BAIT) {
      throw new BotError(`Stok bait maksimal **${MAX_BAIT}**.`);
    }
    await spendBalance(guildId, userId, cost);
    record.baits[bait.id] = (record.baits[bait.id] ?? 0) + count;
    await save();
    return { kind: "bait", rod: null, bait, amount: count, cost, balance: getBalance(guildId, userId) };
  }

  throw new BotError("Jenis barang tidak dikenali. Pilih `rod` atau `bait`.");
}

export async function equipRod(guildId, userId, rodId) {
  await ensureLoaded();
  const record = ensureAccount(guildId, userId);
  const rod = RODS[rodId];
  if (!rod) throw new BotError("Rod tidak ditemukan.");
  if (!record.rods.includes(rod.id)) {
    throw new BotError(`Kamu belum punya **${rod.name}**. Beli lewat \`/fish buy jenis:rod item:${rod.id}\`.`);
  }
  record.rod = rod.id;
  await save();
  return { rod, bait: BAITS[record.bait] ?? BAITS.worm };
}

export async function equipBait(guildId, userId, baitId) {
  await ensureLoaded();
  const record = ensureAccount(guildId, userId);
  const bait = BAITS[baitId];
  if (!bait) throw new BotError("Bait tidak ditemukan.");
  if ((record.baits[bait.id] ?? 0) < 1) {
    throw new BotError(`Kamu tidak punya **${bait.name}**. Beli dulu lewat \`/fish shop\`.`);
  }
  record.bait = bait.id;
  await save();
  return { bait, rod: RODS[record.rod] ?? RODS.bamboo };
}

export async function claimBaitSupply(guildId, userId, now = Date.now()) {
  await ensureLoaded();
  const record = ensureAccount(guildId, userId);
  const elapsed = now - record.lastSupply;
  if (elapsed < FREE_BAIT_COOLDOWN_MS) {
    return { claimed: false, remainingMs: FREE_BAIT_COOLDOWN_MS - elapsed };
  }

  record.baits.worm = Math.min(MAX_BAIT, (record.baits.worm ?? 0) + FREE_BAIT_AMOUNT);
  if (!record.bait) record.bait = "worm";
  record.lastSupply = now;
  await save();

  return { claimed: true, amount: FREE_BAIT_AMOUNT, bait: BAITS.worm, stock: record.baits.worm };
}

/* -------------------------------- Statistik --------------------------------- */

export function getFishingSummary(guildId, userId) {
  const account = getFishingAccount(guildId, userId);
  const bag = getFishBag(guildId, userId);
  const best = account.bestCatch ? { ...account.bestCatch, fish: getFish(account.bestCatch.fishId) } : null;

  return {
    casts: account.casts,
    fishEarned: account.fishEarned,
    uniqueFish: bag.length,
    totalFish: bag.reduce((sum, entry) => sum + entry.count, 0),
    bagValue: bag.reduce((sum, entry) => sum + entry.value, 0),
    best,
    rod: RODS[account.rod] ?? RODS.bamboo,
    ownedRods: account.rods,
    bait: BAITS[account.bait] ?? BAITS.worm,
    baitStock: account.baits[account.bait] ?? 0,
    baits: account.baits,
  };
}

export function getFishingLeaderboard(guildId, limit = 10) {
  return [...accounts.values()]
    .filter((record) => record.guildId === guildId && record.fishEarned > 0)
    .sort((a, b) => b.fishEarned - a.fishEarned || b.casts - a.casts)
    .slice(0, Math.max(1, Math.min(25, limit)))
    .map((record, index) => ({
      rank: index + 1,
      userId: record.userId,
      fishEarned: record.fishEarned,
      casts: record.casts,
      bestCatch: record.bestCatch ? getFish(record.bestCatch.fishId) : null,
    }));
}
