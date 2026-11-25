import { randomInt } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BATTLE_MAX_ROUNDS,
  BATTLE_TAX_RATE,
  CARDS,
  CARD_MAX_LEVEL,
  CELESTIAL_PITY,
  ELEMENTS,
  EPIC_PITY,
  GACHA_MULTI_COST,
  GACHA_MULTI_COUNT,
  GACHA_SINGLE_COST,
  LEGENDARY_PITY,
  RARITIES,
  RARITY_ORDER,
  RARITY_RANK,
  cardPower,
  cardsOfRarity,
  clampCardLevel,
  effectiveStats,
  getCard,
  getUpgradeCost,
} from "./cardCatalog.js";
import { addBalance, getBalance, spendBalance } from "./economy.js";
import { BotError } from "./errors.js";
import { logger } from "./logger.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const CARDS_FILE = path.join(DATA_DIR, "cards.json");

const accounts = new Map();
let loaded = false;
let saveQueue = Promise.resolve();

const key = (guildId, userId) => `${guildId}:${userId}`;

function normalize(record) {
  record.cards = record.cards && typeof record.cards === "object" ? record.cards : {};
  record.levels = record.levels && typeof record.levels === "object" ? record.levels : {};

  for (const [cardId, count] of Object.entries(record.cards)) {
    const value = Math.floor(Number(count) || 0);
    if (value > 0 && getCard(cardId)) record.cards[cardId] = value;
    else delete record.cards[cardId];
  }

  for (const [cardId, level] of Object.entries(record.levels)) {
    if (!record.cards[cardId]) {
      delete record.levels[cardId];
      continue;
    }

    const value = clampCardLevel(level);
    if (value > 1) record.levels[cardId] = value;
    else delete record.levels[cardId];
  }

  record.pulls = Math.max(0, Math.floor(Number(record.pulls) || 0));
  record.pityEpic = Math.max(0, Math.floor(Number(record.pityEpic) || 0));
  record.pityLegend = Math.max(0, Math.floor(Number(record.pityLegend) || 0));
  record.pityCelestial = Math.max(0, Math.floor(Number(record.pityCelestial) || 0));
  record.wins = Math.max(0, Math.floor(Number(record.wins) || 0));
  record.losses = Math.max(0, Math.floor(Number(record.losses) || 0));
  record.streak = Math.max(0, Math.floor(Number(record.streak) || 0));
  record.bestStreak = Math.max(record.streak, Math.floor(Number(record.bestStreak) || 0));
  record.coinsWon = Math.max(0, Math.floor(Number(record.coinsWon) || 0));
  record.coinsLost = Math.max(0, Math.floor(Number(record.coinsLost) || 0));
  record.createdAt = Number(record.createdAt) || Date.now();

  return record;
}

