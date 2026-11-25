import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { discordTimestamp } from "../../lib/duration.js";
import { ok, warn } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { claimWork, formatCoins } from "../../lib/economy.js";
import { recordQuestProgress } from "../../lib/quests.js";

export default {
  data: new SlashCommandBuilder()
    .setName("work")
    .setDescription("Bekerja untuk mendapatkan koin")
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const result = await claimWork(interaction.guild.id, interaction.user.id);

    if (!result.claimed) {
      await interaction.reply({
        embeds: [
          warn(
            `Kamu masih lelah. Istirahat dulu, bisa bekerja lagi ${discordTimestamp(Date.now() + result.remainingMs)}.`,
            "Kerja",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await recordQuestProgress(interaction.guild.id, interaction.user.id, "work");

    await interaction.reply({
      embeds: [
        ok(
          `Kamu ${result.job} dan mendapat ${formatCoins(result.amount)}.\nSaldo sekarang: **${formatCoins(result.balance)}**.`,
          "Kerja",
        ),
      ],
    });
  },
};
