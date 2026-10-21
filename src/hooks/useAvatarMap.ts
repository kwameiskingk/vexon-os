import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches avatar_url for a list of user IDs and returns a Map<userId, avatarUrl>.
 * Automatically deduplicates and handles empty arrays.
 */
export function useAvatarMap(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];

  const { data: avatarMap = new Map<string, string | null>() } = useQuery({
    queryKey: ["avatar-map", uniqueIds.sort().join(",")],
    queryFn: async () => {
      if (uniqueIds.length === 0) return new Map<string, string | null>();
      const { data } = await supabase
        .from("profiles")
        .select("id, avatar_url")
        .in("id", uniqueIds);
      return new Map((data || []).map((p) => [p.id, p.avatar_url]));
    },
    enabled: uniqueIds.length > 0,
    staleTime: 60000,
  });

  return avatarMap;
}

/**
 * Fetches avatar_url for a list of emails and returns a Map<email, avatarUrl>.
 */
export function useAvatarMapByEmail(emails: string[]) {
  const uniqueEmails = [...new Set(emails.filter(Boolean).map(e => e.toLowerCase()))];

  const { data: avatarMap = new Map<string, string | null>() } = useQuery({
    queryKey: ["avatar-map-email", uniqueEmails.sort().join(",")],
    queryFn: async () => {
      if (uniqueEmails.length === 0) return new Map<string, string | null>();
      const { data } = await supabase
        .from("profiles")
        .select("email, avatar_url")
        .in("email", uniqueEmails);
      return new Map((data || []).map((p) => [p.email?.toLowerCase() || "", p.avatar_url]));
    },
    enabled: uniqueEmails.length > 0,
    staleTime: 60000,
  });

  return avatarMap;
}
