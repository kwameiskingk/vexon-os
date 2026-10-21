// Candidate CV storage (Marcus's CV-chase feature).
//
// The private `candidate-cvs` bucket already holds CVs uploaded from the
// admin create-candidate modal (Hiring.tsx); the object path lives on
// candidates.cv_file and is only ever read back through short-lived signed
// URLs (CandidateDrawer pattern — the bucket is not public). These helpers
// let the TA surfaces upload/replace/view a CV with the same conventions:
// flat bucket root, "{Date.now()}_{first}_{last}.{ext}" object names.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HIRING_PIPELINE_QUERY_KEY } from "./useHiringPipeline";

/** What the pickers accept — PDF plus Word, per the chase-alert spec. */
export const CV_ACCEPT = ".pdf,.doc,.docx";

export interface UploadCandidateCvInput {
  candidateId: string;
  firstName: string;
  lastName: string;
  file: File;
}

/**
 * Upload a CV to the bucket and remember its path on candidates.cv_file.
 * A replace is the same operation — the new path overwrites the old
 * reference (the previous object is left in the bucket, matching how the
 * admin flow has always behaved; nothing links to it any more).
 */
// Storage keys must be ASCII-safe: names like "José" or "Müller", or a
// multi-word surname, otherwise fail the upload with a cryptic error.
const slug = (s: string) =>
  (s || "").normalize("NFKD").replace(/[^\w-]+/g, "").slice(0, 40) || "candidate";

export async function uploadCandidateCv(input: UploadCandidateCvInput): Promise<string> {
  const ext = (input.file.name.split(".").pop() || "pdf").replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "pdf";
  const objectName = `${Date.now()}_${slug(input.firstName)}_${slug(input.lastName)}.${ext}`;
  const { data, error } = await supabase.storage
    .from("candidate-cvs")
    .upload(objectName, input.file);
  if (error) throw error;
  const { error: updateError } = await supabase
    .from("candidates")
    .update({ cv_file: data.path } as never)
    .eq("id", input.candidateId);
  if (updateError) throw updateError;
  return data.path;
}

export function useUploadCandidateCv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadCandidateCv,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HIRING_PIPELINE_QUERY_KEY });
    },
  });
}

/** Signed URL (1 hour) for a stored CV — the bucket is private by design. */
export async function candidateCvSignedUrl(cvFile: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from("candidate-cvs")
    .createSignedUrl(cvFile, 3600);
  return data?.signedUrl ?? null;
}
