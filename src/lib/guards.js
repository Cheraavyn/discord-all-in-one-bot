import { PermissionFlagsBits } from "discord.js";
import { isOwner } from "../config.js";
import { BotError } from "./errors.js";

/**
 * Memastikan interaksi berasal dari server dan bot punya izin yang dibutuhkan.
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {bigint[]} botPermissions
 */
export function assertGuildInteraction(interaction, botPermissions = []) {
  if (!interaction.inGuild()) {
    throw new BotError("Command ini hanya bisa dipakai di dalam server.");
  }

  const me = interaction.guild.members.me;
  if (!me) throw new BotError("Aku tidak berada di server ini.");

  if (botPermissions.length) {
    const missing = botPermissions.filter((permission) => !me.permissions.has(permission));
    if (missing.length) {
      const names = missing.map((permission) => permissionName(permission)).join(", ");
      throw new BotError(`Aku butuh izin berikut untuk menjalankan command ini: **${names}**.`);
    }
  }

  return me;
}

const PERMISSION_NAMES = {
  [PermissionFlagsBits.Administrator]: "Administrator",
  [PermissionFlagsBits.ManageGuild]: "Manage Server",
  [PermissionFlagsBits.ManageChannels]: "Manage Channels",
  [PermissionFlagsBits.ManageRoles]: "Manage Roles",
  [PermissionFlagsBits.ManageMessages]: "Manage Messages",
  [PermissionFlagsBits.KickMembers]: "Kick Members",
  [PermissionFlagsBits.BanMembers]: "Ban Members",
  [PermissionFlagsBits.ModerateMembers]: "Moderate Members",
  [PermissionFlagsBits.Connect]: "Connect",
  [PermissionFlagsBits.Speak]: "Speak",
  [PermissionFlagsBits.ViewChannel]: "View Channel",
  [PermissionFlagsBits.SendMessages]: "Send Messages",
  [PermissionFlagsBits.ReadMessageHistory]: "Read Message History",
  [PermissionFlagsBits.AttachFiles]: "Attach Files",
  [PermissionFlagsBits.EmbedLinks]: "Embed Links",
};

export function permissionName(permission) {
  return PERMISSION_NAMES[permission] ?? "tidak diketahui";
}

/** Memastikan user yang memakai command punya izin tertentu. */
export function assertMemberPermissions(interaction, permissions) {
  const missing = permissions.filter((permission) => !interaction.memberPermissions?.has(permission));
  if (missing.length) {
    throw new BotError(`Kamu butuh izin: **${missing.map((permission) => permissionName(permission)).join(", ")}**.`);
  }
}

/**
 * Memeriksa apakah member bisa dimoderasi (hierarki role & kepemilikan server).
 * @returns {Promise<import("discord.js").GuildMember|null>} member target, atau null bila tidak bisa.
 */
export async function assertModeratable(interaction, targetUser) {
  const guild = interaction.guild;

  if (targetUser.id === interaction.user.id) {
    throw new BotError("Kamu tidak bisa menargetkan dirimu sendiri.");
  }
  if (targetUser.id === interaction.client.user.id) {
    throw new BotError("Aku tidak bisa menargetkan diriku sendiri.");
  }
  if (targetUser.id === guild.ownerId) {
    throw new BotError("Owner server tidak bisa dimoderasi.");
  }

  const target = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!target) throw new BotError("User tersebut tidak ditemukan di server ini.");

  const me = guild.members.me;
  if (target.roles.highest.position >= me.roles.highest.position) {
    throw new BotError(`Role **${target.roles.highest.name}** lebih tinggi dari role-ku, jadi aku tidak bisa memoderasi user ini.`);
  }

  if (!isOwner(interaction.user.id) && target.roles.highest.position >= interaction.member.roles.highest.position) {
    throw new BotError("Kamu tidak bisa memoderasi user dengan role yang setara atau lebih tinggi darimu.");
  }

  return target;
}

/** Cek apakah user adalah staff (punya ManageChannels/Administrator) atau owner bot. */
export function isStaff(member) {
  if (!member) return false;
  if (isOwner(member.id)) return true;
  return member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    member.permissions.has(PermissionFlagsBits.Administrator);
}

export function truncate(text, max = 1024) {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
