import { useEffect } from "react";
import { useDepartment } from "@/contexts/DepartmentContext";
import { useAuth } from "@/contexts/AuthContext";
import { isCEOUser } from "@/lib/ceo";
import { useCanViewCEO } from "@/hooks/useCapability";

/**
 * Forces the sidebar department selector to "CEO" whenever a CEO page mounts.
 * Without this the sidebar can drift back to operations after navigation.
 */
export function useForceCEODepartment() {
  const { selectedDepartment, setSelectedDepartment } = useDepartment();
  const { user } = useAuth();
  const { has: canViewCEO } = useCanViewCEO();

  useEffect(() => {
    if ((isCEOUser(user?.id) || canViewCEO) && selectedDepartment !== "ceo") {
      setSelectedDepartment("ceo");
    }
  }, [user?.id, canViewCEO, selectedDepartment, setSelectedDepartment]);
}

