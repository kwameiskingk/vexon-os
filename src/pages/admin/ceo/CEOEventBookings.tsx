// CEO · Event Bookings (17 Sep 2026). Marcus asked on the morning call for
// the same control the Dev Centre has over Vexon OS booking events — dates,
// availability, the questions asked, hosts, pauses — "somewhere within my
// dash". Every meeting that isn't a client meeting is now with him, so the
// events are his to shape. The module is the Dev Centre one unchanged; it
// is only reachable from a second door. No backend change: Marcus holds
// `admin`, which the booking_* RLS policies already treat as the admin tier.

import "@/styles/dev-console.css";
import { Navigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { isCEOUser } from "@/lib/ceo";
import { useCanViewCEO } from "@/hooks/useCapability";
import { useForceCEODepartment } from "@/hooks/useForceCEODepartment";
import { BookingsModule } from "@/components/dev/BookingsModule";

export default function CEOEventBookings() {
  const { user, isLoading } = useAuth();
  const { has: canViewCEO, isLoading: capLoading } = useCanViewCEO();
  useForceCEODepartment();

  if (isLoading || capLoading) return null;
  if (!isCEOUser(user?.id) && !canViewCEO) return <Navigate to="/admin" replace />;

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Kronos"
          subtitle="Your booking events: what each one asks, how long it runs, who hosts it, how far ahead people can book, and when you're free. Client booking links are not here — Daniel manages those on each client's profile."
        />
        <div className="dev-console dc-embedded">
          {/* Internal events only, in the plain layout (the owner, 17 Sep). */}
          <BookingsModule scope="internal" simple />
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
