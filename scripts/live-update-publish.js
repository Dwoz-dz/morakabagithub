/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const ADMIN_EMAIL = "morakaba.qa.admin.live@gmail.com";
const ADMIN_PASSWORD = "Morakaba!QaAdmin2026";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseBoolean(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function normalizeRoles(raw) {
  const roles = String(raw || "all")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set(["member", "admin", "all"]);
  const clean = [...new Set(roles.filter((r) => allowed.has(r)))];
  return clean.length ? clean : ["all"];
}

function arg(name, fallback = null) {
  const index = process.argv.findIndex((item) => item === `--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

async function run() {
  loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env vars.");

  const title = arg("title", `Phase4 Update ${Date.now()}`);
  const version = arg("version", "1.0.1");
  const min = arg("min", "1.0.0");
  const mandatory = parseBoolean(arg("mandatory", "false"), false);
  const forceLogout = parseBoolean(arg("forceLogout", "false"), false);
  const roles = normalizeRoles(arg("roles", "member"));
  const apkPath = arg("apkPath", "");
  const androidUrl = arg("androidUrl", "https://play.google.com/store/apps/details?id=com.morakaba.app");
  const iosUrl = arg("iosUrl", "https://apps.apple.com/app/id0000000000");
  const active = parseBoolean(arg("active", "true"), true);

  if (active && !apkPath.trim()) {
    throw new Error("Active updates now require --apkPath (Supabase Storage path).");
  }

  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (signIn.error || !signIn.data.user) {
    throw new Error(`Admin signIn failed: ${signIn.error?.message ?? "no-user"}`);
  }

  if (active) {
    const deactivate = await client
      .from("app_updates")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("is_active", true)
      .overlaps("target_roles", roles);
    if (deactivate.error) {
      throw new Error(`Deactivate active updates failed: ${deactivate.error.message}`);
    }
  }

  const insert = await client
    .from("app_updates")
    .insert({
      version,
      minimum_required_version: min,
      title,
      release_notes: [`${title} note 1`, `${title} note 2`],
      is_mandatory: mandatory,
      target_roles: roles,
      apk_path: apkPath || null,
      android_url: androidUrl,
      ios_url: iosUrl,
      is_active: active,
      force_logout_after_update: forceLogout,
      published_at: new Date().toISOString(),
      created_by: signIn.data.user.id,
    })
    .select(
      "id,version,minimum_required_version,title,target_roles,is_mandatory,force_logout_after_update,is_active,apk_path,android_url,published_at",
    )
    .single();

  if (insert.error || !insert.data) {
    throw new Error(`Publish update failed: ${insert.error?.message ?? "no-row"}`);
  }

  console.log(JSON.stringify(insert.data, null, 2));
}

run().catch((error) => {
  console.error("[live-update-publish] FAILED:", error.message);
  process.exitCode = 1;
});