export async function initCards() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(CARDS_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];

    for (const record of Array.isArray(data) ? data : []) {
      if (!record?.guildId || !record?.userId) continue;
      accounts.set(key(record.guildId, record.userId), normalize(record));
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/cards.json, mulai dengan data kosong:", error.message);
    }
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initCards();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${CARDS_FILE}.tmp`;
      await writeFile(tmpFile, JSON.stringify([...accounts.values()], null, 2), "utf8");
      await rename(tmpFile, CARDS_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/cards.json:", error.message));

  return saveQueue;
}

export async function closeCards() {
  await save();
}

function blankAccount(guildId, userId) {
  return {
    guildId,
    userId,
    cards: {},
    levels: {},
    pulls: 0,
    pityEpic: 0,
    pityLegend: 0,
    pityCelestial: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    coinsWon: 0,
    coinsLost: 0,
    createdAt: null,
  };
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

export function getCardAccount(guildId, userId) {
  return accounts.get(key(guildId, userId)) ?? blankAccount(guildId, userId);
}

export function getCardCount(guildId, userId, cardId) {
  return getCardAccount(guildId, userId).cards[cardId] ?? 0;
}

export function getCardLevel(guildId, userId, cardId) {
  return clampCardLevel(getCardAccount(guildId, userId).levels?.[cardId] ?? 1);
}

export function getOwnedCards(guildId, userId) {
  const account = getCardAccount(guildId, userId);

  return Object.entries(account.cards)
    .map(([cardId, count]) => {
      const base = getCard(cardId);
      if (!base) return null;

      const level = clampCardLevel(account.levels?.[cardId] ?? 1);
      const card = { ...base, level };

      return { card, count, level, stats: effectiveStats(card, level) };
    })
    .filter((entry) => entry && entry.count > 0)
    .sort(
      (a, b) =>
        RARITY_RANK[b.card.rarity] - RARITY_RANK[a.card.rarity] ||
        cardPower(b.card) - cardPower(a.card) ||
        a.card.name.localeCompare(b.card.name),
    );
}

export function getCollectionSummary(guildId, userId) {
  const account = getCardAccount(guildId, userId);
  const owned = getOwnedCards(guildId, userId);

  return {
    unique: owned.length,
    totalCards: CARDS.length,
    copies: owned.reduce((sum, entry) => sum + entry.count, 0),
    pulls: account.pulls,
    wins: account.wins,
    losses: account.losses,
    streak: account.streak,
    bestStreak: account.bestStreak,
    coinsWon: account.coinsWon,
    coinsLost: account.coinsLost,
    owned,
  };
}

/* --------------------------------- Gacha ---------------------------------- */

function randomOf(list) {
  return list[randomInt(list.length)];
}

/** Bobot disimpan dalam persen; dikali 10 agar randomInt tetap dapat bilangan bulat. */
function weightOf(rarity) {
  return Math.round(RARITIES[rarity].weight * 10);
}

function pickRarity(pool = RARITY_ORDER) {
  const total = pool.reduce((sum, rarity) => sum + weightOf(rarity), 0);
  let roll = randomInt(1, total + 1);

  for (const rarity of pool) {
    roll -= weightOf(rarity);
    if (roll <= 0) return rarity;
  }

  return pool[pool.length - 1];
}

export function gachaCost(times) {
  return times === GACHA_MULTI_COUNT ? GACHA_MULTI_COST : GACHA_SINGLE_COST;
}

/**
 * Tarik kartu. Saldo dipotong dulu, lalu counter pity diperbarui per pull.
 * @returns {Promise<{results: Array<{card: object, isNew: boolean, pitied: string|null}>, cost: number, balance: number, pityEpic: number, pityLegend: number, pityCelestial: number}>}
 */
export async function rollGacha(guildId, userId, times = 1) {
  await ensureLoaded();

  const count = Number(times);
  if (count !== 1 && count !== GACHA_MULTI_COUNT) {
    throw new BotError("Jumlah pull harus **1** atau **10**.");
  }

  const cost = gachaCost(count);
  const balance = getBalance(guildId, userId);
  if (balance < cost) {
    throw new BotError(
      `Koin kamu tidak cukup untuk gacha. Butuh **${cost.toLocaleString("id-ID")}** koin, saldo kamu **${balance.toLocaleString("id-ID")}** koin.`,
    );
  }

  await spendBalance(guildId, userId, cost);
  const record = ensureAccount(guildId, userId);
  const results = [];

  for (let index = 0; index < count; index += 1) {
    record.pulls += 1;
    record.pityEpic += 1;
    record.pityLegend += 1;
    record.pityCelestial += 1;

    let rarity = pickRarity();
    let pitied = null;

    if (RARITY_RANK[rarity] < RARITY_RANK.celestial && record.pityCelestial >= CELESTIAL_PITY) {
      rarity = "celestial";
      pitied = "celestial";
    }

    if (RARITY_RANK[rarity] < RARITY_RANK.legendary && record.pityLegend >= LEGENDARY_PITY) {
      rarity = pickRarity(["legendary", "mythic", "celestial"]);
      pitied = pitied ?? "legendary";
    }

    if (RARITY_RANK[rarity] < RARITY_RANK.epic && record.pityEpic >= EPIC_PITY) {
      rarity = pickRarity(["epic", "legendary", "mythic", "celestial"]);
      pitied = pitied ?? "epic";
    }

    if (RARITY_RANK[rarity] >= RARITY_RANK.celestial) record.pityCelestial = 0;
    if (RARITY_RANK[rarity] >= RARITY_RANK.legendary) record.pityLegend = 0;
    if (RARITY_RANK[rarity] >= RARITY_RANK.epic) record.pityEpic = 0;

    const card = randomOf(cardsOfRarity(rarity));
    const before = record.cards[card.id] ?? 0;
    record.cards[card.id] = before + 1;

    results.push({ card, isNew: before === 0, pitied });
  }

  await save();

  return {
    results,
    cost,
    balance: getBalance(guildId, userId),
    pityEpic: record.pityEpic,
    pityLegend: record.pityLegend,
    pityCelestial: record.pityCelestial,
  };
}

/* --------------------------------- Jual ----------------------------------- */

export async function sellCard(guildId, userId, cardId, amount = 1) {
  await ensureLoaded();

  const card = getCard(cardId);
  if (!card) throw new BotError("Kartu tidak ditemukan.");

  const record = ensureAccount(guildId, userId);
  const owned = record.cards[card.id] ?? 0;
  if (!owned) throw new BotError(`Kamu tidak memiliki kartu **${card.name}**.`);

  const count = Number(amount);
  if (!Number.isInteger(count) || count < 1) {
    throw new BotError("Jumlah kartu yang dijual harus bilangan bulat positif.");
  }
  if (count > owned) {
    throw new BotError(`Kamu hanya punya **${owned}** salinan **${card.name}**.`);
  }

  const coins = RARITIES[card.rarity].sell * count;

  if (count === owned) {
    delete record.cards[card.id];
    delete record.levels[card.id];
  } else record.cards[card.id] = owned - count;

  await addBalance(guildId, userId, coins);
  await save();

  return { card, count, coins, remaining: record.cards[card.id] ?? 0 };
}

/* -------------------------------- Upgrade --------------------------------- */

/**
 * Naikkan level kartu dengan mengorbankan salinan duplikat + koin.
 * Satu salinan selalu disisakan supaya kartu tidak hilang.
 */
export async function upgradeCard(guildId, userId, cardId) {
  await ensureLoaded();

  const card = getCard(cardId);
  if (!card) throw new BotError("Kartu tidak ditemukan.");

  const record = ensureAccount(guildId, userId);
  const owned = record.cards[card.id] ?? 0;
  if (!owned) throw new BotError(`Kamu tidak memiliki kartu **${card.name}**.`);

  const level = clampCardLevel(record.levels[card.id] ?? 1);
  if (level >= CARD_MAX_LEVEL) {
    throw new BotError(
      `**${card.name}** sudah mencapai level maksimum **Lv.${CARD_MAX_LEVEL}**.`,
    );
  }

  const cost = getUpgradeCost(level);
  const duplicates = owned - 1;
  if (duplicates < cost.duplicates) {
    throw new BotError(
      `Butuh **${cost.duplicates}** salinan duplikat **${card.name}** untuk naik ke **Lv.${cost.to}**. Kamu punya **${owned}** salinan (${duplicates} duplikat).`,
    );
  }

  const balance = getBalance(guildId, userId);
  if (balance < cost.coins) {
    throw new BotError(
      `Koin kamu tidak cukup. Butuh **${cost.coins.toLocaleString("id-ID")}** koin, saldo kamu **${balance.toLocaleString("id-ID")}** koin.`,
    );
  }

  await spendBalance(guildId, userId, cost.coins);

  record.cards[card.id] = owned - cost.duplicates;
  if (record.cards[card.id] <= 0) delete record.cards[card.id];
  record.levels[card.id] = cost.to;
  await save();

  const upgraded = { ...card, level: cost.to };

  return {
    card: upgraded,
    from: cost.from,
    to: cost.to,
    cost,
    spentCoins: cost.coins,
    remaining: record.cards[card.id] ?? 0,
    stats: effectiveStats(upgraded, cost.to),
    nextCost: getUpgradeCost(cost.to),
    balance: getBalance(guildId, userId),
  };
}

/* ------------------------------ Leaderboard -------------------------------- */

/** Papan peringkat duel per server, diurutkan dari kemenangan terbanyak. */
export function getBattleLeaderboard(guildId, limit = 10) {
  return [...accounts.values()]
    .filter((record) => record.guildId === guildId && record.wins + record.losses > 0)
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.bestStreak - a.bestStreak ||
        b.coinsWon - a.coinsWon ||
        a.losses - b.losses,
    )
    .slice(0, Math.max(1, limit))
    .map((record, index) => ({
      rank: index + 1,
      userId: record.userId,
      wins: record.wins,
      losses: record.losses,
      streak: record.streak,
      bestStreak: record.bestStreak,
      coinsWon: record.coinsWon,
      coinsLost: record.coinsLost,
    }));
}

/* --------------------------------- Duel ----------------------------------- */

/** Catat hasil duel untuk kedua pemain (dipanggil setelah koin dibayarkan). */
export async function recordBattleResult(guildId, winnerId, loserId, { bet, payout }) {
  await ensureLoaded();

  const winner = ensureAccount(guildId, winnerId);
  winner.wins += 1;
  winner.streak += 1;
  winner.bestStreak = Math.max(winner.bestStreak, winner.streak);
  winner.coinsWon += payout;

  const loser = ensureAccount(guildId, loserId);
  loser.losses += 1;
  loser.streak = 0;
  loser.coinsLost += bet;

  await save();
}

/**
 * Simulasi duel kartu. Urutan serangan ditentukan SPD, lalu bergantian
 * sampai salah satu HP habis atau ronde maksimum tercapai.
 *
 * Skill elemen aktif otomatis:
 * - api   : crit 25%
 * - angin : 15% peluang menyerang dua kali
 * - bumi  : damage masuk -15%
 * - air   : memulihkan 6% HP maksimum di akhir ronde
 */
export function simulateBattle(cardA, cardB) {
  const statsA = effectiveStats(cardA);
  const statsB = effectiveStats(cardB);
  const maxHpA = statsA.hp;
  const maxHpB = statsB.hp;
  let hpA = maxHpA;
  let hpB = maxHpB;
  const events = [];

  const order =
    statsA.spd === statsB.spd
      ? randomOf(["a", "b"]) === "a"
        ? ["a", "b"]
        : ["b", "a"]
      : statsA.spd > statsB.spd
        ? ["a", "b"]
        : ["b", "a"];

  for (let round = 1; round <= BATTLE_MAX_ROUNDS && hpA > 0 && hpB > 0; round += 1) {
    for (const attackerKey of order) {
      if (hpA <= 0 || hpB <= 0) break;

      const attacker = attackerKey === "a" ? cardA : cardB;
      const defender = attackerKey === "a" ? cardB : cardA;
      const attackerStats = attackerKey === "a" ? statsA : statsB;
      const defenderStats = attackerKey === "a" ? statsB : statsA;
      const advantage = ELEMENTS[attacker.element].beats === defender.element;
      const shielded = defender.element === "bumi";
      const hits = attacker.element === "angin" && randomInt(100) < 15 ? 2 : 1;
      const critChance = attacker.element === "api" ? 25 : 10;
      let totalDamage = 0;
      let crit = false;

      for (let hit = 0; hit < hits; hit += 1) {
        const isCrit = randomInt(100) < critChance;
        crit = crit || isCrit;

        const raw =
          attackerStats.atk *
          (0.85 + Math.random() * 0.3) *
          (advantage ? 1.25 : 1) *
          (isCrit ? 1.6 : 1);
        let damage = Math.max(3, Math.round(raw - defenderStats.def * 0.45));
        if (shielded) damage = Math.max(3, Math.round(damage * 0.85));

        totalDamage += damage;
      }

      if (attackerKey === "a") hpB = Math.max(0, hpB - totalDamage);
      else hpA = Math.max(0, hpA - totalDamage);

      events.push({
        round,
        attacker: attackerKey,
        kind: "attack",
        damage: totalDamage,
        hits,
        crit,
        advantage,
        shielded,
        hpA,
        hpB,
      });
    }

    if (hpA <= 0 || hpB <= 0) break;

    for (const healerKey of ["a", "b"]) {
      const card = healerKey === "a" ? cardA : cardB;
      if (card.element !== "air") continue;

      const maxHp = healerKey === "a" ? maxHpA : maxHpB;
      const currentHp = healerKey === "a" ? hpA : hpB;
      if (currentHp <= 0 || currentHp >= maxHp) continue;

      const heal = Math.min(maxHp - currentHp, Math.max(1, Math.round(maxHp * 0.06)));
      if (healerKey === "a") hpA += heal;
      else hpB += heal;

      events.push({
        round,
        attacker: healerKey,
        kind: "heal",
        heal,
        hpA,
        hpB,
      });
    }
  }

  let winner;
  if (hpB <= 0 && hpA > 0) winner = "a";
  else if (hpA <= 0 && hpB > 0) winner = "b";
  else if (hpA <= 0 && hpB <= 0) winner = cardPower(cardA) >= cardPower(cardB) ? "a" : "b";
  else {
    const ratioA = hpA / maxHpA;
    const ratioB = hpB / maxHpB;
    if (ratioA === ratioB) winner = cardPower(cardA) >= cardPower(cardB) ? "a" : "b";
    else winner = ratioA > ratioB ? "a" : "b";
  }

  return { winner, events, maxHpA, maxHpB, hpA, hpB };
}

export function battlePayout(bet) {
  const pot = bet * 2;
  const tax = Math.max(1, Math.floor(pot * BATTLE_TAX_RATE));
  return { pot, tax, payout: pot - tax };
}
