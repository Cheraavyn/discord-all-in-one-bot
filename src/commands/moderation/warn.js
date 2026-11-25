import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { buildEmbed, COLORS, ok } from "../../lib/embeds.js";
import { formatDuration } from "../../lib/duration.js";
import { assertGuildInteraction, assertModeratable } from "../../lib/guards.js";
import { logger } from "../../lib/logger.js";
import { logModeration } from "../../lib/modActions.js";
import { getSettings } from "../../lib/settings.js";
import { addWarning, countWarnings } from "../../lib/warnings.js";

export default {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Beri peringatan kepada member")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("target").setDescription("Member yang diberi peringatan").setRequired(true))
    .addStringOption((option) =>
      option.setName("alasan").setDescription("Alasan peringatan").setRequired(true).setMaxLength(512),
    ),

  async execute(interaction) {
    await interaction.deferReply();
    assertGuildInteraction(interaction, [PermissionFlagsBits.ModerateMembers]);

    const user = interaction.options.getUser("target", true);
    const reason = interaction.options.getString("alasan", true).trim();
    const guild = interaction.guild;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (member) await assertModeratable(interaction, user);

    const warning = await addWarning({
      guildId: guild.id,
      userId: user.id,
      moderatorId: interaction.user.id,
      reason,
    });
    const total = await countWarnings(guild.id, user.id);

    const moderation = getSettings(guild.id).moderation;
    const shouldTimeout =
      Boolean(member) &&
      moderation.warnAutoTimeout &&
      moderation.warnThreshold > 0 &&
      total % moderation.warnThreshold === 0;

    let timedOut = false;
    let timeoutError = null;

    if (shouldTimeout) {
      try {
        await member.timeout(
          moderation.warnTimeoutMs,
          `Auto timeout: ${total} peringatan — oleh ${interaction.user.tag}`,
        );
        timedOut = true;
      } catch (error) {
        timeoutError = error.message;
        logger.warn(`Gagal auto timeout ${user.tag}:`, error.message);
      }
    }

    await user
      .send({
        embeds: [
          buildEmbed({
            title: `Kamu mendapat peringatan di ${guild.name}`,
            color: COLORS.warning,
            fields: [
              { name: "Alasan", value: reason },
              { name: "Total peringatan", value: `${total}`, inline: true },
              ...(timedOut
                ? [{ name: "Auto timeout", value: formatDuration(moderation.warnTimeoutMs), inline: true }]
                : []),
            ],
          }),
        ],
      })
      .catch(() => {});

    const logFields = [
      { name: "Total peringatan", value: `${total}`, inline: true },
      { name: "ID peringatan", value: `\`${warning.id}\``, inline: true },
    ];
    if (timedOut) {
      logFields.push({
        name: "Auto timeout",
        value: formatDuration(moderation.warnTimeoutMs),
        inline: true,
      });
    }
    if (timeoutError) logFields.push({ name: "Auto timeout gagal", value: timeoutError.slice(0, 1024) });

    await logModeration(guild, {
      action: "warn",
      targetId: user.id,
      targetTag: user.tag,
      targetLabel: `${user}`,
      moderator: interaction.user,
      reason,
      color: COLORS.warning,
      fields: logFields,
    });

    const embed = ok(`**${user.tag}** mendapat peringatan.`, "Peringatan Diberikan")
      .addFields(
        { name: "Alasan", value: reason },
        { name: "Total peringatan", value: `${total}`, inline: true },
        { name: "ID peringatan", value: `\`${warning.id}\``, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true },
      );

    if (timedOut) {
      embed.addFields({
        name: "Auto timeout",
        value: `Member dibungkam selama **${formatDuration(moderation.warnTimeoutMs)}**.`,
      });
    } else if (timeoutError) {
      embed.addFields({ name: "Auto timeout gagal", value: timeoutError.slice(0, 1024) });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
