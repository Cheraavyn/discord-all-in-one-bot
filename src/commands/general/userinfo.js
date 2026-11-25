import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { discordTimestamp } from "../../lib/duration.js";
import { assertGuildInteraction, truncate } from "../../lib/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Tampilkan informasi user")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName("user").setDescription("User yang ingin dilihat (default: kamu)")),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const user = interaction.options.getUser("user") ?? interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    const roles = member
      ? member.roles.cache
          .filter((role) => role.id !== interaction.guild.id)
          .sort((a, b) => b.position - a.position)
          .map((role) => `<@&${role.id}>`)
      : [];

    const embed = buildEmbed({
      title: user.tag,
      color: member?.displayColor || COLORS.info,
      thumbnail: user.displayAvatarURL({ size: 256 }),
      fields: [
        { name: "ID", value: `\`${user.id}\``, inline: true },
        { name: "Bot", value: user.bot ? "Ya" : "Tidak", inline: true },
        { name: "Akun dibuat", value: discordTimestamp(user.createdAt), inline: true },
        ...(member
          ? [
              { name: "Bergabung", value: discordTimestamp(member.joinedAt), inline: true },
              { name: "Nickname", value: member.nickname ?? "-", inline: true },
              { name: "Role tertinggi", value: `<@&${member.roles.highest.id}>`, inline: true },
              {
                name: `Role (${roles.length})`,
                value: roles.length ? truncate(roles.slice(0, 20).join(" "), 1024) : "Tidak ada role",
              },
            ]
          : [{ name: "Status", value: "User tidak berada di server ini." }]),
      ],
      footer: `Diminta oleh ${interaction.user.tag}`,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
