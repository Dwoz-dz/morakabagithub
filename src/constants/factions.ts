export const FACTION_OPTIONS = [
  "خليل 21",
  "خليل 29",
  "فرقة البحث و الوقاية",
] as const;

export type FactionOption = (typeof FACTION_OPTIONS)[number];

export const isSupportedFaction = (value: string | null | undefined): value is FactionOption => {
  if (!value) {
    return false;
  }

  return (FACTION_OPTIONS as readonly string[]).includes(value.trim());
};

