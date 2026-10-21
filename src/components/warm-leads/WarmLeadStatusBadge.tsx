import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  new: { label: "New", variant: "secondary" },
  "1st_attempt": { label: "1st Attempt", variant: "outline" },
  "2nd_attempt": { label: "2nd Attempt", variant: "outline" },
  "3rd_attempt": { label: "3rd Attempt", variant: "outline" },
  connected: { label: "Connected", variant: "default" },
  interested: { label: "Interested", variant: "default" },
  meeting_booked: { label: "Meeting Booked", variant: "default" },
  no_show_follow_up: { label: "No-Show Follow Up", variant: "destructive" },
  callback_scheduled: { label: "Callback Scheduled", variant: "outline" },
  not_interested: { label: "Not Interested", variant: "destructive" },
  dead: { label: "Dead", variant: "destructive" },
};

export const LEAD_STATUSES = Object.keys(STATUS_CONFIG);

export function WarmLeadStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, variant: "secondary" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function getStatusLabel(status: string) {
  return STATUS_CONFIG[status]?.label || status;
}
