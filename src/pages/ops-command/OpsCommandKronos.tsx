// Ops Command · Kronos (14 Oct 2026, the owner, from Elena's walkthrough).
// The same bookings module as the CEO's Kronos, in the plain layout, with
// one rule: it shows the signed-in person their own events and bookings.
// For Elena that is the Trial Day she hosts and the Final Interviews she
// books for Marcus; for Daniel, his onboarding calls and catch-ups. The
// CEO and Dev Centre doors are unchanged.

import "@/styles/dev-console.css";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { BookingsModule } from "@/components/dev/BookingsModule";

export default function OpsCommandKronos() {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Kronos"
          subtitle="The booking events you host or book for, the bookings you have made, and when you are free. Copy a link to send it out."
        />
        <div className="dev-console dc-embedded">
          <BookingsModule scope="mine" simple />
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
