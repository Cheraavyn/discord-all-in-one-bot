import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import { formatCoins, getAccount, getPosition } from "../../lib/economy.js";

export default {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Lihat saldo koin")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("user").setDescription("Member yang dicek (default: kamu)"),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const user = interaction.options.getUser("user") ?? interaction.user;
    const account = getAccount(interaction.guild.id, user.id);
    const position = await getPosition(interaction.guild.id, user.id);

    const embed = buildEmbed({
      title: `Saldo ${user.username}`,
      color: COLORS.info,
      thumbnail: user.displayAvatarURL({ size: 256 }),
      fields: [
        { name: "Saldo", value: formatCoins(account.balance), inline: true },
        { name: "Total didapat", value: formatCoins(account.totalEarned), inline: true },
        { name: "Peringkat", value: position ? `#${position}` : "belum ada", inline: true },
      ],
      footer: "Kumpulkan koin dengan /daily dan /work",
    });

    await interaction.reply({ embeds: [embed] });
  },
};
