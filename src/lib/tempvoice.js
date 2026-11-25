import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { BotError } from "./errors.js";
import { logger } from "./logger.js";
import { getSettings } from "./settings.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const TEMPVOICE_FILE = path.join(DATA_DIR, "tempvoice.json");
const DELETE_DELAY_MS = 10 * 1000;
const MAX_NAME_LENGTH = 90;

let channels = [];
let loaded = false;
let saveQueue = Promise.resolve();
const deleteTimers = new Map();

export async function initTempVoice() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(TEMPVOICE_FILE, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];
    channels = Array.isArray(data)
      ? data.filter((record) => record?.channelId && record?.guildId && record?.ownerId)
      : [];
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn("Gagal membaca data/tempvoice.json, mulai dengan data kosong:", error.message);
    }
    channels = [];
  }

  loaded = true;
}

async function ensureLoaded() {
  if (!loaded) await initTempVoice();
}

function save() {
  saveQueue = saveQueue
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${TEMPVOICE_FILE}.tmp`;
      await writeFile(tmpFile, JSON.stringify(channels, null, 2), "utf8");
      await rename(tmpFile, TEMPVOICE_FILE);
    })
    .catch((error) => logger.error("Gagal menyimpan data/tempvoice.json:", error.message));

  return saveQueue;
}

export function getTempVoice(guildId, channelId) {
  return channels.find((record) => record.guildId === guildId && record.channelId === channelId) ?? null;
}

export async function listTempChannels(guildId) {
  await ensureLoaded();
  return channels.filter((record) => record.guildId === guildId);
}

async function addTempVoice(record) {
  await ensureLoaded();
  channels.push(record);
  await save();
  return record;
}

async function removeTempVoice(channelId) {
  await ensureLoaded();

  const index = channels.findIndex((record) => record.channelId === channelId);
  if (index === -1) return null;

  const [removed] = channels.splice(index, 1);
  clearTimeout(deleteTimers.get(channelId));
  deleteTimers.delete(channelId);
  await save();
  return removed;
}

/** Buat voice channel sementara untuk member lalu pindahkan dia ke sana. */
export async function createTempChannel(member, settings) {
  const guild = member.guild;
  const generator = guild.channels.cache.get(settings.generatorChannelId) ?? null;
  const parentId = settings.categoryId ?? generator?.parentId ?? null;

  // Warisi izin dari kategori (atau generator bila tanpa kategori) supaya
  // temp voice di kategori privat tidak tiba-tiba terlihat oleh @everyone.
  const source = parentId ? guild.channels.cache.get(parentId) : generator;
  const permissionOverwrites = [];

  for (const overwrite of source?.permissionOverwrites?.cache?.values() ?? []) {
    if (overwrite.id === member.id) continue;
    permissionOverwrites.push({
      id: overwrite.id,
      type: overwrite.type,
      allow: overwrite.allow.bitfield,
      deny: overwrite.deny.bitfield,
    });
  }

  permissionOverwrites.push({
    id: member.id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.MoveMembers,
      PermissionFlagsBits.Connect,
    ],
  });

  const channel = await guild.channels.create({
    name: `🔊 ${member.displayName}`.slice(0, MAX_NAME_LENGTH),
    type: ChannelType.GuildVoice,
    parent: parentId ?? undefined,
    permissionOverwrites,
    reason: `Temp voice untuk ${member.user.tag}`,
  });

  await addTempVoice({
    channelId: channel.id,
    guildId: guild.id,
    ownerId: member.id,
    createdAt: Date.now(),
  });

  try {
    await member.voice.setChannel(channel, "Temp voice");
  } catch (error) {
    logger.warn(`Gagal memindahkan ${member.user.tag} ke temp voice:`, error.message);
    await deleteTempChannel(guild, channel.id, "Gagal memindahkan member");
    throw new BotError("Gagal memindahkan kamu ke voice channel sementara.");
  }

  return channel;
}

async function scheduleEmptyDelete(guild, channelId) {
  if (deleteTimers.has(channelId)) return;

  const timer = setTimeout(async () => {
    deleteTimers.delete(channelId);

    const record = getTempVoice(guild.id, channelId);
    if (!record) return;

    const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel) {
      await removeTempVoice(channelId);
      return;
    }

    const humans = channel.members.filter((item) => !item.user.bot).size;
    if (humans > 0) return;

    await deleteTempChannel(guild, channelId, "Temp voice kosong");
  }, DELETE_DELAY_MS);

  timer.unref?.();
  deleteTimers.set(channelId, timer);
}

export async function deleteTempChannel(guild, channelId, reason = "Temp voice dihapus") {
  await removeTempVoice(channelId);

  const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  await channel.delete(reason).catch((error) => {
    logger.warn(`Gagal menghapus temp voice ${channelId}:`, error.message);
  });
  return true;
}

/** Bersihkan record temp voice yang channelnya sudah dihapus manual. */
export async function pruneTempChannels(guild) {
  await ensureLoaded();

  let removed = 0;
  for (const record of [...channels]) {
    if (record.guildId !== guild.id) continue;
    if (guild.channels.cache.has(record.channelId)) continue;

    await removeTempVoice(record.channelId);
    removed += 1;
  }

  return removed;
}

/** Dipanggil dari event voiceStateUpdate untuk membuat/menghapus temp voice. */
export async function handleTempVoiceUpdate(oldState, newState) {
  const guild = newState.guild ?? oldState.guild;
  if (!guild) return;

  await ensureLoaded();

  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const record = getTempVoice(guild.id, oldState.channelId);
    if (record) await scheduleEmptyDelete(guild, oldState.channelId);
  }

  if (!newState.channelId || newState.channelId === oldState.channelId) return;

  const settings = getSettings(guild.id).tempVoice;
  if (!settings?.generatorChannelId || newState.channelId !== settings.generatorChannelId) return;

  const member = newState.member ?? (await guild.members.fetch(newState.id).catch(() => null));
  if (!member || member.user.bot) return;

  await createTempChannel(member, settings);
}

/** Bersihkan record/channel yang sudah tidak valid setelah bot restart. */
export async function restoreTempVoice(client) {
  await ensureLoaded();
  if (!channels.length) return;

  let cleaned = 0;
  for (const record of [...channels]) {
    const guild = client.guilds.cache.get(record.guildId);
    if (!guild) continue;

    const channel = guild.channels.cache.get(record.channelId) ?? (await guild.channels.fetch(record.channelId).catch(() => null));
    if (!channel) {
      await removeTempVoice(record.channelId);
      cleaned += 1;
      continue;
    }

    const humans = channel.members.filter((member) => !member.user.bot).size;
    if (humans === 0) {
      await deleteTempChannel(guild, record.channelId, "Temp voice kosong setelah restart");
      cleaned += 1;
    }
  }

  if (cleaned) logger.info(`${cleaned} temp voice lama dibersihkan.`);
}

/** Mengubah owner temp voice (dipakai /tempvoice claim). */
export async function transferTempVoice(channel, previousOwnerId, newOwnerId) {
  const record = getTempVoice(channel.guild.id, channel.id);
  if (!record) throw new BotError("Channel ini bukan temp voice.");

  record.ownerId = newOwnerId;
  await save();

  if (previousOwnerId) {
    await channel.permissionOverwrites.delete(previousOwnerId).catch(() => {});
  }

  await channel.permissionOverwrites.edit(newOwnerId, {
    ManageChannels: true,
    MoveMembers: true,
    Connect: true,
  });

  return record;
}
