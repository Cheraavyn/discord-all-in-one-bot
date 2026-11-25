import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import ffmpegPath from "ffmpeg-static";
import youtubedl from "youtube-dl-exec";
import { config } from "../config.js";
import { MessageFlags } from "discord.js";
import { music as musicEmbed } from "../lib/embeds.js";
import { BotError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { getSettings, updateSettings } from "../lib/settings.js";
import { formatTimestamp } from "../lib/duration.js";
import { parseSpotifyLink, resolveSpotify } from "./spotify.js";

/**
 * yt-dlp membaca proxy dari environment (HTTP_PROXY/HTTPS_PROXY/ALL_PROXY dan
 * versi huruf kecil) walaupun bot tidak mengaturnya. Panel hosting kadang
 * menyuntik nilai placeholder seperti `http://host:PORT`, yang membuat yt-dlp
 * gagal dengan "nonnumeric port: 'PORT'". Buang nilai yang rusak agar yt-dlp
 * memakai koneksi langsung.
 */
const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
];

for (const key of PROXY_ENV_KEYS) {
  const value = process.env[key]?.trim();
  if (!value) continue;

  try {
    new URL(value);
  } catch {
    logger.warn(`Proxy environment ${key} tidak valid — diabaikan.`);
    delete process.env[key];
  }
}

const ytDlpProxy = (() => {
  const value = config.youtube.proxy;
  if (!value) return "";

  try {
    new URL(value);
    return value;
  } catch {
    logger.warn("YTDLP_PROXY tidak valid — diabaikan.");
    return "";
  }
})();

/**
 * yt-dlp selalu menulis ulang cookie file saat process selesai (`save_cookies`),
 * sehingga file harus writable walaupun hanya dipakai untuk dibaca. Di hosting
 * dengan mount read-only (mis. `/home/container`), tulis itu memicu
 * `OSError: [Errno 30] Read-only file system`. Salin cookies ke direktori
 * sementara yang writable saat bot start, lalu pakai salinan itu untuk yt-dlp.
 */
const ytDlpCookiesFile = (() => {
  const source = config.youtube.cookiesFile;
  if (!source) return "";

  if (!existsSync(source)) {
    logger.warn(`YT_COOKIES_FILE tidak ditemukan: ${source}`);
    return "";
  }

  const suffix = createHash("sha1").update(source).digest("hex").slice(0, 8);
  const copyPath = join(tmpdir(), `botopencode-yt-cookies-${suffix}-${process.pid}.txt`);

  try {
    copyFileSync(source, copyPath);
    logger.debug(`Cookies yt-dlp disalin ke path writable: ${copyPath}`);
    return copyPath;
  } catch (error) {
    logger.warn(
      `Gagal menyalin cookies yt-dlp ke ${copyPath}: ${error.message}. ` +
        "yt-dlp akan dijalankan tanpa cookies.",
    );
    return "";
  }
})();

const queues = new Map();
const IDLE_LEAVE_MS = 2 * 60 * 1000;
const EMPTY_CHANNEL_LEAVE_MS = 45 * 1000;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Opsi yt-dlp bersama. `mode` dipakai untuk mencoba strategi alternatif
 * saat YouTube menolak cookies / client tertentu.
 */
function ytDlpOptions(extra = {}, mode = {}) {
  const options = {
    noWarnings: true,
    jsRuntimes: "node",
    // Config yt-dlp lokal bisa menyisipkan --cookies ke path lama yang sudah
    // tidak ada, lalu membuat semua lagu gagal. Abaikan config tersebut.
    ignoreConfig: true,
    ...extra,
  };

  const cookiesFile = mode.cookies === false ? "" : ytDlpCookiesFile;
  const extractorArgs = mode.extractorArgs || config.youtube.extractorArgs;

  if (cookiesFile) options.cookies = cookiesFile;
  if (extractorArgs) options.extractorArgs = extractorArgs;
  if (ytDlpProxy) options.proxy = ytDlpProxy;

  return options;
}

/** Versi argumen CLI dari ytDlpOptions, untuk spawn yt-dlp langsung. */
function ytDlpCliArgs(extra = {}, mode = {}) {
  const flag = (key) => `--${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`;
  const args = [];

  for (const [key, value] of Object.entries(ytDlpOptions(extra, mode))) {
    if (value === true) args.push(flag(key));
    else if (value !== false && value != null) args.push(flag(key), String(value));
  }

  return args;
}

/** Mode yang dicoba berurutan sampai salah satu berhasil. */
const YTDLP_MODES = [
  {}, // utama: cookies + extractor args dari env
  // Workaround bug yt-dlp: client default (tv_downgraded) sering UNPLAYABLE
  // saat memakai cookies. Lihat yt-dlp issue #17389.
  ...(ytDlpCookiesFile
    ? [{ extractorArgs: "youtube:player_client=default,web_embedded" }]
    : []),
  ...config.youtube.playerClients.flatMap((client) => [
    { extractorArgs: `youtube:player_client=${client}` },
    { cookies: false, extractorArgs: `youtube:player_client=${client}` },
  ]),
];

/** Mode yang berhasil saat resolusi didahulukan saat streaming. */
function modesForTrack(track) {
  const preferred = track?.ytdlpMode;
  if (!preferred) return YTDLP_MODES;

  const signature = (mode) => `${mode.cookies === false ? "nocookies" : "cookies"}|${mode.extractorArgs ?? ""}`;
  const preferredSignature = signature(preferred);
  return [preferred, ...YTDLP_MODES.filter((mode) => signature(mode) !== preferredSignature)];
}

function ytDlpErrorDetail(error) {
  return (error?.stderr ?? error?.message ?? String(error)).toString().trim();
}

