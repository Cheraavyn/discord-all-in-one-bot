import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  formatBirthday,
  getBirthday,
  getNextOccurrence,
  getUpcomingBirthdays,
  removeBirthday,
  setBirthday,
  setBirthdayPrivacy,
  setBirthdayTimeZone,
} from "../../lib/birthdays.js";
import { buildEmbed, COLORS, ok } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import {
  resolveTimeZone,
  TIMEZONE_CHOICES,
  timeZoneClock,
  timeZoneLabel,
  timeZoneOffset,
} from "../../lib/timezones.js";

const CURRENT_YEAR = new Date().getFullYear();
const discordDate = (date) => `<t:${Math.floor(date.getTime() / 1000)}:D>`;

const zoneOption = (option) =>
  option
    .setName("zona")
    .setDescription("Zona waktu, mis. WIT, WIB, Malaysia, atau Asia/Kuala_Lumpur")
    .setAutocomplete(true)
    .setMaxLength(60);

export default {
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Kelola ulang tahunmu dan lihat ulang tahun server")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Daftarkan atau perbarui tanggal lahirmu")
        .addIntegerOption((option) =>
          option.setName("tanggal").setDescription("Tanggal lahir, 1-31").setRequired(true).setMinValue(1).setMaxValue(31),
        )
        .addIntegerOption((option) =>
          option.setName("bulan").setDescription("Bulan lahir, 1-12").setRequired(true).setMinValue(1).setMaxValue(12),
        )
        .addIntegerOption((option) =>
          option
            .setName("tahun")
            .setDescription("Tahun lahir (opsional, tidak wajib dibagikan)")
            .setMinValue(1900)
            .setMaxValue(CURRENT_YEAR),
        )
        .addBooleanOption((option) =>
          option.setName("publik").setDescription("Tampilkan di daftar ulang tahun? Default: ya"),
        )
        .addStringOption(zoneOption),
    )
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("Lihat ulang tahunmu atau member lain")
        .addUserOption((option) => option.setName("user").setDescription("Member yang ingin dilihat")),
    )
    .addSubcommand((sub) => sub.setName("upcoming").setDescription("Lihat ulang tahun terdekat di server")
      .addIntegerOption((option) =>
        option.setName("jumlah").setDescription("Jumlah entri (1-10, default 5)").setMinValue(1).setMaxValue(10),
      ),
    )
    .addSubcommand((sub) =>
      sub.setName("privacy").setDescription("Atur apakah ulang tahunmu muncul di daftar publik")
        .addBooleanOption((option) =>
          option.setName("publik").setDescription("true = tampilkan, false = sembunyikan").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("timezone")
        .setDescription("Atur zona waktu perayaan ulang tahunmu")
        .addStringOption((option) => zoneOption(option).setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName("remove").setDescription("Hapus data ulang tahunmu")),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "zona") {
      await interaction.respond([]);
      return;
    }

    const query = String(focused.value ?? "").toLowerCase();
    const choices = TIMEZONE_CHOICES
      .filter((choice) => choice.name.toLowerCase().includes(query) || choice.value.toLowerCase().includes(query))
      .slice(0, 25)
      .map((choice) => ({ name: choice.name, value: choice.value }));

    await interaction.respond(choices);
  },

  async execute(interaction) {
    assertGuildInteraction(interaction);

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "set") return set(interaction);
    if (subcommand === "view") return view(interaction);
    if (subcommand === "upcoming") return upcoming(interaction);
    if (subcommand === "privacy") return privacy(interaction);
    if (subcommand === "timezone") return timezone(interaction);
    return remove(interaction);
  },
};

