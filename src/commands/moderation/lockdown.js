import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { buildEmbed, COLORS, ok } from "../../lib/embeds.js";
import { BotError } from "../../lib/errors.js";
import { discordTimestamp } from "../../lib/duration.js";
import { assertGuildInteraction } from "../../lib/guards.js";
import {
  addLockdown,
  getLockdown,
  listLockdowns,
  removeLockdown,
} from "../../lib/lockdowns.js";
import { logModeration } from "../../lib/modActions.js";

const TEXT_PERMISSIONS = [
  "SendMessages",
  "AddReactions",
  "CreatePublicThreads",
  "CreatePrivateThreads",
  "SendMessagesInThreads",
];
const VOICE_PERMISSIONS = ["Speak", "Stream"];

export default {
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Kunci atau buka channel dari aktivitas member")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Kunci sebuah channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel yang dikunci (default: channel ini)")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.GuildForum,
              ChannelType.GuildVoice,
              ChannelType.GuildStageVoice,
            ),
        )
        .addStringOption((option) => option.setName("alasan").setDescription("Alasan lockdown").setMaxLength(512)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("end")
        .setDescription("Buka kunci channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel yang dibuka (default: channel ini)")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.GuildForum,
              ChannelType.GuildVoice,
              ChannelType.GuildStageVoice,
            ),
        )
        .addStringOption((option) => option.setName("alasan").setDescription("Alasan membuka lockdown").setMaxLength(512)),
    )
    .addSubcommand((sub) => sub.setName("status").setDescription("Lihat channel yang sedang dikunci")),

  async execute(interaction) {
    assertGuildInteraction(interaction);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "start") return startLockdown(interaction);
    if (subcommand === "end") return endLockdown(interaction);
    return showStatus(interaction);
  },
};

async function startLockdown(interaction) {
  const me = assertGuildInteraction(interaction, [PermissionFlagsBits.ManageChannels]);
  const channel = resolveChannel(interaction);
  const reason = interaction.options.getString("alasan")?.trim() || `Lockdown oleh ${interaction.user.tag}`;

  if (channel.isThread()) throw new BotError("Lockdown tidak bisa dipakai di dalam thread.");
  if (!channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) {
    throw new BotError(`Aku butuh izin **Manage Channels** di <#${channel.id}>.`);
  }
  if (await getLockdown(interaction.guild.id, channel.id)) {
    throw new BotError(`<#${channel.id}> sudah dalam keadaan lockdown.`);
  }

  const permissions = permissionNames(channel);
  const everyone = interaction.guild.roles.everyone;
  const previous = capturePrevious(channel, everyone.id, permissions);

  await channel.permissionOverwrites.edit(
    everyone,
    Object.fromEntries(permissions.map((name) => [name, false])),
    reason,
  );

  await addLockdown({
    guildId: interaction.guild.id,
    channelId: channel.id,
    previous,
    lockedBy: interaction.user.id,
  });

  await logModeration(interaction.guild, {
    action: "lockdown",
    targetId: channel.id,
    targetTag: `#${channel.name}`,
    targetLabel: `<#${channel.id}>`,
    moderator: interaction.user,
    reason,
    color: COLORS.warning,
    fields: [{ name: "Channel", value: `<#${channel.id}>`, inline: true }],
  });

  await interaction.reply({
    embeds: [
      ok(
        `<#${channel.id}> berhasil dikunci. Member tidak bisa mengirim pesan sampai lockdown dibuka.`,
        "Lockdown Aktif",
      ),
    ],
  });
}

async function endLockdown(interaction) {
  const me = assertGuildInteraction(interaction, [PermissionFlagsBits.ManageChannels]);
  const channel = resolveChannel(interaction);
  const reason = interaction.options.getString("alasan")?.trim() || `Lockdown dibuka oleh ${interaction.user.tag}`;

  if (channel.isThread()) throw new BotError("Lockdown tidak bisa dipakai di dalam thread.");
  if (!channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) {
    throw new BotError(`Aku butuh izin **Manage Channels** di <#${channel.id}>.`);
  }

  const lock = await getLockdown(interaction.guild.id, channel.id);
  if (!lock) throw new BotError(`<#${channel.id}> tidak sedang dalam keadaan lockdown.`);

  await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, lock.previous, reason);
  await removeLockdown(interaction.guild.id, channel.id);

  await logModeration(interaction.guild, {
    action: "unlockdown",
    targetId: channel.id,
    targetTag: `#${channel.name}`,
    targetLabel: `<#${channel.id}>`,
    moderator: interaction.user,
    reason,
    color: COLORS.success,
    fields: [{ name: "Channel", value: `<#${channel.id}>`, inline: true }],
  });

  await interaction.reply({
    embeds: [ok(`Lockdown <#${channel.id}> dibuka kembali.`, "Lockdown Dibuka")],
  });
}

async function showStatus(interaction) {
  const locks = await listLockdowns(interaction.guild.id);

  if (!locks.length) {
    await interaction.reply({
      embeds: [buildEmbed({ title: "Lockdown", description: "Tidak ada channel yang sedang dikunci.", color: COLORS.success })],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const description = locks
    .map(
      (lock) =>
        `<#${lock.channelId}> • ${discordTimestamp(lock.lockedAt)} • oleh <@${lock.lockedBy}>`,
    )
    .join("\n");

  await interaction.reply({
    embeds: [
      buildEmbed({
        title: "Channel Terkunci",
        description,
        color: COLORS.warning,
        footer: `${locks.length} channel dalam lockdown`,
      }),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

function resolveChannel(interaction) {
  const channel = interaction.options.getChannel("channel") ?? interaction.channel;
  if (!channel?.isTextBased?.() && !channel?.isVoiceBased?.()) {
    throw new BotError("Channel tersebut tidak mendukung lockdown.");
  }
  return channel;
}

function permissionNames(channel) {
  return channel.isVoiceBased() ? VOICE_PERMISSIONS : TEXT_PERMISSIONS;
}

function capturePrevious(channel, everyoneId, permissions) {
  const overwrite = channel.permissionOverwrites.cache.get(everyoneId);
  const previous = {};

  for (const name of permissions) {
    const bit = PermissionFlagsBits[name];
    previous[name] = overwrite ? (overwrite.allow.has(bit) ? true : overwrite.deny.has(bit) ? false : null) : null;
  }

  return previous;
}
