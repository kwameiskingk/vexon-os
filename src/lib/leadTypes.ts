import { Video, Phone, FileText } from "lucide-react";

export type LeadType = 'video_conference' | 'mobile_phone_call' | 'terms_sent';

export const LEAD_TYPE_CONFIG: Record<LeadType, { label: string; icon: typeof Video; color: string }> = {
  video_conference: { label: 'Video Meet', icon: Video, color: 'text-blue-500 border-blue-500/30 bg-blue-500/10' },
  mobile_phone_call: { label: 'Job Spec + Callback', icon: Phone, color: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10' },
  terms_sent: { label: 'Terms Sent + Callback', icon: FileText, color: 'text-amber-500 border-amber-500/30 bg-amber-500/10' },
};

export const getLeadTypeLabel = (type?: string | null): string => {
  if (!type || !(type in LEAD_TYPE_CONFIG)) return 'Video Meet';
  return LEAD_TYPE_CONFIG[type as LeadType].label;
};

export const getLeadTypeConfig = (type?: string | null) => {
  if (!type || !(type in LEAD_TYPE_CONFIG)) return LEAD_TYPE_CONFIG.video_conference;
  return LEAD_TYPE_CONFIG[type as LeadType];
};
