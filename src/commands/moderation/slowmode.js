import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { BotError } from "../../lib/errors.js";
import { COLORS, ok } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { logModeration } from "../../lib/modActions.js";

export default {
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Atur slowmode channel ini")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((option) =>
      option
        .setName("detik")
        .setDescription("Jeda antar pesan dalam detik (0 = matikan, maks 21600)")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction, [PermissionFlagsBits.ManageChannels]);

    if (!interaction.channel?.isTextBased()) throw new BotError("Command ini hanya bisa dipakai di channel teks.");

    const seconds = interaction.options.getInteger("detik", true);
    await interaction.channel.setRateLimitPerUser(seconds, `Diatur oleh ${interaction.user.tag}`);

    await logModeration(interaction.guild, {
      action: "slowmode",
      targetId: interaction.channel.id,
      targetTag: `#${interaction.channel.name}`,
      targetLabel: `<#${interaction.channel.id}>`,
      moderator: interaction.user,
      reason: seconds === 0 ? "Mematikan slowmode" : `Mengatur slowmode ${seconds} detik`,
      color: COLORS.info,
      fields: [{ name: "Slowmode", value: seconds === 0 ? "Mati" : `${seconds} detik`, inline: true }],
    });

    await interaction.reply({
      embeds: [
        ok(
          seconds === 0
            ? "Slowmode dimatikan."
            : `Slowmode diatur ke **${seconds} detik** per pesan.`,
        ),
      ],
    });
  },
};
