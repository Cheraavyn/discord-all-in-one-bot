/**
 * Katalog kartu, aturan rarity, elemen, dan konstanta game kartu.
 * Semua data statis supaya tidak butuh file tambahan saat deploy.
 */

export const RARITY_ORDER = ["common", "rare", "epic", "legendary", "mythic", "celestial"];

/**
 * Bobot dalam persen (boleh desimal). `weightOf` mengkalikan dengan 10
 * supaya `pickRarity` tetap bisa memakai randomInt yang hanya menerima bilangan bulat.
 */
export const RARITIES = {
  common: { label: "Common", emoji: "⚪", color: 0x95a5a6, weight: 54, sell: 25 },
  rare: { label: "Rare", emoji: "🔵", color: 0x3498db, weight: 26.5, sell: 75 },
  epic: { label: "Epic", emoji: "🟣", color: 0x9b59b6, weight: 11.5, sell: 220 },
  legendary: { label: "Legendary", emoji: "🟡", color: 0xf1c40f, weight: 5, sell: 650 },
  mythic: { label: "Mythic", emoji: "🔴", color: 0xe74c3c, weight: 2.5, sell: 2000 },
  celestial: { label: "Celestial", emoji: "💠", color: 0x00d8ff, weight: 0.5, sell: 6000 },
};

export const RARITY_RANK = Object.fromEntries(RARITY_ORDER.map((rarity, index) => [rarity, index]));

export const ELEMENTS = {
  api: { label: "Api", emoji: "🔥", beats: "angin" },
  angin: { label: "Angin", emoji: "🌪️", beats: "bumi" },
  bumi: { label: "Bumi", emoji: "🪨", beats: "air" },
  air: { label: "Air", emoji: "💧", beats: "api" },
};

/** Skill pasif yang aktif otomatis saat duel, berdasarkan elemen kartu. */
export const ELEMENT_SKILLS = {
  api: {
    emoji: "🔥",
    name: "Bara Membara",
    description: "Peluang serangan kritis naik menjadi **25%** (dari 10%).",
  },
  angin: {
    emoji: "🌪️",
    name: "Kelicap Angin",
    description: "**15%** peluang menyerang dua kali dalam satu giliran.",
  },
  bumi: {
    emoji: "🪨",
    name: "Perisai Batu",
    description: "Damage yang diterima berkurang **15%**.",
  },
  air: {
    emoji: "💧",
    name: "Arus Penyembuh",
    description: "Memulihkan **6% HP maksimum** di akhir setiap ronde.",
  },
};

export const GACHA_SINGLE_COST = 150;
export const GACHA_MULTI_COUNT = 10;
export const GACHA_MULTI_COST = 1350;
export const EPIC_PITY = 10;
export const LEGENDARY_PITY = 60;
export const CELESTIAL_PITY = 200;

export const BATTLE_MIN_BET = 50;
export const BATTLE_MAX_BET = 10_000;
export const BATTLE_TAX_RATE = 0.05;
export const BATTLE_MAX_ROUNDS = 15;

export const CARD_MAX_LEVEL = 10;
export const LEVEL_BONUS_RATE = 0.08;
export const UPGRADE_COIN_PER_LEVEL = 150;

