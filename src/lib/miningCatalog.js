/**
 * Katalog minigame Mining: ore, rarity, pickaxe, dan lampu (light).
 * Nama item sengaja memakai bahasa Inggris supaya terasa seperti game.
 */

export const ORE_RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

/** Bobot dalam persen; total harus 100. */
export const ORE_RARITIES = {
  common: { label: "Common", emoji: "⚪", color: 0x95a5a6, weight: 50 },
  uncommon: { label: "Uncommon", emoji: "🟢", color: 0x2ecc71, weight: 28 },
  rare: { label: "Rare", emoji: "🔵", color: 0x3498db, weight: 14 },
  epic: { label: "Epic", emoji: "🟣", color: 0x9b59b6, weight: 6 },
  legendary: { label: "Legendary", emoji: "🟡", color: 0xf1c40f, weight: 1.8 },
  mythic: { label: "Mythic", emoji: "🔴", color: 0xe74c3c, weight: 0.2 },
};

export const ORE_RARITY_RANK = Object.fromEntries(
  ORE_RARITY_ORDER.map((rarity, index) => [rarity, index]),
);

/**
 * {@link ORES} — 30 ore, 5 per rarity.
 * `price` adalah nilai dasar sebelum berat & bonus pickaxe/lampu.
 * `minDepth`/`maxDepth` hanya untuk flavor kedalaman (meter).
 */
