import "dotenv/config";

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  token: process.env.DISCORD_TOKEN?.trim() ?? "",
  clientId: process.env.DISCORD_CLIENT_ID?.trim() ?? "",
  guildId: process.env.DISCORD_GUILD_ID?.trim() || null,
  ownerIds: list(process.env.OWNER_IDS),
  defaultVolume: Math.min(100, Math.max(0, num(process.env.MUSIC_VOLUME, 80))),
  // MUSIC_MAX_QUEUE = 0 (atau tidak diisi) berarti antrean tanpa batas.
  maxQueueSize: (() => {
    const raw = process.env.MUSIC_MAX_QUEUE?.trim().split(/\s+/)[0] ?? "";
    if (!raw) return Infinity;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return Infinity;
    return Math.max(1, Math.floor(parsed));
  })(),
  embedColor: num(process.env.EMBED_COLOR, 0x5865f2),
  messageContentIntent: String(process.env.MESSAGE_CONTENT_INTENT ?? "").toLowerCase() === "true",
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET?.trim() ?? "",
  },
  youtube: {
    cookiesFile: process.env.YT_COOKIES_FILE?.trim() ?? "",
    extractorArgs: process.env.YT_EXTRACTOR_ARGS?.trim() ?? "",
    proxy: process.env.YTDLP_PROXY?.trim() ?? "",
    // Player client alternatif yang dicoba bila client utama ditolak YouTube.
    playerClients: list(process.env.YT_PLAYER_CLIENTS).length
      ? list(process.env.YT_PLAYER_CLIENTS)
      : ["web_embedded", "web_safari", "mweb", "android_vr", "ios", "tv_downgraded"],
  },
};

/** Daftar masalah konfigurasi yang harus diperbaiki sebelum bot dijalankan. */
export function validateConfig() {
  const problems = [];

  if (!config.token) problems.push("DISCORD_TOKEN belum diisi di file .env");
  else if (config.token.split(".").length !== 3) {
    problems.push("DISCORD_TOKEN formatnya tidak valid (harus berupa token bot, bukan client secret)");
  }

  if (!config.clientId) problems.push("DISCORD_CLIENT_ID belum diisi di file .env");
  else if (!/^\d{15,25}$/.test(config.clientId)) {
    problems.push("DISCORD_CLIENT_ID harus berupa angka (Application ID)");
  }

  if (config.guildId && !/^\d{15,25}$/.test(config.guildId)) {
    problems.push("DISCORD_GUILD_ID harus berupa angka (ID server), atau kosongkan");
  }

  const hasSpotifyId = Boolean(config.spotify.clientId);
  const hasSpotifySecret = Boolean(config.spotify.clientSecret);
  if (hasSpotifyId !== hasSpotifySecret) {
    problems.push("SPOTIFY_CLIENT_ID dan SPOTIFY_CLIENT_SECRET harus diisi keduanya, atau kosongkan keduanya");
  }

  return problems;
}

export function isOwner(userId) {
  return config.ownerIds.includes(userId);
}
