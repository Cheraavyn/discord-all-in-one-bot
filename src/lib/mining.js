import { randomInt } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FREE_LIGHT_AMOUNT,
  FREE_LIGHT_COOLDOWN_MS,
  LIGHTS,
  LIGHT_ORDER,
  MAX_LIGHT,
  MINING_COOLDOWN_MS,
  ORE_RARITIES,
  ORE_RARITY_ORDER,
  ORE_RARITY_RANK,
  ORES,
  PICKAXES,
  PICKAXE_ORDER,
  STARTING_TORCHES,
  getOre,
  oresOfRarity,
} from "./miningCatalog.js";
import { addBalance, formatCoins, getBalance, spendBalance } from "./economy.js";
import { BotError } from "./errors.js";
import { logger } from "./logger.js";
import { recordQuestProgress } from "./quests.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const MINING_FILE = path.join(DATA_DIR, "mining.json");

const accounts = new Map();
let loaded = false;
let saveQueue = Promise.resolve();

const key = (guildId, userId) => `${guildId}:${userId}`;
const isPositiveInt = (value) => Number.isInteger(value) && value > 0;

function blankAccount(guildId, userId) {
  return {
    guildId,
    userId,
    ores: {},
    pickaxes: ["wooden"],
    pickaxe: "wooden",
    lights: { torch: STARTING_TORCHES },
    light: "torch",
    lastDig: 0,
    lastSupply: 0,
    digs: 0,
    oreEarned: 0,
    deepest: 0,
    bestFind: null,
    createdAt: Date.now(),
  };
}

function normalize(record) {
  const rawOres = record.ores && typeof record.ores === "object" ? record.ores : {};
  record.ores = {};
  for (const [oreId, entry] of Object.entries(rawOres)) {
    if (!getOre(oreId) || !entry || typeof entry !== "object") continue;
    const count = Math.floor(Number(entry.count) || 0);
    const value = Math.floor(Number(entry.value) || 0);
    if (count > 0) record.ores[oreId] = { count, value: Math.max(0, value) };
  }

  const rawPickaxes = Array.isArray(record.pickaxes) ? record.pickaxes.filter((id) => PICKAXES[id]) : [];
  record.pickaxes = [...new Set([...rawPickaxes, "wooden"])];
  record.pickaxe =
    PICKAXES[record.pickaxe] && record.pickaxes.includes(record.pickaxe) ? record.pickaxe : "wooden";

  const rawLights = record.lights && typeof record.lights === "object" ? record.lights : {};
  record.lights = {};
  for (const [lightId, amount] of Object.entries(rawLights)) {
    if (!LIGHTS[lightId]) continue;
    const value = Math.floor(Number(amount) || 0);
    if (value > 0) record.lights[lightId] = Math.min(MAX_LIGHT, value);
  }
  record.light =
    LIGHTS[record.light] && (record.lights[record.light] ?? 0) > 0
      ? record.light
      : (LIGHT_ORDER.find((id) => (record.lights[id] ?? 0) > 0) ?? "torch");

  record.lastDig = Math.max(0, Number(record.lastDig) || 0);
  record.lastSupply = Math.max(0, Number(record.lastSupply) || 0);
  record.digs = Math.max(0, Math.floor(Number(record.digs) || 0));
  record.oreEarned = Math.max(0, Math.floor(Number(record.oreEarned) || 0));
  record.deepest = Math.max(0, Math.floor(Number(record.deepest) || 0));
  record.bestFind =
    record.bestFind && typeof record.bestFind === "object" && getOre(record.bestFind.oreId)
      ? {
          oreId: record.bestFind.oreId,
          weightGr: Math.max(0, Math.floor(Number(record.bestFind.weightGr) || 0)),
          value: Math.max(0, Math.floor(Number(record.bestFind.value) || 0)),
          depth: Math.max(0, Math.floor(Number(record.bestFind.depth) || 0)),
          foundAt: Math.max(0, Number(record.bestFind.foundAt) || 0),
        }
      : null;
  record.createdAt = Number(record.createdAt) || Date.now();

  return record;
}

