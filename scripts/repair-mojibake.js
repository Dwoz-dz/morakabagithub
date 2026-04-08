const fs = require("node:fs");
const path = require("node:path");

const TARGET_FILES = [
  "app/(app)/admin/index.tsx",
  "app/(app)/admin/settings.tsx",
  "src/components/updates/smart-update-gate.tsx",
];

const MOJIBAKE_MARKER_CHAR_CLASS = "\\u00C2\\u00C3\\u00D8\\u00D9\\u00E2";
const MOJIBAKE_MARKERS_REGEX = new RegExp(`[${MOJIBAKE_MARKER_CHAR_CLASS}]`);
const MOJIBAKE_COUNT_REGEX = new RegExp(`[${MOJIBAKE_MARKER_CHAR_CLASS}]`, "g");
const HAS_ARABIC_REGEX = /[\u0600-\u06FF]/;
const ARABIC_COUNT_REGEX = /[\u0600-\u06FF]/g;

const CP1252_EXTRA_MAP = {
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

const countArabic = (value) => (value.match(ARABIC_COUNT_REGEX) ?? []).length;
const countMojibakeMarkers = (value) => (value.match(MOJIBAKE_COUNT_REGEX) ?? []).length;

const containsMojibakeMarkers = (value) => MOJIBAKE_MARKERS_REGEX.test(value);

const toCp1252Bytes = (value) => {
  const bytes = [];

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

  return Buffer.from(bytes);
};

const decodeCp1252AsUtf8 = (value) => {
  const bytes = toCp1252Bytes(value);
  if (!bytes) {
    return null;
  }

  try {
    return bytes.toString("utf8");
  } catch {
    return null;
  }
};

const isCandidateBetter = (current, candidate) => {
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

const fixPossiblyMojibake = (input) => {
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

const escapeQuoted = (text, delimiter) => {
  const escapedBackslashes = text.replace(/\\/g, "\\\\");

  if (delimiter === "`") {
    return escapedBackslashes.replace(/`/g, "\\`");
  }

  if (delimiter === "\"") {
    return escapedBackslashes.replace(/"/g, '\\"');
  }

  return escapedBackslashes.replace(/'/g, "\\'");
};

const literalRegex = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g;
const bullet = String.fromCharCode(0x2022);

for (const relativePath of TARGET_FILES) {
  const fullPath = path.resolve(process.cwd(), relativePath);
  const original = fs.readFileSync(fullPath, "utf8");
  let content = original;

  content = content.replace(/replace\(\/\^\[\\s\\-.*?\]\+\/, ""\)/g, `replace(/^[\\s\\-${bullet}]+/, "")`);

  content = content
    .split(/\r?\n/)
    .map((line) => {
      if (!containsMojibakeMarkers(line) || HAS_ARABIC_REGEX.test(line)) {
        return line;
      }

      const fixedLine = fixPossiblyMojibake(line);
      return fixedLine === line ? line : fixedLine;
    })
    .join("\n");

  content = content.replace(literalRegex, (match) => {
    const delimiter = match[0];
    const inner = match.slice(1, -1);
    const fixed = fixPossiblyMojibake(inner);

    if (fixed === inner) {
      return match;
    }

    return `${delimiter}${escapeQuoted(fixed, delimiter)}${delimiter}`;
  });

  if (content !== original) {
    fs.writeFileSync(fullPath, content, { encoding: "utf8" });
    console.log(`updated ${relativePath}`);
  } else {
    console.log(`unchanged ${relativePath}`);
  }
}
