import { formatTimestamp } from "../lib/duration.js";
import { logger } from "../lib/logger.js";
import { canSearchSpotify, searchSpotifyTracks } from "./spotify.js";

const CACHE_TTL_MS = 3 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;
/** Batas waktu total agar tetap di bawah timeout autocomplete Discord (3 detik). */
const BUDGET_MS = 2400;

const cache = new Map();

function truncate(text, max = 100) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.choices;
}

function writeCache(key, choices) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { choices, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Jalankan promise dengan batas waktu; null bila lewat batas. */
function withBudget(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/* ------------------------------------------------------------------ */
/* Sumber saran                                                        */
/* ------------------------------------------------------------------ */

function trackChoices(tracks, { useUrl }) {
  return (tracks ?? [])
    .map((track) => {
      const label = truncate(`${track.artist} - ${track.title} · ${formatTimestamp(track.duration)}`);
      const value = truncate(useUrl ? track.url : `${track.artist} ${track.title}`.trim());
      return { name: label, value };
    })
    .filter((choice) => choice.name.length > 0 && choice.value.length > 1);
}

async function searchDeezer(query, limit) {
  const response = await fetch(
    `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    },
  );

  if (!response.ok) return [];

  const data = await response.json().catch(() => null);
  return (data?.data ?? [])
    .filter((item) => item?.title && item?.artist?.name)
    .map((item) => ({
      title: item.title,
      artist: item.artist.name,
      duration: Number(item.duration) || 0,
      thumbnail: item.album?.cover_medium ?? null,
      url: item.link ?? null,
    }));
}

async function searchYouTubeSuggest(query, limit) {
  const response = await fetch(
    `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    },
  );

  if (!response.ok) return [];

  const data = await response.json().catch(() => null);
  const list = Array.isArray(data?.[1]) ? data[1] : [];

  return list
    .slice(0, limit)
    .map((text) => {
      const value = truncate(text);
      return { name: value, value };
    })
    .filter((choice) => choice.value.length > 1);
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Saran untuk autocomplete /play.
 * Urutan: Spotify (bila ada kredensial) -> Deezer -> saran YouTube.
 */
export async function getSuggestions(query, limit = 10) {
  const text = truncate(query);
  if (text.length < 2) return [];

  const key = text.toLowerCase();
  const cached = readCache(key);
  if (cached) return cached;

  const deadline = Date.now() + BUDGET_MS;
  const remaining = () => Math.max(0, deadline - Date.now());

  let choices = [];

  if (canSearchSpotify() && remaining() > 300) {
    choices = trackChoices(await withBudget(searchSpotifyTracks(text, limit), remaining()), {
      useUrl: true,
    });
  }

  if (!choices.length && remaining() > 200) {
    try {
      choices = trackChoices(await withBudget(searchDeezer(text, limit), remaining()), {
        useUrl: false,
      });
    } catch (error) {
      logger.debug("Saran Deezer gagal:", error.message ?? error);
    }
  }

  if (!choices.length && remaining() > 200) {
    choices = (await withBudget(searchYouTubeSuggest(text, limit), remaining())) ?? [];
  }

  writeCache(key, choices);
  return choices;
}
