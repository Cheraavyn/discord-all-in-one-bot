import { Events } from "discord.js";
import { logger } from "../lib/logger.js";
import { configFor, renderMemberMessage } from "../lib/memberMessages.js";
import { refreshServerStats } from "../lib/serverStats.js";
import { getSettings } from "../lib/settings.js";

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const settings = getSettings(member.guild.id);
    void refreshServerStats(member.guild);

    if (settings.autoRole.roleId) {
      const role = member.guild.roles.cache.get(settings.autoRole.roleId);
      if (role) {
        await member.roles.add(role, "Auto role untuk member baru").catch((error) => {
          logger.warn(`Gagal memberi auto role di ${member.guild.name}: ${error.message}`);
        });
      }
    }

    const greeting = configFor(settings, "greeting");
    if (!greeting.enabled || !greeting.channelId) return;

    const channel = member.guild.channels.cache.get(greeting.channelId);
    if (!channel?.isTextBased()) return;

    const { content, embed } = renderMemberMessage("greeting", member, greeting);

    await channel
      .send({ content: content || undefined, embeds: [embed] })
      .catch((error) => logger.warn(`Gagal mengirim greeting di ${member.guild.name}: ${error.message}`));
  },
};
