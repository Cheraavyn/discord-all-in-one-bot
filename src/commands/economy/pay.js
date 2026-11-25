import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { ok } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { formatCoins, transfer } from "../../lib/economy.js";

export default {
  data: new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Kirim koin ke member lain")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("user").setDescription("Penerima koin").setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("jumlah")
        .setDescription("Jumlah koin yang dikirim")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1_000_000_000),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("jumlah", true);

    if (target.bot) throw new BotError("Kamu tidak bisa mengirim koin ke bot.");
    if (target.id === interaction.user.id) throw new BotError("Kamu tidak bisa mengirim koin ke dirimu sendiri.");

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) throw new BotError("Penerima tidak ditemukan di server ini.");

    const result = await transfer(interaction.guild.id, interaction.user.id, target.id, amount);

    await interaction.reply({
      embeds: [
        ok(
          [
            `Kamu mengirim **${formatCoins(result.amount)}** ke ${target}.`,
            `Saldo kamu: **${formatCoins(result.from.balance)}**`,
            `Saldo ${target.username}: **${formatCoins(result.to.balance)}**`,
          ].join("\n"),
          "Transfer Berhasil",
        ),
      ],
      allowedMentions: { parse: [] },
    });
  },
};