/** Statistik: ATK, DEF, SPD, dan teks rasa. */
export const CARDS = [
  // ------------------------------- Common ----------------------------------
  {
    id: "kucing-pasar",
    name: "Kucing Pasar",
    rarity: "common",
    element: "angin",
    emoji: "🐈",
    atk: 9,
    def: 4,
    spd: 12,
    flavor: "Lincah, tapi kabur begitu melihat sapu.",
  },
  {
    id: "ayam-jago",
    name: "Ayam Jago",
    rarity: "common",
    element: "api",
    emoji: "🐓",
    atk: 12,
    def: 5,
    spd: 8,
    flavor: "Berani berkokok jauh sebelum matahari terbit.",
  },
  {
    id: "kambing-gunung",
    name: "Kambing Gunung",
    rarity: "common",
    element: "bumi",
    emoji: "🐐",
    atk: 8,
    def: 9,
    spd: 6,
    flavor: "Pendaki ulung yang tidak takut tebing curam.",
  },
  {
    id: "ikan-cere",
    name: "Ikan Cere",
    rarity: "common",
    element: "air",
    emoji: "🐟",
    atk: 7,
    def: 6,
    spd: 11,
    flavor: "Kecil, cepat, dan hampir mustahil ditangkap tangan.",
  },
  {
    id: "kelelawar-gua",
    name: "Kelelawar Gua",
    rarity: "common",
    element: "angin",
    emoji: "🦇",
    atk: 10,
    def: 5,
    spd: 10,
    flavor: "Mendengar langkahmu sebelum kau sempat bergerak.",
  },
  {
    id: "kepiting-pantai",
    name: "Kepiting Pantai",
    rarity: "common",
    element: "air",
    emoji: "🦀",
    atk: 11,
    def: 8,
    spd: 5,
    flavor: "Capitannya kecil, tapi jangan pernah diremehkan.",
  },
  {
    id: "tikus-lumbung",
    name: "Tikus Lumbung",
    rarity: "common",
    element: "bumi",
    emoji: "🐁",
    atk: 7,
    def: 5,
    spd: 12,
    flavor: "Selalu tahu jalan keluar dari gudang yang terkunci.",
  },
  {
    id: "katak-sawah",
    name: "Katak Sawah",
    rarity: "common",
    element: "air",
    emoji: "🐸",
    atk: 9,
    def: 7,
    spd: 9,
    flavor: "Lompatannya seolah mengalahkan gravitasi desa.",
  },
  {
    id: "biawak-sungai",
    name: "Biawak Sungai",
    rarity: "common",
    element: "bumi",
    emoji: "🦎",
    atk: 11,
    def: 9,
    spd: 6,
    flavor: "Berjemur dulu, baru berkelahi.",
  },
  {
    id: "burung-pipit",
    name: "Burung Pipit",
    rarity: "common",
    element: "angin",
    emoji: "🐦",
    atk: 8,
    def: 4,
    spd: 13,
    flavor: "Kecil, gesit, dan penuh akal.",
  },
  {
    id: "anak-macan",
    name: "Anak Macan",
    rarity: "common",
    element: "api",
    emoji: "🐯",
    atk: 14,
    def: 6,
    spd: 10,
    flavor: "Belum besar, tapi giginya sudah tajam.",
  },
  {
    id: "semut-api",
    name: "Semut Api",
    rarity: "common",
    element: "api",
    emoji: "🐜",
    atk: 10,
    def: 8,
    spd: 7,
    flavor: "Satu semut kecil; seribu semut mengerikan.",
  },
  {
    id: "tupai-kebun",
    name: "Tupai Kebun",
    rarity: "common",
    element: "angin",
    emoji: "🐿️",
    atk: 9,
    def: 5,
    spd: 13,
    flavor: "Selalu punya cadangan kacang di balik daun.",
  },
  {
    id: "kura-kura-kolam",
    name: "Kura-kura Kolam",
    rarity: "common",
    element: "air",
    emoji: "🐢",
    atk: 7,
    def: 11,
    spd: 4,
    flavor: "Lambat melangkah, tapi tak pernah kalah sabar.",
  },
  {
    id: "lebah-madu",
    name: "Lebah Madu",
    rarity: "common",
    element: "angin",
    emoji: "🐝",
    atk: 10,
    def: 6,
    spd: 12,
    flavor: "Sengatnya kecil, kerja samanya menakutkan.",
  },
  {
    id: "ikan-lele",
    name: "Ikan Lele",
    rarity: "common",
    element: "air",
    emoji: "🐟",
    atk: 12,
    def: 7,
    spd: 9,
    flavor: "Berkumis di air keruh, tetap tahu arah pulang.",
  },
  {
    id: "kumbang-badak",
    name: "Kumbang Badak",
    rarity: "common",
    element: "bumi",
    emoji: "🪲",
    atk: 11,
    def: 10,
    spd: 5,
    flavor: "Cimidung kecil dengan kepala sekeras batu.",
  },
  {
    id: "burung-kolibri",
    name: "Burung Kolibri",
    rarity: "common",
    element: "angin",
    emoji: "🐦",
    atk: 8,
    def: 4,
    spd: 15,
    flavor: "Berhenti di udara lebih lama daripada di dahan.",
  },

  // -------------------------------- Rare -----------------------------------
  {
    id: "elang-perkasa",
    name: "Elang Perkasa",
    rarity: "rare",
    element: "angin",
    emoji: "🦅",
    atk: 26,
    def: 12,
    spd: 22,
    flavor: "Matanya membaca arus angin dari ketinggian.",
  },
  {
    id: "serigala-kabut",
    name: "Serigala Kabut",
    rarity: "rare",
    element: "angin",
    emoji: "🐺",
    atk: 24,
    def: 15,
    spd: 20,
    flavor: "Muncul dari kabut tepat saat kau lengah.",
  },
  {
    id: "buaya-muara",
    name: "Buaya Muara",
    rarity: "rare",
    element: "air",
    emoji: "🐊",
    atk: 28,
    def: 20,
    spd: 10,
    flavor: "Diamnya bukan tanda tidur.",
  },
  {
    id: "ular-kobra",
    name: "Ular Kobra",
    rarity: "rare",
    element: "bumi",
    emoji: "🐍",
    atk: 27,
    def: 12,
    spd: 18,
    flavor: "Satu patukan sudah cukup untuk mengakhiri.",
  },
  {
    id: "banteng-sakti",
    name: "Banteng Sakti",
    rarity: "rare",
    element: "bumi",
    emoji: "🐂",
    atk: 30,
    def: 20,
    spd: 11,
    flavor: "Setiap langkahnya mengguncang tanah.",
  },
  {
    id: "merak-api",
    name: "Merak Api",
    rarity: "rare",
    element: "api",
    emoji: "🦚",
    atk: 25,
    def: 14,
    spd: 21,
    flavor: "Bulunya indah; ekornya panas.",
  },
  {
    id: "hiu-karang",
    name: "Hiu Karang",
    rarity: "rare",
    element: "air",
    emoji: "🦈",
    atk: 29,
    def: 16,
    spd: 16,
    flavor: "Bergegas menuju mangsa tanpa ragu.",
  },
  {
    id: "landak-rimba",
    name: "Landak Rimba",
    rarity: "rare",
    element: "bumi",
    emoji: "🦔",
    atk: 20,
    def: 24,
    spd: 12,
    flavor: "Menyerangnya berarti melukai diri sendiri.",
  },
  {
    id: "garuda-muda",
    name: "Garuda Muda",
    rarity: "rare",
    element: "angin",
    emoji: "🪶",
    atk: 28,
    def: 13,
    spd: 23,
    flavor: "Sayapnya belum penuh, tapi cakarnya sudah tajam.",
  },
  {
    id: "rubah-api",
    name: "Rubah Api",
    rarity: "rare",
    element: "api",
    emoji: "🔥",
    atk: 29,
    def: 15,
    spd: 22,
    flavor: "Ekor menyala yang menghangatkan hutan saat ia lewat.",
  },
  {
    id: "rubah-hutan",
    name: "Rubah Hutan",
    rarity: "rare",
    element: "bumi",
    emoji: "🦊",
    atk: 26,
    def: 18,
    spd: 19,
    flavor: "Pandainya hanya kalah dari kemampuan bersembunyinya.",
  },
  {
    id: "elang-salju",
    name: "Elang Salju",
    rarity: "rare",
    element: "air",
    emoji: "🦅",
    atk: 27,
    def: 16,
    spd: 21,
    flavor: "Terbang di atas badai seolah itu jalan tol.",
  },
  {
    id: "kuda-api",
    name: "Kuda Api",
    rarity: "rare",
    element: "api",
    emoji: "🐎",
    atk: 31,
    def: 17,
    spd: 19,
    flavor: "Tapak kaki meninggalkan jejak hangat di tanah.",
  },
  {
    id: "ikan-naga-kecil",
    name: "Ikan Naga Kecil",
    rarity: "rare",
    element: "air",
    emoji: "🐠",
    atk: 25,
    def: 21,
    spd: 17,
    flavor: "Sisiknya berkilau seperti naga yang belum besar.",
  },

  // -------------------------------- Epic -----------------------------------
  {
    id: "harimau-putih",
    name: "Harimau Putih",
    rarity: "epic",
    element: "bumi",
    emoji: "🐅",
    atk: 46,
    def: 26,
    spd: 27,
    flavor: "Penguasa hutan salju yang tak pernah kehilangan jejak.",
  },
  {
    id: "naga-laut",
    name: "Naga Laut",
    rarity: "epic",
    element: "air",
    emoji: "🐉",
    atk: 44,
    def: 30,
    spd: 24,
    flavor: "Ombak mengikuti setiap gerakan tubuhnya.",
  },
  {
    id: "burung-petir",
    name: "Burung Petir",
    rarity: "epic",
    element: "angin",
    emoji: "⚡",
    atk: 48,
    def: 22,
    spd: 33,
    flavor: "Kepak sayapnya memecah langit.",
  },
  {
    id: "golem-batu",
    name: "Golem Batu",
    rarity: "epic",
    element: "bumi",
    emoji: "🗿",
    atk: 40,
    def: 34,
    spd: 18,
    flavor: "Dibangun dari gunung tua, tak mudah runtuh.",
  },
  {
    id: "phoenix-api",
    name: "Phoenix Api",
    rarity: "epic",
    element: "api",
    emoji: "🔥",
    atk: 47,
    def: 24,
    spd: 30,
    flavor: "Setiap kali jatuh, ia bangkit lebih panas.",
  },
  {
    id: "kraken",
    name: "Kraken Laut Dalam",
    rarity: "epic",
    element: "air",
    emoji: "🦑",
    atk: 42,
    def: 32,
    spd: 21,
    flavor: "Tentakelnya mencengkeram kapal dan mimpi buruk.",
  },
  {
    id: "kupu-kupu-celestial",
    name: "Kupu-kupu Celestial",
    rarity: "epic",
    element: "angin",
    emoji: "🦋",
    atk: 43,
    def: 25,
    spd: 34,
    flavor: "Debu sayapnya menerangi jalan menuju langit.",
  },
  {
    id: "singa-padang",
    name: "Singa Padang",
    rarity: "epic",
    element: "api",
    emoji: "🦁",
    atk: 49,
    def: 28,
    spd: 26,
    flavor: "Raungnya membuat savana berhenti sejenak.",
  },
  {
    id: "serigala-perak",
    name: "Serigala Perak",
    rarity: "epic",
    element: "angin",
    emoji: "🐺",
    atk: 46,
    def: 27,
    spd: 33,
    flavor: "Bulu keperakannya tampak di tengah gelap malam.",
  },
  {
    id: "naga-batu",
    name: "Naga Batu",
    rarity: "epic",
    element: "bumi",
    emoji: "🐉",
    atk: 45,
    def: 36,
    spd: 19,
    flavor: "Diam berhari-hari, lalu bergerak seperti gunung.",
  },

  // ------------------------------ Legendary --------------------------------
  {
    id: "garuda-agung",
    name: "Garuda Agung",
    rarity: "legendary",
    element: "angin",
    emoji: "🪽",
    atk: 66,
    def: 38,
    spd: 44,
    flavor: "Raja langit yang menjaga puncak awan.",
  },
  {
    id: "raja-naga",
    name: "Raja Naga",
    rarity: "legendary",
    element: "api",
    emoji: "🐲",
    atk: 70,
    def: 40,
    spd: 36,
    flavor: "Api napasnya cukup untuk melelehkan batu.",
  },
  {
    id: "ratu-laut",
    name: "Ratu Laut",
    rarity: "legendary",
    element: "air",
    emoji: "🧜‍♀️",
    atk: 58,
    def: 46,
    spd: 38,
    flavor: "Suaranya menenangkan badai, tapi juga bisa memanggilnya.",
  },
  {
    id: "singa-berkepala-sembilan",
    name: "Singa Berkepala Sembilan",
    rarity: "legendary",
    element: "api",
    emoji: "🦁",
    atk: 74,
    def: 46,
    spd: 40,
    flavor: "Sembilan raung, sembilan arah, satu penguasa.",
  },
  {
    id: "gagak-petir-perak-celestial",
    name: "Gagak Petir Perak Celestial",
    rarity: "legendary",
    element: "angin",
    emoji: "🪶",
    atk: 68,
    def: 40,
    spd: 46,
    flavor: "Bulu peraknya memantulkan sambaran sebelum menyentuh tanah.",
  },
  {
    id: "naga-listrik-celestial",
    name: "Naga Listrik Celestial",
    rarity: "legendary",
    element: "angin",
    emoji: "⚡",
    atk: 71,
    def: 42,
    spd: 43,
    flavor: "Napasnya adalah arus yang membuat langit berkedip.",
  },
  {
    id: "naga-es-celestial",
    name: "Naga Es Celestial",
    rarity: "legendary",
    element: "air",
    emoji: "❄️",
    atk: 66,
    def: 48,
    spd: 39,
    flavor: "Di belakangnya, embun berubah menjadi es sepanjang perjalanan.",
  },

  // -------------------------------- Mythic ---------------------------------
  {
    id: "dewa-petir",
    name: "Dewa Petir",
    rarity: "mythic",
    element: "angin",
    emoji: "🌩️",
    atk: 86,
    def: 50,
    spd: 56,
    flavor: "Kilat adalah titahnya; guntur adalah jawabannya.",
  },
  {
    id: "naga-emas",
    name: "Naga Emas",
    rarity: "mythic",
    element: "api",
    emoji: "🐉",
    atk: 92,
    def: 56,
    spd: 48,
    flavor: "Satu-satunya makhluk yang membuat naga lain menunduk.",
  },
  {
    id: "rubah-iblis-celestial",
    name: "Rubah Iblis Celestial",
    rarity: "mythic",
    element: "api",
    emoji: "🦊",
    atk: 96,
    def: 54,
    spd: 58,
    flavor: "Senyumnya meminjam kilau rembulan, lalu menyesatkan pemburu.",
  },
  {
    id: "gagak-petir-emas-celestial",
    name: "Gagak Petir Emas Celestial",
    rarity: "mythic",
    element: "angin",
    emoji: "🐦‍⬛",
    atk: 94,
    def: 55,
    spd: 60,
    flavor: "Satu kepakan sayapnya melahirkan petir berwarna emas.",
  },
  {
    id: "gagak-petir-putih-celestial",
    name: "Gagak Petir Putih Celestial",
    rarity: "mythic",
    element: "air",
    emoji: "🪽",
    atk: 91,
    def: 58,
    spd: 57,
    flavor: "Mengendarai badai putih yang tak pernah menyentuh daratan.",
  },
  {
    id: "phoenix-suci",
    name: "Phoenix Suci",
    rarity: "mythic",
    element: "api",
    emoji: "🔥",
    atk: 98,
    def: 57,
    spd: 55,
    flavor: "Api yang membakar bukan untuk menghanguskan, tapi menyucikan.",
  },
  {
    id: "yin-celestial",
    name: "Yin Celestial",
    rarity: "mythic",
    element: "air",
    emoji: "☯️",
    atk: 88,
    def: 62,
    spd: 51,
    flavor: "Sisi gelap langit yang menjaga keseimbangan segalanya.",
  },
  {
    id: "yang-celestial",
    name: "Yang Celestial",
    rarity: "mythic",
    element: "api",
    emoji: "☯️",
    atk: 100,
    def: 53,
    spd: 54,
    flavor: "Sisi terang langit yang menyalakan setiap awal.",
  },

  // ------------------------------ Celestial --------------------------------
  {
    id: "naga-primordial-pencipta",
    name: "Naga Primordial Pencipta",
    rarity: "celestial",
    element: "api",
    emoji: "🐉",
    atk: 124,
    def: 76,
    spd: 64,
    flavor: "Sebelum ada nama, ia sudah meniupkan awal ke dalam dunia.",
  },
  {
    id: "naga-primordial-elemen",
    name: "Naga Primordial Elemen",
    rarity: "celestial",
    element: "angin",
    emoji: "🐉",
    atk: 118,
    def: 70,
    spd: 74,
    flavor: "Api, air, bumi, dan angin tunduk pada satu napasnya.",
  },
  {
    id: "naga-primordial-bayang",
    name: "Naga Primordial Bayang",
    rarity: "celestial",
    element: "bumi",
    emoji: "🐉",
    atk: 121,
    def: 72,
    spd: 68,
    flavor: "Gelap yang lebih tua dari cahaya pertama.",
  },
  {
    id: "naga-berkepala-tiga-celestial",
    name: "Naga Berkepala Tiga Celestial",
    rarity: "celestial",
    element: "api",
    emoji: "🐲",
    atk: 128,
    def: 74,
    spd: 66,
    flavor: "Tiga kepala, tiga takdir, satu kehendak yang tak terbantahkan.",
  },
  {
    id: "rubah-dewa-ekor-sembilan",
    name: "Rubah Dewa Ekor Sembilan",
    rarity: "celestial",
    element: "api",
    emoji: "🦊",
    atk: 112,
    def: 68,
    spd: 78,
    flavor: "Sembilan ekor, sembilan abad, dan satu janji yang tak pernah diingkari.",
  },
];

