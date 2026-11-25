import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { buildEmbed, COLORS, info, ok } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction, assertMemberPermissions } from "../../lib/guards.js";
import { logger } from "../../lib/logger.js";
import { getSettings, updateSettings } from "../../lib/settings.js";

const PANEL_OPEN_ID = "ticket:open";
const PANEL_CLOSE_ID = "ticket:close";
const CLOSE_DELAY_MS = 5_000;

export default {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Sistem tiket bantuan")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Kirim panel tiket ke sebuah channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel tempat panel dikirim")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("kategori")
            .setDescription("Kategori tempat channel tiket dibuat")
            .addChannelTypes(ChannelType.GuildCategory),
        )
        .addRoleOption((option) =>
          option.setName("staff_role").setDescription("Role staff yang bisa melihat semua tiket"),
        ),
    )
    .addSubcommand((sub) => sub.setName("close").setDescription("Tutup tiket di channel ini"))
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Tambahkan user ke tiket ini")
        .addUserOption((option) => option.setName("user").setDescription("User yang ditambahkan").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Hapus user dari tiket ini")
        .addUserOption((option) => option.setName("user").setDescription("User yang dihapus").setRequired(true)),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "setup") return setupPanel(interaction);
    if (subcommand === "close") return closeTicket(interaction);
    if (subcommand === "add") return modifyTicketAccess(interaction, "add");
    if (subcommand === "remove") return modifyTicketAccess(interaction, "remove");
  },
};

/* ------------------------------------------------------------------ */
/* Setup panel                                                         */
/* ------------------------------------------------------------------ */

