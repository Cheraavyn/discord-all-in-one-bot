import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";

const PATTERN = /^(\d{1,2})d(\d{1,3})$/i;

export default {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Lempar dadu, contoh: 2d20")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName("dadu")
        .setDescription("Format NdM, contoh 1d6, 2d20 (default 1d6)")
        .setMaxLength(10),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const input = (interaction.options.getString("dadu") ?? "1d6").trim().toLowerCase();
    const match = PATTERN.exec(input);
    if (!match) throw new BotError("Format dadu tidak valid. Contoh: `1d6` atau `2d20`.");

    const count = Number(match[1]);
    const sides = Number(match[2]);
    if (count < 1 || count > 10) throw new BotError("Jumlah dadu harus antara 1 sampai 10.");
    if (sides < 2 || sides > 100) throw new BotError("Jumlah sisi dadu harus antara 2 sampai 100.");

    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const total = rolls.reduce((sum, value) => sum + value, 0);

    await interaction.reply({
      embeds: [
        buildEmbed({
          title: `🎲 ${count}d${sides}`,
          description: `**${total}**`,
          color: COLORS.info,
          fields: [{ name: "Hasil", value: rolls.map((value) => `\`${value}\``).join(" ") }],
        }),
      ],
    });
  },
};
