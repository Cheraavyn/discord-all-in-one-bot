import { ChannelType, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { discordTimestamp } from "../../lib/duration.js";
import { assertGuildInteraction } from "../../lib/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Tampilkan informasi server ini")
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const { guild } = interaction;

    const humans = guild.members.cache.filter((member) => !member.user.bot).size;
    const bots = guild.members.cache.filter((member) => member.user.bot).size;
    const textChannels = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildVoice).size;

    const embed = buildEmbed({
      title: guild.name,
      color: COLORS.info,
      thumbnail: guild.iconURL({ size: 256 }) ?? undefined,
      fields: [
        { name: "Owner", value: `<@${guild.ownerId}>`, inline: true },
        { name: "Dibuat", value: discordTimestamp(guild.createdAt), inline: true },
        { name: "ID", value: `\`${guild.id}\``, inline: true },
        { name: "Member", value: `${humans} manusia • ${bots} bot`, inline: true },
        { name: "Channel", value: `${textChannels} teks • ${voiceChannels} voice`, inline: true },
        { name: "Role", value: `${guild.roles.cache.size} role`, inline: true },
        { name: "Boost", value: `${guild.premiumSubscriptionCount ?? 0} boost (level ${guild.premiumTier})`, inline: true },
        { name: "Verifikasi", value: String(guild.verificationLevel), inline: true },
        { name: "Emoji & Sticker", value: `${guild.emojis.cache.size} emoji • ${guild.stickers.cache.size} sticker`, inline: true },
      ],
      image: guild.bannerURL({ size: 1024 }) ?? undefined,
      footer: `Diminta oleh ${interaction.user.tag}`,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