export const ORES = [
  // Common
  { id: "coal", name: "Coal", rarity: "common", emoji: "🪨", price: 35, minKg: 0.5, maxKg: 3, minDepth: 5, maxDepth: 30, layer: "Shallow tunnels" },
  { id: "copper-ore", name: "Copper Ore", rarity: "common", emoji: "🟠", price: 40, minKg: 0.4, maxKg: 2.5, minDepth: 5, maxDepth: 35, layer: "Copper veins" },
  { id: "tin-ore", name: "Tin Ore", rarity: "common", emoji: "⚙️", price: 45, minKg: 0.4, maxKg: 2.2, minDepth: 8, maxDepth: 40, layer: "Rocky caverns" },
  { id: "iron-ore", name: "Iron Ore", rarity: "common", emoji: "🔩", price: 50, minKg: 0.6, maxKg: 3.5, minDepth: 10, maxDepth: 50, layer: "Iron deposits" },
  { id: "quartz", name: "Quartz", rarity: "common", emoji: "🔹", price: 55, minKg: 0.2, maxKg: 1.5, minDepth: 12, maxDepth: 55, layer: "Quartz pockets" },

  // Uncommon
  { id: "silver-ore", name: "Silver Ore", rarity: "uncommon", emoji: "⚪", price: 130, minKg: 0.3, maxKg: 2, minDepth: 20, maxDepth: 70, layer: "Silver veins" },
  { id: "gold-ore", name: "Gold Ore", rarity: "uncommon", emoji: "🟡", price: 145, minKg: 0.3, maxKg: 2, minDepth: 25, maxDepth: 80, layer: "Golden seams" },
  { id: "amethyst", name: "Amethyst", rarity: "uncommon", emoji: "🟣", price: 160, minKg: 0.1, maxKg: 1, minDepth: 30, maxDepth: 90, layer: "Amethyst geodes" },
  { id: "sapphire", name: "Sapphire", rarity: "uncommon", emoji: "🔵", price: 180, minKg: 0.1, maxKg: 0.9, minDepth: 35, maxDepth: 100, layer: "Sapphire chambers" },
  { id: "ruby", name: "Ruby", rarity: "uncommon", emoji: "🔴", price: 200, minKg: 0.1, maxKg: 0.9, minDepth: 40, maxDepth: 110, layer: "Ruby caverns" },

  // Rare
  { id: "emerald", name: "Emerald", rarity: "rare", emoji: "🟢", price: 300, minKg: 0.1, maxKg: 0.8, minDepth: 50, maxDepth: 130, layer: "Emerald hollows" },
  { id: "topaz", name: "Topaz", rarity: "rare", emoji: "🟠", price: 330, minKg: 0.1, maxKg: 0.8, minDepth: 55, maxDepth: 140, layer: "Topaz veins" },
  { id: "opal", name: "Opal", rarity: "rare", emoji: "🌈", price: 360, minKg: 0.1, maxKg: 0.7, minDepth: 60, maxDepth: 150, layer: "Opal grottos" },
  { id: "obsidian", name: "Obsidian", rarity: "rare", emoji: "⚫", price: 420, minKg: 0.8, maxKg: 4, minDepth: 70, maxDepth: 170, layer: "Volcanic glass" },
  { id: "meteorite-fragment", name: "Meteorite Fragment", rarity: "rare", emoji: "☄️", price: 470, minKg: 0.5, maxKg: 3, minDepth: 80, maxDepth: 190, layer: "Impact craters" },

  // Epic
  { id: "diamond", name: "Diamond", rarity: "epic", emoji: "💎", price: 700, minKg: 0.1, maxKg: 0.6, minDepth: 90, maxDepth: 210, layer: "Diamond depths" },
  { id: "platinum-ore", name: "Platinum Ore", rarity: "epic", emoji: "⬜", price: 780, minKg: 0.4, maxKg: 2, minDepth: 100, maxDepth: 230, layer: "Platinum veins" },
  { id: "moonstone", name: "Moonstone", rarity: "epic", emoji: "🌙", price: 860, minKg: 0.2, maxKg: 1.2, minDepth: 110, maxDepth: 250, layer: "Moonlit caves" },
  { id: "star-fragment", name: "Star Fragment", rarity: "epic", emoji: "⭐", price: 980, minKg: 0.1, maxKg: 0.8, minDepth: 130, maxDepth: 280, layer: "Fallen stars" },
  { id: "ancient-relic", name: "Ancient Relic", rarity: "epic", emoji: "🏺", price: 1100, minKg: 0.5, maxKg: 3, minDepth: 150, maxDepth: 300, layer: "Lost ruins" },

  // Legendary
  { id: "void-crystal", name: "Void Crystal", rarity: "legendary", emoji: "🔮", price: 1700, minKg: 0.2, maxKg: 1.5, minDepth: 180, maxDepth: 340, layer: "Void rifts" },
  { id: "dragon-scale", name: "Dragon Scale", rarity: "legendary", emoji: "🐉", price: 1950, minKg: 0.3, maxKg: 2, minDepth: 200, maxDepth: 380, layer: "Dragon nests" },
  { id: "phoenix-ember", name: "Phoenix Ember", rarity: "legendary", emoji: "🔥", price: 2200, minKg: 0.1, maxKg: 1, minDepth: 230, maxDepth: 420, layer: "Ember chambers" },
  { id: "celestial-ore", name: "Celestial Ore", rarity: "legendary", emoji: "🌌", price: 2600, minKg: 0.4, maxKg: 2.5, minDepth: 260, maxDepth: 460, layer: "Celestial caverns" },
  { id: "titan-heart", name: "Titan Heart", rarity: "legendary", emoji: "❤️", price: 3000, minKg: 1, maxKg: 5, minDepth: 300, maxDepth: 500, layer: "Titan tombs" },

  // Mythic
  { id: "heart-of-the-earth", name: "Heart of the Earth", rarity: "mythic", emoji: "🌍", price: 4800, minKg: 2, maxKg: 8, minDepth: 400, maxDepth: 600, layer: "World core" },
  { id: "aurora-core", name: "Aurora Core", rarity: "mythic", emoji: "🌠", price: 5400, minKg: 0.5, maxKg: 3, minDepth: 450, maxDepth: 650, layer: "Aurora veins" },
  { id: "chrono-shard", name: "Chrono Shard", rarity: "mythic", emoji: "⏳", price: 6200, minKg: 0.2, maxKg: 1.5, minDepth: 500, maxDepth: 700, layer: "Time fractures" },
  { id: "abyss-gem", name: "Abyss Gem", rarity: "mythic", emoji: "🕳️", price: 7000, minKg: 0.3, maxKg: 2, minDepth: 550, maxDepth: 750, layer: "Abyssal hollows" },
  { id: "genesis-crystal", name: "Genesis Crystal", rarity: "mythic", emoji: "💠", price: 8200, minKg: 0.5, maxKg: 3.5, minDepth: 600, maxDepth: 800, layer: "Genesis vault" },
];

