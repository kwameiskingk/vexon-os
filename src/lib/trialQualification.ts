// Trial Day (15 Sep 2026): the fulfilment qualification tree, worded for a
// trialist. Same questions and the same column names as the client booking
// page (src/pages/public/BookingPage.tsx, "Marcus's tree") and the meetings
// table, so a converted lead maps column-for-column. Only the prose differs:
// the "not qualified" branch tells the trialist it is generally not a lead
// and asks why they would continue — it never blocks them.
//
// Deliberately a second copy for now (the owner, 15 Sep): the live booking page
// is untouched on a same-day build. Folding both into one module is the
// follow-up.

import type { JobRoleEntry, ProposedTime } from "@/hooks/useTrialDay";

export type YesNo = "" | "yes" | "no";
export type DmStatus = "" | "joining" | "briefed_by_prospect" | "email_pending";

export interface TrialQualificationState {
  hiring: YesNo;
  roles: JobRoleEntry[];
  jobSpec: YesNo;
  openCvs: YesNo;
  cvTitles: string;
  cvLevel: string;
  otherDms: YesNo;
  dmStatus: DmStatus;
  dmEmail: string;
  continueReason: string;
}

export const EMPTY_TRIAL_QUALIFICATION: TrialQualificationState = {
  hiring: "",
  roles: [],
  jobSpec: "",
  openCvs: "",
  cvTitles: "",
  cvLevel: "",
  otherDms: "",
  dmStatus: "",
  dmEmail: "",
  continueReason: "",
};

export const TRIAL_COPY = {
  hiring: "Are they currently hiring, or looking to start in the next 3 months?",
  roles: "Which roles are they hiring for?",
  jobSpec: "Do they have a job spec they can send across?",
  openCvs: "Would they be open to receiving strong candidate CVs over the next 3 months?",
  cvTitles: "What kind of candidates or job titles would they want to see?",
  cvLevel: "What level are those candidates?",
  otherDms: "Are there any other decision makers on hiring?",
  notQualifiedTitle: "This is generally not a qualified lead.",
  notQualifiedBody: "Not hiring and not open to CVs. Please specify why you would continue.",
  continuePlaceholder: "What makes this one worth a call back?",
  dmOptions: [
    ["joining", "They will join the meeting — I have their email"],
    ["briefed_by_prospect", "They can't attend — the prospect will brief them"],
    ["email_pending", "No email yet — to be collected"],
  ] as const,
  times: "When could they meet?",
  timesHint: "Ask for two or three times. Your team lead or the setter confirms one with them. You never need a calendar.",
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Not hiring and not open to CVs — the branch that asks for a reason. */
export const isGenerallyNotQualified = (q: TrialQualificationState): boolean =>
  q.hiring === "no" && q.openCvs === "no";

/** Why the form cannot be submitted yet, or null when it can. */
export function trialQualificationBlocker(q: TrialQualificationState): string | null {
  if (q.hiring === "") return "Answer whether they are hiring.";
  if (q.hiring === "yes") {
    if (q.roles.length === 0) return "Add at least one role they are hiring for.";
    if (q.jobSpec === "") return "Answer whether they have a job spec.";
  } else {
    if (q.openCvs === "") return "Answer whether they are open to receiving CVs.";
    if (q.openCvs === "yes" && !(q.cvTitles.trim() && q.cvLevel.trim())) return "Say what candidates they want to see, and at what level.";
    if (q.openCvs === "no" && !q.continueReason.trim()) return "Say why you would continue with this lead.";
  }
  if (q.otherDms === "") return "Answer whether there are other decision makers.";
  if (q.otherDms === "yes") {
    if (q.dmStatus === "") return "Say how the other decision maker is involved.";
    if (q.dmStatus === "joining" && !EMAIL_RE.test(q.dmEmail.trim())) return "Enter the decision maker's email.";
  }
  return null;
}

export const validProposedTimes = (times: ProposedTime[]): ProposedTime[] =>
  times.filter((t) => t.date && t.time);

/** Map the tree onto the trial_leads / meetings column names. */
export function trialQualificationColumns(q: TrialQualificationState) {
  return {
    currently_hiring: q.hiring === "" ? null : q.hiring === "yes",
    job_roles: q.hiring === "yes" ? q.roles : [],
    job_spec_provided: q.hiring === "yes" && q.jobSpec !== "" ? q.jobSpec === "yes" : null,
    open_to_receiving_cvs: q.hiring === "no" && q.openCvs !== "" ? q.openCvs === "yes" : null,
    cv_candidate_titles: q.openCvs === "yes" ? q.cvTitles.trim() : "",
    cv_candidate_level: q.openCvs === "yes" ? q.cvLevel.trim() : "",
    other_decision_makers: q.otherDms === "" ? null : q.otherDms === "yes",
    decision_maker_status: q.otherDms === "yes" ? q.dmStatus : "",
    decision_maker_email: q.otherDms === "yes" && q.dmStatus === "joining" ? q.dmEmail.trim() : "",
    push_through_reason: isGenerallyNotQualified(q) ? q.continueReason.trim() : "",
  };
}
