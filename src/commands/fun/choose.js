import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("choose")
    .setDescription("Pilih satu dari beberapa opsi")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName("pilihan")
        .setDescription("Pisahkan dengan | contoh: Bakso | Mie | Sate")
        .setRequired(true)
        .setMaxLength(500),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const raw = interaction.options.getString("pilihan", true);
    const options = raw
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);

    if (options.length < 2) throw new BotError("Berikan minimal 2 pilihan, dipisahkan dengan `|`.");
    if (options.length > 10) throw new BotError("Maksimal 10 pilihan.");

    const picked = options[Math.floor(Math.random() * options.length)];

    await interaction.reply({
      embeds: [
        buildEmbed({
          title: "Pilihan Acak",
          description: `Aku pilih: **${picked.slice(0, 1024)}**`,
          color: COLORS.info,
          fields: [{ name: "Opsi", value: options.map((option) => `• ${option}`).join("\n").slice(0, 1024) }],
        }),
      ],
      allowedMentions: { parse: [] },
    });
  },
};
