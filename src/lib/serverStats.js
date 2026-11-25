import { ChannelType, PermissionFlagsBits } from "discord.js";
import { logger } from "./logger.js";
import { getSettings, updateSettings } from "./settings.js";

const UPDATE_INTERVAL_MS = 10 * 60 * 1000;
const MIN_RENAME_INTERVAL_MS = 9 * 60 * 1000;
const DEFAULT_CATEGORY_NAME = "📊 Server Stats";

const CHANNEL_TYPES = {
  members: (value) => `👥 Member: ${value}`,
  humans: (value) => `🧑 Manusia: ${value}`,
  bots: (value) => `🤖 Bot: ${value}`,
  channels: (value) => `📁 Channel: ${value}`,
};

let interval = null;
const lastRenames = new Map();

function statsValues(guild) {
  const total = guild.memberCount ?? guild.members.cache.size;
  const bots = guild.members.cache.filter((member) => member.user.bot).size;
  const humans = Math.max(0, total - bots);
  const channels = guild.channels.cache.filter(
    (channel) => channel.type !== ChannelType.GuildCategory,
  ).size;

  return { members: total, humans, bots, channels };
}

async function createStatsCategory(guild) {
  return guild.channels.create({
    name: DEFAULT_CATEGORY_NAME,
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.Connect],
      },
    ],
    reason: "Setup server stats",
  });
}

async function ensureChannel(guild, categoryId, key, name) {
  const settings = getSettings(guild.id).serverStats;
  const existingId = settings.channels?.[key];

  if (existingId) {
    const existing = guild.channels.cache.get(existingId) ?? (await guild.channels.fetch(existingId).catch(() => null));
    if (existing) {
      if (existing.parentId !== categoryId) {
        await existing.setParent(categoryId, { lockPermissions: false }).catch(() => {});
      }
      if (existing.name !== name) await existing.setName(name).catch(() => {});
      return existing;
    }
  }

  const created = await guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: categoryId,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.Connect],
      },
    ],
    reason: "Setup server stats",
  });

  const current = getSettings(guild.id).serverStats;
  updateSettings(guild.id, {
    serverStats: { channels: { ...current.channels, [key]: created.id } },
  });

  return created;
}

/** Buat/rapikan channel statistik lalu aktifkan pembaruan otomatis. */
export async function setupServerStats(guild, categoryOption = null) {
  // Tarik daftar member dulu supaya hitungan bot/human tidak memakai cache parsial.
  await guild.members.fetch().catch(() => {});

  const settings = getSettings(guild.id).serverStats;
  const values = statsValues(guild);

  let categoryId = categoryOption?.id ?? settings.categoryId ?? null;
  if (categoryId) {
    const category = guild.channels.cache.get(categoryId) ?? (await guild.channels.fetch(categoryId).catch(() => null));
    if (!category || category.type !== ChannelType.GuildCategory) categoryId = null;
  }

  if (!categoryId) {
    const category = await createStatsCategory(guild);
    categoryId = category.id;
  }

  updateSettings(guild.id, { serverStats: { enabled: true, categoryId } });

  const result = {};
  for (const [key, formatter] of Object.entries(CHANNEL_TYPES)) {
    const channel = await ensureChannel(guild, categoryId, key, formatter(values[key]));
    result[key] = channel.id;
  }

  updateSettings(guild.id, { serverStats: { channels: result } });

  // Hitung ulang setelah channel statistik dibuat agar jumlah channel ikut benar.
  const fresh = await refreshServerStats(guild, { force: true });
  return { categoryId, values: fresh ?? values, channels: result };
}

/** Hapus channel statistik dan matikan pembaruan. */
export async function disableServerStats(guild) {
  const settings = getSettings(guild.id).serverStats;
  const deletedIds = new Set();

  for (const channelId of Object.values(settings.channels ?? {})) {
    if (!channelId) continue;
    const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
    await channel?.delete("Server stats dimatikan").catch(() => {});
    deletedIds.add(channelId);
  }

  // Hapus juga kategori bawaan bot bila sudah kosong (kategori buatan user dibiarkan).
  const categoryId = settings.categoryId;
  if (categoryId) {
    const category =
      guild.channels.cache.get(categoryId) ?? (await guild.channels.fetch(categoryId).catch(() => null));

    if (category?.type === ChannelType.GuildCategory && category.name === DEFAULT_CATEGORY_NAME) {
      const remaining = guild.channels.cache.filter(
        (channel) => channel.parentId === categoryId && !deletedIds.has(channel.id),
      ).size;

      if (remaining === 0) await category.delete("Server stats dimatikan").catch(() => {});
    }
  }

  updateSettings(guild.id, {
    serverStats: {
      enabled: false,
      categoryId: null,
      channels: { members: null, humans: null, bots: null, channels: null },
    },
  });
}

/** Perbarui nama channel statistik bila angkanya berubah. */
export async function refreshServerStats(guild, { force = false } = {}) {
  const settings = getSettings(guild.id).serverStats;
  if (!settings.enabled && !force) return;

  const values = statsValues(guild);

  for (const [key, formatter] of Object.entries(CHANNEL_TYPES)) {
    const channelId = settings.channels?.[key];
    if (!channelId) continue;

    const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel) continue;

    const name = formatter(values[key]);
    if (channel.name === name) continue;

    const lastRename = lastRenames.get(channelId) ?? 0;
    if (!force && Date.now() - lastRename < MIN_RENAME_INTERVAL_MS) continue;

    await channel
      .setName(name)
      .then(() => lastRenames.set(channelId, Date.now()))
      .catch((error) => {
        logger.debug(`Gagal memperbarui statistik ${key} di ${guild.name}:`, error.message);
      });
  }

  return values;
}

async function refreshAll(client, options) {
  for (const guild of client.guilds.cache.values()) {
    await refreshServerStats(guild, options).catch((error) => {
      logger.debug(`Gagal memperbarui server stats ${guild.name}:`, error.message);
    });
  }
}

export function startServerStats(client) {
  if (interval) clearInterval(interval);

  interval = setInterval(() => {
    void refreshAll(client);
  }, UPDATE_INTERVAL_MS);
  interval.unref?.();

  void refreshAll(client);
}
