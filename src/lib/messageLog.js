import { buildEmbed, COLORS } from "./embeds.js";
import { logger } from "./logger.js";
import { getSettings } from "./settings.js";

const MAX_FIELD = 1024;

function clip(text) {
  const value = String(text ?? "").trim();
  if (!value) return null;
  return value.length > MAX_FIELD ? `${value.slice(0, MAX_FIELD - 1)}…` : value;
}

async function resolveLogChannel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
  return channel?.isTextBased() ? channel : null;
}

export async function logMessageDelete(message) {
  if (!message?.guildId) return;

  const guild = message.guild ?? message.client?.guilds?.cache.get(message.guildId);
  if (!guild) return;

  const settings = getSettings(guild.id).messageLog;
  if (!settings.channelId || !settings.deleted) return;
  if (message.channelId === settings.channelId) return;
  if (message.author?.bot) return;

  const channel = await resolveLogChannel(guild, settings.channelId);
  if (!channel) return;

  const fields = [
    {
      name: "Author",
      value: message.author ? `<@${message.author.id}> \`${message.author.username}\`` : `\`${message.authorId ?? "tidak diketahui"}\``,
      inline: true,
    },
    { name: "Channel", value: `<#${message.channelId}>`, inline: true },
  ];

  const content = clip(message.content);
  fields.push({ name: "Isi pesan", value: content ?? "*Tidak tersedia (pesan tidak ada di cache / tanpa Message Content Intent)*" });

  const attachments = message.attachments?.size ?? message.attachments?.length ?? 0;
  if (attachments) fields.push({ name: "Lampiran", value: `${attachments} file` });

  await channel
    .send({
      embeds: [
        buildEmbed({
          title: "🗑️ Pesan Dihapus",
          color: COLORS.error,
          fields,
          footer: `ID pesan: ${message.id}`,
        }),
      ],
      allowedMentions: { parse: [] },
    })
    .catch((error) => logger.debug("Gagal mengirim log hapus pesan:", error.message));
}

export async function logMessageEdit(oldMessage, newMessage) {
  if (!newMessage?.guildId) return;

  const guild = newMessage.guild ?? newMessage.client?.guilds?.cache.get(newMessage.guildId);
  if (!guild) return;

  const settings = getSettings(guild.id).messageLog;
  if (!settings.channelId || !settings.edited) return;
  if (newMessage.channelId === settings.channelId) return;
  if (newMessage.author?.bot) return;

  if (oldMessage?.partial) {
    await oldMessage.fetch().catch((error) => {
      logger.debug("Gagal fetch pesan lama untuk log edit:", error.message);
    });
  }

  const before = oldMessage?.content ?? "";
  const after = newMessage.content ?? "";
  if (before === after) return;

  const channel = await resolveLogChannel(guild, settings.channelId);
  if (!channel) return;

  const jump = newMessage.url ? `[Jump ke pesan](${newMessage.url})` : undefined;

  await channel
    .send({
      embeds: [
        buildEmbed({
          title: "✏️ Pesan Diedit",
          description: jump,
          color: COLORS.warning,
          fields: [
            {
              name: "Author",
              value: `<@${newMessage.author.id}> \`${newMessage.author.username}\``,
              inline: true,
            },
            { name: "Channel", value: `<#${newMessage.channelId}>`, inline: true },
            { name: "Sebelum", value: clip(before) ?? "*Tidak tersedia*" },
            { name: "Sesudah", value: clip(after) ?? "*Kosong*" },
          ],
          footer: `ID pesan: ${newMessage.id}`,
        }),
      ],
      allowedMentions: { parse: [] },
    })
    .catch((error) => logger.debug("Gagal mengirim log edit pesan:", error.message));
}
