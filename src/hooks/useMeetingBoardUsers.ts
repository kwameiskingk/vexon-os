import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ACTING_AE_USER_IDS } from "@/lib/aeRoster";

export type MeetingBoardFilter = 'sales' | 'fulfillment' | 'operations';

export interface MeetingBoardUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string; // only for setters: 'acquisition' | 'fulfilment'
  avatarUrl?: string | null;
}

const SALES_ROLES: Set<string> = new Set(['account_executive']);
const OPS_ROLES: Set<string> = new Set(['dev', 'admin', 'ops', 'finance', 'csm', 'sdr_manager', 'hr']);

/** Returns true when user questions are numeric (meetings/conversations) */
export const isNumericGoalUser = (user: MeetingBoardUser, filter: MeetingBoardFilter): boolean => {
  return filter === 'sales' || filter === 'fulfillment';
};

export function useMeetingBoardUsers() {
  const [allUsers, setAllUsers] = useState<MeetingBoardUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const [usersRes, settersRes, avatarsRes] = await Promise.all([
        supabase.functions.invoke('admin-users'),
        supabase.from('setters_profiles').select('user_id, department').eq('active', true)
        .eq("is_test_account", false),
        supabase.from('profiles').select('id, avatar_url'),
      ]);

      if (usersRes.error) {
        console.error("Error fetching users:", usersRes.error);
        setIsLoading(false);
        return;
      }

      const apiUsers = usersRes.data?.users || [];
      const setterDepts: Record<string, string> = {};
      (settersRes.data || []).forEach((s: any) => {
        setterDepts[s.user_id] = s.department;
      });

      const avatarById: Record<string, string | null> = {};
      (avatarsRes.data || []).forEach((p: any) => {
        avatarById[p.id] = p.avatar_url;
      });

      const rolePriority: Record<string, number> = {
        'dev': 1, 'admin': 2, 'ops': 3, 'finance': 4, 'csm': 5,
        'sdr_manager': 6, 'account_executive': 7, 'setter': 8, 'hr': 9,
      };

      const users: MeetingBoardUser[] = apiUsers
        .filter((u: any) => u.primary_role !== 'client' && u.is_active)
        .map((u: any) => ({
          id: u.id,
          name: u.full_name || u.email,
          email: u.email,
          role: u.primary_role,
          department: u.primary_role === 'setter' ? setterDepts[u.id] : undefined,
          avatarUrl: avatarById[u.id] || null,
        }))
        .sort((a: MeetingBoardUser, b: MeetingBoardUser) => {
          const pA = rolePriority[a.role] || 99;
          const pB = rolePriority[b.role] || 99;
          if (pA !== pB) return pA - pB;
          return a.name.localeCompare(b.name);
        });

      setAllUsers(users);
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getFilteredUsers = (filter: MeetingBoardFilter, searchQuery: string): MeetingBoardUser[] => {
    let filtered: MeetingBoardUser[];

    switch (filter) {
      case 'sales':
        // Acquisition setters + AEs (incl. acting AEs — Marcus, 2 Sep)
        filtered = allUsers.filter(u =>
          (u.role === 'setter' && u.department === 'acquisition') ||
          SALES_ROLES.has(u.role) ||
          ACTING_AE_USER_IDS.includes(u.id)
        );
        break;
      case 'fulfillment':
        // Fulfilment setters only
        filtered = allUsers.filter(u =>
          u.role === 'setter' && u.department === 'fulfilment'
        );
        break;
      case 'operations':
        // All other roles (non-setter, non-AE)
        filtered = allUsers.filter(u =>
          u.role !== 'setter' && u.role !== 'account_executive'
        );
        break;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(u =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }

    return filtered;
  };

  return { allUsers, isLoading, getFilteredUsers };
}