export async function initMining() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(MINING_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];
    for (const record of Array.isArray(data) ? data : []) {
      if (!record?.guildId || !record?.userId) continue;
      accounts.set(key(record.guildId, record.userId), normalize(record));
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/mining.json, mulai dengan data kosong:", error.message);
    }
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initMining();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${MINING_FILE}.tmp`;
      await writeFile(tmpFile, JSON.stringify([...accounts.values()], null, 2), "utf8");
      await rename(tmpFile, MINING_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/mining.json:", error.message));

  return saveQueue;
}

export async function closeMining() {
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

export function getMiningAccount(guildId, userId) {
  return accounts.get(key(guildId, userId)) ?? blankAccount(guildId, userId);
}

/** Sisa cooldown dig dalam ms (0 kalau boleh dig). Tidak menulis data. */
export async function getDigCooldownRemaining(guildId, userId, now = Date.now()) {
  await ensureLoaded();
  const record = getMiningAccount(guildId, userId);
  const elapsed = now - record.lastDig;
  return elapsed < MINING_COOLDOWN_MS ? MINING_COOLDOWN_MS - elapsed : 0;
}

/** Ubah gram menjadi teks berat yang enak dibaca. */
export function formatWeight(grams) {
  const value = Math.max(0, Math.floor(Number(grams) || 0));
  if (value < 1000) return `${value} g`;
  return `${(value / 1000).toFixed(2)} kg`;
}

/* ------------------------------- Mekanik dig -------------------------------- */

/** Bobot rarity setelah dipengaruhi pickaxe + light. Rare+ naik, Common/Uncommon turun. */
export function oreRarityWeights(luck = 0) {
  const bonus = Math.max(0, Number(luck) || 0);
  const lowFactor = 1 / (1 + bonus);
  const highFactor = 1 + bonus * 0.75;

  return Object.fromEntries(
    ORE_RARITY_ORDER.map((rarity) => {
      const base = ORE_RARITIES[rarity].weight;
      const factor = ORE_RARITY_RANK[rarity] <= 1 ? lowFactor : highFactor;
      return [rarity, base * factor];
    }),
  );
}

export function rollOreRarity(luck = 0, random = randomInt) {
  const weights = oreRarityWeights(luck);
  const scaled = Object.fromEntries(
    ORE_RARITY_ORDER.map((rarity) => [rarity, Math.max(1, Math.round(weights[rarity] * 10))]),
  );
  const total = ORE_RARITY_ORDER.reduce((sum, rarity) => sum + scaled[rarity], 0);
  let roll = random(1, total + 1);

  for (const rarity of ORE_RARITY_ORDER) {
    roll -= scaled[rarity];
    if (roll <= 0) return rarity;
  }
  return ORE_RARITY_ORDER[ORE_RARITY_ORDER.length - 1];
}

/** Satu dig: pakai 1 lampu, tentukan ore + berat + kedalaman + nilai, lalu simpan ke tas. */
export async function digMine(guildId, userId, now = Date.now()) {
  await ensureLoaded();

  const record = ensureAccount(guildId, userId);
  const elapsed = now - record.lastDig;
  if (elapsed < MINING_COOLDOWN_MS) {
    return { ok: false, remainingMs: MINING_COOLDOWN_MS - elapsed };
  }

  const light = LIGHTS[record.light] ?? LIGHTS.torch;
  if ((record.lights[light.id] ?? 0) < 1) {
    throw new BotError(
      `Lampu **${light.name}** kamu habis. Beli di \`/mine shop\` lalu \`/mine buy jenis:light\`, atau ambil lampu gratis lewat \`/mine supply\`.`,
    );
  }
  const pickaxe = PICKAXES[record.pickaxe] ?? PICKAXES.wooden;
  const luck = pickaxe.luck + light.luck;

  const rarity = rollOreRarity(luck);
  const ore = oresOfRarity(rarity)[randomInt(oresOfRarity(rarity).length)];
  const minGr = Math.round(ore.minKg * 1000);
  const maxGr = Math.round(ore.maxKg * 1000);
  const weightGr = randomInt(minGr, maxGr + 1);
  const averageGr = (minGr + maxGr) / 2;
  const weightFactor = Math.min(1.4, Math.max(0.7, weightGr / averageGr));
  const valueBonus = pickaxe.valueBonus + light.valueBonus;
  const value = Math.max(1, Math.round(ore.price * weightFactor * (1 + valueBonus)));
  const depth = randomInt(ore.minDepth, ore.maxDepth + 1) + pickaxe.depthBonus;

  record.lights[light.id] -= 1;
  if (record.lights[light.id] <= 0) delete record.lights[light.id];
  record.lastDig = now;
  record.digs += 1;
  record.deepest = Math.max(record.deepest, depth);

  const entry = record.ores[ore.id] ?? { count: 0, value: 0 };
  entry.count += 1;
  entry.value += value;
  record.ores[ore.id] = entry;

  const isNewBest = !record.bestFind || value > record.bestFind.value;
  if (isNewBest) {
    record.bestFind = { oreId: ore.id, weightGr, value, depth, foundAt: now };
  }

  await save();

  await recordQuestProgress(guildId, userId, {
    mine_dig: 1,
    ...(ORE_RARITY_RANK[rarity] >= ORE_RARITY_RANK.epic ? { mine_rare: 1 } : {}),
  });

  return {
    ok: true,
    ore,
    rarity,
    rarityMeta: ORE_RARITIES[rarity],
    weightGr,
    weightFactor,
    depth,
    value,
    valueBonus,
    luck,
    pickaxe,
    light,
    isNewBest,
    lightLeft: record.lights[light.id] ?? 0,
    nextDigAt: record.lastDig + MINING_COOLDOWN_MS,
  };
}

