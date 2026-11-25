import { Events } from "discord.js";
import { clearAfk } from "../lib/afk.js";
import { removeBirthday } from "../lib/birthdays.js";
import { logger } from "../lib/logger.js";
import { configFor, renderMemberMessage } from "../lib/memberMessages.js";
import { refreshServerStats } from "../lib/serverStats.js";
import { getSettings } from "../lib/settings.js";

export default {
  name: Events.GuildMemberRemove,
  async execute(member) {
    if (!member.guild) return;

    const settings = getSettings(member.guild.id);
    void refreshServerStats(member.guild);
    void clearAfk(member.guild.id, member.id).catch((error) =>
      logger.debug("Gagal menghapus status AFK member yang keluar:", error.message),
    );
    void removeBirthday(member.guild.id, member.id).catch((error) =>
      logger.debug("Gagal menghapus data ulang tahun member yang keluar:", error.message),
    );

    const goodbye = configFor(settings, "goodbye");
    if (!goodbye.enabled || !goodbye.channelId) return;

    const channel = member.guild.channels.cache.get(goodbye.channelId);
    if (!channel?.isTextBased()) return;

    const { content, embed } = renderMemberMessage("goodbye", member, goodbye);

    await channel
      .send({ content: content || undefined, embeds: [embed] })
      .catch((error) => logger.warn(`Gagal mengirim goodbye di ${member.guild.name}: ${error.message}`));
  },
};
