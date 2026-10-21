import { useState } from "react";
import { Bug } from "lucide-react";
import { ReportIssueModal } from "./ReportIssueModal";
import { MyTicketsDrawer } from "./MyTicketsDrawer";
import { useAuth } from "@/contexts/AuthContext";

interface ReportIssueButtonProps {
  collapsed?: boolean;
}

export function ReportIssueButton({ collapsed }: ReportIssueButtonProps) {
  const { user, userRoles } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Hidden from clients
  if (!user || userRoles.includes("client")) return null;

  return (
    <>
      <div className="px-2 pt-1 pb-0.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setModalOpen(true)}
            title="Report an issue"
            className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px] font-medium text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 transition-all border border-transparent hover:border-violet-500/30"
          >
            <Bug className="h-3 w-3" />
            {!collapsed && <span>Report an issue</span>}
          </button>
          {!collapsed && (
            <button
              onClick={() => setDrawerOpen(true)}
              title="My tickets"
              className="px-2 py-1 rounded-md text-[10px] text-violet-400/70 hover:text-violet-300 hover:bg-violet-500/10 transition-all"
            >
              mine
            </button>
          )}
        </div>
      </div>
      <ReportIssueModal open={modalOpen} onOpenChange={setModalOpen} />
      <MyTicketsDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
}