function lastErrorLine(detail) {
  return (
    String(detail ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) || String(detail ?? "")
  );
}

function isRetryableYtDlpError(detail) {
  return /sign in to confirm|not a bot|login_required|requested format is not available|only images are available|http error [45]\d{2}|unable to extract|n challenge|po token|video unavailable|age-restricted|connection reset|timed ?out|tunnel connection|page needs to be reloaded/i.test(
    detail,
  );
}

/** Jalankan yt-dlp dengan fallback otomatis. Mengembalikan info + mode yang berhasil. */
async function fetchYtDlpInfo(target, extra) {
  let lastError;
  let lastDetail = "";

  for (const mode of YTDLP_MODES) {
    try {
      const info = await youtubedl(target, ytDlpOptions(extra, mode));
      return { info, mode };
    } catch (error) {
      lastError = error;
      lastDetail = ytDlpErrorDetail(error);
      logger.debug(`yt-dlp gagal (${mode.extractorArgs ?? "default"}):`, lastErrorLine(lastDetail));
      if (!isRetryableYtDlpError(lastDetail)) break;
    }
  }

  if (lastError) lastError.ytDlpDetail = lastDetail;
  throw lastError;
}

/** Ambil URL media langsung + header yang dibutuhkan dari hasil dump yt-dlp. */
function mediaFromInfo(info) {
  const entry = Array.isArray(info?.entries) ? info.entries.find(Boolean) : info;
  if (!entry) return null;

  const format =
    entry.requested_downloads?.find((download) => download?.url) ??
    entry.requested_formats?.find((item) => item?.url && item.vcodec === "none") ??
    entry.formats?.find((item) => item?.url && item.acodec !== "none") ??
    null;

  const url = entry.url ?? format?.url ?? null;
  if (!url) return null;

  return {
    url,
    headers: format?.http_headers ?? entry.http_headers ?? null,
  };
}

