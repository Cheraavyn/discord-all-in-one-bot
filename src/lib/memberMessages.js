import { buildEmbed, COLORS } from "./embeds.js";

/** Konfigurasi default untuk pesan member join & leave. */
export const DEFAULT_MESSAGES = {
  greeting: {
    enabled: false,
    channelId: null,
    content: "",
    title: "Selamat Datang!",
    description:
      "Halo {user}, selamat datang di **{server}**!\nKamu adalah member ke-**{memberCount}**. Semoga betah! 🎉",
    color: null,
    imageUrl: null,
    thumbnailUrl: "{avatar}",
    footer: "{server}",
  },
  goodbye: {
    enabled: false,
    channelId: null,
    content: "",
    title: "Sampai Jumpa",
    description: "**{username}** telah meninggalkan **{server}**. Sampai jumpa lagi! 👋",
    color: null,
    imageUrl: null,
    thumbnailUrl: "{avatar}",
    footer: "{server} • {memberCount} member",
  },
};

export const KINDS = ["greeting", "goodbye"];

export const KIND_LABELS = {
  greeting: "Greeting (Member Join)",
  goodbye: "Goodbye (Member Leave)",
};

export const DEFAULT_COLORS = {
  greeting: COLORS.success,
  goodbye: COLORS.error,
};

export const PLACEHOLDER_HELP = [
  "`{user}` — mention member",
  "`{username}` — username",
  "`{displayName}` — nama tampilan di server",
  "`{server}` — nama server",
  "`{memberCount}` — jumlah member",
  "`{createdAt}` — umur akun Discord",
  "`{joinedAt}` — kapan member join",
  "`{avatar}` — URL avatar (khusus gambar/thumbnail)",
  "`{serverIcon}` — URL icon server (khusus gambar/thumbnail)",
].join("\n");

function replaceText(text, member) {
  const map = {
    "{user}": `<@${member.id}>`,
    "{username}": member.user.username,
    "{displayName}": member.displayName ?? member.user.username,
    "{server}": member.guild.name,
    "{memberCount}": String(member.guild.memberCount),
    "{createdAt}": member.user.createdTimestamp
      ? `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`
      : "-",
    "{joinedAt}": member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "-",
  };

  return Object.entries(map).reduce(
    (result, [placeholder, value]) => result.split(placeholder).join(value),
    String(text),
  );
}

function resolveUrl(value, member) {
  if (!value) return null;

  const resolved = String(value)
    .split("{avatar}")
    .join(member.user.displayAvatarURL({ size: 1024, extension: "png" }))
    .split("{serverIcon}")
    .join(member.guild.iconURL({ size: 1024, extension: "png" }) ?? "");

  return /^https?:\/\//i.test(resolved) ? resolved : null;
}

export function configFor(settings, kind) {
  return { ...DEFAULT_MESSAGES[kind], ...(settings?.[kind] ?? {}) };
}

/**
 * Merender konfigurasi greeting/goodbye menjadi payload siap kirim.
 * @returns {{ content: string, embed: import("discord.js").EmbedBuilder }}
 */
export function renderMemberMessage(kind, member, config) {
  const cfg = configFor({ [kind]: config }, kind);

  const embed = buildEmbed({
    title: cfg.title ? replaceText(cfg.title, member) : null,
    description: cfg.description ? replaceText(cfg.description, member) : null,
    color: Number.isInteger(cfg.color) ? cfg.color : DEFAULT_COLORS[kind],
    thumbnail: resolveUrl(cfg.thumbnailUrl, member),
    image: resolveUrl(cfg.imageUrl, member),
    footer: cfg.footer ? replaceText(cfg.footer, member) : null,
  });

  return {
    content: cfg.content ? replaceText(cfg.content, member) : "",
    embed,
  };
}
