import type { Session } from "@supabase/supabase-js";

import { isSupportedFaction } from "@/src/constants/factions";
import type { Employee } from "@/src/models";
import { fixPossiblyMojibake } from "@/src/utils/text-normalization";

import { getSupabaseClient, isSupabaseConfigured, type Database } from "./client";
import { EmployeesService } from "./employees.service";
import { LinkedDevicesService } from "./linked-devices.service";

type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

interface AuthPayload {
  session: Session | null;
  employee: Employee | null;
}

interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
  faction: string;
}

const SUPABASE_MISSING_ERROR =
  "Supabase is not configured. Please provide EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";
const INVALID_REFRESH_TOKEN_PATTERNS = ["invalid refresh token", "refresh token not found"];

const ok = <T>(data: T): ServiceResult<T> => ({ data, error: null });
const fail = <T>(error: string): ServiceResult<T> => ({ data: null, error });

const isInvalidRefreshTokenError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return INVALID_REFRESH_TOKEN_PATTERNS.some((pattern) => normalized.includes(pattern));
};

const clearLocalSession = async (): Promise<void> => {
  if (!isSupabaseConfigured) {
    return;
  }

  try {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Best-effort cleanup; never block auth recovery on cleanup failure.
  }
};

const normalizeAuthError = (message: string): string => {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Email is not confirmed yet.";
  }

  if (normalized.includes("user already registered")) {
    return "This email is already registered.";
  }

  if (normalized.includes("password should be at least")) {
    return "Password is too weak.";
  }

  if (normalized.includes("for security purposes")) {
    return "Too many attempts. Please wait and try again.";
  }

  if (normalized.includes("network")) {
    return "Network error. Check your internet connection and try again.";
  }

  return message;
};

const loadEmployee = async (authUserId: string): Promise<ServiceResult<Employee | null>> => {
  const result = await EmployeesService.getByAuthUserId(authUserId);
  if (result.error) {
    return fail(result.error);
  }

  if (result.data) {
    return ok(result.data);
  }

  // Self-heal missing rows (legacy/manual DB cases) from registration_requests.
  const ensureResult = await EmployeesService.ensureCurrentUserProfile();
  if (ensureResult.error) {
    return fail(ensureResult.error);
  }

  const secondRead = await EmployeesService.getByAuthUserId(authUserId);
  if (secondRead.error) {
    return fail(secondRead.error);
  }

  return ok(secondRead.data ?? null);
};

const touchCurrentDevice = async (authUserId: string): Promise<void> => {
  try {
    await LinkedDevicesService.touchCurrentDevice(authUserId);
  } catch {
    // Device tracking should never block auth flow.
  }
};

export class AuthService {
  static isConfigured = isSupabaseConfigured;

  static async getSession(): Promise<ServiceResult<Session | null>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        if (isInvalidRefreshTokenError(error.message)) {
          await clearLocalSession();
          return ok(null);
        }

        return fail(normalizeAuthError(error.message));
      }

      return ok(data.session ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to read auth session.";

      if (isInvalidRefreshTokenError(message)) {
        await clearLocalSession();
        return ok(null);
      }

      return fail(message);
    }
  }

  static async bootstrap(): Promise<ServiceResult<AuthPayload>> {
    const sessionResult = await this.getSession();
    if (sessionResult.error) {
      return fail(sessionResult.error);
    }

    const session = sessionResult.data;
    if (!session) {
      return ok({ session: null, employee: null });
    }

    await touchCurrentDevice(session.user.id);

    const employeeResult = await loadEmployee(session.user.id);
    if (employeeResult.error) {
      return fail(employeeResult.error);
    }

    return ok({
      session,
      employee: employeeResult.data,
    });
  }

  static async signIn(email: string, password: string): Promise<ServiceResult<AuthPayload>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return fail(normalizeAuthError(error.message));
      }

      const session = data.session;
      if (!session) {
        return ok({ session: null, employee: null });
      }

      await touchCurrentDevice(session.user.id);

      const employeeResult = await loadEmployee(session.user.id);
      if (employeeResult.error) {
        return fail(employeeResult.error);
      }

      return ok({
        session,
        employee: employeeResult.data,
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to sign in.");
    }
  }

  static async signUp({
    fullName,
    email,
    password,
    faction,
  }: SignUpInput): Promise<ServiceResult<AuthPayload>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const normalizedFullName = fixPossiblyMojibake(fullName.trim());
      const normalizedFaction = fixPossiblyMojibake(faction.trim());
      if (!isSupportedFaction(normalizedFaction)) {
        return fail("Please choose a valid faction.");
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: normalizedFullName,
            faction: normalizedFaction,
          },
        },
      });

      if (error) {
        return fail(normalizeAuthError(error.message));
      }

      const authUserId = data.user?.id;
      if (!authUserId) {
        return fail("User was created without an auth id.");
      }

      let session = data.session ?? null;

      if (!session) {
        const signInAfterSignUp = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInAfterSignUp.error) {
          return fail(normalizeAuthError(signInAfterSignUp.error.message));
        }

        session = signInAfterSignUp.data.session ?? null;
      }

      if (!session) {
        return fail("No active session after sign up.");
      }

      await touchCurrentDevice(session.user.id);

      const requestPayload: Database["public"]["Tables"]["registration_requests"]["Insert"] = {
        auth_user_id: authUserId,
        full_name: normalizedFullName,
        email,
        faction: normalizedFaction,
        status: "pending",
      };

      const requestResult = await (supabase as any)
        .from("registration_requests")
        .upsert(requestPayload, { onConflict: "auth_user_id" })
        .select("id,status,auth_user_id")
        .single();

      if (requestResult.error) {
        return fail(normalizeAuthError(requestResult.error.message));
      }

      if (requestResult.data?.status !== "pending") {
        return fail("Registration request was created with unexpected status.");
      }

      const employeeResult = await loadEmployee(authUserId);
      if (employeeResult.error) {
        return fail(employeeResult.error);
      }

      return ok({
        session,
        employee: employeeResult.data,
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to sign up.");
    }
  }

  static async signOut(): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        return fail(error.message);
      }

      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to sign out.");
    }
  }
}
