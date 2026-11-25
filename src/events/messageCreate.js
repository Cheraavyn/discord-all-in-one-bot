import { ChannelType, Events } from "discord.js";
import { clearAfk, getAfk } from "../lib/afk.js";
import { discordTimestamp } from "../lib/duration.js";
import { buildEmbed, COLORS } from "../lib/embeds.js";
import { addMessageXp } from "../lib/leveling.js";
import { logger } from "../lib/logger.js";
import { getSettings } from "../lib/settings.js";

const AFK_REPLY_TTL_MS = 7000;

export default {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.inGuild() || !message.author || message.author.bot || message.system) return;

    await handleAfk(message).catch((error) => logger.debug("Gagal memproses AFK:", error.message));
    await handleLeveling(message).catch((error) => logger.debug("Gagal memproses XP:", error.message));
    await handleAutopublish(message).catch((error) => logger.debug("Gagal auto-publish:", error.message));
  },
};

async function handleAutopublish(message) {
  if (message.channel.type !== ChannelType.GuildAnnouncement) return;
  if (!message.crosspostable) return;
  if (!getSettings(message.guild.id).autopublish.enabled) return;

  await message.crosspost();
}

async function handleAfk(message) {
  const guildId = message.guild.id;
  const authorId = message.author.id;

  const own = getAfk(guildId, authorId);
  if (own) {
    await clearAfk(guildId, authorId);

    const notice = await message
      .reply({
        content: `👋 Selamat datang kembali ${message.author}! Status AFK kamu sudah dihapus.`,
        allowedMentions: { repliedUser: false },
      })
      .catch(() => null);

    if (notice) {
      const timer = setTimeout(() => void notice.delete().catch(() => {}), AFK_REPLY_TTL_MS);
      timer.unref?.();
    }
  }

  const mentioned = [...message.mentions.users.values()];
  const replied = message.mentions.repliedUser;
  if (replied && !mentioned.some((user) => user.id === replied.id)) mentioned.push(replied);

  const entries = mentioned
    .filter((user) => user.id !== authorId && !user.bot)
    .map((user) => ({ user, afk: getAfk(guildId, user.id) }))
    .filter((entry) => entry.afk);

  if (!entries.length) return;

  const description = entries
    .map(
      ({ user, afk }) =>
        `**${user.username}** sedang AFK sejak ${discordTimestamp(afk.since)}\n> ${afk.reason}`,
    )
    .join("\n\n");

  await message
    .reply({
      embeds: [buildEmbed({ title: "Status AFK", description, color: COLORS.neutral })],
      allowedMentions: { repliedUser: false, parse: [] },
    })
    .catch(() => {});
}

async function handleLeveling(message) {
  const guild = message.guild;
  const settings = getSettings(guild.id).leveling;
  if (!settings.enabled) return;

  const result = await addMessageXp(guild.id, message.author.id, { cooldownMs: settings.cooldownMs });
  if (!result?.leveledUp || !settings.announce) return;

  const configured = settings.announceChannelId
    ? guild.channels.cache.get(settings.announceChannelId)
    : null;
  const channel = configured?.isTextBased() ? configured : message.channel;
  if (!channel?.isTextBased()) return;

  await channel
    .send({
      embeds: [
        buildEmbed({
          title: "🎉 Level Up!",
          description: `**${message.member?.displayName ?? message.author.username}** naik ke **level ${result.level}**.`,
          color: COLORS.success,
          footer: `${result.record.xp} XP total`,
        }),
      ],
      allowedMentions: { parse: [] },
    })
    .catch((error) => logger.debug("Gagal mengirim pengumuman level up:", error.message));
}
