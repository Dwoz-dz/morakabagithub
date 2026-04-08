const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env");
const STATE_PATH = path.join(ROOT, "scripts", ".final-audit-state.json");
const REPORT_PATH = path.join(ROOT, "scripts", ".live-qa-final-report.json");

const REQUIRED_BUCKETS = ["weapon-checks", "fuel-bon", "profile-avatars"];
const QA_ADMIN_FALLBACK = {
  email: "morakaba.qa.admin.live@gmail.com",
  password: "Morakaba!QaAdmin2026",
};

const readEnvFile = () => {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(".env file not found.");
  }

  const raw = fs.readFileSync(ENV_PATH, "utf8");
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
const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env");
}

if (!fs.existsSync(STATE_PATH)) {
  throw new Error(`Missing state file: ${STATE_PATH}`);
}

const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));

const resolveRoute = ({ hasBootstrapped, session, employee }) => {
  if (!hasBootstrapped) return "/splash";
  if (!session) return "/(auth)/login";
  if (!employee || employee.status === "pending") return "/(auth)/waiting-approval";
  if (["rejected", "frozen", "blocked"].includes(employee.status)) return "/(auth)/blocked-status";
  if (employee.role === "admin") return "/(app)/admin";
  return "/(app)/member";
};

const createAuthedClient = async ({ email, password, label }) => {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session || !signIn.data.user) {
    throw new Error(`${label} signIn failed: ${signIn.error?.message ?? "no session"}`);
  }

  return {
    client,
    session: signIn.data.session,
    user: signIn.data.user,
  };
};

const getWeekStartSaturday = () => {
  const now = new Date();
  const day = now.getDay();
  const distanceFromSaturday = (day + 1) % 7;
  const saturday = new Date(now);
  saturday.setDate(now.getDate() - distanceFromSaturday);
  return saturday.toISOString().slice(0, 10);
};

const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const results = [];
const context = {
  qaPrefix: `qa-live-${Date.now()}`,
};

