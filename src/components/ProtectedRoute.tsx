import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { MaintenancePage } from "@/components/dev/MaintenancePage";
import { useAnyCapability } from "@/hooks/useCapability";
import { ONBOARDING_ROUTE, useOnboardingMode } from "@/hooks/useOnboardingMode";
import { TRIAL_ROUTE, useTrialMode } from "@/hooks/useTrialMode";
import { ACTING_BASE_ROLE, isDemoActingRole, toDemoPath } from "@/lib/actingAs";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
  /** If provided, users with this capability (any of them, when a list) bypass the role check. */
  allowedCapability?: string | string[];
  /**
   * The onboarding surface itself — the one route an account in onboarding
   * mode is allowed to reach.
   */
  isOnboardingSurface?: boolean;
  /** The trialist surface — the one route an account in trial mode reaches. */
  isTrialSurface?: boolean;
}

export const ProtectedRoute = ({ children, allowedRoles, allowedCapability, isOnboardingSurface, isTrialSurface }: ProtectedRouteProps) => {
  const { user, userRole, userRoles, isLoading, actingAs } = useAuth();
  const { isMaintenance, message, restrictedRoles } = useMaintenanceMode();
  const capabilityList = allowedCapability
    ? Array.isArray(allowedCapability)
      ? allowedCapability
      : [allowedCapability]
    : [];
  const { has: hasCapability, isLoading: capLoading } = useAnyCapability(capabilityList);
  const { inOnboardingMode, isLoading: onboardingLoading } = useOnboardingMode();
  const { inTrialMode, isLoading: trialLoading } = useTrialMode();
  const location = useLocation();

  if (isLoading || (capabilityList.length > 0 && capLoading) || onboardingLoading || trialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    const isClientRoute = location.pathname.startsWith('/client');
    const isPartnerRoute = location.pathname.startsWith('/partnerships');
    return <Navigate to={isClientRoute ? "/client" : isPartnerRoute ? "/partnerships" : "/"} replace />;
  }

  // An account in onboarding mode sees the onboarding surface and nothing
  // else — no role portal, whatever role it holds. Checked before the role
  // gate so it also covers a starter whose role isn't assigned yet.
  if (isOnboardingSurface) {
    // The surface itself: reachable only while restricted. Everyone else is
    // sent to their own landing so /onboarding never becomes a side door.
    return inOnboardingMode ? <>{children}</> : <Navigate to="/" replace />;
  }
  if (inOnboardingMode) {
    return <Navigate to={ONBOARDING_ROUTE} replace />;
  }

  // Trial Day (15 Sep): a trialist login is contained exactly like a new
  // starter — one surface, no role portal, checked before the role gate.
  if (isTrialSurface) {
    return inTrialMode ? <>{children}</> : <Navigate to="/" replace />;
  }
  if (inTrialMode) {
    return <Navigate to={TRIAL_ROUTE} replace />;
  }

  if (!userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">Awaiting Role Assignment</h2>
          <p className="text-muted-foreground">Your account is being set up. Please contact an administrator.</p>
        </div>
      </div>
    );
  }

  // Maintenance mode: devs always bypass; otherwise check restricted roles list.
  // If no list is set, fall back to restricting everyone non-dev.
  if (isMaintenance && !userRoles.includes("dev")) {
    const restricted = restrictedRoles && restrictedRoles.length > 0
      ? restrictedRoles
      : null;
    const isRestricted = restricted
      ? userRoles.some((r) => restricted.includes(r))
      : true;
    if (isRestricted) {
      return <MaintenancePage message={message} />;
    }
  }

  const roleAllowed = userRoles.some(r => allowedRoles.includes(r));
  const capabilityAllowed = !!allowedCapability && hasCapability;

  // Acting-as (3 Sep): an admin/dev wearing another role's hat is admitted to
  // that role's routes. actingAs is non-null only for admin/dev (AuthContext),
  // so this arm can never widen access for anyone else. The demo hats
  // (setter, client) have no identity behind them, so their real portal
  // routes bounce to the demo twin instead of rendering an empty portal.
  if (!roleAllowed && !capabilityAllowed && actingAs) {
    const baseRole = ACTING_BASE_ROLE[actingAs];
    if (allowedRoles.includes(baseRole)) {
      if (isDemoActingRole(actingAs)) {
        const demoPath = toDemoPath(baseRole, location.pathname);
        if (demoPath && demoPath !== location.pathname) {
          return <Navigate to={demoPath} replace />;
        }
      } else {
        return <>{children}</>;
      }
    }
  }

  if (!roleAllowed && !capabilityAllowed) {
    const isClientRoute = location.pathname.startsWith('/client');
    const isPartnerRoute = location.pathname.startsWith('/partnerships');
    return <Navigate to={isClientRoute ? "/client" : isPartnerRoute ? "/partnerships" : "/"} replace />;
  }

  return <>{children}</>;
};
