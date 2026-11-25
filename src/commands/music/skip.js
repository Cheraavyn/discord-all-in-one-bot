import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { music as musicEmbed } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { assertSameVoiceChannel, getQueue, skipTrack } from "../../music/manager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Lewati lagu yang sedang diputar")
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const queue = getQueue(interaction.guild.id);
    if (!queue?.current) throw new BotError("Tidak ada lagu yang sedang diputar.");

    assertSameVoiceChannel(interaction, queue);

    const skipped = skipTrack(queue);
    await interaction.reply({
      embeds: [musicEmbed(`**[${skipped.title}](${skipped.url})** dilewati.`, "Lagu Dilewati")],
    });
  },
};
