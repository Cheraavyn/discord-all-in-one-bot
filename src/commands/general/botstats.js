import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { formatDuration } from "../../lib/duration.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { assertGuildInteraction } from "../../lib/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("botstats")
    .setDescription("Lihat statistik dan status bot")
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const client = interaction.client;
    const memory = process.memoryUsage().rss / 1024 / 1024;
    const ping = Math.max(0, Math.round(client.ws.ping));

    const embed = buildEmbed({
      title: `Statistik ${client.user.username}`,
      color: COLORS.info,
      thumbnail: client.user.displayAvatarURL({ size: 256 }),
      fields: [
        { name: "Uptime", value: formatDuration(client.uptime ?? 0), inline: true },
        { name: "Ping", value: `${ping} ms`, inline: true },
        { name: "Server", value: `${client.guilds.cache.size}`, inline: true },
        { name: "User (cache)", value: `${client.users.cache.size}`, inline: true },
        { name: "Channel (cache)", value: `${client.channels.cache.size}`, inline: true },
        { name: "Command", value: `${client.commands.size}`, inline: true },
        { name: "Memori", value: `${memory.toFixed(1)} MB`, inline: true },
        { name: "Node.js", value: process.version, inline: true },
      ],
      footer: "Cache bisa lebih kecil dari jumlah sebenarnya di server besar",
    });

    await interaction.reply({ embeds: [embed] });
  },
};
