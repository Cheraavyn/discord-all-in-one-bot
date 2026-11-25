import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Tampilkan avatar user dalam ukuran besar")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName("user").setDescription("User yang ingin dilihat (default: kamu)")),

  async execute(interaction) {
    const user = interaction.options.getUser("user") ?? interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const avatar = member?.displayAvatarURL({ size: 1024, extension: "png" }) ?? user.displayAvatarURL({ size: 1024, extension: "png" });

    const embed = buildEmbed({
      title: `Avatar ${user.tag}`,
      color: COLORS.info,
      image: avatar,
      fields: [
        {
          name: "Unduh",
          value: [
            `[256](${user.displayAvatarURL({ size: 256 })})`,
            `[512](${user.displayAvatarURL({ size: 512 })})`,
            `[1024](${user.displayAvatarURL({ size: 1024 })})`,
            `[2048](${user.displayAvatarURL({ size: 2048 })})`,
          ].join(" • "),
        },
      ],
    });

    await interaction.reply({ embeds: [embed] });
  },
};
