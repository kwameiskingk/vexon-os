import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { useState } from "react";
import { PerformanceReviewView } from "@/components/ops-command/performance-review/PerformanceReviewView";
import { AEReviewView } from "@/components/acquisition/ae-review/AEReviewView";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSdrManagerScope } from "@/hooks/useSdrManagerScope";

/**
 * SDR-manager mount of the performance reviews. Same animated components as
 * Ops Command / CEO, scoped to the manager's own department(s) — the picker
 * scoping here is UX; the real enforcement is the sdr_manager RLS on
 * performance_reviews / performance_review_briefs (migrations
 * 20260727150000 + 20260811140000).
 *
 * The Account Executives tab is a capability gate: shown whenever the
 * manager HOLDS acquisition (scope-model rule), rendering the shared
 * AEReviewView in managerScope. AEs never see their own reviews
 * (2026-07-28 ruling, unchanged).
 */
export default function SDRManagerPerformanceReview() {
  const { departments } = useSdrManagerScope();
  const [revieweeType, setRevieweeType] = useState<"setters" | "aes">("setters");
  const showAETab = departments.includes("acquisition");
  const aeMode = showAETab && revieweeType === "aes";
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Performance Reviews"
          subtitle={
            aeMode
              ? "Weekly and monthly performance reviews for your account executives."
              : `Weekly and monthly performance reviews for your ${departments.join(" and ")} setters.`
          }
        />
        {showAETab && (
          <Tabs
            value={revieweeType}
            onValueChange={(v) => setRevieweeType(v as "setters" | "aes")}
            className="mb-4"
          >
            <TabsList>
              <TabsTrigger value="setters">Setters</TabsTrigger>
              <TabsTrigger value="aes">Account Executives</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        {aeMode ? <AEReviewView managerScope /> : <PerformanceReviewView fulfilmentScope />}
      </PageContainer>
    </DashboardLayout>
  );
}
