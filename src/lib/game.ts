export const STORAGE_KEY = "dendro_hunter_save";
export const TREE_DATA_URL =
  "/Trees_Major_Parks_Trees_Major_Parks_converted.geojson";

export type PlayerData = {
  fertilizer: number;
  lastCheckinDate: string | null;
  streak: number;
  totalCheckins: number;
  collectedSpecies: string[];
  treeLevels: Record<string, number>;
};

export const EMPTY_PLAYER: PlayerData = {
  fertilizer: 0,
  lastCheckinDate: null,
  streak: 0,
  totalCheckins: 0,
  collectedSpecies: [],
  treeLevels: {},
};

export const STAGE_ICONS = ["🌱", "🌿", "🪴", "🌳", "🌲"] as const;
export const STAGE_NAMES = ["幼苗", "小樹苗", "成長期", "大樹", "巨木"] as const;

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function cleanSpeciesName(name: string) {
  return name.replace(/[（(].*?[）)]/g, "").trim();
}

export function loadPlayer(): PlayerData {
  if (typeof window === "undefined") return { ...EMPTY_PLAYER };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { ...EMPTY_PLAYER, treeLevels: {}, collectedSpecies: [] };
    const parsed = JSON.parse(saved) as Partial<PlayerData>;
    return {
      ...EMPTY_PLAYER,
      ...parsed,
      collectedSpecies: Array.isArray(parsed.collectedSpecies)
        ? parsed.collectedSpecies.filter((item) => typeof item === "string")
        : [],
      treeLevels:
        parsed.treeLevels && typeof parsed.treeLevels === "object"
          ? parsed.treeLevels
          : {},
    };
  } catch {
    return { ...EMPTY_PLAYER, treeLevels: {}, collectedSpecies: [] };
  }
}

export function savePlayer(player: PlayerData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(player));
}

export type CollectResult =
  | { kind: "empty" }
  | { kind: "duplicate"; name: string }
  | { kind: "new"; name: string };

export function collectSpecies(player: PlayerData, rawName: string): {
  player: PlayerData;
  result: CollectResult;
} {
  const speciesName = cleanSpeciesName(rawName);
  if (!speciesName) return { player, result: { kind: "empty" } };

  if (player.collectedSpecies.includes(speciesName)) {
    return {
      player: { ...player, fertilizer: player.fertilizer + 1 },
      result: { kind: "duplicate", name: speciesName },
    };
  }

  return {
    player: {
      ...player,
      collectedSpecies: [...player.collectedSpecies, speciesName],
      treeLevels: { ...player.treeLevels, [speciesName]: 1 },
      fertilizer: player.fertilizer + 2,
    },
    result: { kind: "new", name: speciesName },
  };
}

export function checkIn(player: PlayerData, today = localDateKey()): {
  player: PlayerData;
  already: boolean;
} {
  if (player.lastCheckinDate === today) return { player, already: true };
  return {
    already: false,
    player: {
      ...player,
      fertilizer: player.fertilizer + 1,
      lastCheckinDate: today,
      streak: player.streak + 1,
      totalCheckins: player.totalCheckins + 1,
    },
  };
}

export type UpgradeResult =
  | { ok: true; player: PlayerData; stage: string }
  | { ok: false; reason: "max" | "fertilizer" };

export function upgradeTree(player: PlayerData, species: string): UpgradeResult {
  const level = player.treeLevels[species] || 1;
  if (level >= 5) return { ok: false, reason: "max" };
  if (player.fertilizer < 1) return { ok: false, reason: "fertilizer" };
  const nextLevel = level + 1;
  return {
    ok: true,
    stage: STAGE_NAMES[level],
    player: {
      ...player,
      fertilizer: player.fertilizer - 1,
      treeLevels: { ...player.treeLevels, [species]: nextLevel },
    },
  };
}