const runStep = async (name, fn) => {
  const startedAt = new Date().toISOString();
  try {
    const details = await fn();
    results.push({
      name,
      status: "pass",
      startedAt,
      endedAt: new Date().toISOString(),
      details: details ?? null,
    });
  } catch (error) {
    results.push({
      name,
      status: "fail",
      startedAt,
      endedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const run = async () => {
  await runStep("admin_signin_and_role_check", async () => {
    const candidateCreds = [];
    if (state.admin?.email && state.admin?.password) {
      candidateCreds.push({
        email: state.admin.email,
        password: state.admin.password,
        label: "state-admin",
      });
    }
    candidateCreds.push({
      email: QA_ADMIN_FALLBACK.email,
      password: QA_ADMIN_FALLBACK.password,
      label: "qa-admin-fallback",
    });

    let adminAuth = null;
    let lastError = null;

    for (const creds of candidateCreds) {
      try {
        adminAuth = await createAuthedClient({
          email: creds.email,
          password: creds.password,
          label: creds.label,
        });
        context.adminCreds = creds;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    assert(adminAuth, `Admin sign-in failed for all candidates. Last error: ${lastError}`);
    context.admin = adminAuth;

    const { data, error } = await adminAuth.client
      .from("employees")
      .select("id, auth_user_id, role, status, faction")
      .eq("auth_user_id", adminAuth.user.id)
      .single();

    assert(!error, `Admin employee lookup failed: ${error?.message}`);
    assert(data?.role === "admin", `Expected admin role, got: ${data?.role}`);
    assert(data?.status === "approved", `Expected approved admin status, got: ${data?.status}`);

    context.adminEmployee = data;
    return {
      adminUserId: adminAuth.user.id,
      adminEmployeeId: data.id,
      credsSource: context.adminCreds?.label ?? "unknown",
      adminEmail: context.adminCreds?.email ?? null,
    };
  });

  await runStep("bucket_existence_check", async () => {
    const admin = context.admin;
    assert(admin?.client, "Admin client missing.");

    const bucketResult = await admin.client.storage.listBuckets();
    if (bucketResult.error) {
      return {
        mode: "listBuckets-inconclusive",
        reason: bucketResult.error.message,
      };
    }

    const names = (bucketResult.data ?? []).map((b) => b.name);
    const missing = REQUIRED_BUCKETS.filter((bucket) => !names.includes(bucket));
    if (missing.length > 0) {
      return {
        mode: "listBuckets-inconclusive",
        visibleBuckets: names,
        missingFromList: missing,
        note: "Will verify bucket existence via real upload tests.",
      };
    }

    return { buckets: names };
  });

  await runStep("approve_to_employees_flow_live", async () => {
    const admin = context.admin;
    assert(admin?.client, "Admin client missing.");

    const email = `${context.qaPrefix}.member@gmail.com`;
    const password = `Morakaba!${Date.now()}`;
    const fullName = "QA Live Member";
    const faction = "خليل 21";

    const pendingClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const signUp = await pendingClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          faction,
        },
      },
    });

    let session = signUp.data?.session ?? null;
    let user = signUp.data?.user ?? null;

    if (!session) {
      const fallback = await pendingClient.auth.signInWithPassword({ email, password });
      assert(!fallback.error, `Pending fallback signIn failed: ${fallback.error?.message}`);
      session = fallback.data?.session ?? null;
      user = fallback.data?.user ?? null;
    }

    assert(session && user, "Pending user signup failed: no session or user.");

    const requestInsert = await pendingClient
      .from("registration_requests")
      .upsert(
        {
          auth_user_id: user.id,
          full_name: fullName,
          email,
          faction,
          status: "pending",
        },
        { onConflict: "auth_user_id" },
      )
      .select("id, auth_user_id, status")
      .single();

    assert(!requestInsert.error, `registration_requests upsert failed: ${requestInsert.error?.message}`);

    const pendingEmployeeBefore = await pendingClient
      .from("employees")
      .select("auth_user_id, role, status")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const routeBeforeApproval = resolveRoute({
      hasBootstrapped: true,
      session,
      employee: pendingEmployeeBefore.data ?? null,
    });

    assert(routeBeforeApproval === "/(auth)/waiting-approval", `Unexpected pending route: ${routeBeforeApproval}`);

    const approveRequest = await admin.client
      .from("registration_requests")
      .update({ status: "approved" })
      .eq("id", requestInsert.data.id)
      .eq("status", "pending");
    assert(!approveRequest.error, `Approve request failed: ${approveRequest.error?.message}`);

    const upsertEmployee = await admin.client.from("employees").upsert(
      {
        auth_user_id: user.id,
        full_name: fullName,
        email,
        role: "member",
        status: "approved",
        faction,
      },
      { onConflict: "auth_user_id" },
    );
    assert(!upsertEmployee.error, `Employee upsert failed: ${upsertEmployee.error?.message}`);

    const memberAuth = await createAuthedClient({
      email,
      password,
      label: "qa-member",
    });

    const memberEmployee = await memberAuth.client
      .from("employees")
      .select("id, auth_user_id, role, status, faction, full_name, email")
      .eq("auth_user_id", memberAuth.user.id)
      .single();
    assert(!memberEmployee.error, `Approved member employee fetch failed: ${memberEmployee.error?.message}`);
    assert(memberEmployee.data?.status === "approved", "Approved member status mismatch.");
    assert(memberEmployee.data?.role === "member", "Approved member role mismatch.");

    const routeAfterApproval = resolveRoute({
      hasBootstrapped: true,
      session: memberAuth.session,
      employee: memberEmployee.data,
    });
    assert(routeAfterApproval === "/(app)/member", `Unexpected route after approval: ${routeAfterApproval}`);

    context.qaMember = {
      email,
      password,
      auth: memberAuth,
      employee: memberEmployee.data,
      requestId: requestInsert.data.id,
      faction,
    };

    return {
      qaMemberEmail: email,
      routeBeforeApproval,
      routeAfterApproval,
      requestId: requestInsert.data.id,
      employeeId: memberEmployee.data.id,
    };
  });

  await runStep("rls_policy_live_checks", async () => {
    const qaMember = context.qaMember;
    const admin = context.admin;
    assert(qaMember?.auth?.client, "QA member client missing.");
    assert(admin?.client, "Admin client missing.");

    const pendingEmail = `${context.qaPrefix}.pending@gmail.com`;
    const pendingPassword = `Morakaba!${Date.now()}P`;
    const pendingClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const pendingSignUp = await pendingClient.auth.signUp({
      email: pendingEmail,
      password: pendingPassword,
      options: { data: { full_name: "QA Pending", faction: "خليل 21" } },
    });

    if (!pendingSignUp.data?.session) {
      const pendingFallback = await pendingClient.auth.signInWithPassword({
        email: pendingEmail,
        password: pendingPassword,
      });
      assert(!pendingFallback.error, `Pending signIn fallback failed: ${pendingFallback.error?.message}`);
    }

    const pendingUser = (await pendingClient.auth.getUser()).data.user;
    assert(pendingUser?.id, "Pending user missing.");

    const pendingRequestUpsert = await pendingClient.from("registration_requests").upsert(
      {
        auth_user_id: pendingUser.id,
        full_name: "QA Pending",
        email: pendingEmail,
        faction: "خليل 21",
        status: "pending",
      },
      { onConflict: "auth_user_id" },
    );
    assert(!pendingRequestUpsert.error, `Pending request upsert failed: ${pendingRequestUpsert.error?.message}`);

    const pendingFactions = await pendingClient.from("factions").select("id").limit(5);
    assert(!pendingFactions.error, `Pending factions query failed: ${pendingFactions.error?.message}`);
    assert((pendingFactions.data ?? []).length === 0, "Pending user should not see factions.");

    const pendingEmployees = await pendingClient.from("employees").select("id").limit(5);
    assert(!pendingEmployees.error, `Pending employees query failed: ${pendingEmployees.error?.message}`);
    assert((pendingEmployees.data ?? []).length === 0, "Pending user should not see employees.");

    const pendingUploadPath = `${pendingUser.id}/qa/pending-weapon.txt`;
    const pendingUpload = await pendingClient.storage
      .from("weapon-checks")
      .upload(pendingUploadPath, Buffer.from("pending"), {
        contentType: "text/plain",
        upsert: false,
      });
    assert(pendingUpload.error, "Pending upload to weapon-checks must be denied.");

    const memberVehicleInsert = await qaMember.auth.client.from("vehicles").insert({
      faction: qaMember.faction,
      name: `Forbidden-${context.qaPrefix}`,
      plate_number: `FORB-${Date.now()}`,
      vehicle_type: "patrol",
      created_by: qaMember.auth.user.id,
    });
    assert(memberVehicleInsert.error, "Member should not insert vehicles.");

    const memberAdminLogsRead = await qaMember.auth.client.from("activity_logs").select("id").limit(1);
    assert(
      memberAdminLogsRead.error || (memberAdminLogsRead.data ?? []).length === 0,
      "Member should not read activity logs.",
    );

    const memberOtherRequests = await qaMember.auth.client
      .from("registration_requests")
      .select("id")
      .neq("auth_user_id", qaMember.auth.user.id)
      .limit(5);

    assert(!memberOtherRequests.error, `Member requests check failed: ${memberOtherRequests.error?.message}`);
    assert((memberOtherRequests.data ?? []).length === 0, "Member should not see other registration requests.");

    return {
      pendingUserId: pendingUser.id,
      pendingUploadError: pendingUpload.error?.message ?? null,
      memberVehicleInsertError: memberVehicleInsert.error?.message ?? null,
      memberActivityLogsError: memberAdminLogsRead.error?.message ?? null,
    };
  });

  await runStep("weekly_rest_live", async () => {
    const admin = context.admin;
    const qaMember = context.qaMember;
    assert(admin?.client && qaMember?.employee, "Missing admin/member for weekly rest.");

    const weekStart = getWeekStartSaturday();
    const weekEnd = addDays(weekStart, 6);
    const days = ["saturday", "monday"];

    const assignment = await admin.client
      .from("weekly_rest_assignments")
      .upsert(
        {
          employee_id: qaMember.employee.id,
          faction: qaMember.employee.faction ?? qaMember.faction,
          days,
          week_start_date: weekStart,
          week_end_date: weekEnd,
          status: "active",
          created_by: admin.user.id,
        },
        { onConflict: "employee_id,week_start_date" },
      )
      .select("id, employee_id, days, week_start_date, week_end_date, status")
      .single();
    assert(!assignment.error, `weekly_rest assignment failed: ${assignment.error?.message}`);

    const history = await admin.client.from("weekly_rest_history").insert({
      assignment_id: assignment.data.id,
      employee_id: qaMember.employee.id,
      action: "assigned",
      faction: qaMember.employee.faction ?? qaMember.faction,
      days,
      week_start_date: weekStart,
      week_end_date: weekEnd,
      created_by: admin.user.id,
    });
    assert(!history.error, `weekly_rest history failed: ${history.error?.message}`);

    const notify = await admin.client.from("notifications").insert({
      sender_auth_user_id: admin.user.id,
      target_auth_user_id: qaMember.auth.user.id,
      title: "الراحة الأسبوعية",
      message: `${context.qaPrefix}: راحتك الأسبوعية للأيام ${days.join(", ")}`,
      type: "weekly_rest",
      target_type: "user",
      target_faction: null,
      is_read: false,
    });
    assert(!notify.error, `weekly_rest notification failed: ${notify.error?.message}`);

    const memberAssignments = await qaMember.auth.client
      .from("weekly_rest_assignments")
      .select("id, days, week_start_date, status")
      .eq("employee_id", qaMember.employee.id)
      .order("week_start_date", { ascending: false })
      .limit(5);

    assert(!memberAssignments.error, `Member weekly rest read failed: ${memberAssignments.error?.message}`);
    assert((memberAssignments.data ?? []).length > 0, "Member weekly rest not visible.");

    return {
      assignmentId: assignment.data.id,
      memberAssignments: memberAssignments.data?.length ?? 0,
      weekStart,
    };
  });

  await runStep("notifications_live", async () => {
    const admin = context.admin;
    const qaMember = context.qaMember;
    assert(admin?.client && qaMember?.employee, "Missing admin/member for notifications.");

    const baseMsg = `${context.qaPrefix}: notification`;

    const userInsert = await admin.client.from("notifications").insert({
      sender_auth_user_id: admin.user.id,
      target_auth_user_id: qaMember.auth.user.id,
      title: "QA User",
      message: `${baseMsg}-user`,
      type: "general",
      target_type: "user",
      target_faction: null,
      is_read: false,
    });
    assert(!userInsert.error, `User notification insert failed: ${userInsert.error?.message}`);

    const factionMembers = await admin.client
      .from("employees")
      .select("auth_user_id")
      .eq("status", "approved")
      .eq("faction", qaMember.employee.faction ?? qaMember.faction);
    assert(!factionMembers.error, `Faction members query failed: ${factionMembers.error?.message}`);
    const factionTargets = (factionMembers.data ?? [])
      .map((row) => row.auth_user_id)
      .filter(Boolean);

    if (factionTargets.length > 0) {
      const factionInsert = await admin.client.from("notifications").insert(
        factionTargets.map((id) => ({
          sender_auth_user_id: admin.user.id,
          target_auth_user_id: id,
          title: "QA Faction",
          message: `${baseMsg}-faction`,
          type: "general",
          target_type: "faction",
          target_faction: qaMember.employee.faction ?? qaMember.faction,
          is_read: false,
        })),
      );
      assert(!factionInsert.error, `Faction notifications insert failed: ${factionInsert.error?.message}`);
    }

    const allMembers = await admin.client
      .from("employees")
      .select("auth_user_id")
      .eq("status", "approved");
    assert(!allMembers.error, `All members query failed: ${allMembers.error?.message}`);
    const allTargets = (allMembers.data ?? []).map((row) => row.auth_user_id).filter(Boolean);

    if (allTargets.length > 0) {
      const allInsert = await admin.client.from("notifications").insert(
        allTargets.map((id) => ({
          sender_auth_user_id: admin.user.id,
          target_auth_user_id: id,
          title: "QA All",
          message: `${baseMsg}-all`,
          type: "general",
          target_type: "all",
          target_faction: null,
          is_read: false,
        })),
      );
      assert(!allInsert.error, `All notifications insert failed: ${allInsert.error?.message}`);
    }

    const memberNotifications = await qaMember.auth.client
      .from("notifications")
      .select("id, message, is_read, target_type")
      .like("message", `${context.qaPrefix}:%`)
      .order("created_at", { ascending: false });
    assert(!memberNotifications.error, `Member notifications read failed: ${memberNotifications.error?.message}`);
    assert((memberNotifications.data ?? []).length > 0, "No QA notifications visible for member.");

    const firstId = memberNotifications.data[0].id;
    const markRead = await qaMember.auth.client
      .from("notifications")
      .update({ is_read: true })
      .eq("id", firstId)
      .eq("target_auth_user_id", qaMember.auth.user.id);
    assert(!markRead.error, `Mark as read failed: ${markRead.error?.message}`);

    const clearAll = await qaMember.auth.client
      .from("notifications")
      .delete()
      .in("id", memberNotifications.data.map((n) => n.id));
    assert(!clearAll.error, `Clear notifications failed: ${clearAll.error?.message}`);

    return {
      notificationsCount: memberNotifications.data.length,
      markedReadId: firstId,
    };
  });

  await runStep("weapon_submissions_live", async () => {
    const admin = context.admin;
    const qaMember = context.qaMember;
    assert(admin?.client && qaMember?.employee, "Missing admin/member for weapon.");

    const submission = await qaMember.auth.client
      .from("weapon_submissions")
      .insert({
        employee_id: qaMember.employee.id,
        faction: qaMember.employee.faction ?? qaMember.faction,
        weapon_type: `AK-QA-${context.qaPrefix}`,
        serial_number: `SER-${Date.now()}`,
        check_date: new Date().toISOString().slice(0, 10),
        image_path: null,
        signature_name: qaMember.employee.full_name ?? "QA Signature",
        notes: `${context.qaPrefix}: weapon submission`,
        status: "pending",
      })
      .select("id, status")
      .single();
    assert(!submission.error, `Weapon submission failed: ${submission.error?.message}`);

    const adminRead = await admin.client
      .from("weapon_submissions")
      .select("id, status")
      .eq("id", submission.data.id)
      .single();
    assert(!adminRead.error, `Admin weapon read failed: ${adminRead.error?.message}`);

    const review = await admin.client
      .from("weapon_submissions")
      .update({
        status: "reviewed",
        reviewed_by: admin.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", submission.data.id);
    assert(!review.error, `Weapon review failed: ${review.error?.message}`);

    const memberRead = await qaMember.auth.client
      .from("weapon_submissions")
      .select("id, status")
      .eq("id", submission.data.id)
      .single();
    assert(!memberRead.error, `Member weapon read failed: ${memberRead.error?.message}`);
    assert(memberRead.data.status === "reviewed", "Weapon status not updated to reviewed.");

    return {
      weaponSubmissionId: submission.data.id,
      finalStatus: memberRead.data.status,
    };
  });

  await runStep("fuel_submissions_live", async () => {
    const admin = context.admin;
    const qaMember = context.qaMember;
    assert(admin?.client && qaMember?.employee, "Missing admin/member for fuel.");

    const plate = `QA-${Date.now()}`;
    const vehicleInsert = await admin.client
      .from("vehicles")
      .insert({
        faction: qaMember.employee.faction ?? qaMember.faction,
        name: `QA Vehicle ${context.qaPrefix}`,
        plate_number: plate,
        vehicle_type: "patrol",
        is_active: true,
        last_odometer: 5000,
        maintenance_due_km: 5300,
        created_by: admin.user.id,
      })
      .select("id, faction, last_odometer")
      .single();

    assert(!vehicleInsert.error, `Vehicle insert failed: ${vehicleInsert.error?.message}`);
    const vehicleId = vehicleInsert.data.id;

    const fuelInsert = await qaMember.auth.client
      .from("fuel_entries")
      .insert({
        employee_id: qaMember.employee.id,
        vehicle_id: vehicleId,
        faction: qaMember.employee.faction ?? qaMember.faction,
        fuel_type: "diesel",
        coupon_date: new Date().toISOString().slice(0, 10),
        quantity_liters: 18,
        distance_km: 72,
        odometer_current: 5000,
        odometer_new: 5072,
        image_path: null,
        signature_name: qaMember.employee.full_name ?? "QA Signature",
        notes: `${context.qaPrefix}: fuel entry`,
        status: "pending",
      })
      .select("id, status")
      .single();
    assert(!fuelInsert.error, `Fuel submission failed: ${fuelInsert.error?.message}`);

    const adminReview = await admin.client
      .from("fuel_entries")
      .update({
        status: "reviewed",
        reviewed_by: admin.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", fuelInsert.data.id);
    assert(!adminReview.error, `Fuel review failed: ${adminReview.error?.message}`);

    const memberRead = await qaMember.auth.client
      .from("fuel_entries")
      .select("id, status")
      .eq("id", fuelInsert.data.id)
      .single();
    assert(!memberRead.error, `Member fuel read failed: ${memberRead.error?.message}`);
    assert(memberRead.data.status === "reviewed", "Fuel status not updated to reviewed.");

    return {
      vehicleId,
      fuelEntryId: fuelInsert.data.id,
      finalStatus: memberRead.data.status,
    };
  });

  await runStep("linked_devices_live", async () => {
    const qaMember = context.qaMember;
    assert(qaMember?.auth?.client, "Missing member for linked devices.");

    const deviceId = `${context.qaPrefix}-device`;
    const touch = await qaMember.auth.client.from("linked_devices").upsert(
      {
        auth_user_id: qaMember.auth.user.id,
        device_id: deviceId,
        device_name: "QA Test Device",
        platform: "android",
        app_version: "qa-live",
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "auth_user_id,device_id" },
    );
    assert(!touch.error, `Linked device upsert failed: ${touch.error?.message}`);

    const list = await qaMember.auth.client
      .from("linked_devices")
      .select("id, device_id")
      .eq("device_id", deviceId)
      .single();
    assert(!list.error, `Linked devices read failed: ${list.error?.message}`);

    const remove = await qaMember.auth.client.from("linked_devices").delete().eq("id", list.data.id);
    assert(!remove.error, `Linked device delete failed: ${remove.error?.message}`);

    return {
      linkedDeviceId: list.data.id,
      deviceId,
    };
  });

  await runStep("support_tickets_live", async () => {
    const admin = context.admin;
    const qaMember = context.qaMember;
    assert(admin?.client && qaMember?.employee, "Missing admin/member for support.");

    const ticketInsert = await qaMember.auth.client
      .from("support_tickets")
      .insert({
        employee_id: qaMember.employee.id,
        subject: `${context.qaPrefix}: support subject`,
        message: `${context.qaPrefix}: support message`,
        status: "open",
      })
      .select("id, status")
      .single();
    assert(!ticketInsert.error, `Support ticket insert failed: ${ticketInsert.error?.message}`);

    const reply = await admin.client
      .from("support_tickets")
      .update({
        status: "in_progress",
        admin_reply: `${context.qaPrefix}: support admin reply`,
        replied_by: admin.user.id,
      })
      .eq("id", ticketInsert.data.id);
    assert(!reply.error, `Support ticket reply failed: ${reply.error?.message}`);

    const memberRead = await qaMember.auth.client
      .from("support_tickets")
      .select("id, status, admin_reply")
      .eq("id", ticketInsert.data.id)
      .single();
    assert(!memberRead.error, `Support ticket member read failed: ${memberRead.error?.message}`);
    assert(memberRead.data.status === "in_progress", "Support status mismatch.");
    assert(
      typeof memberRead.data.admin_reply === "string" &&
        memberRead.data.admin_reply.includes(context.qaPrefix),
      "Support admin reply missing.",
    );

    return {
      ticketId: ticketInsert.data.id,
      finalStatus: memberRead.data.status,
    };
  });

  await runStep("settings_live", async () => {
    const admin = context.admin;
    const qaMember = context.qaMember;
    assert(admin?.client && qaMember?.auth?.client, "Missing admin/member for settings.");

    const appMetaValue = {
      supportPhone: "0555-00-11-22",
      supportEmail: "support@morakaba.qa",
      termsVersion: "2.0-live-qa",
    };
    const defaultsValue = {
      maintenanceThresholdKm: 180,
    };
    const termsContent = {
      lines: [
        "QA live terms line 1",
        "QA live terms line 2",
      ],
      updatedAt: new Date().toISOString(),
    };

    const upsertSettings = await admin.client.from("app_settings").upsert(
      [
        { key: "app_meta", value: appMetaValue, updated_by: admin.user.id },
        { key: "notifications_defaults", value: defaultsValue, updated_by: admin.user.id },
        { key: "terms_content", value: termsContent, updated_by: admin.user.id },
      ],
      { onConflict: "key" },
    );
    assert(!upsertSettings.error, `Settings upsert failed: ${upsertSettings.error?.message}`);

    const memberRead = await qaMember.auth.client
      .from("app_settings")
      .select("key, value")
      .in("key", ["app_meta", "notifications_defaults", "terms_content"]);
    assert(!memberRead.error, `Member settings read failed: ${memberRead.error?.message}`);

    const byKey = Object.fromEntries((memberRead.data ?? []).map((row) => [row.key, row.value]));
    assert(byKey.app_meta?.termsVersion === "2.0-live-qa", "Member app_meta mismatch.");
    assert(
      Number(byKey.notifications_defaults?.maintenanceThresholdKm) === 180,
      "Member notifications_defaults mismatch.",
    );

    return {
      keysVisibleToMember: Object.keys(byKey),
      termsVersion: byKey.app_meta?.termsVersion ?? null,
    };
  });

  await runStep("bucket_upload_policy_live", async () => {
    const qaMember = context.qaMember;
    assert(qaMember?.auth?.client, "Missing member for bucket upload checks.");

    const uploads = [];
    for (const bucket of REQUIRED_BUCKETS) {
      const filePath = `${qaMember.auth.user.id}/qa/${context.qaPrefix}-${bucket}.txt`;
      const upload = await qaMember.auth.client.storage.from(bucket).upload(
        filePath,
        Buffer.from(`qa-live-${bucket}`),
        { contentType: "text/plain", upsert: true },
      );
      assert(!upload.error, `Upload failed for ${bucket}: ${upload.error?.message}`);
      uploads.push({ bucket, filePath });
    }

    for (const item of uploads) {
      const remove = await qaMember.auth.client.storage.from(item.bucket).remove([item.filePath]);
      assert(!remove.error, `Remove failed for ${item.bucket}: ${remove.error?.message}`);
    }

    return {
      uploadedBuckets: uploads.map((x) => x.bucket),
      removedObjects: uploads.length,
    };
  });

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const report = {
    generatedAt: new Date().toISOString(),
    projectRef: "aipbbowsdnokhhellmhb",
    summary: {
      total: results.length,
      passed,
      failed,
    },
    results,
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
};

run().catch((error) => {
  const report = {
    generatedAt: new Date().toISOString(),
    fatal: true,
    error: error instanceof Error ? error.message : String(error),
    results,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
});