async function set(interaction) {
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const day = interaction.options.getInteger("tanggal", true);
  const month = interaction.options.getInteger("bulan", true);
  const year = interaction.options.getInteger("tahun");
  const zoneInput = interaction.options.getString("zona");
  const existing = await getBirthday(guildId, userId);
  const isPublic = interaction.options.getBoolean("publik") ?? existing?.public ?? true;

  const record = await setBirthday(guildId, userId, {
    month,
    day,
    year,
    public: isPublic,
    timeZone: zoneInput ? resolveTimeZone(zoneInput) : null,
  });
  const next = getNextOccurrence(record);

  await interaction.reply({
    embeds: [
      ok(
        [
          `Ulang tahun tersimpan: **${formatBirthday(record)}**.`,
          `Berikutnya: ${discordDate(next.instant)} (${next.key} waktu ${next.timeZone}).`,
          `Zona waktu: **${timeZoneLabel(record.timeZone)}** — ${timeZoneOffset(record.timeZone)}.`,
          "",
          existing ? "Data lama berhasil diperbarui." : "Tahun lahir opsional dan bisa diisi kapan saja.",
        ].join("\n"),
        "Ulang Tahun Tersimpan 🎂",
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function view(interaction) {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const record = await getBirthday(interaction.guild.id, target.id);

  if (!record) {
    throw new BotError(
      `${target.id === interaction.user.id ? "Kamu" : `**${target.username}**`} belum mendaftarkan ulang tahun. Gunakan \`/birthday set\`.`,
    );
  }

  if (!record.public && target.id !== interaction.user.id) {
    throw new BotError(`${target.username} menyembunyikan ulang tahunnya dari daftar publik.`);
  }

  const next = getNextOccurrence(record);
  const age = record.year ? next.year - record.year : null;

  const embed = buildEmbed({
    title: `🎂 Ulang Tahun ${target.username}`,
    color: COLORS.info,
    thumbnail: target.displayAvatarURL({ size: 256 }),
    fields: [
      { name: "Tanggal lahir", value: formatBirthday(record), inline: true },
      { name: "Berikutnya", value: `${discordDate(next.instant)}`, inline: true },
      { name: "Umur berikutnya", value: age === null ? "tidak diisi" : `${age} tahun`, inline: true },
      { name: "Visibilitas", value: record.public ? "Publik" : "Privat", inline: true },
      {
        name: "Zona waktu",
        value: `${timeZoneLabel(record.timeZone)} • ${timeZoneOffset(record.timeZone)} • sekarang ${timeZoneClock(record.timeZone)}`,
      },
    ],
    footer: record.day === 29 && record.month === 2 ? "29 Februari dirayakan pada 1 Maret saat tahun bukan kabut" : undefined,
  });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function upcoming(interaction) {
  const limit = interaction.options.getInteger("jumlah") ?? 5;
  const list = await getUpcomingBirthdays(interaction.guild.id, { limit });

  if (!list.length) {
    await interaction.reply({
      embeds: [buildEmbed({
        title: "Ulang Tahun Terdekat",
        description: "Belum ada ulang tahun publik yang terdaftar di server ini.",
        color: COLORS.neutral,
      })],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines = list.map((record, index) => {
    const when = record.daysUntil === 0 ? "🎉 **hari ini**" : `<t:${Math.floor(record.nextAt / 1000)}:R>`;
    return `${index + 1}. <@${record.userId}> — **${formatBirthday(record)}** • ${when}`;
  });

  await interaction.reply({
    embeds: [buildEmbed({
      title: "Ulang Tahun Terdekat",
      description: lines.join("\n"),
      color: COLORS.info,
      footer: "Publik saja • perayaan mengikuti zona waktu masing-masing member",
    })],
    flags: MessageFlags.Ephemeral,
  });
}

async function timezone(interaction) {
  const zone = resolveTimeZone(interaction.options.getString("zona", true));
  const record = await setBirthdayTimeZone(interaction.guild.id, interaction.user.id, zone);

  await interaction.reply({
    embeds: [ok(
      [
        `Zona waktu ulang tahunmu: **${timeZoneLabel(record.timeZone)}**.`,
        `Offset saat ini: ${timeZoneOffset(record.timeZone)} • waktu setempat **${timeZoneClock(record.timeZone)}**.`,
        "",
        "Perayaan otomatis akan menyesuaikan zona ini (misalnya WIT atau Malaysia).",
      ].join("\n"),
      "Zona Waktu Diperbarui",
    )],
    flags: MessageFlags.Ephemeral,
  });
}

async function privacy(interaction) {
  const isPublic = interaction.options.getBoolean("publik", true);
  await setBirthdayPrivacy(interaction.guild.id, interaction.user.id, isPublic);

  await interaction.reply({
    embeds: [ok(
      isPublic
        ? "Ulang tahunmu sekarang tampil di `/birthday upcoming`."
        : "Ulang tahunmu sekarang disembunyikan dari daftar publik.",
      "Visibilitas Diperbarui",
    )],
    flags: MessageFlags.Ephemeral,
  });
}

async function remove(interaction) {
  const deleted = await removeBirthday(interaction.guild.id, interaction.user.id);
  if (!deleted) throw new BotError("Kamu belum mendaftarkan ulang tahun.");

  await interaction.reply({
    embeds: [ok("Data ulang tahunmu di server ini sudah dihapus.", "Ulang Tahun Dihapus")],
    flags: MessageFlags.Ephemeral,
  });
}
