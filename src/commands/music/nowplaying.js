import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { buildMusicDashboard, buildNowPlayingEmbed, getQueue } from "../../music/manager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Lihat lagu yang sedang diputar")
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const queue = getQueue(interaction.guild.id);
    if (!queue?.current) throw new BotError("Tidak ada lagu yang sedang diputar.");

    await interaction.reply({
      embeds: [buildNowPlayingEmbed(queue)],
      components: buildMusicDashboard(queue),
    });
  },
};
