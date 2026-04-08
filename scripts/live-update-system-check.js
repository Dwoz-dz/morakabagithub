/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const APP_VERSION = "1.0.0";
const QA_PREFIX = `phase4upd${Date.now()}`;
const ADMIN_CANDIDATES = [
  { email: "morakaba.qa.admin.live@gmail.com", password: "Morakaba!QaAdmin2026", label: "qa-admin-fallback" },
];

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function compareVersions(a, b) {
  const left = String(a)
    .split(".")
    .map((x) => Number.parseInt(x, 10) || 0);
  const right = String(b)
    .split(".")
    .map((x) => Number.parseInt(x, 10) || 0);
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

function evaluateRequirement(currentVersion, row) {
  const mandatory =
    compareVersions(currentVersion, row.minimum_required_version) < 0 ||
    (Boolean(row.is_mandatory) && compareVersions(currentVersion, row.version) < 0);
  if (mandatory) return "mandatory";
  if (compareVersions(currentVersion, row.version) < 0) return "optional";
  return "none";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildQaApkPath(suffix) {
  return `${QA_PREFIX}/${suffix}.apk`;
}

async function createAuthedClient(url, anonKey, email, password, label) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session || !signIn.data.user) {
    throw new Error(`${label} signIn failed: ${signIn.error?.message ?? "no-session"}`);
  }
  return { client, session: signIn.data.session, user: signIn.data.user, email, label };
}

async function resolveValidFaction(admin) {
  const factions = await admin.client.from("factions").select("name").order("created_at", { ascending: true }).limit(1);
  if (!factions.error && factions.data?.[0]?.name) {
    return factions.data[0].name;
  }

  const selfEmployee = await admin.client
    .from("employees")
    .select("faction")
    .eq("auth_user_id", admin.user.id)
    .maybeSingle();

  if (!selfEmployee.error && selfEmployee.data?.faction) {
    return selfEmployee.data.faction;
  }

  throw new Error(
    `Could not resolve valid faction for member seed. factionsErr=${factions.error?.message ?? "none"} selfErr=${selfEmployee.error?.message ?? "none"}`,
  );
}

async function ensureQaMember(url, anonKey, admin) {
  const email = `${QA_PREFIX}.member@gmail.com`;
  const password = `Morakaba!${Date.now()}M`;
  const faction = await resolveValidFaction(admin);

  const memberClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signUp = await memberClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: `${QA_PREFIX} member`,
        faction,
      },
    },
  });

  if (signUp.error) {
    throw new Error(`Member signUp failed: ${signUp.error.message}`);
  }

  const memberAuthUserId = signUp.data.user?.id;
  assert(memberAuthUserId, "Member auth user id missing after signUp.");

  const upsertEmployee = await admin.client.from("employees").upsert(
    {
      auth_user_id: memberAuthUserId,
      email,
      full_name: `${QA_PREFIX} member`,
      role: "member",
      status: "approved",
      faction,
    },
    { onConflict: "auth_user_id" },
  );

  if (upsertEmployee.error) {
    throw new Error(`Member employee upsert failed: ${upsertEmployee.error.message}`);
  }

  const auth = await createAuthedClient(url, anonKey, email, password, "qa-member");
  return {
    ...auth,
    password,
  };
}

async function createUpdate(admin, payload) {
  const insert = await admin.client
    .from("app_updates")
    .insert(payload)
    .select(
      "id,version,minimum_required_version,title,release_notes,is_mandatory,target_roles,apk_path,android_url,ios_url,is_active,force_logout_after_update,published_at,created_at",
    )
    .single();

  if (insert.error || !insert.data) {
    throw new Error(`Create update failed: ${insert.error?.message ?? "no-row"}`);
  }

  return insert.data;
}

async function cleanupQaRows(admin) {
  const del = await admin.client.from("app_updates").delete().ilike("title", `${QA_PREFIX}%`);
  if (del.error) {
    throw new Error(`Cleanup failed: ${del.error.message}`);
  }
}

