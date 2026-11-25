import {
  ActionRowBuilder,
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { buildEmbed, COLORS, fail, ok } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { assertGuildInteraction, assertMemberPermissions } from "../../lib/guards.js";
import { logger } from "../../lib/logger.js";

const PANEL_ID = "rolepanel:toggle";
const MAX_ROLES = 25;

export default {
  data: new SlashCommandBuilder()
    .setName("rolepanel")
    .setDescription("Panel untuk member mengambil atau melepas role sendiri")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Kirim panel role ke sebuah channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel tempat panel dikirim")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("roles")
            .setDescription("Daftar role (mention/ID), pisahkan dengan koma atau spasi")
            .setRequired(true)
            .setMaxLength(1000),
        )
        .addStringOption((option) =>
          option.setName("judul").setDescription("Judul panel").setMaxLength(256),
        )
        .addStringOption((option) =>
          option.setName("deskripsi").setDescription("Deskripsi panel").setMaxLength(2000),
        ),
    ),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "create") await createPanel(interaction);
  },
};

async function createPanel(interaction) {
  assertMemberPermissions(interaction, [PermissionFlagsBits.ManageRoles]);
  const me = assertGuildInteraction(interaction, [
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ]);

  const channel = interaction.options.getChannel("channel", true);
  if (!channel.isTextBased()) throw new BotError("Channel panel harus berupa channel teks.");

  if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    throw new BotError(`Aku butuh izin **Send Messages** dan **Embed Links** di <#${channel.id}>.`);
  }

  const roles = parseRoleList(interaction.guild, interaction.options.getString("roles", true));
  if (!roles.length) throw new BotError("Tidak ada role valid yang bisa ditambahkan ke panel.");
  if (roles.length > MAX_ROLES) throw new BotError(`Maksimal ${MAX_ROLES} role dalam satu panel.`);

  const highestPosition = me.roles.highest.position;
  for (const role of roles) {
    if (role.id === interaction.guild.roles.everyone.id) {
      throw new BotError("Role @everyone tidak bisa dimasukkan ke panel.");
    }
    if (role.managed) {
      throw new BotError(`Role **${role.name}** dikelola bot/integrasi, jadi tidak bisa dipakai di panel.`);
    }
    if (role.position >= highestPosition) {
      throw new BotError(`Role **${role.name}** lebih tinggi dari role-ku, jadi tidak bisa kuberikan.`);
    }
  }

  const title = interaction.options.getString("judul")?.trim() || "Pilih Role";
  const description =
    interaction.options.getString("deskripsi")?.trim() ||
    "Pilih role yang kamu inginkan dari menu di bawah.\nPilih role yang sama lagi untuk melepasnya.";

  const embed = buildEmbed({
    title,
    description,
    color: COLORS.info,
    footer: `${roles.length} role tersedia • Panel role otomatis`,
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(PANEL_ID)
    .setPlaceholder("Pilih role...")
    .setMinValues(1)
    .setMaxValues(roles.length)
    .addOptions(
      roles.map((role) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(role.name.slice(0, 100))
          .setValue(role.id)
          .setDescription(`Role • ${role.id}`.slice(0, 100)),
      ),
    );

  const sent = await channel.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
  });

  await interaction.reply({
    embeds: [
      ok(`Panel role dikirim ke <#${channel.id}>.`, "Panel Role Dibuat").addFields({
        name: "Detail",
        value: [
          `Panel: [buka pesan](${sent.url})`,
          `Jumlah role: **${roles.length}**`,
          "Cara pakai: pilih role di menu. Pilih role yang sama lagi untuk melepasnya.",
        ].join("\n"),
      }),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

function parseRoleList(guild, input) {
  const tokens = input
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const roles = [];
  const missing = [];

  for (const token of tokens) {
    const idMatch = /^<@&(\d{15,25})>$/.exec(token) ?? /^(\d{15,25})$/.exec(token);
    const role = idMatch
      ? guild.roles.cache.get(idMatch[1])
      : guild.roles.cache.find((candidate) => candidate.name.toLowerCase() === token.toLowerCase());

    if (!role) {
      missing.push(token);
      continue;
    }
    if (!roles.some((existing) => existing.id === role.id)) roles.push(role);
  }

  if (missing.length) {
    throw new BotError(
      `Role tidak ditemukan: ${missing.map((token) => `\`${token}\``).join(", ")}. ` +
        "Sebut role dengan mention agar nama yang mengandung spasi tetap terbaca.",
    );
  }

  return roles;
}

/* ------------------------------------------------------------------ */
/* Handler select menu                                                 */
/* ------------------------------------------------------------------ */

export async function handleRolePanelComponent(interaction) {
  const [, action] = interaction.customId.split(":");
  if (action !== "toggle") return;

  const guild = interaction.guild;
  const me = guild?.members?.me;
  if (!me) {
    await interaction
      .reply({ content: "Aku tidak berada di server ini.", flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const panelRoleIds = roleIdsFromPanel(interaction);
  const selected = interaction.values.filter((roleId) => panelRoleIds.has(roleId));

  const added = [];
  const removed = [];
  const failed = [];

  for (const roleId of selected) {
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      failed.push("role tidak ditemukan");
      continue;
    }
    if (role.position >= me.roles.highest.position) {
      failed.push(role.name);
      continue;
    }

    try {
      if (interaction.member.roles.cache.has(roleId)) {
        await interaction.member.roles.remove(role, `Panel role oleh ${interaction.user.tag}`);
        removed.push(role.name);
      } else {
        await interaction.member.roles.add(role, `Panel role oleh ${interaction.user.tag}`);
        added.push(role.name);
      }
    } catch (error) {
      logger.warn(`Gagal mengubah role ${role.name} untuk ${interaction.user.tag}:`, error.message);
      failed.push(role.name);
    }
  }

  const lines = [];
  if (added.length) lines.push(`✅ Ditambahkan: ${added.join(", ")}`);
  if (removed.length) lines.push(`➖ Dilepas: ${removed.join(", ")}`);
  if (failed.length) lines.push(`⚠️ Gagal: ${failed.join(", ")}`);

  const nothingChanged = !added.length && !removed.length;
  const embed = nothingChanged
    ? fail(lines.join("\n") || "Tidak ada role yang berubah.", "Gagal Mengubah Role")
    : ok(lines.join("\n"), "Role Diperbarui");

  await interaction.editReply({ embeds: [embed] }).catch(() => {});
}

function roleIdsFromPanel(interaction) {
  const fromComponent = interaction.component?.options?.map((option) => option.value);
  if (fromComponent?.length) return new Set(fromComponent);

  const menu = interaction.message.components
    .flatMap((row) => row.components)
    .find((component) => component.customId === PANEL_ID);

  return new Set(menu?.options?.map((option) => option.value) ?? []);
}
