import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Building2, Briefcase } from "lucide-react";

interface SelectDepartmentModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (department: 'fulfilment' | 'acquisition') => void;
}

export const SelectDepartmentModal = ({ open, onClose, onSelect }: SelectDepartmentModalProps) => {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Department</DialogTitle>
          <DialogDescription>
            Which department should this meeting be assigned to?
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <Button
            variant="outline"
            className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-primary/10 hover:border-primary"
            onClick={() => onSelect('fulfilment')}
          >
            <Building2 className="h-8 w-8 text-primary" />
            <span className="font-medium">Fulfilment</span>
          </Button>
          <Button
            variant="outline"
            className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-primary/10 hover:border-primary"
            onClick={() => onSelect('acquisition')}
          >
            <Briefcase className="h-8 w-8 text-primary" />
            <span className="font-medium">Acquisition</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
