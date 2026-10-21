import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

function deriveFromEmail(email: string | null | undefined, mode: "first" | "full"): string {
  if (!email) return mode === "first" ? "there" : "User";
  const local = email.split("@")[0] ?? "";
  if (/[._-]/.test(local)) {
    const parts = local.split(/[._-]/).filter(Boolean).map(capitalize);
    return mode === "first" ? parts[0] : parts.join(" ");
  }
  return capitalize(local);
}

/**
 * Returns the user's display name from `profiles.full_name` when available,
 * falling back to a sensible email-derived name. Prefer this over splitting
 * the email yourself so single-token emails (e.g. `joshtaylor@…`) still show
 * the real first name "Josh" rather than "Joshtaylor".
 */
export function useUserDisplayName() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setFullName(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setFullName(data?.full_name?.trim() || null);
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const firstName = fullName
    ? capitalize(fullName.split(/\s+/)[0])
    : deriveFromEmail(user?.email, "first");

  const displayName = fullName ?? deriveFromEmail(user?.email, "full");

  return { firstName, displayName, fullName, isLoading };
}
