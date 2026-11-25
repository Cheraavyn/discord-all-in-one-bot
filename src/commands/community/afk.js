import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { ok } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { setAfk } from "../../lib/afk.js";

export default {
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Tandai dirimu sedang AFK")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option.setName("alasan").setDescription("Alasan AFK").setMaxLength(200),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const reason = interaction.options.getString("alasan")?.trim() || "Sedang AFK";
    await setAfk(interaction.guild.id, interaction.user.id, reason);

    await interaction.reply({
      embeds: [
        ok(
          `Status AFK kamu diatur: **${reason}**.\nStatus akan otomatis hilang saat kamu mengirim pesan lagi.`,
          "AFK Aktif",
        ),
      ],
    });
  },
};
