import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { music as musicEmbed } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { assertSameVoiceChannel, getQueue, resumeQueue } from "../../music/manager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Lanjutkan lagu yang dijeda")
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const queue = getQueue(interaction.guild.id);
    assertSameVoiceChannel(interaction, queue);
    resumeQueue(queue);

    await interaction.reply({ embeds: [musicEmbed("Lagu dilanjutkan.", "Resume")] });
  },
};
