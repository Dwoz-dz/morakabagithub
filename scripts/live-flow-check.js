const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const STATE_PATH = path.join(__dirname, ".live-flow-state.json");

const readEnvFile = () => {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env file not found.");
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

const resolveRoute = ({ hasBootstrapped, session, employee }) => {
  if (!hasBootstrapped) return "/splash";
  if (!session) return "/(auth)/login";
  if (!employee || employee.status === "pending") return "/(auth)/waiting-approval";
  if (["rejected", "frozen", "blocked"].includes(employee.status)) {
    return "/(auth)/blocked-status";
  }
  if (employee.role === "admin") return "/(app)/admin";
  return "/(app)/member";
};

const env = readEnvFile();
const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const OFFICIAL_FACTION = "\u062e\u0644\u064a\u0644 21";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const mode = process.argv[2] || "register";

const registerFlow = async () => {
  const now = Date.now();
  const email = `morakaba.live.${now}@gmail.com`;
  const password = `Morakaba!${now}`;

  const signUp = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: "Morakaba Live User",
        faction: OFFICIAL_FACTION,
      },
    },
  });

  if (signUp.error) {
    console.log(
      JSON.stringify(
        {
          mode: "register",
          success: false,
          step: "signUp",
          error: signUp.error.message,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  let session = signUp.data.session ?? null;
  const userId = signUp.data.user?.id ?? null;

  if (!session) {
    const signInFallback = await supabase.auth.signInWithPassword({ email, password });
    if (signInFallback.error) {
      console.log(
        JSON.stringify(
          {
            mode: "register",
            success: false,
            step: "signInFallback",
            error: signInFallback.error.message,
            email,
          },
          null,
          2,
        ),
      );
      process.exit(0);
    }

    session = signInFallback.data.session ?? null;
  }

  if (!session || !userId) {
    console.log(
      JSON.stringify(
        {
          mode: "register",
          success: false,
          step: "session",
          error: "No active session after sign-up flow.",
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const request = await supabase
    .from("registration_requests")
    .upsert(
      {
        auth_user_id: userId,
        full_name: "Morakaba Live User",
        email,
        faction: OFFICIAL_FACTION,
        status: "pending",
      },
      { onConflict: "auth_user_id" },
    )
    .select("id,status,auth_user_id")
    .single();

  if (request.error) {
    console.log(
      JSON.stringify(
        {
          mode: "register",
          success: false,
          step: "registration_request",
          error: request.error.message,
          email,
          userId,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const pendingRoute = resolveRoute({
    hasBootstrapped: true,
    session,
    employee: null,
  });

  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify(
      {
        email,
        password,
        userId,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        mode: "register",
        success: true,
        email,
        userId,
        hasSession: true,
        registrationRequest: request.data,
        routeAfterRegister: pendingRoute,
        stateFile: STATE_PATH,
      },
      null,
      2,
    ),
  );
};

const routeCheck = async () => {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error(`State file not found: ${STATE_PATH}. Run register mode first.`);
  }

  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  const { email, password } = state;

  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.error) {
    console.log(
      JSON.stringify(
        {
          mode: "route",
          success: false,
          step: "signIn",
          error: signIn.error.message,
          email,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const session = signIn.data.session;
  const userId = signIn.data.user?.id;

  const employee = await supabase
    .from("employees")
    .select("role,status,auth_user_id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (employee.error) {
    console.log(
      JSON.stringify(
        {
          mode: "route",
          success: false,
          step: "employee",
          error: employee.error.message,
          userId,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const route = resolveRoute({
    hasBootstrapped: true,
    session,
    employee: employee.data,
  });

  console.log(
    JSON.stringify(
      {
        mode: "route",
        success: true,
        email,
        userId,
        employee: employee.data,
        resolvedRoute: route,
      },
      null,
      2,
    ),
  );
};

const main = async () => {
  if (mode === "register") {
    await registerFlow();
    return;
  }

  if (mode === "route") {
    await routeCheck();
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
