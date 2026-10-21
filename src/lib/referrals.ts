/** Shared labels/styles for the partner referral lifecycle. Status values
 *  mirror the referrals.status CHECK constraint; closed_won/closed_lost are
 *  written only by the DB outcome-sync triggers. */

export type ReferralStatus = "submitted" | "converted" | "closed_won" | "closed_lost";
export type PayoutStatus = "unpaid" | "paid";

export const REFERRAL_STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  converted: "In Progress",
  closed_won: "Won",
  closed_lost: "Not Proceeding",
};

export const REFERRAL_STATUS_STYLES: Record<string, string> = {
  submitted: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  converted: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  closed_won: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  closed_lost: "bg-muted text-muted-foreground border-border",
};

export const PAYOUT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
};

export const PAYOUT_STATUS_STYLES: Record<string, string> = {
  unpaid: "bg-muted text-muted-foreground border-border",
  paid: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
};

export const DOC_TYPE_LABELS: Record<string, string> = {
  contract: "Contract",
  proof_of_payment: "Proof of Payment",
  other: "Other",
};

export const DOC_TYPE_STYLES: Record<string, string> = {
  contract: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  proof_of_payment: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  other: "bg-muted text-muted-foreground border-border",
};

export const formatPayout = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