/** URL yang menunjuk ke kumpulan lagu (playlist/album/channel/artis). */
export function isCollectionUrl(url) {
  const value = String(url ?? "").trim();
  if (!/^https?:\/\//i.test(value)) return false;

  return (
    /youtube\.com\/playlist/i.test(value) ||
    /music\.youtube\.com\/(channel|browse)\//i.test(value) ||
    /youtube\.com\/(?:@|channel\/|c\/|user\/)/i.test(value) ||
    /soundcloud\.com\/[^/?#]+\/sets\//i.test(value) ||
    /^(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/[^/?#]+\/?$/i.test(value)
  );
}

/* ------------------------------------------------------------------ */
/* Resolusi metadata lagu                                              */
/* ------------------------------------------------------------------ */

export async function resolveTrack(query, requester) {
  const target = /^https?:\/\//i.test(query) ? query : `ytsearch1:${query}`;

  let info;
  let mode;
  try {
    ({ info, mode } = await fetchYtDlpInfo(target, {
      dumpSingleJson: true,
      noPlaylist: true,
      skipDownload: true,
      format: "bestaudio/best",
      socketTimeout: 20,
    }));
  } catch (error) {
    const detail = error?.ytDlpDetail ?? ytDlpErrorDetail(error);
    logger.warn("yt-dlp gagal:", lastErrorLine(detail));
    if (process.env.DEBUG) logger.debug("Detail yt-dlp:", detail);

    if (/nonnumeric port|proxy|invalid url/i.test(detail)) {
      throw new BotError(
        "Proxy tidak valid. Hapus/kosongkan `YTDLP_PROXY` dan variabel proxy " +
          "di Environment Variables panel, lalu restart bot.",
      );
    }

    throw new BotError(
      "Lagu tidak ditemukan atau YouTube menolak akses. Coba judul/URL lain, " +
        "atau isi `YT_COOKIES_FILE` di `.env` lalu restart bot.",
    );
  }

  const entry = Array.isArray(info?.entries) ? info.entries[0] : info;
  if (!entry?.title || !(entry.webpage_url ?? entry.url)) {
    throw new BotError("Lagu tidak ditemukan. Coba kata kunci lain.");
  }

  return {
    title: entry.title,
    url: entry.webpage_url ?? entry.url,
    duration: Number(entry.duration) || 0,
    thumbnail: entry.thumbnail ?? entry.thumbnails?.at(-1)?.url ?? null,
    uploader: entry.uploader ?? entry.channel ?? null,
    requestedBy: { id: requester.id, tag: requester.tag },
    ytdlpMode: mode,
    playback: mediaFromInfo(info),
    verified: true,
  };
}

/**
 * Ambil banyak lagu dari playlist/album/channel YouTube atau SoundCloud.
 * Mengembalikan null kalau URL ternyata bukan kumpulan lagu.
 */
async function resolveCollection(url, requester, limit = config.maxQueueSize) {
  let info;
  let mode;
  try {
    const options = {
      dumpSingleJson: true,
      flatPlaylist: true,
      skipDownload: true,
      socketTimeout: 30,
    };
    const effectiveLimit = Math.min(limit, config.maxQueueSize);
    // Tanpa batas: jangan kirim --playlist-end, biar yt-dlp mengambil semua entri.
    if (Number.isFinite(effectiveLimit)) {
      options.playlistEnd = Math.max(1, effectiveLimit);
    }

    ({ info, mode } = await fetchYtDlpInfo(url, options));
  } catch (error) {
    const detail = error?.ytDlpDetail ?? ytDlpErrorDetail(error);
    logger.warn("yt-dlp gagal membaca playlist:", lastErrorLine(detail));
    if (process.env.DEBUG) logger.debug("Detail playlist:", detail);
    return null;
  }

  const entries = Array.isArray(info?.entries) ? info.entries.filter(Boolean) : [];
  if (entries.length < 2) return null;

  const tracks = [];
  for (const entry of entries) {
    const mediaUrl =
      entry.webpage_url ??
      entry.url ??
      (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null);

    if (!entry?.title || !mediaUrl) continue;

    tracks.push({
      title: entry.title,
      url: mediaUrl,
      duration: Number(entry.duration) || 0,
      thumbnail: entry.thumbnail ?? entry.thumbnails?.at(-1)?.url ?? info?.thumbnail ?? null,
      uploader: entry.uploader ?? entry.channel ?? info?.uploader ?? null,
      requestedBy: { id: requester.id, tag: requester.tag },
      ytdlpMode: mode,
    });

    if (Number.isFinite(limit) && tracks.length >= limit) break;
  }

  if (!tracks.length) return null;

  return {
    type: "playlist",
    name: info?.title ?? info?.channel ?? "Daftar Lagu",
    image: info?.thumbnail ?? tracks[0].thumbnail,
    total: entries.length,
    tracks,
  };
}

/**
 * Mengubah input /play menjadi daftar lagu.
 * Link Spotify (lagu/playlist/album/artis) diambil metadatanya lewat Spotify,
 * link playlist/artis YouTube & SoundCloud diambil semua lagunya via yt-dlp,
 * input lain dianggap pencarian/URL lagu tunggal.
 */
export async function resolveInput(query, requester, limit = config.maxQueueSize) {
  const spotify = parseSpotifyLink(query);

  if (spotify) {
    const result = await resolveSpotify(spotify, requester, limit);
    if (!result.tracks.length) {
      throw new BotError("Tidak ada lagu yang bisa diputar dari link Spotify itu.");
    }
    return result;
  }

  if (isCollectionUrl(query)) {
    const collection = await resolveCollection(query, requester, limit);
    if (collection) return collection;
  }

  const track = await resolveTrack(query, requester);
  return { type: "track", name: null, image: track.thumbnail, total: 1, tracks: [track] };
}

/* ------------------------------------------------------------------ */
/* Stream audio: yt-dlp -> ffmpeg -> PCM 48kHz stereo                  */
/* ------------------------------------------------------------------ */

/**
 * Pastikan sumber audio bisa diakses sebelum lagu mulai diputar, dan simpan
 * mode yt-dlp yang berhasil supaya dipakai lebih dulu saat streaming.
 */
async function verifyPlaybackSource(track) {
  if (track.verified) return;

  const target = track.playbackTarget ?? track.url;
  if (!target) throw new BotError("Lagu ini tidak punya sumber audio.");

  const isPageUrl = /youtube\.com\/|youtu\.be\/|soundcloud\.com\//i.test(target);
  if (/^https?:\/\//i.test(target) && !isPageUrl) return;

  const { info, mode } = await fetchYtDlpInfo(target, {
    dumpSingleJson: true,
    noPlaylist: true,
    skipDownload: true,
    format: "bestaudio/best",
    socketTimeout: 20,
  });

  const media = mediaFromInfo(info);
  if (!media) {
    throw new BotError("Audio lagu tidak bisa diambil. Coba ulangi atau pakai lagu lain.");
  }

  track.ytdlpMode = mode;
  track.playback = media;
  track.verified = true;
}

/**
 * Buat resource audio. Bila yt-dlp gagal sebelum audio mengalir, mode lain
 * dicoba otomatis. `onFatal` dipanggil bila semua mode gagal.
 */
function createAudioStream(track, onFatal = () => {}) {
  if (!ffmpegPath) {
    throw new BotError("ffmpeg tidak tersedia. Jalankan `npm install` ulang.");
  }

  const ytdlpPath = youtubedl.constants?.YOUTUBE_DL_PATH;
  if (!ytdlpPath) {
    throw new BotError("yt-dlp tidak ditemukan. Jalankan `npm install` ulang.");
  }

  const target = track.playbackTarget ?? track.url;
  const modes = modesForTrack(track);
  const pcm = new PassThrough();
  const resource = createAudioResource(pcm, { inputType: StreamType.Raw, inlineVolume: true });

  let ytdlp = null;
  let ffmpeg = null;
  let modeIndex = 0;
  let started = false;
  let destroyed = false;
  let fatalCalled = false;
  let useDirect = Boolean(track.playback?.url);

  function ffmpegHeaderArgs(headers) {
    const entries = Object.entries(headers ?? {});
    if (!entries.length) return [];
    const value = `${entries.map(([key, headerValue]) => `${key}: ${headerValue}`).join("\r\n")}\r\n`;
    return ["-headers", value];
  }

  function cleanup() {
    try {
      ytdlp?.stdout?.unpipe();
    } catch {
      /* abaikan */
    }
    try {
      ffmpeg?.stdout?.unpipe(pcm);
    } catch {
      /* abaikan */
    }
    try {
      ytdlp?.kill();
    } catch {
      /* abaikan */
    }
    try {
      ffmpeg?.kill();
    } catch {
      /* abaikan */
    }
    ytdlp = null;
    ffmpeg = null;
  }

  function fail(error) {
    if (fatalCalled) return;
    fatalCalled = true;
    onFatal(error);
  }

  function spawnMode() {
    if (destroyed || fatalCalled) return;

    // URL media sudah didapat saat resolusi metadata, jadi tidak perlu
    // menjalankan yt-dlp untuk kedua kalinya sebelum lagu mulai.
    if (useDirect && track.playback?.url) {
      const media = track.playback;
      ffmpeg = spawn(
        ffmpegPath,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          ...ffmpegHeaderArgs(media.headers),
          "-i",
          media.url,
          "-vn",
          "-f",
          "s16le",
          "-ar",
          "48000",
          "-ac",
          "2",
          "pipe:1",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );

      ffmpeg.stdout?.on("data", () => {
        started = true;
      });
      ffmpeg.stdin?.on("error", () => {});
      ffmpeg.stdout?.pipe(pcm, { end: false });
      ffmpeg.stderr?.on("data", (chunk) => logger.debug(`[ffmpeg] ${chunk.toString().trim()}`));
      ffmpeg.on("error", (error) => logger.debug("ffmpeg gagal dijalankan:", error.message));

      let suppressEnd = false;
      const currentFfmpeg = ffmpeg;
      currentFfmpeg.on("close", (code) => {
        if (destroyed || suppressEnd) return;
        if (!started && code !== 0) {
          // URL langsung kedaluwarsa/ditolak: kembali ke jalur yt-dlp.
          logger.debug("Streaming langsung gagal, mencoba yt-dlp.");
          suppressEnd = true;
          cleanup();
          useDirect = false;
          modeIndex = 0;
          spawnMode();
          return;
        }
        try {
          pcm.end();
        } catch {
          /* abaikan */
        }
      });
      return;
    }

    const mode = modes[modeIndex] ?? {};
    const args = [
      ...ytDlpCliArgs(
        {
          format: "bestaudio/best",
          noPlaylist: true,
          noWarnings: true,
          noProgress: true,
          quiet: true,
          socketTimeout: 15,
          retries: 3,
        },
        mode,
      ),
      "-o",
      "-",
      target,
    ];

    ytdlp = spawn(ytdlpPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    ffmpeg = spawn(
      ffmpegPath,
      ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-f", "s16le", "-ar", "48000", "-ac", "2", "pipe:1"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let stderrTail = "";
    ytdlp.stderr?.on("data", (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000);
    });
    ytdlp.stdout?.on("data", () => {
      started = true;
    });
    ytdlp.stdin?.on("error", () => {});
    ffmpeg.stdin?.on("error", () => {});
    ytdlp.stdout?.pipe(ffmpeg.stdin);
    ffmpeg.stdout?.pipe(pcm, { end: false });
    ffmpeg.stderr?.on("data", (chunk) => logger.debug(`[ffmpeg] ${chunk.toString().trim()}`));

    // PassThrough sengaja tidak ditutup oleh pipe; tutup saat ffmpeg terakhir selesai
    // supaya audio player tetap berpindah ke lagu berikutnya.
    let suppressEnd = false;
    const currentFfmpeg = ffmpeg;
    currentFfmpeg.on("close", () => {
      if (destroyed || suppressEnd) return;
      try {
        pcm.end();
      } catch {
        /* abaikan */
      }
    });

    ytdlp.on("error", (error) => logger.debug("yt-dlp gagal dijalankan:", error.message));
    ytdlp.on("close", (code) => {
      if (destroyed || fatalCalled || started || code === 0) return;

      const detail = lastErrorLine(stderrTail);
      logger.debug(`yt-dlp gagal (${mode.extractorArgs ?? "default"}):`, detail);
      suppressEnd = true;
      cleanup();
      modeIndex += 1;

      if (modeIndex < modes.length) {
        spawnMode();
        return;
      }

      fail(
        new BotError(
          "Semua mode YouTube gagal. Coba lagi nanti, perbarui yt-dlp (`npm run update:ytdlp`), " +
            "atau isi `YT_COOKIES_FILE` / `YT_PLAYER_CLIENTS` di `.env`.",
        ),
      );
      try {
        pcm.end();
      } catch {
        /* abaikan */
      }
    });
  }

  spawnMode();

  return {
    resource,
    destroy() {
      destroyed = true;
      cleanup();
      try {
        pcm.destroy();
      } catch {
        /* abaikan */
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

export function getQueue(guildId) {
  return queues.get(guildId) ?? null;
}

export function getOrCreateQueue(client, guild) {
  const existing = queues.get(guild.id);
  if (existing && !existing.destroyed) return existing;

  const volume = getSettings(guild.id).music.volume;
  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });

  const queue = {
    client,
    guild,
    player,
    connection: null,
    tracks: [],
    history: [],
    current: null,
    currentStream: null,
    volume,
    loop: "off", // off | track | queue
    shuffle: Boolean(getSettings(guild.id).music.shuffle),
    likes: new Set(),
    textChannelId: null,
    dashboardMessage: null,
    destroyed: false,
    pendingStart: false,
    startToken: 0,
    consecutiveFailures: 0,
    idleTimer: null,
    emptyTimer: null,
  };

  player.on(AudioPlayerStatus.Idle, () => {
    if (queue.destroyed) return;
    const finished = queue.current;
    queue.currentStream?.destroy();
    queue.currentStream = null;
    queue.current = null;

    if (finished) {
      if (queue.loop === "track") {
        queue.tracks.unshift(finished);
      } else {
        queue.history.push(finished);
        if (queue.history.length > 50) queue.history.shift();
        if (queue.loop === "queue") queue.tracks.push(finished);
      }
    }

    playNext(queue);
  });

  player.on("error", (error) => {
    logger.error(`Audio player error di ${guild.name}:`, error.message);
    const finished = queue.current;
    queue.currentStream?.destroy();
    queue.currentStream = null;
    queue.current = null;
    if (finished && queue.loop !== "track") queue.history.push(finished);
    playNext(queue);
  });

  queues.set(guild.id, queue);
  return queue;
}

export async function ensureConnected(queue, voiceChannel) {
  const existing = queue.connection;

  if (
    existing &&
    existing.state.status !== VoiceConnectionStatus.Destroyed &&
    existing.joinConfig.channelId === voiceChannel.id
  ) {
    return;
  }

  existing?.destroy();

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: queue.guild.id,
    adapterCreator: queue.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch {
    connection.destroy();
    throw new BotError("Gagal terhubung ke voice channel. Coba lagi beberapa saat lagi.");
  }

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    if (queue.destroyed || connection.state.status === VoiceConnectionStatus.Destroyed) return;
    logger.warn(`Koneksi voice terputus di ${queue.guild.name}, keluar dari channel.`);
    destroyQueue(queue.guild.id, "Koneksi voice terputus");
  });

  connection.subscribe(queue.player);
  queue.connection = connection;
}

/**
 * Masukkan satu/beberapa lagu ke antrean.
 * `front: true` menaruhnya di paling atas antrean tanpa membalik urutan lagu,
 * `front: false` (default) menaruhnya di paling akhir.
 * Kalau belum ada yang diputar, lagu langsung dimainkan.
 */
export function enqueueTracks(queue, tracks, { front = false } = {}) {
  if (!tracks.length) return;

  // Permintaan baru menandakan antrean siap dipakai lagi setelah kegagalan
  // berturut-turut sebelumnya.
  queue.consecutiveFailures = 0;

  if (Number.isFinite(config.maxQueueSize) && queue.tracks.length + tracks.length > config.maxQueueSize) {
    throw new BotError(`Antrean sudah penuh (maksimal ${config.maxQueueSize} lagu).`);
  }

  if (front) {
    // Tandai sebagai prioritas supaya tetap dimainkan lebih dulu walau shuffle aktif.
    for (const track of tracks) track.priority = true;
    queue.tracks.unshift(...tracks);
  } else {
    queue.tracks.push(...tracks);
  }

  if (!queue.current) playNext(queue);
}

export function enqueue(queue, track) {
  enqueueTracks(queue, [track]);
}

/** Masukkan lagu ke urutan paling depan. Kalau belum ada yang diputar, langsung mainkan. */
export function queueNext(queue, track) {
  enqueueTracks(queue, [track], { front: true });
}

/** Hapus lagu dari antrean berdasarkan posisi 1-based. */
export function removeTrack(queue, position) {
  const index = position - 1;
  if (!Number.isInteger(index) || index < 0 || index >= queue.tracks.length) {
    throw new BotError(
      queue.tracks.length
        ? `Posisi tidak valid. Antrean berisi ${queue.tracks.length} lagu.`
        : "Antrean sedang kosong.",
    );
  }
  return queue.tracks.splice(index, 1)[0];
}

/** Pindahkan lagu di antrean dari posisi 1-based ke posisi lain. */
export function moveTrack(queue, from, to) {
  const fromIndex = from - 1;
  const toIndex = to - 1;
  const count = queue.tracks.length;

  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= count) {
    throw new BotError(count ? `Posisi asal tidak valid. Antrean berisi ${count} lagu.` : "Antrean sedang kosong.");
  }
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= count) {
    throw new BotError(`Posisi tujuan tidak valid. Antrean berisi ${count} lagu.`);
  }
  if (fromIndex === toIndex) return queue.tracks[fromIndex];

  const [track] = queue.tracks.splice(fromIndex, 1);
  queue.tracks.splice(toIndex, 0, track);
  return track;
}

/** Kosongkan lagu yang menunggu; lagu yang sedang diputar tetap berjalan. */
export function clearQueue(queue) {
  const count = queue.tracks.length;
  queue.tracks.length = 0;
  return count;
}

function playNext(queue) {
  if (queue.destroyed || queue.pendingStart) return;
  clearTimeout(queue.idleTimer);

  const index = nextTrackIndex(queue);
  const track = queue.tracks.splice(index, 1)[0];
  if (!track) {
    queue.likes.clear();
    scheduleIdleLeave(queue);
    return;
  }

  void startTrack(queue, track);
}

/**
 * Tentukan lagu berikutnya. Saat shuffle aktif, lagu prioritas (hasil
 * `/play insert:true` atau `/playnext`) tetap didahulukan; sisanya acak.
 */
function nextTrackIndex(queue) {
  if (!queue.shuffle || queue.tracks.length <= 1) return 0;

  const priorityIndex = queue.tracks.findIndex((track) => track.priority);
  if (priorityIndex !== -1) return priorityIndex;

  return Math.floor(Math.random() * queue.tracks.length);
}

async function startTrack(queue, track) {
  if (queue.destroyed) return;

  queue.pendingStart = true;
  const token = ++queue.startToken;
  let failed = false;
  const alive = () => !queue.destroyed && token === queue.startToken;

  const handleFailure = (error) => {
    if (!alive() || failed) return;
    failed = true;
    logger.error(`Gagal memutar "${track.title}":`, error.message);
    queue.current = null;
    queue.currentStream?.destroy();
    queue.currentStream = null;

    queue.consecutiveFailures = (queue.consecutiveFailures ?? 0) + 1;
    if (queue.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      const skipped = queue.tracks.length;
      queue.tracks.length = 0;
      queue.consecutiveFailures = 0;
      announceFailureStop(queue, skipped);
    } else {
      announcePlaybackError(queue, track, error);
    }

    queue.pendingStart = false;
    playNext(queue);
  };

  try {
    await verifyPlaybackSource(track);
    if (!alive()) return;

    const stream = createAudioStream(track, handleFailure);
    queue.current = track;
    queue.currentStream = stream;
    queue.likes.clear();
    stream.resource.volume?.setVolume(queue.volume / 100);
    queue.player.play(stream.resource);
    queue.consecutiveFailures = 0;
    announceNowPlaying(queue, track);
    logger.music(`Memutar "${track.title}" di ${queue.guild.name}`);
  } catch (error) {
    handleFailure(error);
  } finally {
    if (alive()) queue.pendingStart = false;
  }
}

function announcePlaybackError(queue, track, error) {
  if (!queue.textChannelId) return;
  const channel = queue.client.channels.cache.get(queue.textChannelId);
  if (!channel?.isTextBased()) return;

  const reason = error instanceof BotError ? error.message : "gagal menyiapkan audio";
  channel
    .send({ content: `⚠️ Gagal memutar **${String(track.title).slice(0, 80)}**: ${reason}` })
    .catch((sendError) => logger.debug("Gagal kirim notifikasi error musik:", sendError.message));
}

function announceFailureStop(queue, skipped) {
  if (!queue.textChannelId) return;
  const channel = queue.client.channels.cache.get(queue.textChannelId);
  if (!channel?.isTextBased()) return;

  const tail = skipped ? ` ${skipped} lagu berikutnya dilewati.` : "";
  channel
    .send({
      content:
        `⏹️ ${MAX_CONSECUTIVE_FAILURES} lagu gagal berturut-turut, jadi antrean dihentikan sementara.${tail} ` +
        "Ini mencegah bot sibuk mencoba terus dan membuat command lain lambat. Coba `/play` lagi nanti.",
    })
    .catch((sendError) => logger.debug("Gagal kirim notifikasi penghentian musik:", sendError.message));
}

function announceNowPlaying(queue, track) {
  if (!queue.textChannelId) return;
  const channel = queue.client.channels.cache.get(queue.textChannelId);
  if (!channel?.isTextBased()) return;

  const embed = buildNowPlayingEmbed(queue, track);
  const components = buildMusicDashboard(queue);

  channel
    .send({ embeds: [embed], components })
    .then((message) => {
      queue.dashboardMessage = message;
    })
    .catch((error) => logger.debug("Gagal kirim now playing:", error.message));
}

function scheduleIdleLeave(queue) {
  clearTimeout(queue.idleTimer);
  queue.idleTimer = null;
  if (queue.tracks.length || queue.current || queue.pendingStart) return;
  if (getSettings(queue.guild.id).music.stayInVoice) return;

  queue.idleTimer = setTimeout(() => {
    if (queue.tracks.length || queue.current || queue.pendingStart || queue.destroyed) return;
    destroyQueue(queue.guild.id, "Tidak ada lagu selama 2 menit");
  }, IDLE_LEAVE_MS);
  queue.idleTimer.unref?.();
}

function scheduleEmptyLeave(queue, channel) {
  clearTimeout(queue.emptyTimer);
  queue.emptyTimer = null;
  if (!channel || queue.destroyed) return;

  const humans = channel.members.filter((member) => !member.user.bot).size;
  if (humans > 0) return;
  if (getSettings(queue.guild.id).music.stayInVoice) return;

  queue.emptyTimer = setTimeout(() => {
    const current = queue.guild.channels.cache.get(channel.id);
    const stillEmpty = !current || current.members.filter((member) => !member.user.bot).size === 0;
    if (stillEmpty && !queue.destroyed) {
      destroyQueue(queue.guild.id, "Voice channel kosong");
    }
  }, EMPTY_CHANNEL_LEAVE_MS);
  queue.emptyTimer.unref?.();
}

export function skipTrack(queue) {
  if (!queue.current) {
    // Masih menyiapkan audio: batalkan dan lanjut ke lagu berikutnya.
    if (queue.pendingStart) {
      queue.startToken += 1;
      queue.pendingStart = false;
      playNext(queue);
    }
    return null;
  }

  const skipped = queue.current;
  // stopping triggers Idle handler which will push to history / handle loop
  queue.consecutiveFailures = 0;
  queue.player.stop(true);
  return skipped;
}

export function previousTrack(queue) {
  if (!queue.history.length) throw new BotError("Tidak ada lagu sebelumnya.");
  if (!queue.current) throw new BotError("Tidak ada lagu yang sedang diputar.");

  const previous = queue.history.pop();
  // put current back to front so user can go forward again
  queue.tracks.unshift(queue.current);
  queue.current = null;
  queue.currentStream?.destroy();
  queue.currentStream = null;
  // Batalkan resolusi yang masih berjalan sebelum memulai lagu sebelumnya.
  queue.startToken += 1;
  queue.pendingStart = false;
  queue.consecutiveFailures = 0;
  void startTrack(queue, previous);
  return previous;
}

export function isPaused(queue) {
  return queue?.player?.state?.status === AudioPlayerStatus.Paused;
}

export function togglePause(queue) {
  if (!queue.current) throw new BotError("Tidak ada lagu yang sedang diputar.");
  if (isPaused(queue)) {
    queue.player.unpause();
    return "resumed";
  }
  queue.player.pause();
  return "paused";
}

export function pauseQueue(queue) {
  if (!queue.current) throw new BotError("Tidak ada lagu yang sedang diputar.");
  const paused = queue.player.pause();
  if (!paused) throw new BotError("Lagu sudah dalam keadaan pause.");
}

export function resumeQueue(queue) {
  if (!queue.current) throw new BotError("Tidak ada lagu yang sedang diputar.");
  const resumed = queue.player.unpause();
  if (!resumed) throw new BotError("Lagu sudah berjalan.");
}

export function cycleLoop(queue) {
  const modes = ["off", "track", "queue"];
  const next = modes[(modes.indexOf(queue.loop) + 1) % modes.length];
  queue.loop = next;
  return next;
}

/** Mengacak array secara in-place dengan Fisher-Yates. */
function shuffleArray(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return items;
}

/** Salinan daftar lagu yang sudah diacak, dipakai sebelum antrean diisi. */
export function shuffleTracks(tracks) {
  return shuffleArray([...tracks]);
}

/** Mengacak urutan lagu yang menunggu tanpa menyentuh lagu yang sedang diputar. */
export function shuffleQueue(queue) {
  if (!queue?.tracks?.length) throw new BotError("Antrean sedang kosong.");
  if (queue.tracks.length < 2) throw new BotError("Antrean butuh minimal 2 lagu untuk diacak.");

  shuffleArray(queue.tracks);
  return queue.tracks.length;
}

/**
 * Aktifkan/matikan mode shuffle untuk sebuah guild. Preference disimpan walau
 * belum ada antrean, jadi lagu/playlist yang diputar berikutnya langsung acak.
 * @returns {{ enabled: boolean, count: number, hasQueue: boolean }}
 */
export function setShuffleForGuild(guildId, enabled, queue = queues.get(guildId)) {
  const value = Boolean(enabled);
  updateSettings(guildId, { music: { shuffle: value } });

  const activeQueue = queue && !queue.destroyed ? queue : null;
  if (activeQueue) activeQueue.shuffle = value;

  let count = 0;
  if (value && activeQueue?.tracks?.length >= 2) count = shuffleQueue(activeQueue);

  logger.music(`Shuffle ${value ? "aktif" : "mati"} di guild ${guildId}.`);

  return { enabled: value, count, hasQueue: Boolean(activeQueue) };
}

export function getShufflePreference(guildId) {
  return Boolean(getSettings(guildId).music.shuffle);
}

export function setShuffle(queue, enabled) {
  return setShuffleForGuild(queue.guild.id, enabled, queue);
}

export function toggleShuffle(queue) {
  return setShuffle(queue, !queue.shuffle);
}

export function toggleLike(queue, userId) {
  if (!queue.current) throw new BotError("Tidak ada lagu yang sedang diputar.");
  if (queue.likes.has(userId)) {
    queue.likes.delete(userId);
    return { liked: false, count: queue.likes.size };
  }
  queue.likes.add(userId);
  return { liked: true, count: queue.likes.size };
}

export function setVolume(queue, percent) {
  const clamped = Math.min(100, Math.max(0, percent));
  queue.volume = clamped;
  queue.currentStream?.resource.volume?.setVolume(clamped / 100);
  return clamped;
}

/**
 * Aktifkan/matikan mode tetap terhubung di voice untuk sebuah guild.
 * Preference disimpan walau belum ada antrean.
 * @returns {{ enabled: boolean, hasQueue: boolean }}
 */
export function setStayInVoiceForGuild(guildId, enabled, queue = queues.get(guildId)) {
  const value = Boolean(enabled);
  updateSettings(guildId, { music: { stayInVoice: value } });

  const activeQueue = queue && !queue.destroyed ? queue : null;
  if (!activeQueue) return { enabled: value, hasQueue: false };

  if (value) {
    clearTimeout(activeQueue.idleTimer);
    activeQueue.idleTimer = null;
    clearTimeout(activeQueue.emptyTimer);
    activeQueue.emptyTimer = null;
    return { enabled: value, hasQueue: true };
  }

  // Dimatikan: pulihkan perilaku auto-leave bila kondisinya terpenuhi.
  if (!activeQueue.tracks.length && !activeQueue.current && !activeQueue.pendingStart) {
    scheduleIdleLeave(activeQueue);
  }

  const channelId = activeQueue.connection?.joinConfig.channelId;
  const channel = channelId ? activeQueue.guild.channels.cache.get(channelId) : null;
  if (channel) scheduleEmptyLeave(activeQueue, channel);

  return { enabled: value, hasQueue: true };
}

export function getStayInVoicePreference(guildId) {
  return Boolean(getSettings(guildId).music.stayInVoice);
}

export function destroyQueue(guildId, reason = "Selesai") {
  const queue = queues.get(guildId);
  if (!queue) return;

  queue.destroyed = true;
  queue.startToken += 1;
  queue.pendingStart = false;
  queue.consecutiveFailures = 0;
  clearTimeout(queue.idleTimer);
  clearTimeout(queue.emptyTimer);
  queue.tracks.length = 0;
  queue.history.length = 0;
  queue.likes.clear();
  queue.current = null;
  queue.currentStream?.destroy();
  queue.currentStream = null;
  queue.player.stop(true);

  try {
    queue.connection?.destroy();
  } catch {
    /* abaikan */
  }

  queues.delete(guildId);
  logger.music(`Keluar dari voice di ${queue.guild.name} (${reason}).`);
}

export function shutdownMusic() {
  for (const guildId of [...queues.keys()]) {
    destroyQueue(guildId, "Bot dimatikan");
  }
}

/** Keluar otomatis bila tidak ada manusia tersisa di voice channel. */
export function handleVoiceStateUpdate(oldState) {
  const queue = queues.get(oldState.guild.id);
  if (!queue?.connection || queue.destroyed) return;

  const channelId = queue.connection.joinConfig.channelId;
  const channel = oldState.guild.channels.cache.get(channelId);
  if (!channel) return;

  scheduleEmptyLeave(queue, channel);
}

/* ------------------------------------------------------------------ */
/* Dashboard & tampilan                                                */
/* ------------------------------------------------------------------ */

export function buildNowPlayingEmbed(queue, track = queue.current) {
  if (!track) return musicEmbed("Tidak ada lagu yang sedang diputar.", "Musik");

  const elapsed = queue.currentStream?.resource.playbackDuration ?? 0;
  const durationText = track.duration ? formatTimestamp(track.duration) : "LIVE";
  const elapsedText = formatTimestamp(Math.floor(elapsed / 1000));
  const loopLabel = queue.loop === "off" ? "Off" : queue.loop === "track" ? "Lagu" : "Antrean";
  const bar = progressBar(elapsed, track.duration);

  return musicEmbed(
    `**[${track.title}](${track.url})**\n\n${bar}\n\`${elapsedText}\` / \`${durationText}\``,
    "Sedang Diputar",
  )
    .setThumbnail(track.thumbnail ?? null)
    .addFields(
      { name: "Diminta", value: `<@${track.requestedBy.id}>`, inline: true },
      { name: "Volume", value: `${queue.volume}%`, inline: true },
      { name: "Antrean", value: `${queue.tracks.length} lagu`, inline: true },
      { name: "Loop", value: loopLabel, inline: true },
      { name: "Shuffle", value: queue.shuffle ? "On" : "Off", inline: true },
      { name: "Like", value: `${queue.likes.size}`, inline: true },
    );
}

function progressBar(elapsedMs, totalSeconds, size = 16) {
  if (!totalSeconds) return "🔴 LIVE";
  const ratio = Math.min(1, Math.max(0, elapsedMs / 1000 / totalSeconds));
  const filled = Math.round(ratio * size);
  return `${"▬".repeat(filled)}🔘${"▬".repeat(Math.max(0, size - filled))}`;
}

export function buildMusicDashboard(queue) {
  const paused = isPaused(queue);
  const loopStyle =
    queue.loop === "off" ? ButtonStyle.Secondary : queue.loop === "track" ? ButtonStyle.Primary : ButtonStyle.Success;
  const loopLabel = queue.loop === "off" ? "Loop: Off" : queue.loop === "track" ? "Loop: Lagu" : "Loop: Antrean";
  const shuffleOn = Boolean(queue.shuffle);
  const likeCount = queue.likes?.size ?? 0;

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("music:previous").setEmoji("⏮️").setStyle(ButtonStyle.Secondary).setDisabled(!queue.history?.length),
      new ButtonBuilder()
        .setCustomId("music:pause")
        .setEmoji(paused ? "▶️" : "⏸️")
        .setLabel(paused ? "Resume" : "Pause")
        .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("music:skip").setEmoji("⏭️").setLabel("Skip").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("music:loop").setEmoji("🔁").setLabel(loopLabel).setStyle(loopStyle),
      new ButtonBuilder()
        .setCustomId("music:like")
        .setEmoji("❤️")
        .setLabel(likeCount ? `Like (${likeCount})` : "Like")
        .setStyle(likeCount ? ButtonStyle.Danger : ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("music:shuffle")
        .setEmoji("🔀")
        .setLabel(shuffleOn ? "Shuffle: On" : "Shuffle: Off")
        .setStyle(shuffleOn ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(queue.tracks.length < 2 && !shuffleOn),
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* Helper tampilan                                                     */
/* ------------------------------------------------------------------ */

export function assertSameVoiceChannel(interaction, queue) {
  if (!queue) throw new BotError("Aku sedang tidak memutar musik.");

  const botChannelId = queue.connection?.joinConfig.channelId;
  if (!botChannelId) throw new BotError("Aku sedang tidak berada di voice channel.");

  if (interaction.member.voice?.channelId !== botChannelId) {
    throw new BotError("Kamu harus berada di voice channel yang sama denganku.");
  }
}

export function trackSummary(track) {
  const duration = track.duration ? formatTimestamp(track.duration) : "LIVE";
  return `**[${track.title}](${track.url})** \`${duration}\``;
}

export async function handleMusicComponent(interaction) {
  const [, action] = interaction.customId.split(":");
  const queue = getQueue(interaction.guildId);

  if (!queue?.current) {
    await interaction.reply({ content: "Tidak ada lagu yang sedang diputar.", flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }

  const botChannelId = queue.connection?.joinConfig.channelId;
  if (botChannelId && interaction.member?.voice?.channelId !== botChannelId) {
    await interaction.reply({ content: "Kamu harus berada di voice channel yang sama denganku.", flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }

  try {
    if (action === "pause") {
      const state = togglePause(queue);
      await interaction.update({ embeds: [buildNowPlayingEmbed(queue)], components: buildMusicDashboard(queue) });
      return;
    }
    if (action === "skip") {
      const skipped = skipTrack(queue);
      await interaction.reply({ content: `⏭️ Melewati **${skipped?.title ?? "lagu"}**.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    if (action === "previous") {
      const prev = previousTrack(queue);
      await interaction.reply({ content: `⏮️ Kembali ke **${prev.title}**.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    if (action === "loop") {
      const mode = cycleLoop(queue);
      const label = mode === "off" ? "Loop dimatikan." : mode === "track" ? "Loop lagu diaktifkan." : "Loop antrean diaktifkan.";
      await interaction.update({ embeds: [buildNowPlayingEmbed(queue)], components: buildMusicDashboard(queue) });
      return;
    }
    if (action === "like") {
      const { liked, count } = toggleLike(queue, interaction.user.id);
      await interaction.update({ embeds: [buildNowPlayingEmbed(queue)], components: buildMusicDashboard(queue) });
      return;
    }
    if (action === "shuffle") {
      toggleShuffle(queue);
      await interaction.update({ embeds: [buildNowPlayingEmbed(queue)], components: buildMusicDashboard(queue) });
      return;
    }

    await interaction.reply({ content: "Aksi tidak dikenal.", flags: MessageFlags.Ephemeral }).catch(() => {});
  } catch (error) {
    if (error instanceof BotError) {
      const payload = { content: error.message, flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
      return;
    }
    throw error;
  }
}
