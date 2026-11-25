import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { music as musicEmbed } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { destroyQueue, getQueue } from "../../music/manager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Hentikan musik dan keluarkan bot dari voice channel")
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const queue = getQueue(interaction.guild.id);
    if (!queue) throw new BotError("Aku sedang tidak memutar musik.");

    destroyQueue(interaction.guild.id, `Dihentikan oleh ${interaction.user.tag}`);
    await interaction.reply({ embeds: [musicEmbed("Musik dihentikan dan antrean dibersihkan.", "Berhenti")] });
  },
};
