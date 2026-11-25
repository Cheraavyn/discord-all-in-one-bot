import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { music as musicEmbed } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { assertSameVoiceChannel, getQueue, moveTrack, trackSummary } from "../../music/manager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("move")
    .setDescription("Pindahkan lagu ke posisi lain di antrean")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((option) =>
      option
        .setName("dari")
        .setDescription("Posisi lagu saat ini (mulai dari 1)")
        .setRequired(true)
        .setMinValue(1),
    )
    .addIntegerOption((option) =>
      option
        .setName("ke")
        .setDescription("Posisi tujuan (mulai dari 1)")
        .setRequired(true)
        .setMinValue(1),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const queue = getQueue(interaction.guild.id);
    if (!queue) throw new BotError("Aku sedang tidak memutar musik.");

    assertSameVoiceChannel(interaction, queue);

    const from = interaction.options.getInteger("dari", true);
    const to = interaction.options.getInteger("ke", true);
    const moved = moveTrack(queue, from, to);

    await interaction.reply({
      embeds: [
        musicEmbed(`${trackSummary(moved)} dipindah ke posisi **#${to}**.`, "Lagu Dipindah"),
      ],
    });
  },
};
