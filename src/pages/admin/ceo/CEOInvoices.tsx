// CEO · Invoices (9 Oct 2026). Marcus's ask on the 8 Oct EOD call: when a
// client is closed, raise the Meridian invoice from the dashboard and send it,
// instead of copying his Google Doc template (about ten minutes a time). The
// PDF IS his template (the owner: "don't recreate it"). Marking an invoice paid
// can press Confirm paid on the client's onboarding in the same go, which is
// what sends the welcome email — the chain he described on the 9 Oct call.
// 15 Oct: the screen itself lives in InvoicesWorkspace (also in the Dev Centre).

import { Navigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { useAuth } from "@/contexts/AuthContext";
import { isCEOUser } from "@/lib/ceo";
import { useCanViewCEO } from "@/hooks/useCapability";
import { useForceCEODepartment } from "@/hooks/useForceCEODepartment";
import { InvoicesWorkspace } from "@/components/invoices/InvoicesWorkspace";

export default function CEOInvoices() {
  const { user, userRoles, isLoading } = useAuth();
  const { has: canViewCEO, isLoading: capLoading } = useCanViewCEO();
  useForceCEODepartment();

  if (isLoading || capLoading) return null;
  if (!isCEOUser(user?.id) && !canViewCEO) return <Navigate to="/admin" replace />;
  const canIssue = userRoles.includes("admin") || userRoles.includes("dev");

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <InvoicesWorkspace canIssue={canIssue} />
      </PageContainer>
    </DashboardLayout>
  );
}