/**
 * Pickaxe: `luck` menaikkan bobot ore Rare+ dan menurunkan Common/Uncommon.
 * `valueBonus` menaikkan harga jual ore. `depthBonus` menambah kedalaman (meter).
 */
export const PICKAXES = {
  wooden: { id: "wooden", name: "Wooden Pickaxe", emoji: "⛏️", cost: 0, luck: 0, valueBonus: 0, depthBonus: 0, note: "Pickaxe awal, tanpa bonus." },
  stone: { id: "stone", name: "Stone Pickaxe", emoji: "🪨", cost: 600, luck: 0.15, valueBonus: 0.05, depthBonus: 5, note: "Lebih kuat menggali batuan dasar." },
  iron: { id: "iron", name: "Iron Pickaxe", emoji: "🔩", cost: 2500, luck: 0.35, valueBonus: 0.12, depthBonus: 15, note: "Bisa menembus lapisan keras." },
  diamond: { id: "diamond", name: "Diamond Pickaxe", emoji: "💎", cost: 9000, luck: 0.7, valueBonus: 0.25, depthBonus: 30, note: "Magnet ore langka di kedalaman." },
  celestial: { id: "celestial", name: "Celestial Pickaxe", emoji: "🌌", cost: 28000, luck: 1.2, valueBonus: 0.45, depthBonus: 60, note: "Pickaxe legendaris dari inti bintang." },
};

/** Lampu: dikonsumsi 1 per dig. `luck` dan `valueBonus` ditambahkan ke pickaxe. */
export const LIGHTS = {
  torch: { id: "torch", name: "Torch", emoji: "🔥", cost: 15, luck: 0, valueBonus: 0, note: "Lampu standar." },
  lantern: { id: "lantern", name: "Lantern", emoji: "🏮", cost: 45, luck: 0.12, valueBonus: 0.05, note: "Cahaya stabil di terowongan panjang." },
  glowstone: { id: "glowstone", name: "Glowstone", emoji: "🟡", cost: 110, luck: 0.3, valueBonus: 0.1, note: "Bersinar terang, menarik ore langka." },
  crystal: { id: "crystal", name: "Crystal Light", emoji: "🔷", cost: 300, luck: 0.7, valueBonus: 0.2, note: "Kristal bercahaya dari gua dalam." },
  star: { id: "star", name: "Star Light", emoji: "🌟", cost: 900, luck: 1.2, valueBonus: 0.35, note: "Cahaya paling langka di tambang." },
};

export const PICKAXE_ORDER = Object.keys(PICKAXES);
export const LIGHT_ORDER = Object.keys(LIGHTS);

export const MINING_COOLDOWN_MS = 45_000;
export const FREE_LIGHT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const FREE_LIGHT_AMOUNT = 5;
export const STARTING_TORCHES = 10;
export const MAX_LIGHT = 9999;

const ORE_BY_ID = new Map(ORES.map((ore) => [ore.id, ore]));
const ORE_BY_RARITY = new Map(
  ORE_RARITY_ORDER.map((rarity) => [rarity, ORES.filter((ore) => ore.rarity === rarity)]),
);

export function getOre(oreId) {
  return ORE_BY_ID.get(String(oreId)) ?? null;
}

export function oresOfRarity(rarity) {
  return ORE_BY_RARITY.get(rarity) ?? [];
}

export function oreLabel(ore) {
  return `${ORE_RARITIES[ore.rarity].emoji} ${ore.emoji} ${ore.name}`;
}
