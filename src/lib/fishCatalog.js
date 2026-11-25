/**
 * Katalog minigame Fishing: ikan, rarity, rod (pancing), dan bait (umpan).
 * Nama ikan sengaja memakai bahasa Inggris supaya terasa seperti game.
 */

export const FISH_RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

/** Bobot dalam persen; total harus 100. */
export const FISH_RARITIES = {
  common: { label: "Common", emoji: "⚪", color: 0x95a5a6, weight: 50 },
  uncommon: { label: "Uncommon", emoji: "🟢", color: 0x2ecc71, weight: 28 },
  rare: { label: "Rare", emoji: "🔵", color: 0x3498db, weight: 14 },
  epic: { label: "Epic", emoji: "🟣", color: 0x9b59b6, weight: 6 },
  legendary: { label: "Legendary", emoji: "🟡", color: 0xf1c40f, weight: 1.8 },
  mythic: { label: "Mythic", emoji: "🔴", color: 0xe74c3c, weight: 0.2 },
};

export const FISH_RARITY_RANK = Object.fromEntries(
  FISH_RARITY_ORDER.map((rarity, index) => [rarity, index]),
);

/** {@link FISH} — 30 ikan, 5 per rarity. `price` adalah nilai dasar sebelum ukuran & bonus rod/bait. */
export const FISH = [
  // Common
  { id: "sardine", name: "Sardine", rarity: "common", emoji: "🐟", price: 30, minCm: 10, maxCm: 22, habitat: "Coastal shallows" },
  { id: "anchovy", name: "Anchovy", rarity: "common", emoji: "🐟", price: 35, minCm: 8, maxCm: 18, habitat: "Open sea" },
  { id: "guppy", name: "Guppy", rarity: "common", emoji: "🐠", price: 40, minCm: 3, maxCm: 6, habitat: "Garden ponds" },
  { id: "creek-catfish", name: "Creek Catfish", rarity: "common", emoji: "🐟", price: 45, minCm: 25, maxCm: 55, habitat: "Muddy rivers" },
  { id: "pond-roach", name: "Pond Roach", rarity: "common", emoji: "🐟", price: 50, minCm: 12, maxCm: 28, habitat: "Still water" },

  // Uncommon
  { id: "rainbow-trout", name: "Rainbow Trout", rarity: "uncommon", emoji: "🐟", price: 120, minCm: 30, maxCm: 60, habitat: "Cold streams" },
  { id: "nile-tilapia", name: "Nile Tilapia", rarity: "uncommon", emoji: "🐟", price: 140, minCm: 20, maxCm: 45, habitat: "Warm lakes" },
  { id: "goldfish", name: "Goldfish", rarity: "uncommon", emoji: "🐠", price: 160, minCm: 8, maxCm: 20, habitat: "Ornamental ponds" },
  { id: "glassfish", name: "Glassfish", rarity: "uncommon", emoji: "🐠", price: 180, minCm: 4, maxCm: 9, habitat: "Clear rivers" },
  { id: "river-perch", name: "River Perch", rarity: "uncommon", emoji: "🐟", price: 200, minCm: 18, maxCm: 40, habitat: "Riverbanks" },

  // Rare
  { id: "koi-carp", name: "Koi Carp", rarity: "rare", emoji: "🐠", price: 280, minCm: 30, maxCm: 70, habitat: "Temple ponds" },
  { id: "angelfish", name: "Angelfish", rarity: "rare", emoji: "🐠", price: 320, minCm: 12, maxCm: 25, habitat: "Coral reefs" },
  { id: "blue-marlin", name: "Blue Marlin", rarity: "rare", emoji: "🐟", price: 360, minCm: 180, maxCm: 320, habitat: "Deep blue" },
  { id: "snow-crab", name: "Snow Crab", rarity: "rare", emoji: "🦀", price: 400, minCm: 10, maxCm: 20, habitat: "Cold seabed" },
  { id: "sturgeon", name: "Sturgeon", rarity: "rare", emoji: "🐟", price: 450, minCm: 120, maxCm: 250, habitat: "Ancient rivers" },

  // Epic
  { id: "lionfish", name: "Lionfish", rarity: "epic", emoji: "🐠", price: 650, minCm: 20, maxCm: 40, habitat: "Coral reefs" },
  { id: "electric-eel", name: "Electric Eel", rarity: "epic", emoji: "🐍", price: 750, minCm: 100, maxCm: 200, habitat: "Murky swamps" },
  { id: "flying-fish", name: "Flying Fish", rarity: "epic", emoji: "🐟", price: 850, minCm: 15, maxCm: 30, habitat: "Ocean surface" },
  { id: "moon-jellyfish", name: "Moon Jellyfish", rarity: "epic", emoji: "🪼", price: 950, minCm: 10, maxCm: 25, habitat: "Midnight tide" },
  { id: "emperor-angelfish", name: "Emperor Angelfish", rarity: "epic", emoji: "🐠", price: 1100, minCm: 20, maxCm: 40, habitat: "Tropical reefs" },

  // Legendary
  { id: "king-koi", name: "King Koi", rarity: "legendary", emoji: "🐠", price: 1600, minCm: 60, maxCm: 110, habitat: "Imperial ponds" },
  { id: "golden-trout", name: "Golden Trout", rarity: "legendary", emoji: "🐟", price: 1900, minCm: 40, maxCm: 80, habitat: "Alpine lakes" },
  { id: "narwhal", name: "Narwhal", rarity: "legendary", emoji: "🐋", price: 2200, minCm: 350, maxCm: 550, habitat: "Arctic seas" },
  { id: "giant-squid", name: "Giant Squid", rarity: "legendary", emoji: "🦑", price: 2600, minCm: 600, maxCm: 1000, habitat: "Abyssal zone" },
  { id: "coelacanth", name: "Coelacanth", rarity: "legendary", emoji: "🐟", price: 3000, minCm: 80, maxCm: 180, habitat: "Deep caves" },

  // Mythic
  { id: "leviathan", name: "Leviathan", rarity: "mythic", emoji: "🐋", price: 4500, minCm: 900, maxCm: 1500, habitat: "Legendary depths" },
  { id: "crystal-dragonfish", name: "Crystal Dragonfish", rarity: "mythic", emoji: "🐉", price: 5200, minCm: 150, maxCm: 300, habitat: "Crystal trench" },
  { id: "abyssal-anglerfish", name: "Abyssal Anglerfish", rarity: "mythic", emoji: "🎣", price: 6000, minCm: 20, maxCm: 50, habitat: "Lightless deep" },
  { id: "celestial-manta", name: "Celestial Manta", rarity: "mythic", emoji: "🐋", price: 6800, minCm: 400, maxCm: 700, habitat: "Starlit sea" },
  { id: "golden-whale", name: "Golden Whale", rarity: "mythic", emoji: "🐋", price: 8000, minCm: 800, maxCm: 1400, habitat: "Golden current" },
];

