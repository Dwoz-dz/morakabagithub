import { resolveAppRoute } from "../src/navigation/auth-routing";
import { EMPLOYEE_ROLES } from "../src/models/roles";
import { EMPLOYEE_STATUSES } from "../src/models/status";

const fakeSession = { user: { id: "u1" } };

const mkEmployee = (role: "admin" | "member", status: string) => ({
  id: "1",
  authUserId: "u1",
  fullName: "x",
  email: "x",
  role,
  status,
  faction: null,
  avatarUrl: null,
  createdAt: "",
  updatedAt: "",
});

const checks = [
  {
    case: "not_logged_in",
    route: resolveAppRoute({
      hasBootstrapped: true,
      session: null,
      employee: null,
    }),
  },
  {
    case: "pending_no_employee",
    route: resolveAppRoute({
      hasBootstrapped: true,
      session: fakeSession as any,
      employee: null,
    }),
  },
  {
    case: "blocked_employee",
    route: resolveAppRoute({
      hasBootstrapped: true,
      session: fakeSession as any,
      employee: mkEmployee(EMPLOYEE_ROLES.MEMBER, EMPLOYEE_STATUSES.BLOCKED) as any,
    }),
  },
  {
    case: "approved_member",
    route: resolveAppRoute({
      hasBootstrapped: true,
      session: fakeSession as any,
      employee: mkEmployee(EMPLOYEE_ROLES.MEMBER, EMPLOYEE_STATUSES.APPROVED) as any,
    }),
  },
  {
    case: "approved_admin",
    route: resolveAppRoute({
      hasBootstrapped: true,
      session: fakeSession as any,
      employee: mkEmployee(EMPLOYEE_ROLES.ADMIN, EMPLOYEE_STATUSES.APPROVED) as any,
    }),
  },
];

console.log(JSON.stringify(checks, null, 2));

