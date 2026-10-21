/**
 * Acting-as (2 Sep, extended 3 Sep 2026).
 *
 * An admin/dev can run the platform wearing another role's hat so Marcus can
 * audit what each role type sees and can do. Two flavours:
 *
 *  - REAL hats (sdr_manager, account_executive, csm): the real portal renders
 *    on the admin's own identity. Admin RLS already covers those tables, and
 *    every write still attributes to the real auth.uid().
 *  - DEMO hats (sdr_fulfilment, sdr_acquisition, client): Marcus has no setter
 *    or client identity, so those portals render the REAL page View
 *    components on fixture data at a demo URL. The nav is remapped so it
 *    feels like the real portal; the header chip says "demo data".
 *
 * Never a session swap, never "dev". This module is the single source of
 * truth for the option list, labels, landing routes and demo remaps so the
 * sidebar switcher, header chip, ProtectedRoute and the login landing all
 * agree.
 */
export type ActingRole =
  | 'sdr_manager'
  | 'account_executive'
  | 'sdr_fulfilment'
  | 'sdr_acquisition'
  | 'csm'
  | 'client';

export const ACTING_ROLES: readonly ActingRole[] = [
  'sdr_manager',
  'account_executive',
  'sdr_fulfilment',
  'sdr_acquisition',
  'csm',
  'client',
] as const;

export const isActingRole = (value: unknown): value is ActingRole =>
  typeof value === 'string' && (ACTING_ROLES as readonly string[]).includes(value);

/** Human label shown in the switcher and the header chip. */
export const ACTING_LABELS: Record<ActingRole, string> = {
  sdr_manager: 'SDR Manager',
  account_executive: 'Account Executive',
  sdr_fulfilment: 'SDR (Fulfilment)',
  sdr_acquisition: 'SDR (Acquisition)',
  csm: 'Customer Success Manager',
  client: 'Client',
};

/** Where the hat lands you the moment you put it on (and on login). */
export const ACTING_HOME: Record<ActingRole, string> = {
  sdr_manager: '/sdr-manager',
  account_executive: '/ae/discovery-calls',
  sdr_fulfilment: '/demo/setter',
  sdr_acquisition: '/demo/setter',
  csm: '/csm',
  client: '/ae/demo-portal/dashboard',
};

/**
 * The platform role whose routes and nav the hat borrows. ProtectedRoute
 * admits an acting admin/dev to routes that allow this base role.
 */
export const ACTING_BASE_ROLE: Record<ActingRole, string> = {
  sdr_manager: 'sdr_manager',
  account_executive: 'account_executive',
  sdr_fulfilment: 'setter',
  sdr_acquisition: 'setter',
  csm: 'csm',
  client: 'client',
};

/** Hats that render on fixtures rather than the admin's own identity. */
export const DEMO_ACTING_ROLES: readonly ActingRole[] = ['sdr_fulfilment', 'sdr_acquisition', 'client'] as const;
export const isDemoActingRole = (role: ActingRole | null | undefined): boolean =>
  !!role && DEMO_ACTING_ROLES.includes(role);

export type SetterDepartment = 'fulfilment' | 'acquisition';
export const actingSetterDepartment = (role: ActingRole | null | undefined): SetterDepartment | null =>
  role === 'sdr_fulfilment' ? 'fulfilment' : role === 'sdr_acquisition' ? 'acquisition' : null;

/** Switcher options in display order. `null` = be yourself. */
export const ACTING_OPTIONS: ReadonlyArray<{ value: ActingRole | null; label: string; route: string }> = [
  { value: null, label: 'Admin', route: '/admin' },
  { value: 'sdr_manager', label: ACTING_LABELS.sdr_manager, route: ACTING_HOME.sdr_manager },
  { value: 'account_executive', label: ACTING_LABELS.account_executive, route: ACTING_HOME.account_executive },
  { value: 'sdr_fulfilment', label: ACTING_LABELS.sdr_fulfilment, route: ACTING_HOME.sdr_fulfilment },
  { value: 'sdr_acquisition', label: ACTING_LABELS.sdr_acquisition, route: ACTING_HOME.sdr_acquisition },
  { value: 'csm', label: ACTING_LABELS.csm, route: ACTING_HOME.csm },
  { value: 'client', label: ACTING_LABELS.client, route: ACTING_HOME.client },
];

// ── Demo surfaces ──────────────────────────────────────────────────────────

/** Setter demo surface (admin/dev only). Mirrors /setter/* one-to-one. */
export const SETTER_DEMO_BASE = '/demo/setter';
export const SETTER_DEMO_PAGES = [
  '', // overview
  'coaching',
  'client-responsibility',
  'meetings',
  'warm-leads',
  'enrichment',
  'settings',
] as const;

/** Client demo surface (the AE demo portal). Mirrors /client/* pages. */
export const CLIENT_DEMO_BASE = '/ae/demo-portal';
export const CLIENT_DEMO_PAGES = [
  'dashboard',
  'meetings',
  'warm-leads',
  'lead-lists',
  'onboarding',
  'metrics',
  'communications',
  'documents',
] as const;

/**
 * Translate a real portal path into its demo twin, or null when the path has
 * no demo page. `/setter` → `/demo/setter`, `/setter/meetings` →
 * `/demo/setter/meetings`, `/client/meetings` → `/ae/demo-portal/meetings`.
 */
export const toDemoPath = (base: string, pathname: string): string | null => {
  if (base === 'setter') {
    if (pathname === '/setter') return SETTER_DEMO_BASE;
    if (!pathname.startsWith('/setter/')) return null;
    const rest = pathname.slice('/setter/'.length);
    return (SETTER_DEMO_PAGES as readonly string[]).includes(rest) ? `${SETTER_DEMO_BASE}/${rest}` : SETTER_DEMO_BASE;
  }
  if (base === 'client') {
    if (pathname === '/client') return `${CLIENT_DEMO_BASE}/dashboard`;
    if (!pathname.startsWith('/client/')) return null;
    const rest = pathname.slice('/client/'.length);
    return (CLIENT_DEMO_PAGES as readonly string[]).includes(rest)
      ? `${CLIENT_DEMO_BASE}/${rest}`
      : `${CLIENT_DEMO_BASE}/dashboard`;
  }
  return null;
};

// ── Persistence (per user, same key the 2 Sep build used) ─────────────────

export const actingStorageKey = (userId: string) => `acting-as:${userId}`;

export const readStoredActingAs = (userId: string): ActingRole | null => {
  try {
    const raw = localStorage.getItem(actingStorageKey(userId));
    return isActingRole(raw) ? raw : null;
  } catch {
    return null;
  }
};
