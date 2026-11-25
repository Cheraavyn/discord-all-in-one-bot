import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { music as musicEmbed } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { assertSameVoiceChannel, clearQueue, getQueue } from "../../music/manager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Kosongkan semua lagu yang menunggu di antrean")
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const queue = getQueue(interaction.guild.id);
    if (!queue) throw new BotError("Aku sedang tidak memutar musik.");

    assertSameVoiceChannel(interaction, queue);

    const count = clearQueue(queue);
    if (!count) throw new BotError("Antrean memang sudah kosong.");

    await interaction.reply({
      embeds: [
        musicEmbed(
          `**${count}** lagu dihapus dari antrean. Lagu yang sedang diputar tetap berjalan.`,
          "Antrean Dibersihkan",
        ),
      ],
    });
  },
};
