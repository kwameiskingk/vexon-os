import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useDevRole = () => {
  const [isDev, setIsDev] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const checkDevRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsDev(false);
          setLoading(false);
          setUserId(null);
          return;
        }

        setUserId(user.id);

        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'dev')
          .maybeSingle();

        setIsDev(!!roleData);
      } catch (error) {
        console.error('Error checking dev role:', error);
        setIsDev(false);
      } finally {
        setLoading(false);
      }
    };

    checkDevRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Defer Supabase calls to avoid deadlocks inside the callback
      setTimeout(() => {
        checkDevRole();
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { isDev, loading, userId };
};

export const VALID_ROLES = [
  { value: 'dev', label: 'Developer' },
  { value: 'admin', label: 'Admin' },
  { value: 'ops', label: 'Operations' },
  { value: 'finance', label: 'Finance' },
  { value: 'csm', label: 'Customer Success' },
  { value: 'hr', label: 'Human Resources' },
  { value: 'accounting', label: 'Accounting' },
  { value: 'sdr_manager', label: 'SDR Manager' },
  { value: 'talent_acquisition', label: 'Talent Acquisition' },
  { value: 'setter', label: 'Setter (SDR)' },
  { value: 'account_executive', label: 'Account Executive' },
  { value: 'gtm_engineer', label: 'GTM Engineer' },
  { value: 'ops_assistant', label: 'Ops Assistant' },
  { value: 'client', label: 'Client' },
] as const;

export type ValidRole = typeof VALID_ROLES[number]['value'];
