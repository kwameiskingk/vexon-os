import { useState } from "react";
import { useEODPending } from "@/hooks/useEODPending";
import { EODSubmissionModal } from "@/components/operations/EODSubmissionModal";
import { useAuth } from "@/contexts/AuthContext";
import { getUKDateString } from "@/utils/timezoneUtils";
import { useQueryClient } from "@tanstack/react-query";

interface EODModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isTest?: boolean;
}

export function EODModal({ open: openProp, onOpenChange, isTest }: EODModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: pending } = useEODPending();
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(true);
  const open = isControlled ? !!openProp : (pending?.pending && internalOpen);

  const handleOpenChange = (v: boolean) => {
    if (isControlled) {
      onOpenChange?.(v);
    } else {
      setInternalOpen(v);
      if (!v && user && !isTest) {
        localStorage.setItem(`eod-dismissed-${user.id}-${getUKDateString()}`, "1");
      }
    }
  };

  if (!open) return null;

  return (
    <EODSubmissionModal
      open={open}
      onOpenChange={handleOpenChange}
      isTest={isTest}
      onSuccess={() => {
        queryClient.invalidateQueries({ queryKey: ["eod-pending"] });
      }}
    />
  );
}
