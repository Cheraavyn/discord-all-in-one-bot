import { config } from "../config.js";
import { BotError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

const API_BASE = "https://api.spotify.com/v1";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const LINK_PATTERN =
  /(?:https?:\/\/)?(?:open|play)\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|playlist|album|artist)\/([A-Za-z0-9]+)/i;
const URI_PATTERN = /(?:^|\s)spotify:(track|playlist|album|artist):([A-Za-z0-9]+)/i;

/** Mengenali link/URI Spotify. Mengembalikan null jika bukan link Spotify. */
export function parseSpotifyLink(input) {
  const text = String(input ?? "").trim();

  const uri = URI_PATTERN.exec(text);
  if (uri) return { type: uri[1].toLowerCase(), id: uri[2] };

  const link = LINK_PATTERN.exec(text);
  if (link) return { type: link[1].toLowerCase(), id: link[2] };

  return null;
}

/* ------------------------------------------------------------------ */
/* Token Spotify                                                       */
/* ------------------------------------------------------------------ */

let cachedToken = null;
let anonymousBlockedUntil = 0;

function credentialsError() {
  return new BotError(
    "Spotify butuh kredensial. Isi `SPOTIFY_CLIENT_ID` dan `SPOTIFY_CLIENT_SECRET` di `.env` " +
      "(buat gratis di developer.spotify.com), lalu restart bot.",
  );
}

function hasCredentials() {
  return Boolean(config.spotify.clientId && config.spotify.clientSecret);
}

async function requestClientToken() {
  const basic = Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description ?? data?.error ?? `HTTP ${response.status}`);
  }

  return {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(60, (Number(data.expires_in) || 3600) - 60) * 1000,
  };
}

async function requestAnonymousToken() {
  const response = await fetch(
    "https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
    { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
  );

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.accessToken) throw new Error(`HTTP ${response.status}`);

  const expiresAt = Number(data.accessTokenExpirationTimestampMs);
  return {
    value: data.accessToken,
    expiresAt: Number.isFinite(expiresAt) && expiresAt > Date.now() ? expiresAt : Date.now() + 30 * 60 * 1000,
  };
}

async function getToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken;

  if (hasCredentials()) {
    try {
      cachedToken = await requestClientToken();
      return cachedToken;
    } catch (error) {
      logger.warn(`Login Spotify gagal (${error.message}), mencoba token anonim.`);
    }
  }

  if (Date.now() < anonymousBlockedUntil) throw credentialsError();

  try {
    cachedToken = await requestAnonymousToken();
    return cachedToken;
  } catch (error) {
    // Token anonim sering diblokir Spotify; beri jeda sebelum mencoba lagi.
    anonymousBlockedUntil = Date.now() + 10 * 60 * 1000;
    logger.debug("Token anonim Spotify gagal:", error.message);
  }

  throw credentialsError();
}

/* ------------------------------------------------------------------ */
/* Pemanggilan API                                                     */
/* ------------------------------------------------------------------ */

class UnauthorizedError extends Error {}

async function apiGet(path, token, signal) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token.value}`, Accept: "application/json" },
    signal,
  });

  if (response.status === 401) throw new UnauthorizedError("Token Spotify ditolak");

  if (!response.ok) {
    const data = await response.json().catch(() => null);

    if (response.status === 404) {
      throw new BotError("Konten Spotify tidak ditemukan (mungkin playlist privat atau sudah dihapus).");
    }
    if (response.status === 429) {
      throw new BotError("Spotify sedang membatasi permintaan (rate limit). Coba lagi beberapa saat.");
    }
    if (response.status === 403) {
      // Sertakan pesan asli Spotify, mis. "Active premium subscription required
      // for the owner of the app", supaya penyebabnya tidak tertutup pesan umum.
      throw new BotError(`Spotify API menolak akses (403): ${data?.error?.message ?? "akses ditolak"}`);
    }

    throw new BotError(`Spotify error (${response.status}): ${data?.error?.message ?? "tidak diketahui"}`);
  }

  return response.json();
}

/** GET ke API Spotify dengan satu kali percobaan ulang bila token kedaluwarsa. */
async function spotifyGet(path, signal) {
  let token = await getToken();

  try {
    return await apiGet(path, token, signal);
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) throw error;

    cachedToken = null;
    token = await getToken();
    return apiGet(path, token, signal);
  }
}

/* ------------------------------------------------------------------ */
/* Konversi data Spotify -> track bot                                  */
/* ------------------------------------------------------------------ */

function artistNames(raw) {
  return (raw?.artists ?? []).map((artist) => artist?.name).filter(Boolean);
}

function buildTrack({ id, name, artists, durationMs, image, url, requester, context }) {
  const artistText = artists.join(", ");
  const title = artistText ? `${artistText} - ${name}` : name;
  const query = `${artistText} ${name}`.trim() || name;

  return {
    title,
    url: url ?? (id ? `https://open.spotify.com/track/${id}` : null),
    duration: Math.round((Number(durationMs) || 0) / 1000),
    thumbnail: image ?? null,
    uploader: artistText || null,
    requestedBy: { id: requester.id, tag: requester.tag },
    source: "spotify",
    // Audio tetap diambil dari YouTube, karena Spotify tidak mengizinkan streaming langsung.
    playbackTarget: `ytsearch1:${query}`,
    playlist: context ?? null,
  };
}

