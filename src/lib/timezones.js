import { BotError } from "./errors.js";

/** Nama ramah yang dipakai di autocomplete. */
export const TIMEZONE_CHOICES = [
  { name: "WIB — Asia/Jakarta (UTC+7)", value: "Asia/Jakarta" },
  { name: "WITA — Asia/Makassar (UTC+8)", value: "Asia/Makassar" },
  { name: "WIT — Asia/Jayapura (UTC+9)", value: "Asia/Jayapura" },
  { name: "Malaysia — Asia/Kuala Lumpur (UTC+8)", value: "Asia/Kuala_Lumpur" },
  { name: "Singapura — Asia/Singapore (UTC+8)", value: "Asia/Singapore" },
  { name: "Thailand — Asia/Bangkok (UTC+7)", value: "Asia/Bangkok" },
  { name: "Filipina — Asia/Manila (UTC+8)", value: "Asia/Manila" },
  { name: "Vietnam — Asia/Ho Chi Minh (UTC+7)", value: "Asia/Ho_Chi_Minh" },
  { name: "Jepang — Asia/Tokyo (UTC+9)", value: "Asia/Tokyo" },
  { name: "Korea — Asia/Seoul (UTC+9)", value: "Asia/Seoul" },
  { name: "India — Asia/Kolkata (UTC+5:30)", value: "Asia/Kolkata" },
  { name: "UEA — Asia/Dubai (UTC+4)", value: "Asia/Dubai" },
  { name: "Inggris — Europe/London", value: "Europe/London" },
  { name: "AS Timur — America/New_York", value: "America/New_York" },
  { name: "AS Barat — America/Los_Angeles", value: "America/Los_Angeles" },
  { name: "Australia — Australia/Sydney", value: "Australia/Sydney" },
  { name: "UTC", value: "UTC" },
];

const ALIASES = {
  wib: "Asia/Jakarta",
  jakarta: "Asia/Jakarta",
  wita: "Asia/Makassar",
  makassar: "Asia/Makassar",
  wit: "Asia/Jayapura",
  jayapura: "Asia/Jayapura",
  malaysia: "Asia/Kuala_Lumpur",
  myt: "Asia/Kuala_Lumpur",
  kl: "Asia/Kuala_Lumpur",
  "kuala lumpur": "Asia/Kuala_Lumpur",
  singapura: "Asia/Singapore",
  singapore: "Asia/Singapore",
  sgt: "Asia/Singapore",
  utc: "UTC",
};

for (let offset = -12; offset <= 14; offset += 1) {
  const sign = offset >= 0 ? "+" : "-";
  // Etc/GMT memakai tanda terbalik terhadap UTC offset.
  ALIASES[`utc${sign}${Math.abs(offset)}`] = `Etc/GMT${offset === 0 ? "" : offset > 0 ? `-${offset}` : `+${Math.abs(offset)}`}`;
}

export function isValidTimeZone(zone) {
  if (typeof zone !== "string" || !zone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(input) {
  const raw = String(input ?? "").trim();
  if (!raw) throw new BotError("Zona waktu tidak boleh kosong.");

  const normalized = raw.includes("/") ? raw.replace(/\s+/g, "_") : raw;
  const aliased = ALIASES[normalized.toLowerCase()] ?? ALIASES[raw.toLowerCase()] ?? normalized;

  if (!isValidTimeZone(aliased)) {
    throw new BotError(
      `Zona waktu \`${raw}\` tidak dikenal. Contoh: \`WIB\`, \`WITA\`, \`WIT\`, \`Malaysia\`, atau \`Asia/Kuala_Lumpur\`.`,
    );
  }

  return aliased;
}

export function detectTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function timeZoneLabel(zone) {
  const known = TIMEZONE_CHOICES.find((choice) => choice.value === zone);
  return known ? known.name : zone;
}

export function timeZoneOffset(zone, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(now);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? zone;
  } catch {
    return zone;
  }
}

export function timeZoneClock(zone, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now);
  } catch {
    return "-";
  }
}
