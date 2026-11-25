import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { music as musicEmbed } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { assertSameVoiceChannel, getQueue, pauseQueue } from "../../music/manager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pause lagu yang sedang diputar")
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const queue = getQueue(interaction.guild.id);
    assertSameVoiceChannel(interaction, queue);
    pauseQueue(queue);

    await interaction.reply({ embeds: [musicEmbed("Lagu dijeda. Gunakan `/resume` untuk melanjutkan.", "Pause")] });
  },
};
