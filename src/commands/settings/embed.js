import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  InteractionContextType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { buildEmbed, COLORS, info, ok } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction, assertMemberPermissions, truncate } from "../../lib/guards.js";
import { logger } from "../../lib/logger.js";
import {
  DEFAULT_COLORS,
  DEFAULT_MESSAGES,
  KIND_LABELS,
  KINDS,
  PLACEHOLDER_HELP,
  configFor,
  renderMemberMessage,
} from "../../lib/memberMessages.js";
import { getSettings, updateSettings } from "../../lib/settings.js";

const EDIT_FIELDS = {
  content: {
    label: "Pesan Teks di Luar Embed",
    modalTitle: "Pesan Teks",
    max: 2000,
    style: TextInputStyle.Paragraph,
    placeholder: "Contoh: {user} — kosongkan untuk tanpa teks",
  },
  title: {
    label: "Judul Embed",
    modalTitle: "Judul",
    max: 256,
    placeholder: "Kosongkan untuk tanpa judul",
  },
  description: {
    label: "Deskripsi Embed",
    modalTitle: "Deskripsi",
    max: 4000,
    style: TextInputStyle.Paragraph,
    placeholder: "Gunakan placeholder {user}, {server}, {memberCount}, dll.",
  },
  color: {
    label: "Warna Embed (Hex)",
    modalTitle: "Warna",
    max: 8,
    placeholder: "#2ECC71 — kosongkan untuk warna default",
  },
  imageUrl: {
    label: "URL Gambar / GIF",
    modalTitle: "Gambar / GIF",
    max: 1000,
    placeholder: "https://... atau {avatar} / {serverIcon}",
  },
  thumbnailUrl: {
    label: "URL Thumbnail",
    modalTitle: "Thumbnail",
    max: 1000,
    placeholder: "https://... atau {avatar}",
  },
  footer: {
    label: "Footer Embed",
    modalTitle: "Footer",
    max: 2048,
    placeholder: "Teks kecil di bawah embed",
  },
};

const MENU_OPTIONS = [
  ["content", "Pesan teks (di luar embed)", "💬"],
  ["title", "Judul embed", "🏷️"],
  ["description", "Deskripsi embed", "📄"],
  ["color", "Warna embed", "🎨"],
  ["imageUrl", "Gambar / GIF (URL)", "🖼️"],
  ["thumbnailUrl", "Thumbnail (URL)", "🔻"],
  ["footer", "Footer embed", "📌"],
];

