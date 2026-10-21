// Core team — the ONE definition of "who counts as leadership" for the
// Projects person filter, project contributor pickers and the department-head
// goals pool (Marcus, 13 Sep 2026: those pickers were listing every login ever
// — setters, the shared Accountant, partners, leavers).
//
// Rule-based on purpose, so a newly hired SDR manager, account executive or
// other department head appears automatically the day their role is granted:
//
//   core team = active profile
//             AND ( holds a role in CORE_TEAM_ROLES
//                   OR is a listed department head — departmentHeadGoals.ts )
//
//   active    = profiles.offboarded_at IS NULL (the platform-wide leaver flag,
//               migration 20260825140000). Nothing else on profiles or
//               setters_profiles marks a person as gone (setters_profiles.status
//               is the SDR pipeline stage, not employment).
//
// The department-head clause exists because a head is core team by definition
// whatever their platform role — today that is how Tom Reilly (platform
// role `setter`, runs Marketing) stays in. Grant him `gtm_engineer` and the
// clause becomes redundant for him.
//
// Consumers go through useCoreTeam() (src/hooks/useCoreTeam.ts); this module
// is pure so the rule can be reasoned about without a database.

/** app_role values that make someone core team. */
export const CORE_TEAM_ROLES = [
  "admin",
  "dev",
  "ops",
  "ops_assistant",
  "csm",
  "gtm_engineer",
  "sdr_manager",
  "account_executive",
  "hr",
] as const;

export type CoreTeamRole = (typeof CORE_TEAM_ROLES)[number];

/**
 * app_role values that are explicitly NOT core team, kept here so the
 * exclusion is documented next to the inclusion: individual setters, client
 * logins, external partners and the shared finance/accounting login.
 */
export const NON_CORE_TEAM_ROLES = ["setter", "client", "partner", "finance", "accounting"] as const;

const CORE_ROLE_SET: ReadonlySet<string> = new Set<string>(CORE_TEAM_ROLES);

export const isCoreTeamRole = (role: string | null | undefined): role is CoreTeamRole =>
  !!role && CORE_ROLE_SET.has(role);

/** Caption shown under core-team pickers. */
export const CORE_TEAM_CAPTION = "Core team only (leadership roles)";

export interface CoreTeamProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  offboarded_at: string | null;
}

export interface CoreTeamRoleRow {
  user_id: string;
  role: string;
}

export interface CoreTeamMember {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  /** The role that qualified them (first core role found), or null when they
   * qualify only as a listed department head. */
  role: string | null;
  /** Every role they hold. */
  roles: string[];
}

export const coreTeamDisplayName = (m: Pick<CoreTeamMember, "full_name" | "email">): string =>
  (m.full_name ?? "").trim() || m.email || "Unknown";

/**
 * Pure selection: applies the rule above to raw rows. `headIds` are the user
 * ids from the department-head mapping.
 */
export function selectCoreTeam(
  profiles: CoreTeamProfile[],
  roleRows: CoreTeamRoleRow[],
  headIds: Iterable<string> = [],
): CoreTeamMember[] {
  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows) {
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.role);
    rolesByUser.set(r.user_id, list);
  }
  const heads = new Set(headIds);

  return profiles
    .filter((p) => p.offboarded_at == null)
    .flatMap((p) => {
      const roles = rolesByUser.get(p.id) ?? [];
      const coreRole = roles.find(isCoreTeamRole) ?? null;
      if (!coreRole && !heads.has(p.id)) return [];
      return [
        {
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          avatar_url: p.avatar_url,
          role: coreRole ?? roles[0] ?? null,
          roles,
        },
      ];
    })
    .sort((a, b) => coreTeamDisplayName(a).localeCompare(coreTeamDisplayName(b)));
}
