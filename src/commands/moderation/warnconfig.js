import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { formatDuration, parseDuration } from "../../lib/duration.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction, assertMemberPermissions } from "../../lib/guards.js";
import { getSettings, updateSettings } from "../../lib/settings.js";

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

export default {
  data: new SlashCommandBuilder()
    .setName("warnconfig")
    .setDescription("Atur aturan warning dan auto timeout")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption((option) =>
      option
        .setName("threshold")
        .setDescription("Jumlah warning yang memicu auto timeout")
        .setMinValue(1)
        .setMaxValue(20),
    )
    .addStringOption((option) =>
      option
        .setName("timeout")
        .setDescription("Durasi auto timeout, contoh: 10m, 1h, 1d")
        .setMaxLength(20),
    )
    .addBooleanOption((option) =>
      option.setName("auto").setDescription("Aktifkan atau matikan auto timeout"),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    assertMemberPermissions(interaction, [PermissionFlagsBits.ManageGuild]);

    const threshold = interaction.options.getInteger("threshold");
    const timeoutInput = interaction.options.getString("timeout");
    const auto = interaction.options.getBoolean("auto");

    if (threshold === null && !timeoutInput && auto === null) {
      return showConfig(interaction);
    }

    const patch = {};
    if (threshold !== null) patch.warnThreshold = threshold;

    if (timeoutInput) {
      const timeoutMs = parseDuration(timeoutInput);
      if (!timeoutMs || timeoutMs < 10_000) {
        throw new BotError("Durasi timeout tidak valid. Contoh: `10m`, `1h`, `1d` (minimal 10 detik).");
      }
      if (timeoutMs > MAX_TIMEOUT_MS) throw new BotError("Durasi auto timeout maksimal 28 hari.");
      patch.warnTimeoutMs = timeoutMs;
    }

    if (auto !== null) patch.warnAutoTimeout = auto;

    updateSettings(interaction.guild.id, { moderation: patch });

    await interaction.reply({
      embeds: [await buildConfigEmbed(interaction.guild.id, "Aturan Warning Diperbarui")],
      flags: MessageFlags.Ephemeral,
    });
  },
};

async function showConfig(interaction) {
  await interaction.reply({
    embeds: [await buildConfigEmbed(interaction.guild.id, "Aturan Warning")],
    flags: MessageFlags.Ephemeral,
  });
}

async function buildConfigEmbed(guildId, title) {
  const moderation = getSettings(guildId).moderation;

  return buildEmbed({
    title,
    color: COLORS.info,
    fields: [
      { name: "Auto timeout", value: moderation.warnAutoTimeout ? "Aktif" : "Mati", inline: true },
      { name: "Threshold", value: `${moderation.warnThreshold} peringatan`, inline: true },
      { name: "Durasi timeout", value: formatDuration(moderation.warnTimeoutMs), inline: true },
    ],
    footer: "Auto timeout berlaku setiap kelipatan threshold",
  });
}