/**
 * Rod: `luck` menaikkan bobot ikan Rare+ dan menurunkan Common/Uncommon.
 * `valueBonus` menaikkan harga jual hasil tangkapan.
 */
export const RODS = {
  bamboo: { id: "bamboo", name: "Bamboo Rod", emoji: "🎣", cost: 0, luck: 0, valueBonus: 0, note: "Pancing awal, tanpa bonus." },
  starter: { id: "starter", name: "Starter Rod", emoji: "🪝", cost: 600, luck: 0.15, valueBonus: 0.05, note: "Ringan dan seimbang untuk pemula." },
  steel: { id: "steel", name: "Steel Rod", emoji: "⚙️", cost: 2500, luck: 0.35, valueBonus: 0.12, note: "Kuat untuk ikan besar." },
  golden: { id: "golden", name: "Golden Rod", emoji: "🏆", cost: 9000, luck: 0.7, valueBonus: 0.25, note: "Magnet ikan langka." },
  celestial: { id: "celestial", name: "Celestial Rod", emoji: "💠", cost: 28000, luck: 1.2, valueBonus: 0.45, note: "Pancing legendaris dari langit." },
};

/** Bait: dikonsumsi 1 per cast. `luck` dan `valueBonus` ditambahkan ke rod. */
export const BAITS = {
  worm: { id: "worm", name: "Worm", emoji: "🪱", cost: 15, luck: 0, valueBonus: 0, note: "Umpan standar." },
  corn: { id: "corn", name: "Corn", emoji: "🌽", cost: 45, luck: 0.12, valueBonus: 0.05, note: "Disukai ikan air tawar." },
  shrimp: { id: "shrimp", name: "Shrimp", emoji: "🦐", cost: 110, luck: 0.3, valueBonus: 0.1, note: "Aroma kuat dari dasar laut." },
  golden: { id: "golden", name: "Golden Bait", emoji: "✨", cost: 300, luck: 0.7, valueBonus: 0.2, note: "Berkilau, menarik ikan epic." },
  celestial: { id: "celestial", name: "Celestial Bait", emoji: "🌟", cost: 900, luck: 1.2, valueBonus: 0.35, note: "Umpan paling langka di pasaran." },
};

export const ROD_ORDER = Object.keys(RODS);
export const BAIT_ORDER = Object.keys(BAITS);

export const FISH_COOLDOWN_MS = 30_000;
export const FREE_BAIT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const FREE_BAIT_AMOUNT = 5;
export const STARTING_WORMS = 10;
export const MAX_BAIT = 9999;

const FISH_BY_ID = new Map(FISH.map((fish) => [fish.id, fish]));
const FISH_BY_RARITY = new Map(
  FISH_RARITY_ORDER.map((rarity) => [rarity, FISH.filter((fish) => fish.rarity === rarity)]),
);

export function getFish(fishId) {
  return FISH_BY_ID.get(String(fishId)) ?? null;
}

export function fishesOfRarity(rarity) {
  return FISH_BY_RARITY.get(rarity) ?? [];
}

export function fishLabel(fish) {
  return `${FISH_RARITIES[fish.rarity].emoji} ${fish.emoji} ${fish.name}`;
}
