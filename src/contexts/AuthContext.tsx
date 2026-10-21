import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { actingStorageKey, readStoredActingAs, type ActingRole } from '@/lib/actingAs';

/**
 * Acting-as (2 Sep 2026, extended 3 Sep): an admin/dev can run the platform
 * wearing another role's hat — Marcus is the CEO and, post-downsizing, also
 * the acting SDR manager and acting Account Executive, and audits the setter,
 * CSM and client portals. This is a VIEW switch on the user's own identity:
 * `userRoles` (and therefore every RLS check) stays the real set, and every
 * write still attributes to the real auth.uid(). Never a session swap — that's
 * impersonation, which stays dev-only. The role list, labels, homes and demo
 * remaps live in src/lib/actingAs.ts.
 */
export type { ActingRole } from '@/lib/actingAs';

interface AuthContextType {
  user: User | null;
  userRole: string | null;
  userRoles: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Role the user is currently acting as, or null when being themselves.
      Only ever non-null for admin/dev (see canActAs). */
  actingAs: ActingRole | null;
  /** Whether this user may use the acting-as switcher (admin or dev). */
  canActAs: boolean;
  setActingAs: (role: ActingRole | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [actingAs, setActingAsState] = useState<ActingRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Acting-as is Marcus's audit tool (admin). Dev never wears hats (the owner, 4 Sep):
  // the dev account gets a Dev Centre button in that slot instead.
  const canActAs = userRoles.includes('admin') && !userRoles.includes('dev');

  const fetchUserRoles = async (userId: string) => {
    try {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      const rolesList = roles?.map(r => r.role) || [];
      setUserRoles(rolesList);
      setUserRole(rolesList[0] || null);
      // Restore the persisted acting hat, but only for users entitled to
      // one — a stale key on a shared browser must never flip a normal
      // account's portal.
      const entitled = rolesList.includes('admin') && !rolesList.includes('dev');
      setActingAsState(entitled ? readStoredActingAs(userId) : null);
    } catch (error) {
      console.error('Error fetching user roles:', error);
    }
  };

  const setActingAs = useCallback((role: ActingRole | null) => {
    setActingAsState(role);
    const uid = user?.id;
    if (!uid) return;
    try {
      if (role) localStorage.setItem(actingStorageKey(uid), role);
      else localStorage.removeItem(actingStorageKey(uid));
    } catch {
      // Persistence is a convenience; the in-memory switch already happened.
    }
  }, [user?.id]);

  useEffect(() => {
    // Set up auth state listener FIRST (before checking session)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Only synchronous state updates here
        setUser(session?.user ?? null);

        if (event === 'SIGNED_OUT') {
          setUserRole(null);
          setUserRoles([]);
          setActingAsState(null);
          setIsLoading(false);
        } else if (session?.user) {
          // Defer Supabase calls with setTimeout to prevent deadlock
          setTimeout(() => {
            fetchUserRoles(session.user.id).finally(() => {
              setIsLoading(false);
            });
          }, 0);
        } else {
          setIsLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRoles(session.user.id).finally(() => {
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      userRole,
      userRoles,
      isLoading,
      isAuthenticated: !!user,
      actingAs: canActAs ? actingAs : null,
      canActAs,
      setActingAs
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
