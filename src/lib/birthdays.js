import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PermissionFlagsBits } from "discord.js";
import { addBalance } from "./economy.js";
import { buildEmbed, COLORS } from "./embeds.js";
import { BotError } from "./errors.js";
import { logger } from "./logger.js";
import { getSettings } from "./settings.js";
import { detectTimeZone, resolveTimeZone } from "./timezones.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const BIRTHDAYS_FILE = path.join(DATA_DIR, "birthdays.json");

const FALLBACK_MESSAGE = "🎉 Selamat ulang tahun, {user}! Semoga panjang umur, sehat, dan selalu bahagia. 🎂";
const ROLE_DURATION_MS = 24 * 60 * 60 * 1000;
const SEND_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const records = new Map();
let loaded = false;
let saveQueue = Promise.resolve();
let schedulerTimer = null;
let tickTimer = null;

const key = (guildId, userId) => `${guildId}:${userId}`;

function safeZone(zone) {
  try {
    return resolveTimeZone(zone);
  } catch {
    return detectTimeZone();
  }
}

/* ------------------------------- Tanggal ----------------------------------- */

function isLeap(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidDate(month, day, year = 2000) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Ambil komponen tanggal sesuai zona waktu (bukan zona lokal bot). */
function zonedParts(date, zone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(date);
    const get = (type) => Number(parts.find((part) => part.type === type)?.value);
    return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  }
}

const pad2 = (value) => String(value).padStart(2, "0");
const partsKey = ({ year, month, day }) => `${year}-${pad2(month)}-${pad2(day)}`;

function dateKeyInZone(date, zone) {
  return partsKey(zonedParts(date, zone));
}

/** Ubah "tengah malam di zona X" menjadi instant UTC yang benar (termasuk DST). */
function zonedMidnightToUtc(year, month, day, zone) {
  const target = Date.UTC(year, month - 1, day);
  let instant = target;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(instant), zone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const delta = target - asUtc;
    instant += delta;
    if (delta === 0) break;
  }

  return new Date(instant);
}

/** 29 Februari dirayakan 1 Maret pada tahun bukan kabut. */
function occurrenceParts(month, day, year) {
  if (month === 2 && day === 29 && !isLeap(year)) return { year, month: 3, day: 1 };
  return { year, month, day };
}

function nextOccurrence(record, now = new Date()) {
  const zone = record.timeZone ?? detectTimeZone();
  const today = zonedParts(now, zone);
  const thisYear = occurrenceParts(record.month, record.day, today.year);
  const useThisYear = partsKey(thisYear) >= partsKey(today);
  const occurrence = useThisYear ? thisYear : occurrenceParts(record.month, record.day, today.year + 1);

  return {
    ...occurrence,
    timeZone: zone,
    key: partsKey(occurrence),
    instant: zonedMidnightToUtc(occurrence.year, occurrence.month, occurrence.day, zone),
  };
}

function daysUntil(occurrence, now) {
  const today = zonedParts(now, occurrence.timeZone);
  return Math.round(
    (Date.UTC(occurrence.year, occurrence.month - 1, occurrence.day) -
      Date.UTC(today.year, today.month - 1, today.day)) /
      (24 * 60 * 60 * 1000),
  );
}

function ageOn(record, occurrence) {
  return record.year ? occurrence.year - record.year : null;
}

export function formatBirthday(record) {
  return `${record.day} ${MONTH_NAMES[record.month - 1]}${record.year ? ` ${record.year}` : ""}`;
}

export function getNextOccurrence(record, now = new Date()) {
  return nextOccurrence(record, now);
}

/* ----------------------------- Persistensi --------------------------------- */

function normalize(record) {
  const month = Number(record?.month);
  const day = Number(record?.day);
  if (!isValidDate(month, day)) return null;

  const yearValue = Number(record.year);
  const year = Number.isInteger(yearValue) && yearValue >= 1900 && yearValue <= new Date().getFullYear()
    ? yearValue
    : null;

  return {
    guildId: String(record.guildId),
    userId: String(record.userId),
    month,
    day,
    year,
    timeZone: safeZone(record.timeZone),
    public: record.public !== false,
    lastCelebrated: typeof record.lastCelebrated === "string" ? record.lastCelebrated : null,
    lastRoleId: typeof record.lastRoleId === "string" ? record.lastRoleId : null,
    celebratedAt: Number(record.celebratedAt) || null,
    createdAt: Number(record.createdAt) || Date.now(),
  };
}