const CARD_BY_ID = new Map(CARDS.map((card) => [card.id, card]));
const CARDS_BY_RARITY = new Map(
  RARITY_ORDER.map((rarity) => [rarity, CARDS.filter((card) => card.rarity === rarity)]),
);

export function getCard(cardId) {
  return CARD_BY_ID.get(String(cardId)) ?? null;
}

export function cardsOfRarity(rarity) {
  return CARDS_BY_RARITY.get(rarity) ?? [];
}

export function clampCardLevel(level) {
  const value = Math.floor(Number(level) || 1);
  return Math.min(CARD_MAX_LEVEL, Math.max(1, value));
}

/** Statistik efektif setelah bonus level (+8% per level di atas 1). */
export function effectiveStats(card, level = card.level ?? 1) {
  const current = clampCardLevel(level);
  const multiplier = 1 + (current - 1) * LEVEL_BONUS_RATE;

  return {
    atk: Math.round(card.atk * multiplier),
    def: Math.round(card.def * multiplier),
    spd: Math.round(card.spd * multiplier),
    hp: Math.round((90 + card.def * 7) * multiplier),
  };
}

/** HP diturunkan dari DEF supaya kartu bertahan lebih lama punya nilai. */
export function cardHp(card, level) {
  return effectiveStats(card, level).hp;
}

