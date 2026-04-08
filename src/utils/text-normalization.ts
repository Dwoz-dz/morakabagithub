const MOJIBAKE_MARKER_CHAR_CLASS = "\\u00C2\\u00C3\\u00D8\\u00D9\\u00E2";
const MOJIBAKE_MARKERS_REGEX = new RegExp(`[${MOJIBAKE_MARKER_CHAR_CLASS}]`);
const MOJIBAKE_COUNT_REGEX = new RegExp(`[${MOJIBAKE_MARKER_CHAR_CLASS}]`, "g");
const ARABIC_COUNT_REGEX = /[\u0600-\u06FF]/g;

const CP1252_EXTRA_MAP: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

const countArabic = (value: string): number => (value.match(ARABIC_COUNT_REGEX) ?? []).length;
const countMojibakeMarkers = (value: string): number => (value.match(MOJIBAKE_COUNT_REGEX) ?? []).length;

const containsMojibakeMarkers = (value: string): boolean => MOJIBAKE_MARKERS_REGEX.test(value);

const toCp1252Bytes = (value: string): Uint8Array | null => {
  const bytes: number[] = [];

  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (typeof codePoint !== "number") {
      return null;
    }

    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }

    const mapped = CP1252_EXTRA_MAP[codePoint];
    if (typeof mapped === "number") {
      bytes.push(mapped);
      continue;
    }

    return null;
  }

  return new Uint8Array(bytes);
};

const decodeCp1252AsUtf8 = (value: string): string | null => {
  const bytes = toCp1252Bytes(value);
  if (!bytes) {
    return null;
  }

  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
};

const isCandidateBetter = (current: string, candidate: string): boolean => {
  if (!candidate || candidate === current) {
    return false;
  }

  if (candidate.includes("\uFFFD")) {
    return false;
  }

  const currentArabic = countArabic(current);
  const candidateArabic = countArabic(candidate);

  const currentMojibake = countMojibakeMarkers(current);
  const candidateMojibake = countMojibakeMarkers(candidate);

  if (candidateArabic > currentArabic) {
    return true;
  }

  if (candidateMojibake < currentMojibake && candidateArabic >= currentArabic) {
    return true;
  }

  return false;
};

export const fixPossiblyMojibake = (input: string): string => {
  if (!input || !containsMojibakeMarkers(input)) {
    return input;
  }

  let current = input;

  for (let index = 0; index < 4; index += 1) {
    const decoded = decodeCp1252AsUtf8(current);
    if (!decoded) {
      break;
    }

    if (!isCandidateBetter(current, decoded)) {
      break;
    }

    current = decoded;
  }

  return current;
};

const normalizeUnknown = (value: unknown, seen: WeakMap<object, unknown>): unknown => {
  if (typeof value === "string") {
    return fixPossiblyMojibake(value);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value);
  }

  if (Array.isArray(value)) {
    const normalizedArray: unknown[] = [];
    seen.set(value, normalizedArray);
    value.forEach((item) => {
      normalizedArray.push(normalizeUnknown(item, seen));
    });
    return normalizedArray;
  }

  const normalizedObject: Record<string, unknown> = {};
  seen.set(value, normalizedObject);

  Object.entries(value as Record<string, unknown>).forEach(([key, itemValue]) => {
    normalizedObject[key] = normalizeUnknown(itemValue, seen);
  });

  return normalizedObject;
};

export const normalizeTextDeep = <T>(value: T): T => {
  if (typeof value === "string") {
    return fixPossiblyMojibake(value) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return normalizeUnknown(value, new WeakMap<object, unknown>()) as T;
};