export async function initBirthdays() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(BIRTHDAYS_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];
    for (const item of Array.isArray(data) ? data : []) {
      if (!item?.guildId || !item?.userId) continue;
      const record = normalize(item);
      if (record) records.set(key(record.guildId, record.userId), record);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/birthdays.json, mulai dengan data kosong:", error.message);
    }
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initBirthdays();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${BIRTHDAYS_FILE}.tmp`;
      await writeFile(tmpFile, JSON.stringify([...records.values()], null, 2), "utf8");
      await rename(tmpFile, BIRTHDAYS_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/birthdays.json:", error.message));

  return saveQueue;
}

export async function closeBirthdays() {
  await save();
}

/* ------------------------------- CRUD -------------------------------------- */

export async function setBirthday(guildId, userId, { month, day, year = null, public: isPublic = true, timeZone = null }) {
  await ensureLoaded();

  if (!isValidDate(month, day)) {
    throw new BotError("Tanggal tidak valid. Contoh: tanggal `29` bulan `2` (pastikan jumlah hari sesuai bulan).");
  }

  const currentYear = new Date().getFullYear();
  let normalizedYear = null;

  if (year !== null && year !== undefined) {
    if (!Number.isInteger(year) || year < 1900 || year > currentYear) {
      throw new BotError(`Tahun harus antara **1900** dan **${currentYear}**.`);
    }
    if (month === 2 && day === 29 && !isLeap(year)) {
      throw new BotError(`Tahun **${year}** bukan tahun kabut, jadi tidak mungkin tanggal 29 Februari.`);
    }
    normalizedYear = year;
  }

  const id = key(guildId, userId);
  const existing = records.get(id);
  const record = {
    guildId,
    userId,
    month,
    day,
    year: normalizedYear,
    timeZone: timeZone
      ? resolveTimeZone(timeZone)
      : safeZone(existing?.timeZone ?? getSettings(guildId).birthday.timeZone),
    public: Boolean(isPublic),
    lastCelebrated: existing?.lastCelebrated ?? null,
    lastRoleId: existing?.lastRoleId ?? null,
    celebratedAt: existing?.celebratedAt ?? null,
    createdAt: existing?.createdAt ?? Date.now(),
  };

  records.set(id, record);
  await save();
  return record;
}

export async function removeBirthday(guildId, userId) {
  await ensureLoaded();
  const deleted = records.delete(key(guildId, userId));
  if (deleted) await save();
  return deleted;
}

export async function setBirthdayPrivacy(guildId, userId, isPublic) {
  await ensureLoaded();

  const record = records.get(key(guildId, userId));
  if (!record) throw new BotError("Kamu belum mendaftarkan ulang tahun. Pakai `/birthday set` dulu.");

  record.public = Boolean(isPublic);
  await save();
  return record;
}

export async function setBirthdayTimeZone(guildId, userId, timeZone) {
  await ensureLoaded();

  const record = records.get(key(guildId, userId));
  if (!record) throw new BotError("Kamu belum mendaftarkan ulang tahun. Pakai `/birthday set` dulu.");

  record.timeZone = resolveTimeZone(timeZone);
  await save();
  return record;
}

export async function getBirthday(guildId, userId) {
  await ensureLoaded();
  return records.get(key(guildId, userId)) ?? null;
}

/** Daftar ulang tahun terdekat di sebuah server. */
export async function getUpcomingBirthdays(guildId, { limit = 5, now = new Date(), includePrivate = false } = {}) {
  await ensureLoaded();

  return [...records.values()]
    .filter((record) => record.guildId === guildId && (includePrivate || record.public))
    .map((record) => {
      const next = nextOccurrence(record, now);
      return {
        ...record,
        nextAt: next.instant.getTime(),
        daysUntil: daysUntil(next, now),
        age: ageOn(record, next),
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil || a.month - b.month || a.day - b.day)
    .slice(0, Math.max(1, Math.min(10, limit)));
}

/* ------------------------------ Perayaan ----------------------------------- */

export function renderBirthdayMessage(guild, member, record, template) {
  const age = ageOn(record, nextOccurrence(record));
  const map = {
    "{user}": `<@${member.id}>`,
    "{username}": member.user.username,
    "{displayName}": member.displayName ?? member.user.username,
    "{server}": guild.name,
    "{age}": age === null ? "" : String(age),
    "{date}": formatBirthday(record),
  };

  const description = Object.entries(map).reduce(
    (result, [placeholder, value]) => result.split(placeholder).join(value),
    String(template || FALLBACK_MESSAGE),
  );

  const embed = buildEmbed({
    title: "🎉 Selamat Ulang Tahun",
    description,
    color: COLORS.success,
    thumbnail: member.user.displayAvatarURL({ size: 256 }),
    footer: guild.name,
  });

  return { embeds: [embed], allowedMentions: { parse: ["users"] } };
}

function canSend(channel, me) {
  return Boolean(channel?.isTextBased?.() && me && channel.permissionsFor(me)?.has(SEND_PERMISSIONS));
}

function resolveChannel(guild, channelId) {
  const me = guild.members.me;
  if (!me) return null;

  if (channelId) {
    const configured = guild.channels.cache.get(channelId);
    return canSend(configured, me) ? configured : null;
  }

  const system = guild.systemChannelId ? guild.channels.cache.get(guild.systemChannelId) : null;
  if (canSend(system, me)) return system;

  return guild.channels.cache.find((channel) => canSend(channel, me)) ?? null;
}

async function removeBirthdayRole(guild, userId, roleId) {
  if (!roleId) return;

  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member?.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, "Ulang tahun sudah berakhir");
    }
  } catch (error) {
    logger.debug(`Gagal mencabut role ulang tahun ${roleId} di ${guild.name}:`, error.message);
  }
}

async function expireRoles(guild) {
  const stale = [...records.values()].filter(
    (record) =>
      record.guildId === guild.id &&
      record.lastRoleId &&
      record.celebratedAt &&
      Date.now() - record.celebratedAt >= ROLE_DURATION_MS,
  );
  if (!stale.length) return;

  await Promise.all(stale.map((record) => removeBirthdayRole(guild, record.userId, record.lastRoleId)));

  for (const record of stale) {
    record.lastRoleId = null;
    record.celebratedAt = null;
  }
  await save();
}

/** Cabut role yang sudah lewat 24 jam, termasuk saat bot baru restart. */
export async function expireBirthdayRoles(client) {
  await ensureLoaded();
  for (const guild of client.guilds.cache.values()) {
    await expireRoles(guild);
  }
}

/**
 * Rayakan ulang tahun hari ini. Aman dipanggil berulang kali: penanda
 * `lastCelebrated` mencegah ucapan/koin dobel setelah bot restart.
 */
export async function celebrateBirthdays(client, now = new Date()) {
  await ensureLoaded();

  let celebrated = 0;

  for (const guild of client.guilds.cache.values()) {
    await expireRoles(guild);

    const settings = getSettings(guild.id).birthday;
    if (!settings.enabled) continue;

    const today = [...records.values()].filter(
      (record) =>
        record.guildId === guild.id &&
        !(record.celebratedAt && now.getTime() - record.celebratedAt < ROLE_DURATION_MS) &&
        record.lastCelebrated !== dateKeyInZone(now, record.timeZone) &&
        isToday(record, now),
    );
    if (!today.length) continue;

    const channel = resolveChannel(guild, settings.channelId);
    if (!channel && (settings.channelId || guild.channels.cache.size)) {
      logger.warn(`Tidak ada channel untuk mengirim ucapan ulang tahun di ${guild.name}.`);
    }

    const me = guild.members.me;
    const role = settings.roleId ? guild.roles.cache.get(settings.roleId) : null;
    const canAssignRole = Boolean(
      role &&
        !role.managed &&
        role.id !== guild.id &&
        me?.permissions.has(PermissionFlagsBits.ManageRoles) &&
        role.position < me.roles.highest.position,
    );

    for (const record of today) {
      // Tandai dulu supaya restart mendadak tidak mengirim hadiah dua kali.
      record.lastCelebrated = dateKeyInZone(now, record.timeZone);
      record.lastRoleId = canAssignRole ? role.id : null;
      record.celebratedAt = now.getTime();
      await save();

      const member = await guild.members.fetch(record.userId).catch(() => null);
      if (member) {
        if (canAssignRole && !member.roles.cache.has(role.id)) {
          await member.roles.add(role.id, "Selamat ulang tahun").catch((error) =>
            logger.debug(`Gagal memberi role ulang tahun di ${guild.name}:`, error.message),
          );
        }

        try {
          await channel?.send(renderBirthdayMessage(guild, member, record, settings.message));
        } catch (error) {
          logger.warn(`Gagal mengirim ucapan ulang tahun di ${guild.name}: ${error.message}`);
        }
      }

      if (settings.coins > 0) {
        await addBalance(guild.id, record.userId, settings.coins).catch((error) =>
          logger.warn(`Gagal memberi koin ulang tahun di ${guild.name}:`, error.message),
        );
      }

      celebrated += 1;
    }
  }

  return celebrated;
}

function isToday(record, now) {
  return dateKeyInZone(now, record.timeZone) === nextOccurrence(record, now).key;
}

/** Jadwalkan pengecekan tiap tengah malam lokal, plus sekali saat bot siap. */
export function startBirthdayScheduler(client) {
  void celebrateBirthdays(client).catch((error) => logger.error("Gagal mengecek ulang tahun:", error));
  scheduleNext(client);

  // Zona tiap member berbeda-beda, jadi cek tiap 10 menit (sekaligus mencabut
  // role yang sudah lewat 24 jam). Timer tengah malam tetap dipakai agar
  // perayaan di zona bot sendiri terjadi tepat waktu.
  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    void celebrateBirthdays(client).catch((error) => logger.error("Gagal merayakan ulang tahun:", error));
  }, 10 * 60 * 1000);
  tickTimer.unref?.();
}

function scheduleNext(client) {
  clearTimeout(schedulerTimer);

  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5, 0);
  const timer = setTimeout(() => {
    void celebrateBirthdays(client)
      .catch((error) => logger.error("Gagal merayakan ulang tahun:", error))
      .finally(() => scheduleNext(client));
  }, Math.max(1000, midnight.getTime() - now.getTime()));

  timer.unref?.();
  schedulerTimer = timer;
}
