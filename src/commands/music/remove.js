import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { music as musicEmbed } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { assertSameVoiceChannel, getQueue, removeTrack, trackSummary } from "../../music/manager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Hapus lagu dari antrean berdasarkan posisinya")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((option) =>
      option
        .setName("posisi")
        .setDescription("Posisi lagu di antrean (mulai dari 1)")
        .setRequired(true)
        .setMinValue(1),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const queue = getQueue(interaction.guild.id);
    if (!queue) throw new BotError("Aku sedang tidak memutar musik.");

    assertSameVoiceChannel(interaction, queue);

    const position = interaction.options.getInteger("posisi", true);
    const removed = removeTrack(queue, position);

    await interaction.reply({
      embeds: [musicEmbed(`${trackSummary(removed)} dihapus dari antrean.`, "Lagu Dihapus")],
    });
  },
};
