import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { getBirthday, renderBirthdayMessage } from "../../lib/birthdays.js";
import { buildEmbed, COLORS, ok } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction, assertMemberPermissions, truncate } from "../../lib/guards.js";
import { getSettings, updateSettings } from "../../lib/settings.js";
import {
  resolveTimeZone,
  TIMEZONE_CHOICES,
  timeZoneClock,
  timeZoneLabel,
  timeZoneOffset,
} from "../../lib/timezones.js";

const PLACEHOLDERS = [
  "`{user}` — mention member",
  "`{username}` — username",
  "`{displayName}` — nama di server",
  "`{server}` — nama server",
  "`{age}` — umur (kosong jika tahun tidak diisi)",
  "`{date}` — tanggal lahir",
].join("\n");

export default {
  data: new SlashCommandBuilder()
    .setName("birthdayconfig")
    .setDescription("Atur ucapan, role, dan hadiah ulang tahun")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Ubah pengaturan ulang tahun server")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel untuk ucapan (kosongkan untuk channel otomatis)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addRoleOption((option) => option.setName("role").setDescription("Role yang diberikan saat ulang tahun"))
        .addIntegerOption((option) =>
          option.setName("koin").setDescription("Koin hadiah per ulang tahun (0 = tidak ada)").setMinValue(0).setMaxValue(100000),
        )
        .addStringOption((option) =>
          option.setName("pesan").setDescription("Template pesan ucapan").setMaxLength(500),
        )
        .addBooleanOption((option) => option.setName("aktif").setDescription("Aktifkan/matikan ucapan"))
        .addStringOption((option) =>
          option
            .setName("zona")
            .setDescription("Zona waktu default server (mis. WIT, WIB, Malaysia)")
            .setAutocomplete(true)
            .setMaxLength(60),
        ),
    )
    .addSubcommand((sub) => sub.setName("status").setDescription("Lihat pengaturan ulang tahun"))
    .addSubcommand((sub) => sub.setName("off").setDescription("Matikan ucapan otomatis"))
    .addSubcommand((sub) => sub.setName("test").setDescription("Pratinjau ucapan tanpa memberi role/koin")),

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
    assertMemberPermissions(interaction, [PermissionFlagsBits.ManageGuild]);

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "set") return configure(interaction);
    if (subcommand === "off") return disable(interaction);
    if (subcommand === "test") return preview(interaction);
    return showStatus(interaction);
  },
};

async function configure(interaction) {
  const channel = interaction.options.getChannel("channel");
  const role = interaction.options.getRole("role");
  const coins = interaction.options.getInteger("koin");
  const message = interaction.options.getString("pesan")?.trim();
  const enabled = interaction.options.getBoolean("aktif");
  const zoneInput = interaction.options.getString("zona");

  if (!channel && !role && coins === null && !message && enabled === null && !zoneInput) return showStatus(interaction);

  const patch = {};

  if (channel) {
    const me = assertGuildInteraction(interaction, [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ]);
    const permissions = channel.permissionsFor(me);
    if (!permissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])) {
      throw new BotError(`Aku butuh izin **View Channel**, **Send Messages**, dan **Embed Links** di <#${channel.id}>.`);
    }
    patch.channelId = channel.id;
  }

  if (role) {
    const me = interaction.guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new BotError("Aku butuh izin **Manage Roles** untuk memberikan role ulang tahun.");
    }
    if (role.id === interaction.guild.id || role.managed) {
      throw new BotError("Role itu tidak bisa diberikan oleh bot.");
    }
    if (role.position >= me.roles.highest.position) {
      throw new BotError(`Role **${role.name}** lebih tinggi atau setara dengan role-ku, jadi aku tidak bisa memberikannya.`);
    }
    patch.roleId = role.id;
  }

  if (coins !== null) patch.coins = coins;
  if (zoneInput) patch.timeZone = resolveTimeZone(zoneInput);
  if (message) patch.message = message;
  if (enabled !== null) patch.enabled = enabled;

  updateSettings(interaction.guild.id, { birthday: patch });

  await interaction.reply({
    embeds: [buildStatusEmbed(interaction.guild.id, "Pengaturan Ulang Tahun Diperbarui")],
    flags: MessageFlags.Ephemeral,
  });
}

async function disable(interaction) {
  updateSettings(interaction.guild.id, { birthday: { enabled: false } });

  await interaction.reply({
    embeds: [ok("Ucapan ulang tahun otomatis dimatikan. Data anggota tetap tersimpan.", "Ulang Tahun Dimatikan")],
    flags: MessageFlags.Ephemeral,
  });
}

async function preview(interaction) {
  const settings = getSettings(interaction.guild.id).birthday;
  const now = new Date();
  const record = (await getBirthday(interaction.guild.id, interaction.user.id)) ?? {
    month: now.getMonth() + 1,
    day: now.getDate(),
    year: null,
  };

  const payload = renderBirthdayMessage(interaction.guild, interaction.member, record, settings.message);
  await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

async function showStatus(interaction) {
  await interaction.reply({
    embeds: [buildStatusEmbed(interaction.guild.id, "Pengaturan Ulang Tahun")],
    flags: MessageFlags.Ephemeral,
  });
}

function buildStatusEmbed(guildId, title) {
  const settings = getSettings(guildId).birthday;

  return buildEmbed({
    title,
    color: settings.enabled ? COLORS.success : COLORS.neutral,
    fields: [
      { name: "Status", value: settings.enabled ? "Aktif" : "Nonaktif", inline: true },
      { name: "Channel", value: settings.channelId ? `<#${settings.channelId}>` : "otomatis", inline: true },
      { name: "Role", value: settings.roleId ? `<@&${settings.roleId}>` : "tidak ada", inline: true },
      { name: "Koin hadiah", value: `🪙 ${settings.coins.toLocaleString("id-ID")}`, inline: true },
      {
        name: "Zona waktu default",
        value: `${timeZoneLabel(settings.timeZone)} • ${timeZoneOffset(settings.timeZone)} • sekarang ${timeZoneClock(settings.timeZone)}`,
      },
      { name: "Template pesan", value: truncate(settings.message || "-", 500) },
      { name: "Placeholder", value: PLACEHOLDERS },
    ],
    footer: "Ulang tahun dirayakan tiap tengah malam waktu lokal bot",
  });
}
