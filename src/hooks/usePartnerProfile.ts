import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface PartnerProfile {
  id: string;
  full_name: string;
  email: string;
  company_name: string | null;
  bank_account_name?: string | null;
  bank_sort_code?: string | null;
  bank_account_number?: string | null;
  bank_details_updated_at?: string | null;
}

/**
 * Resolves the logged-in partner's `partners` row. Partners are 1:1 with
 * auth users (partners.user_id UNIQUE) — no join table, unlike clients.
 */
export function usePartnerProfile() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["partner-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<PartnerProfile | null> => {
      const { data: partner, error } = await supabase
        .from("partners")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return partner as PartnerProfile | null;
    },
  });

  return { partner: data ?? null, isLoading };
}
