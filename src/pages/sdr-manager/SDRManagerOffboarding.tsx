// SDR manager · Offboarding (14 Oct 2026, the owner). The HR Employee
// Offboarding page, scoped to the setters of the manager's own
// department(s). A fulfilment manager sees fulfilment setters, an
// acquisition manager sees sales setters; an acting admin holds both.

import HROffboarding from "@/pages/admin/hr/Offboarding";
import { useSdrManagerScope } from "@/hooks/useSdrManagerScope";

export default function SDRManagerOffboarding() {
  const { departments } = useSdrManagerScope();
  return <HROffboarding scope={{ departments }} />;
}
