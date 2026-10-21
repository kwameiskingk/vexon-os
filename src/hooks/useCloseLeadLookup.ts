// Pull a candidate's Typeform answers from their Close lead (11 Sep 2026).
// The edge function hiring-close-lead resolves the pasted lead link in the
// Human Resources Close org and returns the contact details plus every
// custom field with a value, by name. Saving is a separate step so the
// operator sees what came back before it lands on the card.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CV_SCREENINGS_QUERY_KEY } from "./useCvScreenings";

export interface CloseLeadLookupResult {
  lead_id: string;
  lead_url: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  company_name: string | null;
  answers: Record<string, string>;
}

export function useCloseLeadLookup() {
  return useMutation({
    mutationFn: async (closeLeadLink: string): Promise<CloseLeadLookupResult> => {
      const { data, error } = await supabase.functions.invoke("hiring-close-lead", {
        body: { close_lead_link: closeLeadLink },
      });
      if (error) {
        // The function's own JSON error is inside the response body.
        let message = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) message = ((await ctx.json()) as { error?: string }).error ?? message;
        } catch {
          /* keep the generic message */
        }
        throw new Error(message || "Close lookup failed");
      }
      if (data?.error) throw new Error(String(data.error));
      return data as CloseLeadLookupResult;
    },
  });
}

/** Write pulled answers (and any contact details that were blank) onto the screening row. */
export function useSaveTypeformAnswers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cvScreeningId: string;
      answers: Record<string, string>;
      closeLeadId?: string | null;
      closeLeadUrl?: string | null;
      /** Only written when the row has none yet. */
      email?: string | null;
      phone?: string | null;
      linkedinUrl?: string | null;
    }) => {
      const patch: Record<string, unknown> = { typeform_answers: input.answers };
      if (input.closeLeadId !== undefined) patch.close_lead_id = input.closeLeadId;
      if (input.closeLeadUrl !== undefined) patch.close_lead_url = input.closeLeadUrl;
      const { data: current } = await supabase
        .from("cv_screenings")
        .select("email, phone, linkedin_url")
        .eq("id", input.cvScreeningId)
        .maybeSingle();
      if (current) {
        if (!current.email && input.email) patch.email = input.email;
        if (!current.phone && input.phone) patch.phone = input.phone;
        if (!current.linkedin_url && input.linkedinUrl) patch.linkedin_url = input.linkedinUrl;
      }
      const { error } = await supabase.from("cv_screenings").update(patch as never).eq("id", input.cvScreeningId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CV_SCREENINGS_QUERY_KEY });
    },
  });
}
