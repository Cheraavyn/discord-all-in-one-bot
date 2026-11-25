import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { buildEmbed, COLORS, ok } from "../../lib/embeds.js";
import { assertGuildInteraction, assertMemberPermissions } from "../../lib/guards.js";
import {
  getQueue,
  getShufflePreference,
  getStayInVoicePreference,
  setStayInVoiceForGuild,
} from "../../music/manager.js";
import { getSettings } from "../../lib/settings.js";

export default {
  data: new SlashCommandBuilder()
    .setName("musicconfig")
    .setDescription("Atur perilaku musik di server ini")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("stay")
        .setDescription("Atur apakah bot tetap terhubung di voice saat idle/kosong")
        .addBooleanOption((option) =>
          option
            .setName("aktif")
            .setDescription("Aktifkan mode tetap terhubung 24/7 (tanpa autoplay)")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("status").setDescription("Lihat pengaturan musik server")),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    assertMemberPermissions(interaction, [PermissionFlagsBits.ManageGuild]);

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "stay") return setStay(interaction);
    return showStatus(interaction);
  },
};

async function setStay(interaction) {
  const enabled = interaction.options.getBoolean("aktif", true);
  const queue = getQueue(interaction.guild.id);
  const result = setStayInVoiceForGuild(interaction.guild.id, enabled, queue);

  const lines = enabled
    ? [
        "Bot akan **tetap terhubung** di voice channel saat antrean habis atau channel kosong.",
        "Musik **tidak** akan diputar otomatis ketika antrean kosong (tidak ada autoplay).",
        "Gunakan `/stop` untuk mengeluarkan bot secara manual.",
      ]
    : [
        "Bot kembali ke perilaku default: keluar otomatis saat **2 menit** idle atau voice channel kosong **45 detik**.",
      ];

  if (result.hasQueue) {
    lines.push("", "_Pengaturan diterapkan ke sesi musik yang sedang aktif._");
  } else {
    lines.push("", "_Pengaturan disimpan untuk sesi musik berikutnya._");
  }

  await interaction.reply({
    embeds: [
      ok(lines.join("\n"), enabled ? "Mode Tetap di Voice Aktif" : "Mode Tetap di Voice Dimatikan"),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function showStatus(interaction) {
  const settings = getSettings(interaction.guild.id).music;
  const queue = getQueue(interaction.guild.id);
  const stay = getStayInVoicePreference(interaction.guild.id);
  const shuffle = queue ? queue.shuffle : getShufflePreference(interaction.guild.id);

  const embed = buildEmbed({
    title: "Pengaturan Musik",
    color: stay ? COLORS.success : COLORS.neutral,
    fields: [
      { name: "Tetap di voice (24/7)", value: stay ? "Aktif" : "Nonaktif", inline: true },
      { name: "Shuffle default", value: shuffle ? "Aktif" : "Nonaktif", inline: true },
      { name: "Volume default", value: `${settings.volume}%`, inline: true },
      {
        name: "Sesi aktif",
        value: queue?.connection
          ? `Terhubung${queue.connection.joinConfig.channelId ? ` di <#${queue.connection.joinConfig.channelId}>` : ""}`
          : "Tidak ada",
        inline: true,
      },
    ],
    footer: stay
      ? "Mode tetap di voice tidak mencakup autoplay atau auto-rejoin setelah restart."
      : "Gunakan /musicconfig stay aktif:true agar bot tidak keluar otomatis.",
  });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
