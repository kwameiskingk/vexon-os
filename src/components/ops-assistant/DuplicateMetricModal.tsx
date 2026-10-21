import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface DuplicateMetricModalProps {
  open: boolean;
  userName: string;
  date: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DuplicateMetricModal = ({
  open,
  userName,
  date,
  onConfirm,
  onCancel,
}: DuplicateMetricModalProps) => {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Existing Metrics Found
          </DialogTitle>
          <DialogDescription>
            Metrics for <strong>{userName}</strong> on <strong>{date}</strong> already exist. Do you want to update them?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Update</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