function fromApiTrack(raw, requester, context, fallbackImage, fallbackArtists = []) {
  if (!raw?.name || raw.is_local || raw.type === "episode") return null;

  const artists = artistNames(raw);
  return buildTrack({
    id: raw.id,
    name: raw.name,
    artists: artists.length ? artists : fallbackArtists,
    durationMs: raw.duration_ms,
    image: raw.album?.images?.[0]?.url ?? fallbackImage,
    url: raw.external_urls?.spotify ?? null,
    requester,
    context,
  });
}

/* ------------------------------------------------------------------ */
/* Loader per tipe konten                                              */
/* ------------------------------------------------------------------ */

async function loadTrack(id, requester) {
  const raw = await spotifyGet(`/tracks/${id}`);
  const track = fromApiTrack(raw, requester, null, null);
  if (!track) throw new BotError("Lagu Spotify itu tidak bisa diputar (mungkin lagu lokal atau episode podcast).");

  return { type: "track", name: null, image: track.thumbnail, total: 1, tracks: [track] };
}

async function loadPlaylist(id, requester, limit) {
  const meta = await spotifyGet(`/playlists/${id}?fields=name,images,tracks(total)`);
  const name = meta?.name ?? "Playlist Spotify";
  const image = meta?.images?.[0]?.url ?? null;

  const tracks = [];
  let page = await fetchPlaylistPage(id, Math.min(100, limit));

  while (page && tracks.length < limit) {
    for (const item of page.items ?? []) {
      const track = fromApiTrack(item?.track, requester, name, image);
      if (!track) continue;

      tracks.push(track);
      if (tracks.length >= limit) break;
    }

    page = page.next ? await spotifyGet(page.next) : null;
  }

  return {
    type: "playlist",
    name,
    image,
    total: Number(meta?.tracks?.total) || tracks.length,
    tracks,
  };
}

