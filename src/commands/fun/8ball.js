import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";

const ANSWERS = [
  "Ya, pasti.",
  "Tentu saja.",
  "Tanpa ragu.",
  "Hampir pasti iya.",
  "Bisa jadi.",
  "Coba lagi nanti.",
  "Belum bisa dipastikan.",
  "Jangan berharap terlalu tinggi.",
  "Tidak.",
  "Sepertinya tidak.",
  "Jangan sekarang.",
  "Sangat tidak mungkin.",
  "Menurutku iya.",
  "Tanyakan lagi setelah kopi.",
  "Itu pertanyaan bagus, tapi tidak.",
];

export default {
  data: new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Tanya bola ajaib")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option.setName("pertanyaan").setDescription("Pertanyaanmu").setRequired(true).setMaxLength(200),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const question = interaction.options.getString("pertanyaan", true).trim();
    const answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];

    await interaction.reply({
      embeds: [
        buildEmbed({
          title: "🎱 Bola Ajaib",
          color: COLORS.music,
          fields: [
            { name: "Pertanyaan", value: question.slice(0, 1024) },
            { name: "Jawaban", value: answer },
          ],
        }),
      ],
      allowedMentions: { parse: [] },
    });
  },
};
