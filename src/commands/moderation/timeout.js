import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS, ok } from "../../lib/embeds.js";
import { formatDuration, parseDuration } from "../../lib/duration.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction, assertModeratable } from "../../lib/guards.js";
import { logModeration } from "../../lib/modActions.js";

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

export default {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Bungkam sementara seorang member")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("target").setDescription("Member yang di-timeout").setRequired(true))
    .addStringOption((option) =>
      option
        .setName("durasi")
        .setDescription("Contoh: 30s, 10m, 2h, 1d (maksimal 28d)")
        .setRequired(true),
    )
    .addStringOption((option) => option.setName("alasan").setDescription("Alasan timeout").setMaxLength(512)),

  async execute(interaction) {
    await interaction.deferReply();
    assertGuildInteraction(interaction, [PermissionFlagsBits.ModerateMembers]);

    const user = interaction.options.getUser("target", true);
    const durationInput = interaction.options.getString("durasi", true);
    const reason = interaction.options.getString("alasan") ?? "Tidak ada alasan";

    const duration = parseDuration(durationInput);
    if (!duration || duration < 5_000) throw new BotError("Durasi tidak valid. Contoh yang benar: `30s`, `10m`, `2h`, `1d`.");
    if (duration > MAX_TIMEOUT_MS) throw new BotError("Durasi maksimal timeout adalah 28 hari.");

    const target = await assertModeratable(interaction, user);
    await target.timeout(duration, `${reason} — oleh ${interaction.user.tag}`);

    await logModeration(interaction.guild, {
      action: "timeout",
      targetId: user.id,
      targetTag: user.tag,
      targetLabel: `${user}`,
      moderator: interaction.user,
      reason,
      color: COLORS.warning,
      fields: [
        { name: "Durasi", value: formatDuration(duration), inline: true },
        { name: "Berakhir", value: `<t:${Math.floor((Date.now() + duration) / 1000)}:R>`, inline: true },
      ],
    });

    await interaction.editReply({
      embeds: [
        ok(`**${user.tag}** dibungkam selama **${formatDuration(duration)}**.`, "Timeout Berhasil").addFields(
          { name: "Alasan", value: reason },
          { name: "Berakhir", value: `<t:${Math.floor((Date.now() + duration) / 1000)}:R>`, inline: true },
          { name: "Moderator", value: `${interaction.user}`, inline: true },
        ),
      ],
    });
  },
};
