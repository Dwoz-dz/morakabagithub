const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env");
const STATE_PATH = path.join(ROOT, "scripts", ".final-audit-state.json");
const FLOW_STATE_PATH = path.join(ROOT, "scripts", ".live-flow-state.json");

const readEnv = () => {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(".env file not found.");
  }

  const raw = fs.readFileSync(ENV_PATH, "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return env;
};

const safeReadJson = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnR9KkAAAAASUVORK5CYII=";

const nowStamp = () => Date.now();

const buildCandidates = () => {
  const state = safeReadJson(STATE_PATH);
  const flow = safeReadJson(FLOW_STATE_PATH);

  const candidates = [
    {
      label: "qa-fallback-approved-member",
      email: "morakaba.qa.admin.live@gmail.com",
      password: "Morakaba!QaAdmin2026",
    },
    {
      label: "state-admin",
      email: state?.admin?.email ?? null,
      password: state?.admin?.password ?? null,
    },
    {
      label: "state-member",
      email: state?.member?.email ?? null,
      password: state?.member?.password ?? null,
    },
    {
      label: "flow-user",
      email: flow?.email ?? null,
      password: flow?.password ?? null,
    },
  ];

  return candidates.filter((item) => item.email && item.password);
};

const signInFirstApprovedUser = async (url, anonKey, candidates) => {
  for (const candidate of candidates) {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const signIn = await client.auth.signInWithPassword({
      email: candidate.email,
      password: candidate.password,
    });

    if (signIn.error || !signIn.data.user) {
      continue;
    }

    const uid = signIn.data.user.id;
    const employee = await client
      .from("employees")
      .select("id,auth_user_id,full_name,email,role,status,faction,avatar_url")
      .eq("auth_user_id", uid)
      .maybeSingle();

    if (employee.error || !employee.data) {
      continue;
    }

    if (employee.data.status !== "approved") {
      continue;
    }

    return {
      client,
      user: signIn.data.user,
      session: signIn.data.session,
      account: candidate,
      employee: employee.data,
    };
  }

  return null;
};