/** Satu angka ringkas untuk membandingkan kekuatan kartu. */
export function cardPower(card, level) {
  const stats = effectiveStats(card, level);
  return stats.atk * 2 + stats.def + stats.spd;
}

export function formatCardHeader(card) {
  const level = clampCardLevel(card.level ?? 1);
  return `${RARITIES[card.rarity].emoji} ${card.emoji} **${card.name}**${level > 1 ? ` · Lv.${level}` : ""}`;
}

export function formatCardStats(card) {
  const stats = effectiveStats(card);
  return `ATK **${stats.atk}** · DEF **${stats.def}** · SPD **${stats.spd}** · HP **${stats.hp}**`;
}

export function formatPower(card) {
  return `**${cardPower(card)}** power`;
}

/** Biaya naik level: duplikat sebanyak level sekarang + koin bertingkat. */
export function getUpgradeCost(level) {
  const current = clampCardLevel(level);
  if (current >= CARD_MAX_LEVEL) return null;

  return {
    from: current,
    to: current + 1,
    duplicates: current,
    coins: current * UPGRADE_COIN_PER_LEVEL,
  };
}

/** Gabungkan kartu dasar dengan levelnya untuk ditampilkan/dipertarungkan. */
export function withCardLevel(card, level) {
  return { ...card, level: clampCardLevel(level) };
}