async function setupPanel(interaction) {
  assertMemberPermissions(interaction, [PermissionFlagsBits.ManageGuild]);
  const me = assertGuildInteraction(interaction, [
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ]);

  const channel = interaction.options.getChannel("channel", true);
  const category = interaction.options.getChannel("kategori");
  const staffRole = interaction.options.getRole("staff_role");

  if (!channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)) {
    throw new BotError(`Aku tidak punya izin mengirim pesan di <#${channel.id}>.`);
  }

  updateSettings(interaction.guild.id, {
    ticket: {
      panelChannelId: channel.id,
      categoryId: category?.id ?? null,
      staffRoleId: staffRole?.id ?? null,
    },
  });

  const embed = buildEmbed({
    title: "Pusat Bantuan",
    description: [
      "Butuh bantuan dari staff? Klik tombol **Buka Tiket** di bawah.",
      "",
      "Satu tiket akan membuat channel privat khusus untukmu dan staff.",
      "Jelaskan masalahmu dengan detail agar cepat ditangani.",
    ].join("\n"),
    color: COLORS.info,
    footer: "Sistem tiket otomatis",
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(PANEL_OPEN_ID).setLabel("Buka Tiket").setEmoji("🎫").setStyle(ButtonStyle.Primary),
  );

  const sent = await channel.send({ embeds: [embed], components: [row] });

  await interaction.reply({
    embeds: [
      ok(`Panel tiket dikirim ke <#${channel.id}>.`, "Ticket Diatur").addFields({
        name: "Detail",
        value: [
          `Panel: [buka pesan](${sent.url})`,
          `Kategori: ${category ? category.name : "belum diatur (channel dibuat tanpa kategori)"}`,
          `Staff role: ${staffRole ? `<@&${staffRole.id}>` : "belum diatur"}`,
        ].join("\n"),
      }),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

/* ------------------------------------------------------------------ */
/* Buka tiket (tombol)                                                 */
/* ------------------------------------------------------------------ */

async function openTicket(interaction) {
  const { guild } = interaction;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const me = assertGuildInteraction(interaction, [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.SendMessages,
  ]);
  const settings = getSettings(guild.id);
  const count = (settings.ticket.counter ?? 0) + 1;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  if (settings.ticket.staffRoleId) {
    overwrites.push({
      id: settings.ticket.staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: `tiket-${String(count).padStart(4, "0")}`,
    type: ChannelType.GuildText,
    parent: settings.ticket.categoryId && guild.channels.cache.has(settings.ticket.categoryId)
      ? settings.ticket.categoryId
      : undefined,
    topic: `Tiket #${count} • ${interaction.user.tag} (${interaction.user.id})`,
    permissionOverwrites: overwrites,
    reason: `Tiket dibuka oleh ${interaction.user.tag}`,
  });

  updateSettings(guild.id, { ticket: { counter: count } });

  const embed = buildEmbed({
    title: `Tiket #${count}`,
    description: [
      `Halo ${interaction.user}, tiketmu sudah dibuat.`,
      "",
      "Tulis pertanyaan atau masalahmu di sini. Staff akan segera membantu.",
      "Klik tombol **Tutup Tiket** jika sudah selesai.",
    ].join("\n"),
    color: COLORS.info,
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(PANEL_CLOSE_ID).setLabel("Tutup Tiket").setEmoji("🔒").setStyle(ButtonStyle.Danger),
  );

  const staffMention = settings.ticket.staffRoleId ? ` <@&${settings.ticket.staffRoleId}>` : "";
  await channel.send({
    content: `${interaction.user}${staffMention}`,
    embeds: [embed],
    components: [row],
  });

  await interaction.editReply({
    embeds: [ok(`Tiket kamu sudah dibuat: <#${channel.id}>`)],
  });
}

/* ------------------------------------------------------------------ */
/* Tutup tiket                                                         */
/* ------------------------------------------------------------------ */

function ticketCreatorId(channel) {
  const match = /\((\d{15,25})\)\s*$/.exec(channel.topic ?? "");
  return match?.[1] ?? null;
}

/** Staff = punya Manage Channels, atau memegang role staff yang diatur di /ticket setup. */
function isTicketStaff(interaction, settings) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) return true;

  const staffRoleId = settings?.ticket?.staffRoleId;
  return Boolean(staffRoleId && interaction.member?.roles?.cache?.has(staffRoleId));
}

async function closeTicket(interaction) {
  const channel = interaction.channel;

  if (!channel?.isTextBased() || !channel.name.match(/^tic?ket-\d+$/i)) {
    throw new BotError("Command ini hanya bisa dipakai di dalam channel tiket.");
  }

  const creatorId = ticketCreatorId(channel);
  const allowed = isTicketStaff(interaction, getSettings(interaction.guild.id)) || interaction.user.id === creatorId;

  if (!allowed) throw new BotError("Hanya pembuat tiket atau staff yang bisa menutup tiket ini.");

  await interaction.reply({
    embeds: [
      info(`Tiket ditutup oleh ${interaction.user}. Channel akan dihapus dalam ${CLOSE_DELAY_MS / 1000} detik.`),
    ],
  });

  setTimeout(() => {
    channel.delete(`Tiket ditutup oleh ${interaction.user.tag}`).catch((error) => {
      logger.warn(`Gagal menghapus channel tiket: ${error.message}`);
    });
  }, CLOSE_DELAY_MS);
}

/* ------------------------------------------------------------------ */
/* Tambah / hapus akses user                                           */
/* ------------------------------------------------------------------ */

async function modifyTicketAccess(interaction, action) {
  assertGuildInteraction(interaction, [PermissionFlagsBits.ManageChannels]);

  const channel = interaction.channel;
  if (!channel?.isTextBased() || !channel.name.match(/^tic?ket-\d+$/i)) {
    throw new BotError("Command ini hanya bisa dipakai di dalam channel tiket.");
  }

  if (!isTicketStaff(interaction, getSettings(interaction.guild.id))) {
    throw new BotError("Hanya staff yang bisa mengubah akses tiket.");
  }

  const user = interaction.options.getUser("user", true);
  if (user.id === interaction.client.user.id) throw new BotError("Aku sudah punya akses ke tiket ini.");

  if (action === "add") {
    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
    });
  } else {
    await channel.permissionOverwrites.delete(user.id, `Dihapus dari tiket oleh ${interaction.user.tag}`);
  }

  await interaction.reply({
    embeds: [ok(`${user} ${action === "add" ? "ditambahkan ke" : "dihapus dari"} tiket ini.`)],
    flags: MessageFlags.Ephemeral,
  });
}

/* ------------------------------------------------------------------ */
/* Handler tombol                                                      */
/* ------------------------------------------------------------------ */

export async function handleTicketComponent(interaction) {
  const [, action] = interaction.customId.split(":");

  if (action === "open") {
    await openTicket(interaction);
    return;
  }

  if (action === "close") {
    await closeTicket(interaction);
  }
}
