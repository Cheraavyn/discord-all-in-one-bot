import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { WEEKLY_QUEST_COUNT, DAILY_QUEST_COUNT } from "../../lib/questCatalog.js";
import { claimQuests, getQuestBoard } from "../../lib/quests.js";
import { formatCoins } from "../../lib/economy.js";
import { buildEmbed, COLORS } from "../../lib/embeds.js";
import { discordTimestamp } from "../../lib/duration.js";
import { assertGuildInteraction } from "../../lib/guards.js";

const LABELS = { daily: "Daily", weekly: "Weekly" };
const EMOJIS = { daily: "📅", weekly: "🗓️" };

function progressBar(progress, target, size = 10) {
  const ratio = target > 0 ? Math.min(1, Math.max(0, progress / target)) : 0;
  const filled = Math.round(ratio * size);
  return `${"█".repeat(filled)}${"░".repeat(size - filled)}`;
}

function statusOf(quest) {
  if (quest.claimed) return "✅ **Diklaim**";
  if (quest.completed) return "🎁 **Siap diklaim**";
  return `${quest.progress}/${quest.target}`;
}

function boardEmbed(board, username) {
  const fields = board.quests.map((quest) => ({
    name: `${quest.emoji} ${quest.title} — ${formatCoins(quest.reward)}`,
    value: `\`${progressBar(quest.progress, quest.target)}\` ${statusOf(quest)}`,
  }));

  return buildEmbed({
    title: `${EMOJIS[board.type]} ${LABELS[board.type]} Quest — ${username}`,
    description:
      `Progres berjalan otomatis dari aktivitas kamu. ` +
      `**${board.completed}/${board.quests.length}** selesai, **${board.claimable}** bisa diklaim.`,
    color: board.claimable > 0 ? COLORS.success : COLORS.info,
    fields,
    footer: `Reset ${discordTimestamp(board.resetAt)} · /quests claim untuk mengambil hadiah`,
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName("quests")
    .setDescription("Lihat dan klaim quest harian serta mingguan")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) => sub.setName("daily").setDescription(`Lihat ${DAILY_QUEST_COUNT} quest harian kamu`))
    .addSubcommand((sub) => sub.setName("weekly").setDescription(`Lihat ${WEEKLY_QUEST_COUNT} quest mingguan kamu`))
    .addSubcommand((sub) =>
      sub
        .setName("claim")
        .setDescription("Klaim hadiah quest yang sudah selesai")
        .addStringOption((option) =>
          option
            .setName("jenis")
            .setDescription("Pilih papan yang diklaim (default: semua)")
            .addChoices(
              { name: "Semua quest", value: "all" },
              { name: "Daily saja", value: "daily" },
              { name: "Weekly saja", value: "weekly" },
            ),
        ),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    if (subcommand === "claim") {
      const type = interaction.options.getString("jenis") ?? "all";
      const result = await claimQuests(guildId, userId, type);

      if (!result.claimed) {
        await interaction.reply({
          embeds: [
            buildEmbed({
              title: "🎁 Belum ada hadiah",
              description:
                "Belum ada quest yang selesai dan belum diklaim. Cek progresmu lewat `/quests daily` atau `/quests weekly`.",
              color: COLORS.neutral,
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const lines = result.quests.map(
        (quest) => `${quest.emoji} ${LABELS[quest.type]}: **${quest.title}** — ${formatCoins(quest.reward)}`,
      );

      await interaction.reply({
        embeds: [
          buildEmbed({
            title: "🎉 Hadiah Quest Diklaim",
            description: lines.join("\n"),
            color: COLORS.success,
            fields: [
              { name: "Total didapat", value: formatCoins(result.total), inline: true },
              { name: "Saldo sekarang", value: formatCoins(result.balance), inline: true },
            ],
            footer: `${result.quests.length} quest selesai diklaim`,
          }),
        ],
      });
      return;
    }

    const type = subcommand === "weekly" ? "weekly" : "daily";
    const board = getQuestBoard(guildId, userId, type);
    await interaction.reply({ embeds: [boardEmbed(board, interaction.user.username)] });
  },
};
