const fs = require("node:fs");
const path = require("node:path");

const TARGET_DIRS = ["app", "src", "supabase/migrations"];
const SCANNED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".sql",
  ".md",
]);
const MARKER_REGEX = /[\u00C2\u00C3\u00D8\u00D9\u00E2]/;

const ROOT = process.cwd();

const walkFiles = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".expo" || entry.name === ".git") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, out);
      continue;
    }

    if (SCANNED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(fullPath);
    }
  }

  return out;
};

const detectMojibake = (content) => {
  const hits = [];
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (MARKER_REGEX.test(lines[index])) {
      hits.push({
        line: index + 1,
        preview: lines[index].trim().slice(0, 200),
      });
    }
  }
  return hits;
};

const allFiles = TARGET_DIRS.flatMap((dir) => walkFiles(path.join(ROOT, dir)));
const report = [];

for (const filePath of allFiles) {
  const raw = fs.readFileSync(filePath, "utf8");
  const hits = detectMojibake(raw);
  if (hits.length) {
    report.push({
      file: path.relative(ROOT, filePath).replace(/\\/g, "/"),
      hits: hits.slice(0, 10),
      totalHits: hits.length,
    });
  }
}

if (report.length) {
  console.error("Mojibake markers detected:");
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      scannedFiles: allFiles.length,
      message: "No mojibake markers found in source and migrations.",
    },
    null,
    2,
  ),
);
