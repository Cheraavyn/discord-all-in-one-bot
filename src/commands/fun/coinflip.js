import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Lempar koin")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName("tebakan")
        .setDescription("Tebak hasilnya (opsional)")
        .addChoices({ name: "Angka", value: "angka" }, { name: "Gambar", value: "gambar" }),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const guess = interaction.options.getString("tebakan");
    const result = Math.random() < 0.5 ? "angka" : "gambar";
    const label = result === "angka" ? "🪙 Angka" : "🪙 Gambar";

    const description = guess
      ? guess === result
        ? `${label}\n\nTebakanmu benar! ✅`
        : `${label}\n\nTebakanmu salah. ❌`
      : label;

    await interaction.reply({
      embeds: [buildEmbed({ title: "Lempar Koin", description, color: COLORS.info })],
    });
  },
};