async function run() {
  loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.");
  }

  let admin = null;
  let lastAdminError = null;
  for (const candidate of ADMIN_CANDIDATES) {
    try {
      admin = await createAuthedClient(url, anonKey, candidate.email, candidate.password, candidate.label);
      break;
    } catch (error) {
      lastAdminError = error;
    }
  }
  if (!admin) {
    throw new Error(`Admin auth failed. Last error: ${lastAdminError?.message ?? "unknown"}`);
  }

  const member = await ensureQaMember(url, anonKey, admin);

  const report = {
    timestamp: new Date().toISOString(),
    qaPrefix: QA_PREFIX,
    appVersion: APP_VERSION,
    adminEmail: admin.email,
    memberEmail: member.email,
    memberPassword: member.password,
    checks: {},
  };

  const tableProbe = await admin.client.from("app_updates").select("id").limit(1);
  assert(!tableProbe.error, `app_updates table check failed: ${tableProbe.error?.message}`);
  report.checks.tableExists = true;

  const memberInsert = await member.client.from("app_updates").insert({
    version: "9.9.9",
    minimum_required_version: "9.9.9",
    title: `${QA_PREFIX} should fail insert`,
    release_notes: ["blocked"],
    target_roles: ["member"],
    is_active: false,
    is_mandatory: false,
    force_logout_after_update: false,
  });
  report.checks.memberInsertBlocked = Boolean(memberInsert.error);

  await cleanupQaRows(admin);

  const optionalUpdate = await createUpdate(admin, {
    version: "1.0.1",
    minimum_required_version: "1.0.0",
    title: `${QA_PREFIX} member optional`,
    release_notes: ["optional update"],
    is_mandatory: false,
    target_roles: ["member"],
    apk_path: buildQaApkPath("member-optional"),
    android_url: "https://play.google.com/store/apps/details?id=com.morakaba.app",
    ios_url: "https://apps.apple.com/app/id0000000000",
    is_active: true,
    force_logout_after_update: false,
    published_at: new Date().toISOString(),
    created_by: admin.user.id,
  });

  const memberOptionalRead = await member.client
    .from("app_updates")
    .select("id,version,minimum_required_version,is_mandatory,target_roles,apk_path,is_active,force_logout_after_update,android_url")
    .eq("is_active", true)
    .overlaps("target_roles", ["member", "all"]);
  assert(!memberOptionalRead.error, `member optional read failed: ${memberOptionalRead.error?.message}`);
  const memberOptionalRow = (memberOptionalRead.data ?? []).find((row) => row.id === optionalUpdate.id);
  assert(memberOptionalRow, "member optional update not visible for member.");
  report.checks.memberOptionalRequirement = evaluateRequirement(APP_VERSION, memberOptionalRow);

  const adminMemberOnlyFilter = await admin.client
    .from("app_updates")
    .select("id,title,target_roles")
    .eq("is_active", true)
    .overlaps("target_roles", ["admin", "all"]);
  assert(!adminMemberOnlyFilter.error, `admin filtered read failed: ${adminMemberOnlyFilter.error?.message}`);
  report.checks.adminSeesMemberOnlyViaAppFilter = (adminMemberOnlyFilter.data ?? []).some(
    (row) => row.id === optionalUpdate.id,
  );

  const mandatoryUpdate = await createUpdate(admin, {
    version: "1.0.2",
    minimum_required_version: "1.0.1",
    title: `${QA_PREFIX} member mandatory`,
    release_notes: ["mandatory update"],
    is_mandatory: true,
    target_roles: ["member"],
    apk_path: buildQaApkPath("member-mandatory"),
    android_url: "https://play.google.com/store/apps/details?id=com.morakaba.app",
    ios_url: "https://apps.apple.com/app/id0000000000",
    is_active: true,
    force_logout_after_update: false,
    published_at: new Date().toISOString(),
    created_by: admin.user.id,
  });

  const memberMandatoryRead = await member.client
    .from("app_updates")
    .select("id,version,minimum_required_version,is_mandatory,target_roles,apk_path,is_active,force_logout_after_update")
    .eq("id", mandatoryUpdate.id)
    .single();
  assert(!memberMandatoryRead.error, `member mandatory read failed: ${memberMandatoryRead.error?.message}`);
  report.checks.memberMandatoryRequirement = evaluateRequirement(APP_VERSION, memberMandatoryRead.data);

  const allRolesUpdate = await createUpdate(admin, {
    version: "1.0.3",
    minimum_required_version: "1.0.0",
    title: `${QA_PREFIX} all optional`,
    release_notes: ["all users"],
    is_mandatory: false,
    target_roles: ["all"],
    apk_path: buildQaApkPath("all-optional"),
    android_url: "https://play.google.com/store/apps/details?id=com.morakaba.app",
    ios_url: "https://apps.apple.com/app/id0000000000",
    is_active: true,
    force_logout_after_update: false,
    published_at: new Date().toISOString(),
    created_by: admin.user.id,
  });

  const memberAllRead = await member.client
    .from("app_updates")
    .select("id")
    .eq("id", allRolesUpdate.id)
    .single();
  const adminAllFilteredRead = await admin.client
    .from("app_updates")
    .select("id")
    .eq("id", allRolesUpdate.id)
    .overlaps("target_roles", ["admin", "all"])
    .single();
  report.checks.targetAllVisibleToMember = !memberAllRead.error;
  report.checks.targetAllVisibleToAdmin = !adminAllFilteredRead.error;

  const forceLogoutUpdate = await createUpdate(admin, {
    version: "1.0.0",
    minimum_required_version: "1.0.0",
    title: `${QA_PREFIX} member force logout`,
    release_notes: ["force logout check"],
    is_mandatory: false,
    target_roles: ["member"],
    apk_path: buildQaApkPath("member-force-logout"),
    android_url: "https://play.google.com/store/apps/details?id=com.morakaba.app",
    ios_url: "https://apps.apple.com/app/id0000000000",
    is_active: true,
    force_logout_after_update: true,
    published_at: new Date().toISOString(),
    created_by: admin.user.id,
  });

  const memberForceLogoutRead = await member.client
    .from("app_updates")
    .select("id,version,minimum_required_version,is_mandatory,force_logout_after_update")
    .eq("id", forceLogoutUpdate.id)
    .single();
  assert(!memberForceLogoutRead.error, `member force logout read failed: ${memberForceLogoutRead.error?.message}`);
  report.checks.forceLogoutShouldTriggerAtCurrentVersion =
    Boolean(memberForceLogoutRead.data.force_logout_after_update) &&
    compareVersions(APP_VERSION, memberForceLogoutRead.data.version) >= 0;

  const memberDeleteAttempt = await member.client.from("app_updates").delete().eq("id", forceLogoutUpdate.id);
  const adminCheckAfterMemberDelete = await admin.client
    .from("app_updates")
    .select("id")
    .eq("id", forceLogoutUpdate.id)
    .maybeSingle();
  report.checks.memberDeleteBlocked =
    !memberDeleteAttempt.error && Boolean(adminCheckAfterMemberDelete.data?.id) && !adminCheckAfterMemberDelete.error;

  report.checks.optionalUrl = optionalUpdate.android_url;
  report.checks.optionalApkPath = optionalUpdate.apk_path;
  report.checks.allTargetUrl = allRolesUpdate.android_url;
  report.checks.allTargetApkPath = allRolesUpdate.apk_path;

  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error("[live-update-system-check] FAILED:", error.message);
  process.exitCode = 1;
});
