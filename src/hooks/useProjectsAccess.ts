import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDepartment } from "@/contexts/DepartmentContext";
import { isCEOUser } from "@/lib/ceo";
import { useCanViewCEO, useCanViewProjects } from "@/hooks/useCapability";

/**
 * Who may open the Projects tab: the CEO, any can_view_ceo_dashboard holder
 * (Elena's parity) or a can_view_projects holder. Also pins the sidebar to
 * the CEO department while a projects page is mounted, mirroring
 * useForceCEODepartment — the tab lives in that department's nav.
 */
export function useProjectsAccess() {
  const { user, isLoading: authLoading } = useAuth();
  const ceo = useCanViewCEO();
  const projects = useCanViewProjects();
  const { selectedDepartment, setSelectedDepartment } = useDepartment();

  const allowed = isCEOUser(user?.id) || ceo.has || projects.has;
  const isLoading = authLoading || ceo.isLoading || projects.isLoading;

  useEffect(() => {
    if (allowed && selectedDepartment !== "ceo") setSelectedDepartment("ceo");
  }, [allowed, selectedDepartment, setSelectedDepartment]);

  return { allowed, isLoading };
}
