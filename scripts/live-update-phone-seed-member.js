/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const ADMIN_EMAIL = "morakaba.qa.admin.live@gmail.com";
const ADMIN_PASSWORD = "Morakaba!QaAdmin2026";
const MEMBER_EMAIL = "phase4.phone.member@gmail.com";
const MEMBER_PASSWORD = "Morakaba12345";

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

async function signInClient(url, anon, email, password, label) {
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.user) {
    throw new Error(`${label} signIn failed: ${signIn.error?.message ?? "no-user"}`);
  }
  return { client, user: signIn.data.user };
}

async function run() {
  loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env vars.");

  const admin = await signInClient(url, anon, ADMIN_EMAIL, ADMIN_PASSWORD, "admin");

  const factions = await admin.client.from("factions").select("name").order("name", { ascending: true }).limit(1);
  const faction = factions.data?.[0]?.name;
  if (!faction) throw new Error(`No faction found. factions error: ${factions.error?.message ?? "none"}`);

  const memberClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const signUp = await memberClient.auth.signUp({
    email: MEMBER_EMAIL,
    password: MEMBER_PASSWORD,
    options: { data: { full_name: "Phase4 Phone Member", faction } },
  });
  if (signUp.error && !/already|registered|exists/i.test(signUp.error.message)) {
    throw new Error(`Member signUp failed: ${signUp.error.message}`);
  }

  let memberAuth = await memberClient.auth.signInWithPassword({ email: MEMBER_EMAIL, password: MEMBER_PASSWORD });
  if (memberAuth.error || !memberAuth.data.user) {
    throw new Error(`Member signIn failed: ${memberAuth.error?.message ?? "no-user"}`);
  }

  const memberUserId = memberAuth.data.user.id;
  const upsertEmp = await admin.client.from("employees").upsert(
    {
      auth_user_id: memberUserId,
      full_name: "Phase4 Phone Member",
      email: MEMBER_EMAIL,
      role: "member",
      status: "approved",
      faction,
    },
    { onConflict: "auth_user_id" },
  );
  if (upsertEmp.error) throw new Error(`employees upsert failed: ${upsertEmp.error.message}`);

  const employee = await admin.client
    .from("employees")
    .select("id,auth_user_id,role,status,faction,email")
    .eq("auth_user_id", memberUserId)
    .single();
  if (employee.error) throw new Error(`Employee fetch failed: ${employee.error.message}`);

  console.log(
    JSON.stringify(
      {
        memberEmail: MEMBER_EMAIL,
        memberPassword: MEMBER_PASSWORD,
        memberUserId,
        employee: employee.data,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error("[live-update-phone-seed-member] FAILED:", error.message);
  process.exitCode = 1;
});