/* --------------------------------- Inventory -------------------------------- */

export function getOreBag(guildId, userId) {
  const account = getMiningAccount(guildId, userId);
  return Object.entries(account.ores)
    .map(([oreId, entry]) => {
      const ore = getOre(oreId);
      if (!ore || entry.count <= 0) return null;
      return {
        ore,
        count: entry.count,
        value: entry.value,
        unitValue: Math.max(1, Math.round(entry.value / entry.count)),
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        ORE_RARITY_RANK[b.ore.rarity] - ORE_RARITY_RANK[a.ore.rarity] ||
        b.unitValue - a.unitValue ||
        a.ore.name.localeCompare(b.ore.name),
    );
}

export async function sellOres(guildId, userId, { oreId = null, amount = null } = {}) {
  await ensureLoaded();

  if (amount !== null && !oreId) {
    throw new BotError("Tentukan ore-nya dulu kalau mau menjual sejumlah tertentu.");
  }

  const record = ensureAccount(guildId, userId);
  const entries = oreId ? [[oreId, record.ores[oreId]]] : Object.entries(record.ores);
  const selected = [];

  for (const [id, entry] of entries) {
    if (!entry || !isPositiveInt(entry.count)) {
      if (oreId) throw new BotError(`Kamu tidak punya ore **${getOre(oreId)?.name ?? oreId}** di tas.`);
      continue;
    }
    const count = amount === null ? entry.count : Math.floor(Number(amount));
    if (!isPositiveInt(count) || count > entry.count) {
      throw new BotError(`Kamu hanya punya **${entry.count}** salinan **${getOre(id)?.name ?? id}**.`);
    }
    const coins = Math.round((entry.value * count) / entry.count);
    selected.push({ id, count, coins, remaining: entry.count - count });
  }

  if (!selected.length) throw new BotError("Tas ore kamu masih kosong. Jual hasil galian setelah menambang.");

  let total = 0;
  for (const item of selected) {
    total += item.coins;
    const entry = record.ores[item.id];
    if (item.remaining <= 0) delete record.ores[item.id];
    else {
      entry.count = item.remaining;
      entry.value = Math.max(0, entry.value - item.coins);
    }
  }

  record.oreEarned += total;
  await save();
  await addBalance(guildId, userId, total);

  await recordQuestProgress(guildId, userId, {
    mine_sell: selected.reduce((sum, item) => sum + item.count, 0),
    mine_earn: total,
  });

  return {
    items: selected.map((item) => ({ ...item, ore: getOre(item.id) })),
    total,
    balance: getBalance(guildId, userId),
    remaining: getOreBag(guildId, userId),
  };
}

/* ---------------------------------- Toko ----------------------------------- */

export async function buyMiningItem(guildId, userId, type, itemId, amount = 1) {
  await ensureLoaded();
  const record = ensureAccount(guildId, userId);

  if (type === "pickaxe") {
    const pickaxe = PICKAXES[itemId];
    if (!pickaxe) throw new BotError("Pickaxe tidak ditemukan.");
    if (record.pickaxes.includes(pickaxe.id)) throw new BotError(`Kamu sudah punya **${pickaxe.name}**.`);
    if (getBalance(guildId, userId) < pickaxe.cost) {
      throw new BotError(`Koin tidak cukup untuk **${pickaxe.name}**. Butuh ${formatCoins(pickaxe.cost)}.`);
    }
    await spendBalance(guildId, userId, pickaxe.cost);
    record.pickaxes.push(pickaxe.id);
    record.pickaxe = pickaxe.id;
    await save();
    return { kind: "pickaxe", pickaxe, light: null, amount: 1, cost: pickaxe.cost, balance: getBalance(guildId, userId) };
  }

  if (type === "light") {
    const light = LIGHTS[itemId];
    if (!light) throw new BotError("Lampu tidak ditemukan.");
    const count = Math.floor(Number(amount));
    if (!isPositiveInt(count) || count > 100) throw new BotError("Jumlah lampu harus antara 1 sampai 100.");
    const cost = light.cost * count;
    if (getBalance(guildId, userId) < cost) {
      throw new BotError(`Koin tidak cukup untuk **${count}x ${light.name}**. Butuh ${formatCoins(cost)}.`);
    }
    if ((record.lights[light.id] ?? 0) + count > MAX_LIGHT) {
      throw new BotError(`Stok lampu maksimal **${MAX_LIGHT}**.`);
    }
    await spendBalance(guildId, userId, cost);
    record.lights[light.id] = (record.lights[light.id] ?? 0) + count;
    await save();
    return { kind: "light", pickaxe: null, light, amount: count, cost, balance: getBalance(guildId, userId) };
  }

  throw new BotError("Jenis barang tidak dikenali. Pilih `pickaxe` atau `light`.");
}

export async function equipPickaxe(guildId, userId, pickaxeId) {
  await ensureLoaded();
  const record = ensureAccount(guildId, userId);
  const pickaxe = PICKAXES[pickaxeId];
  if (!pickaxe) throw new BotError("Pickaxe tidak ditemukan.");
  if (!record.pickaxes.includes(pickaxe.id)) {
    throw new BotError(`Kamu belum punya **${pickaxe.name}**. Beli lewat \`/mine buy jenis:pickaxe item:${pickaxe.id}\`.`);
  }
  record.pickaxe = pickaxe.id;
  await save();
  return { pickaxe, light: LIGHTS[record.light] ?? LIGHTS.torch };
}

export async function equipLight(guildId, userId, lightId) {
  await ensureLoaded();
  const record = ensureAccount(guildId, userId);
  const light = LIGHTS[lightId];
  if (!light) throw new BotError("Lampu tidak ditemukan.");
  if ((record.lights[light.id] ?? 0) < 1) {
    throw new BotError(`Kamu tidak punya **${light.name}**. Beli dulu lewat \`/mine shop\`.`);
  }
  record.light = light.id;
  await save();
  return { light, pickaxe: PICKAXES[record.pickaxe] ?? PICKAXES.wooden };
}

export async function claimLightSupply(guildId, userId, now = Date.now()) {
  await ensureLoaded();
  const record = ensureAccount(guildId, userId);
  const elapsed = now - record.lastSupply;
  if (elapsed < FREE_LIGHT_COOLDOWN_MS) {
    return { claimed: false, remainingMs: FREE_LIGHT_COOLDOWN_MS - elapsed };
  }

  record.lights.torch = Math.min(MAX_LIGHT, (record.lights.torch ?? 0) + FREE_LIGHT_AMOUNT);
  if (!record.light) record.light = "torch";
  record.lastSupply = now;
  await save();

  return { claimed: true, amount: FREE_LIGHT_AMOUNT, light: LIGHTS.torch, stock: record.lights.torch };
}

/* -------------------------------- Statistik --------------------------------- */

export function getMiningSummary(guildId, userId) {
  const account = getMiningAccount(guildId, userId);
  const bag = getOreBag(guildId, userId);
  const best = account.bestFind ? { ...account.bestFind, ore: getOre(account.bestFind.oreId) } : null;

  return {
    digs: account.digs,
    oreEarned: account.oreEarned,
    uniqueOres: bag.length,
    totalOres: bag.reduce((sum, entry) => sum + entry.count, 0),
    bagValue: bag.reduce((sum, entry) => sum + entry.value, 0),
    best,
    deepest: account.deepest,
    pickaxe: PICKAXES[account.pickaxe] ?? PICKAXES.wooden,
    ownedPickaxes: account.pickaxes,
    light: LIGHTS[account.light] ?? LIGHTS.torch,
    lightStock: account.lights[account.light] ?? 0,
    lights: account.lights,
  };
}

export function getMiningLeaderboard(guildId, limit = 10) {
  return [...accounts.values()]
    .filter((record) => record.guildId === guildId && record.oreEarned > 0)
    .sort((a, b) => b.oreEarned - a.oreEarned || b.digs - a.digs)
    .slice(0, Math.max(1, Math.min(25, limit)))
    .map((record, index) => ({
      rank: index + 1,
      userId: record.userId,
      oreEarned: record.oreEarned,
      digs: record.digs,
      deepest: record.deepest,
      bestFind: record.bestFind ? getOre(record.bestFind.oreId) : null,
    }));
}
