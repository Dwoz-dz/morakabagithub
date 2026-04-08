const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const readEnvFile = () => {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const raw = fs.readFileSync(envPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const map = {};

  for (const line of lines) {
    if (line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    map[key] = value;
  }

  return map;
};

const env = readEnvFile();
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(url, anonKey);

async function run() {
  const result = {
    sessionCheck: null,
    employeesTable: null,
    registrationRequestsTable: null,
    factionsTable: null,
    storageBucketExists: null,
  };

  const session = await supabase.auth.getSession();
  result.sessionCheck = session.error ? `error: ${session.error.message}` : "ok";

  const employees = await supabase.from("employees").select("id").limit(1);
  result.employeesTable = employees.error ? `error: ${employees.error.message}` : "ok";

  const requests = await supabase.from("registration_requests").select("id").limit(1);
  result.registrationRequestsTable = requests.error ? `error: ${requests.error.message}` : "ok";

  const factions = await supabase.from("factions").select("id").limit(1);
  result.factionsTable = factions.error ? `error: ${factions.error.message}` : "ok";

  const buckets = await supabase.storage.listBuckets();
  if (buckets.error) {
    result.storageBucketExists = `error: ${buckets.error.message}`;
  } else {
    const visibleBuckets = buckets.data || [];
    if (visibleBuckets.length === 0) {
      result.storageBucketExists = "inconclusive: listBuckets returned no visible buckets";
    } else {
      const exists = visibleBuckets.some((bucket) => bucket.name === "weapon-checks");
      result.storageBucketExists = exists ? "ok" : "missing";
    }
  }

  const failedChecks = Object.entries(result).filter(([, value]) => {
    if (typeof value !== "string") return false;
    return value.startsWith("error:") || value === "missing";
  });

  console.log(JSON.stringify(result, null, 2));

  if (failedChecks.length > 0) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error("verify-backend failed:", error?.message || error);
  process.exit(1);
});
