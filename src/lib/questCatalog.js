/**
 * Katalog Daily & Weekly Quest.
 *
 * Setiap quest punya `event` yang dipanggil dari aksi terkait (fishing,
 * mining, gacha, battle, work) dan `family` supaya satu board tidak berisi
 * dua quest dari aktivitas yang sama.
 */

export const DAILY_QUEST_COUNT = 4;
export const WEEKLY_QUEST_COUNT = 3;

export const DAILY_QUESTS = [
  { id: "daily_dig_5", type: "daily", family: "mine", event: "mine_dig", target: 5, reward: 350, emoji: "⛏️", title: "Gali 5 kali" },
  { id: "daily_mine_sell_8", type: "daily", family: "mine", event: "mine_sell", target: 8, reward: 300, emoji: "💰", title: "Jual 8 ore" },
  { id: "daily_mine_earn_1000", type: "daily", family: "mine", event: "mine_earn", target: 1000, reward: 300, emoji: "🪙", title: "Dapat 1.000 koin dari ore" },
  { id: "daily_mine_rare_1", type: "daily", family: "mine", event: "mine_rare", target: 1, reward: 500, emoji: "💎", title: "Temukan 1 ore Epic+" },

  { id: "daily_fish_5", type: "daily", family: "fish", event: "fish_cast", target: 5, reward: 350, emoji: "🎣", title: "Tangkap 5 ikan" },
  { id: "daily_fish_sell_8", type: "daily", family: "fish", event: "fish_sell", target: 8, reward: 300, emoji: "💰", title: "Jual 8 ikan" },
  { id: "daily_fish_earn_1000", type: "daily", family: "fish", event: "fish_earn", target: 1000, reward: 300, emoji: "🪙", title: "Dapat 1.000 koin dari ikan" },
  { id: "daily_fish_rare_2", type: "daily", family: "fish", event: "fish_rare", target: 2, reward: 500, emoji: "✨", title: "Tangkap 2 ikan Rare+" },

  { id: "daily_gacha_2", type: "daily", family: "gacha", event: "gacha_pull", target: 2, reward: 450, emoji: "🎴", title: "Buka 2 gacha" },
  { id: "daily_battle_win_1", type: "daily", family: "battle", event: "battle_win", target: 1, reward: 600, emoji: "⚔️", title: "Menang 1 duel kartu" },
  { id: "daily_work_2", type: "daily", family: "work", event: "work", target: 2, reward: 300, emoji: "💼", title: "Bekerja 2 kali" },
];

export const WEEKLY_QUESTS = [
  { id: "weekly_dig_30", type: "weekly", family: "mine", event: "mine_dig", target: 30, reward: 2200, emoji: "⛏️", title: "Gali 30 kali" },
  { id: "weekly_mine_sell_50", type: "weekly", family: "mine", event: "mine_sell", target: 50, reward: 1800, emoji: "💰", title: "Jual 50 ore" },
  { id: "weekly_mine_earn_15000", type: "weekly", family: "mine", event: "mine_earn", target: 15000, reward: 2000, emoji: "🪙", title: "Dapat 15.000 koin dari ore" },
  { id: "weekly_mine_rare_10", type: "weekly", family: "mine", event: "mine_rare", target: 10, reward: 2800, emoji: "💎", title: "Temukan 10 ore Epic+" },

  { id: "weekly_fish_30", type: "weekly", family: "fish", event: "fish_cast", target: 30, reward: 2200, emoji: "🎣", title: "Tangkap 30 ikan" },
  { id: "weekly_fish_sell_50", type: "weekly", family: "fish", event: "fish_sell", target: 50, reward: 1800, emoji: "💰", title: "Jual 50 ikan" },
  { id: "weekly_fish_earn_15000", type: "weekly", family: "fish", event: "fish_earn", target: 15000, reward: 2000, emoji: "🪙", title: "Dapat 15.000 koin dari ikan" },
  { id: "weekly_fish_rare_10", type: "weekly", family: "fish", event: "fish_rare", target: 10, reward: 2800, emoji: "✨", title: "Tangkap 10 ikan Rare+" },

  { id: "weekly_gacha_15", type: "weekly", family: "gacha", event: "gacha_pull", target: 15, reward: 2500, emoji: "🎴", title: "Buka 15 gacha" },
  { id: "weekly_battle_win_5", type: "weekly", family: "battle", event: "battle_win", target: 5, reward: 3000, emoji: "⚔️", title: "Menang 5 duel kartu" },
  { id: "weekly_work_10", type: "weekly", family: "work", event: "work", target: 10, reward: 2000, emoji: "💼", title: "Bekerja 10 kali" },
];

const QUEST_BY_ID = new Map([...DAILY_QUESTS, ...WEEKLY_QUESTS].map((quest) => [quest.id, quest]));

export function getQuest(questId) {
  return QUEST_BY_ID.get(String(questId)) ?? null;
}

/** FNV-1a 32-bit, cukup untuk seed deterministik per user/periode. */
function hashString(input) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pilih quest secara deterministik dari sebuah pool. Seed yang sama selalu
 * menghasilkan board yang sama, jadi pilihan tidak berubah saat bot restart.
 */
export function pickQuests(pool, count, seed) {
  const random = mulberry32(hashString(String(seed)));
  const shuffled = [...pool];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }

  const picked = [];
  const families = new Set();
  for (const quest of shuffled) {
    if (families.has(quest.family)) continue;
    families.add(quest.family);
    picked.push(quest);
    if (picked.length >= count) break;
  }

  return picked;
}
