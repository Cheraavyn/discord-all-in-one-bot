import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Cek latency bot dan API Discord")
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const startedAt = Date.now();
    await interaction.reply({ content: "Mengukur latency..." });
    const roundtrip = Date.now() - startedAt;

    const embed = buildEmbed({
      title: "Pong! 🏓",
      color: COLORS.success,
      fields: [
        { name: "Websocket", value: `${Math.max(0, Math.round(interaction.client.ws.ping))} ms`, inline: true },
        { name: "Roundtrip", value: `${roundtrip} ms`, inline: true },
        { name: "Uptime", value: `<t:${Math.floor((Date.now() - interaction.client.uptime) / 1000)}:R>`, inline: true },
      ],
    });

    await interaction.editReply({ content: null, embeds: [embed] });
  },
};