export default {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Atur embed greeting & goodbye langsung dari Discord")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("greeting").setDescription("Buka editor embed member join (greeting)"))
    .addSubcommand((sub) => sub.setName("goodbye").setDescription("Buka editor embed member leave (goodbye)"))
    .addSubcommand((sub) =>
      sub
        .setName("test")
        .setDescription("Kirim contoh embed ke channel pengaturan")
        .addStringOption((option) =>
          option
            .setName("jenis")
            .setDescription("Jenis embed yang dites")
            .setRequired(true)
            .addChoices({ name: "Greeting", value: "greeting" }, { name: "Goodbye", value: "goodbye" }),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("Kembalikan embed ke pengaturan default")
        .addStringOption((option) =>
          option
            .setName("jenis")
            .setDescription("Jenis embed yang direset")
            .setRequired(true)
            .addChoices({ name: "Greeting", value: "greeting" }, { name: "Goodbye", value: "goodbye" }),
        ),
    ),

  async execute(interaction) {
    assertMemberPermissions(interaction, [PermissionFlagsBits.ManageGuild]);
    assertGuildInteraction(interaction);

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "greeting" || subcommand === "goodbye") {
      await interaction.reply({ ...panelPayload(interaction, subcommand), flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "test") {
      await sendTest(interaction, interaction.options.getString("jenis", true));
      return;
    }

    const kind = interaction.options.getString("jenis", true);
    updateSettings(interaction.guild.id, { [kind]: structuredClone(DEFAULT_MESSAGES[kind]) });
    await interaction.reply({
      embeds: [ok(`Embed **${KIND_LABELS[kind]}** dikembalikan ke pengaturan default.`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};

/* ------------------------------------------------------------------ */
/* Panel editor                                                        */
/* ------------------------------------------------------------------ */

function colorLabel(kind, cfg) {
  const color = Number.isInteger(cfg.color) ? cfg.color : DEFAULT_COLORS[kind];
  const hex = `#${color.toString(16).padStart(6, "0").toUpperCase()}`;
  return Number.isInteger(cfg.color) ? hex : `${hex} (default)`;
}

function panelPayload(interaction, kind) {
  const settings = getSettings(interaction.guild.id);
  const cfg = configFor(settings, kind);
  const preview = renderMemberMessage(kind, interaction.member, cfg);

  const editorEmbed = buildEmbed({
    title: `Editor ${KIND_LABELS[kind]}`,
    description:
      "Pilih menu di bawah untuk mengubah isi embed. Semua perubahan **langsung tersimpan** dan pratinjau di bawah ikut diperbarui.",
    color: COLORS.info,
    fields: [
      { name: "Status", value: cfg.enabled ? "✅ Aktif" : "⛔ Nonaktif", inline: true },
      { name: "Channel", value: cfg.channelId ? `<#${cfg.channelId}>` : "Belum diatur", inline: true },
      { name: "Warna", value: colorLabel(kind, cfg), inline: true },
      { name: "Pesan Teks", value: truncate(cfg.content || "—", 200) },
      { name: "Judul", value: truncate(cfg.title || "—", 200) },
      { name: "Deskripsi", value: truncate(cfg.description || "—", 900) },
      { name: "Gambar / GIF", value: truncate(cfg.imageUrl || "—", 300) },
      { name: "Thumbnail", value: truncate(cfg.thumbnailUrl || "—", 300) },
      { name: "Footer", value: truncate(cfg.footer || "—", 300) },
      { name: "Placeholder", value: PLACEHOLDER_HELP },
    ],
    footer: "Editor embed • perubahan tersimpan otomatis",
  });

  const previewEmbed = preview.embed;
  previewEmbed.setAuthor({ name: "Pratinjau" });

  const editMenu = new StringSelectMenuBuilder()
    .setCustomId(`embed:edit:${kind}`)
    .setPlaceholder("Pilih bagian embed yang ingin diubah")
    .addOptions(
      MENU_OPTIONS.map(([value, label, emoji]) =>
        new StringSelectMenuOptionBuilder().setValue(value).setLabel(label).setEmoji(emoji),
      ),
    );

  const channelMenu = new ChannelSelectMenuBuilder()
    .setCustomId(`embed:channel:${kind}`)
    .setPlaceholder("Pilih channel pengiriman")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`embed:toggle:${kind}`)
      .setLabel(cfg.enabled ? "Matikan" : "Aktifkan")
      .setEmoji(cfg.enabled ? "⛔" : "✅")
      .setStyle(cfg.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`embed:test:${kind}`)
      .setLabel("Kirim Test")
      .setEmoji("📨")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("embed:close").setLabel("Tutup").setStyle(ButtonStyle.Danger),
  );

  return {
    embeds: [editorEmbed, previewEmbed],
    components: [
      new ActionRowBuilder().addComponents(editMenu),
      new ActionRowBuilder().addComponents(channelMenu),
      buttons,
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Aksi tombol, select, dan modal                                      */
/* ------------------------------------------------------------------ */

function showFieldModal(interaction, kind, field) {
  const meta = EDIT_FIELDS[field];
  if (!meta) return;

  const cfg = configFor(getSettings(interaction.guild.id), kind);
  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(meta.label)
    .setStyle(meta.style ?? TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(meta.max)
    .setPlaceholder(meta.placeholder);

  const current = cfg[field];
  if (current !== null && current !== undefined && String(current).length) {
    input.setValue(String(current));
  }

  const modal = new ModalBuilder()
    .setCustomId(`embed:modal:${kind}:${field}`)
    .setTitle(truncate(meta.modalTitle, 45))
    .addComponents(new ActionRowBuilder().addComponents(input));

  return interaction.showModal(modal);
}

async function saveField(interaction, kind, field) {
  const meta = EDIT_FIELDS[field];
  if (!meta) throw new BotError("Bagian embed tersebut tidak dikenali.");

  const raw = interaction.fields.getTextInputValue("value").trim();
  const patch = {};

  if (field === "color") {
    if (!raw) {
      patch.color = null;
    } else {
      const hex = raw.replace(/^#/, "").replace(/^0x/i, "");
      if (!/^[0-9a-f]{6}$/i.test(hex)) {
        throw new BotError("Warna tidak valid. Gunakan format hex 6 digit, contoh: `#2ECC71` atau `2ecc71`.");
      }
      patch.color = Number.parseInt(hex, 16);
    }
  } else if (field === "imageUrl" || field === "thumbnailUrl") {
    if (!raw) {
      patch[field] = null;
    } else if (
      !/^https?:\/\//i.test(raw) &&
      !raw.includes("{avatar}") &&
      !raw.includes("{serverIcon}")
    ) {
      throw new BotError(
        "URL gambar harus diawali `http://` atau `https://` (link langsung ke file gambar/GIF), atau gunakan `{avatar}` / `{serverIcon}`.",
      );
    } else {
      patch[field] = raw;
    }
  } else if (field === "content") {
    patch.content = raw;
  } else {
    patch[field] = raw || null;
  }

  updateSettings(interaction.guild.id, { [kind]: patch });

  await interaction.deferUpdate();
  await interaction.editReply(panelPayload(interaction, kind));
}

async function handleChannelSelect(interaction, kind) {
  const channelId = interaction.values[0];
  const channel = interaction.guild.channels.cache.get(channelId);

  if (!channel?.isTextBased()) throw new BotError("Channel tersebut tidak bisa dipakai untuk mengirim embed.");

  const permissions = channel.permissionsFor(interaction.guild.members.me);
  if (
    !permissions?.has(PermissionFlagsBits.ViewChannel) ||
    !permissions.has(PermissionFlagsBits.SendMessages) ||
    !permissions.has(PermissionFlagsBits.EmbedLinks)
  ) {
    throw new BotError(`Aku butuh izin **View Channel**, **Send Messages**, dan **Embed Links** di ${channel}.`);
  }

  updateSettings(interaction.guild.id, { [kind]: { channelId, enabled: true } });
  await interaction.update(panelPayload(interaction, kind));
}

async function toggleKind(interaction, kind) {
  const cfg = configFor(getSettings(interaction.guild.id), kind);

  if (!cfg.enabled && !cfg.channelId) {
    throw new BotError("Pilih channel pengiriman dulu sebelum mengaktifkan embed ini.");
  }

  updateSettings(interaction.guild.id, { [kind]: { enabled: !cfg.enabled } });
  await interaction.update(panelPayload(interaction, kind));
}

async function sendTest(interaction, kind) {
  assertGuildInteraction(interaction);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const cfg = configFor(getSettings(interaction.guild.id), kind);
  const target = (cfg.channelId && interaction.guild.channels.cache.get(cfg.channelId)) || interaction.channel;

  if (!target?.isTextBased()) throw new BotError("Channel pengiriman belum diatur dan channel ini tidak bisa dipakai.");

  const permissions = target.permissionsFor(interaction.guild.members.me);
  if (!permissions?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    throw new BotError(`Aku butuh izin **Send Messages** dan **Embed Links** di ${target}.`);
  }

  const { content, embed } = renderMemberMessage(kind, interaction.member, cfg);

  await target.send({ content: content || undefined, embeds: [embed] });
  await interaction.editReply({
    embeds: [ok(`Contoh embed **${KIND_LABELS[kind]}** dikirim ke ${target}.`)],
  });
}

export async function handleEmbedComponent(interaction) {
  const [, action, kind, field] = interaction.customId.split(":");

  if (action === "close") {
    assertMemberPermissions(interaction, [PermissionFlagsBits.ManageGuild]);
    await interaction.update({
      embeds: [info("Editor embed ditutup. Jalankan `/embed greeting` atau `/embed goodbye` untuk membukanya lagi.")],
      components: [],
    });
    return;
  }

  if (!KINDS.includes(kind)) return;

  assertMemberPermissions(interaction, [PermissionFlagsBits.ManageGuild]);
  assertGuildInteraction(interaction);

  if (interaction.isStringSelectMenu() && action === "edit") {
    await showFieldModal(interaction, kind, interaction.values[0]);
    return;
  }

  if (interaction.isChannelSelectMenu() && action === "channel") {
    await handleChannelSelect(interaction, kind);
    return;
  }

  if (interaction.isModalSubmit() && action === "modal") {
    await saveField(interaction, kind, field);
    return;
  }

  if (interaction.isButton()) {
    if (action === "toggle") {
      await toggleKind(interaction, kind);
      return;
    }
    if (action === "test") {
      await sendTest(interaction, kind);
      return;
    }
  }

  logger.debug(`Aksi embed tidak dikenali: ${interaction.customId}`);
}
