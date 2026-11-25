import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { music as musicEmbed } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { updateSettings } from "../../lib/settings.js";
import { assertSameVoiceChannel, getQueue, setVolume } from "../../music/manager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Atur volume musik (0-100)")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((option) =>
      option.setName("persen").setDescription("Volume 0-100").setRequired(true).setMinValue(0).setMaxValue(100),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const queue = getQueue(interaction.guild.id);
    if (!queue) throw new BotError("Aku sedang tidak memutar musik.");

    assertSameVoiceChannel(interaction, queue);

    const percent = interaction.options.getInteger("persen", true);
    const applied = setVolume(queue, percent);
    updateSettings(interaction.guild.id, { music: { volume: applied } });

    await interaction.reply({
      embeds: [musicEmbed(`Volume diatur ke **${applied}%**.`, "Volume")],
    });
  },
};