/** Endpoint playlist berganti nama dari /tracks menjadi /items; coba keduanya. */
async function fetchPlaylistPage(id, limit) {
  let lastError = null;

  for (const segment of ["tracks", "items"]) {
    try {
      return await spotifyGet(
        `/playlists/${id}/${segment}?limit=${Math.max(1, limit)}&offset=0` +
          "&fields=items(track(id,name,duration_ms,artists(name),album(images),external_urls,is_local,type)),next",
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new BotError("Gagal membaca isi playlist Spotify.");
}

async function loadAlbum(id, requester, limit) {
  const meta = await spotifyGet(`/albums/${id}?fields=name,images,artists(name),total_tracks`);
  const name = meta?.name ?? "Album Spotify";
  const image = meta?.images?.[0]?.url ?? null;
  const albumArtists = artistNames(meta);

  const tracks = [];
  let page = await spotifyGet(`/albums/${id}/tracks?limit=${Math.min(50, limit)}&offset=0`);

  while (page && tracks.length < limit) {
    for (const raw of page.items ?? []) {
      const track = fromApiTrack(raw, requester, name, image, albumArtists);
      if (!track) continue;

      tracks.push(track);
      if (tracks.length >= limit) break;
    }

    page = page.next ? await spotifyGet(page.next) : null;
  }

  return {
    type: "album",
    name,
    image,
    total: Number(meta?.total_tracks) || tracks.length,
    tracks,
  };
}

async function loadArtist(id, requester, limit) {
  const meta = await spotifyGet(`/artists/${id}?fields=name,images`);
  const name = meta?.name ?? "Artis Spotify";
  const image = meta?.images?.[0]?.url ?? null;

  const data = await spotifyGet(`/artists/${id}/top-tracks?market=US`);
  const tracks = (data?.tracks ?? [])
    .slice(0, limit)
    .map((raw) => fromApiTrack(raw, requester, name, image))
    .filter(Boolean);

  return { type: "artist", name, image, total: tracks.length, tracks };
}

async function resolveViaApi(link, requester, limit) {
  if (link.type === "track") return loadTrack(link.id, requester);
  if (link.type === "playlist") return loadPlaylist(link.id, requester, limit);
  if (link.type === "album") return loadAlbum(link.id, requester, limit);
  return loadArtist(link.id, requester, limit);
}

/* ------------------------------------------------------------------ */
/* Cadangan tanpa kredensial: baca halaman embed Spotify               */
/* ------------------------------------------------------------------ */

async function fetchEmbedEntity(type, id) {
  const response = await fetch(`https://open.spotify.com/embed/${type}/${id}`, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
  });

  if (response.status === 404) {
    throw new BotError("Konten Spotify tidak ditemukan (mungkin playlist privat atau sudah dihapus).");
  }
  if (response.status === 403) {
    throw new BotError("Spotify menolak akses ke konten ini. Pastikan playlist bersifat publik.");
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const html = await response.text();
  const match = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match) throw new Error("data embed tidak ditemukan");

  const pageProps = JSON.parse(match[1])?.props?.pageProps;
  if (Number(pageProps?.status) === 404) {
    throw new BotError("Konten Spotify tidak ditemukan (mungkin playlist privat atau sudah dihapus).");
  }

  const entity = pageProps?.state?.data?.entity;
  if (!entity) throw new Error("entity embed tidak ditemukan");

  return entity;
}

function fromEmbedItem(item, requester, context, fallbackImage) {
  const name = item?.title ?? item?.name;
  if (!name || item?.entityType === "episode") return null;

  const subtitle = item?.subtitle ?? artistNames(item).join(", ");
  const id = item?.uri?.split(":").pop();
  const image =
    item?.coverArt?.sources?.[0]?.url ?? item?.visualIdentity?.image?.[0]?.url ?? fallbackImage ?? null;

  return buildTrack({
    id,
    name,
    artists: subtitle ? [subtitle] : [],
    durationMs: item?.duration,
    image,
    url: id ? `https://open.spotify.com/track/${id}` : null,
    requester,
    context,
  });
}

async function resolveViaEmbed(link, requester, limit) {
  const entity = await fetchEmbedEntity(link.type, link.id);
  const context =
    link.type === "track" ? null : (entity.name ?? entity.title ?? null);
  const image =
    entity.coverArt?.sources?.[0]?.url ?? entity.visualIdentity?.image?.[0]?.url ?? null;
  const items = Array.isArray(entity.trackList) ? entity.trackList : [entity];

  const tracks = [];
  for (const item of items) {
    const track = fromEmbedItem(item, requester, context, image);
    if (!track) continue;

    tracks.push(track);
    if (tracks.length >= limit) break;
  }

  if (!tracks.length) throw new Error("tidak ada lagu di halaman embed");

  return {
    type: link.type,
    name: context,
    image: image ?? tracks[0].thumbnail,
    total: tracks.length,
    tracks,
    // Dipakai embed /play untuk menjelaskan kenapa daftar lagu berhenti di ~100.
    limitedBy: "spotify-embed",
  };
}

/* ------------------------------------------------------------------ */
/* Pencarian lagu untuk autocomplete                                   */
/* ------------------------------------------------------------------ */

/** True bila pencarian Spotify bisa dipakai (kredensial atau token aktif). */
export function canSearchSpotify() {
  return hasCredentials() || Boolean(cachedToken);
}

export async function searchSpotifyTracks(query, limit = 10) {
  const size = Math.min(10, Math.max(1, Math.floor(limit)));
  const data = await spotifyGet(
    `/search?type=track&limit=${size}&q=${encodeURIComponent(query)}`,
    AbortSignal.timeout(5000),
  );

  return (data?.tracks?.items ?? [])
    .filter((raw) => raw?.name && !raw.is_local && raw.type !== "episode")
    .map((raw) => ({
      title: raw.name,
      artist: artistNames(raw).join(", "),
      duration: Math.round((Number(raw.duration_ms) || 0) / 1000),
      thumbnail: raw.album?.images?.[0]?.url ?? null,
      url: raw.external_urls?.spotify ?? `https://open.spotify.com/track/${raw.id}`,
    }));
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Mengambil daftar lagu dari link Spotify.
 * @param {{type: string, id: string}} link hasil parseSpotifyLink
 * @param {{id: string, tag: string}} requester
 * @param {number} limit jumlah maksimal lagu yang diambil
 */
export async function resolveSpotify(link, requester, limit = 100) {
  const max = Math.max(1, limit);
  let apiError = null;

  try {
    const result = await resolveViaApi(link, requester, max);
    if (result.tracks.length) {
      logger.info(`Spotify ${link.type}: ${result.tracks.length}/${result.total} lagu diambil lewat API.`);
      return result;
    }
  } catch (error) {
    apiError = error;
    logger.warn(`Spotify API gagal (${error.message ?? error}), mencoba halaman embed...`);
  }

  let embedError = null;
  try {
    const result = await resolveViaEmbed(link, requester, max);
    // Halaman embed Spotify hanya menyediakan ~100 lagu pertama; API yang dipakai
    // kalau tersedia. Peringatan ini memudahkan melihat kenapa antrean berhenti di 100.
    logger.warn(
      `Spotify ${link.type}: memakai embed (${result.tracks.length} lagu). Embed hanya memuat ~100 lagu pertama.`,
    );
    return result;
  } catch (error) {
    embedError = error;
    logger.debug("Membaca embed Spotify gagal:", error.message ?? error);
  }

  // "Tidak ditemukan/privat" lebih informatif daripada "butuh kredensial".
  if (embedError instanceof BotError) throw embedError;
  if (apiError instanceof BotError) throw apiError;

  throw new BotError(
    "Gagal mengambil data dari Spotify. Coba lagi nanti, atau isi `SPOTIFY_CLIENT_ID` dan " +
      "`SPOTIFY_CLIENT_SECRET` di `.env` agar lebih stabil.",
  );
}
