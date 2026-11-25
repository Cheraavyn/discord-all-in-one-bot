import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { discordTimestamp } from "../../lib/duration.js";
import { ok, warn } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { claimDaily, formatCoins } from "../../lib/economy.js";

export default {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Ambil hadiah koin harian")
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const result = await claimDaily(interaction.guild.id, interaction.user.id);

    if (!result.claimed) {
      await interaction.reply({
        embeds: [
          warn(
            `Kamu sudah mengambil hadiah hari ini.\nBisa diambil lagi ${discordTimestamp(Date.now() + result.remainingMs)}.`,
            "Hadiah Harian",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        ok(
          `Kamu mendapat ${formatCoins(result.amount)}.\nSaldo sekarang: **${formatCoins(result.balance)}**.`,
          "Hadiah Harian",
        ),
      ],
    });
  },
};