const main = async () => {
  const env = readEnv();
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    account: null,
    profileLoad: null,
    rpcs: {
      ensureEmployeeProfile: null,
      updateCurrentProfile: null,
      syncEmployeeFromRequest: null,
    },
    avatar: {
      upload: null,
      signedUrl: null,
      persistToEmployee: null,
    },
    weaponSignature: {
      upload: null,
      insertSubmission: null,
      readSubmission: null,
      signedUrl: null,
    },
    cleanup: [],
  };

  const cleanup = {
    avatarPath: null,
    signaturePath: null,
    submissionId: null,
  };

  const candidates = buildCandidates();
  const authContext = await signInFirstApprovedUser(url, anonKey, candidates);
  if (!authContext) {
    report.error = "No approved test account could sign in.";
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const { client, user, account, employee } = authContext;
  report.account = {
    label: account.label,
    email: account.email,
    userId: user.id,
    employeeId: employee.id,
    role: employee.role,
    status: employee.status,
    faction: employee.faction,
  };

  try {
    report.profileLoad = { ok: true, employee };

    const ensureRpc = await client.rpc("ensure_employee_profile_for_current_user");
    report.rpcs.ensureEmployeeProfile = ensureRpc.error
      ? { ok: false, error: ensureRpc.error.message }
      : { ok: true, value: ensureRpc.data };

    const avatarPath = `${user.id}/avatar.jpg`;
    cleanup.avatarPath = avatarPath;

    const avatarUpload = await client.storage
      .from("profile-avatars")
      .upload(avatarPath, Buffer.from(tinyPngBase64, "base64"), {
        contentType: "image/png",
        upsert: true,
      });

    report.avatar.upload = avatarUpload.error
      ? { ok: false, error: avatarUpload.error.message }
      : { ok: true, path: avatarPath };

    if (!avatarUpload.error) {
      const avatarSigned = await client.storage
        .from("profile-avatars")
        .createSignedUrl(avatarPath, 3600);

      report.avatar.signedUrl = avatarSigned.error
        ? { ok: false, error: avatarSigned.error.message }
        : { ok: true, urlPrefix: avatarSigned.data?.signedUrl?.slice(0, 80) ?? null };
    }

    const updateRpc = await client.rpc("update_current_employee_profile", {
      p_full_name: employee.full_name,
      p_avatar_url: avatarPath,
      p_set_avatar: true,
    });

    report.rpcs.updateCurrentProfile = updateRpc.error
      ? { ok: false, error: updateRpc.error.message }
      : { ok: true, value: updateRpc.data };

    const employeeAfter = await client
      .from("employees")
      .select("id,auth_user_id,avatar_url")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    report.avatar.persistToEmployee = employeeAfter.error
      ? { ok: false, error: employeeAfter.error.message }
      : {
          ok: true,
          avatarUrl: employeeAfter.data?.avatar_url ?? null,
          expectedPath: avatarPath,
          match: employeeAfter.data?.avatar_url === avatarPath,
        };

    const syncRpc = await client.rpc("sync_employee_from_registration_request", {
      p_auth_user_id: user.id,
    });
    report.rpcs.syncEmployeeFromRequest = syncRpc.error
      ? { ok: false, error: syncRpc.error.message }
      : { ok: true, value: syncRpc.data };

    const signaturePath = `${user.id}/signature.png`;
    cleanup.signaturePath = signaturePath;

    const signatureUpload = await client.storage
      .from("weapon-checks")
      .upload(signaturePath, Buffer.from(tinyPngBase64, "base64"), {
        contentType: "image/png",
        upsert: true,
      });

    report.weaponSignature.upload = signatureUpload.error
      ? { ok: false, error: signatureUpload.error.message }
      : { ok: true, path: signaturePath };

    if (!signatureUpload.error && employee.faction) {
      const insertSubmission = await client
        .from("weapon_submissions")
        .insert({
          employee_id: employee.id,
          faction: employee.faction,
          weapon_type: `QA Weapon ${nowStamp()}`,
          serial_number: `QA-${nowStamp()}`,
          check_date: new Date().toISOString().slice(0, 10),
          image_path: null,
          signature_path: signaturePath,
          signature_name: employee.full_name,
          notes: "qa signature end-to-end",
          status: "pending",
        })
        .select("id,employee_id,faction,signature_path,status,created_at")
        .single();

      report.weaponSignature.insertSubmission = insertSubmission.error
        ? { ok: false, error: insertSubmission.error.message }
        : { ok: true, row: insertSubmission.data };

      if (!insertSubmission.error && insertSubmission.data?.id) {
        cleanup.submissionId = insertSubmission.data.id;

        const readSubmission = await client
          .from("weapon_submissions")
          .select("id,signature_path,status,created_at")
          .eq("id", insertSubmission.data.id)
          .single();

        report.weaponSignature.readSubmission = readSubmission.error
          ? { ok: false, error: readSubmission.error.message }
          : { ok: true, row: readSubmission.data };

        const signatureSigned = await client.storage
          .from("weapon-checks")
          .createSignedUrl(signaturePath, 3600);

        report.weaponSignature.signedUrl = signatureSigned.error
          ? { ok: false, error: signatureSigned.error.message }
          : { ok: true, urlPrefix: signatureSigned.data?.signedUrl?.slice(0, 80) ?? null };
      }
    }
  } finally {
    if (cleanup.submissionId) {
      const deleteSubmission = await client.from("weapon_submissions").delete().eq("id", cleanup.submissionId);
      report.cleanup.push({
        type: "weapon_submission",
        id: cleanup.submissionId,
        ok: !deleteSubmission.error,
        error: deleteSubmission.error?.message ?? null,
      });
    }

    if (cleanup.signaturePath) {
      const deleteSignature = await client.storage.from("weapon-checks").remove([cleanup.signaturePath]);
      report.cleanup.push({
        type: "weapon_signature_file",
        path: cleanup.signaturePath,
        ok: !deleteSignature.error,
        error: deleteSignature.error?.message ?? null,
      });
    }

    if (cleanup.avatarPath) {
      const deleteAvatar = await client.storage.from("profile-avatars").remove([cleanup.avatarPath]);
      report.cleanup.push({
        type: "profile_avatar_file",
        path: cleanup.avatarPath,
        ok: !deleteAvatar.error,
        error: deleteAvatar.error?.message ?? null,
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        fatal: true,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
