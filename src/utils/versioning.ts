interface ParsedVersion {
  numeric: number[];
  prerelease: string[];
}

const toNumericToken = (token: string): number => {
  if (!token) return 0;
  const normalized = token.replace(/[^0-9]/g, "");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseVersion = (version: string): ParsedVersion => {
  const normalized = version.trim().replace(/^v/i, "");
  if (!normalized) {
    return { numeric: [0], prerelease: [] };
  }

  const [withoutMetadata] = normalized.split("+");
  const [basePart, prereleasePart] = withoutMetadata.split("-");

  const numeric = basePart
    .split(".")
    .map((segment) => toNumericToken(segment));

  return {
    numeric: numeric.length ? numeric : [0],
    prerelease: prereleasePart
      ? prereleasePart
          .split(".")
          .map((segment) => segment.trim())
          .filter(Boolean)
      : [],
  };
};

const comparePrerelease = (left: string[], right: string[]): number => {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;

  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];

    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    const leftNumber = Number(leftPart);
    const rightNumber = Number(rightPart);
    const leftIsNumber = Number.isInteger(leftNumber) && `${leftNumber}` === leftPart;
    const rightIsNumber = Number.isInteger(rightNumber) && `${rightNumber}` === rightPart;

    if (leftIsNumber && rightIsNumber) {
      if (leftNumber > rightNumber) return 1;
      if (leftNumber < rightNumber) return -1;
      continue;
    }

    if (leftIsNumber) return -1;
    if (rightIsNumber) return 1;

    return leftPart > rightPart ? 1 : -1;
  }

  return 0;
};

export const compareVersions = (left: string, right: string): number => {
  const leftParsed = parseVersion(left);
  const rightParsed = parseVersion(right);

  const maxLength = Math.max(leftParsed.numeric.length, rightParsed.numeric.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftSegment = leftParsed.numeric[index] ?? 0;
    const rightSegment = rightParsed.numeric[index] ?? 0;

    if (leftSegment > rightSegment) return 1;
    if (leftSegment < rightSegment) return -1;
  }

  return comparePrerelease(leftParsed.prerelease, rightParsed.prerelease);
};

export const isVersionLowerThan = (currentVersion: string, targetVersion: string): boolean =>
  compareVersions(currentVersion, targetVersion) < 0;
