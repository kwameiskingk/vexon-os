import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { User, Mail, Phone, Calendar, Video } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isPast, isToday } from "date-fns";
import { CatchupBookingDialog } from "@/components/client/CatchupBookingDialog";
import { utcToZoneParts } from "@/components/bookings/BookingSlotPicker";

export interface CSMInfo {
  name: string;
  email: string;
  phone: string | null;
}

export interface Catchup {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
}

export interface ClientCommunicationsViewProps {
  loading: boolean;
  csmInfo: CSMInfo;
  catchups: Catchup[];
  /** Demo portal: the booking dialog renders inert. */
  demo?: boolean;
  /** Fires after a successful in-portal booking so the container can refetch. */
  onBooked?: (bookingId: string, startsAt: string) => void;
}

export const ClientCommunicationsView = ({
  loading,
  csmInfo,
  catchups,
  demo,
  onBooked,
}: ClientCommunicationsViewProps) => {
  // "Book a call" opens the in-portal catch-up dialog (3 Sep ruling) instead
  // of sending clients to the public onboarding page and its questions.
  const [bookingOpen, setBookingOpen] = useState(false);
  // The just-booked call shows in "Scheduled Catch-ups" straight away, before
  // (and regardless of) the container's refetch. booking-create mirrors the
  // booking into client_catchups, so the refetched list carries the same
  // date/time under a different id: dedupe on date + time, not id.
  const [justBooked, setJustBooked] = useState<Catchup[]>([]);
  const visibleCatchups: Catchup[] = [
    ...justBooked.filter(
      (j) =>
        !catchups.some(
          (c) =>
            c.scheduled_date === j.scheduled_date &&
            (c.scheduled_time || "").slice(0, 5) === j.scheduled_time.slice(0, 5),
        ),
    ),
    ...catchups,
  ].sort((a, b) =>
    `${a.scheduled_date}T${a.scheduled_time}`.localeCompare(`${b.scheduled_date}T${b.scheduled_time}`),
  );
  const handleBooked = (bookingId: string, startsAt: string) => {
    const { date, time } = utcToZoneParts(startsAt, "Europe/London");
    setJustBooked((prev) => [
      ...prev,
      { id: bookingId, scheduled_date: date, scheduled_time: time, status: "scheduled" },
    ]);
    onBooked?.(bookingId, startsAt);
  };
  const getCatchupBadge = (catchup: Catchup) => {
    const scheduledDate = new Date(catchup.scheduled_date);
    if (isToday(scheduledDate)) {
      return <Badge className="bg-primary/10 text-primary border-primary/30">Today</Badge>;
    }
    if (isPast(scheduledDate)) {
      return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30">Overdue</Badge>;
    }
    return <Badge variant="outline">Upcoming</Badge>;
  };

  return (
    <DashboardLayout role="client">
      <PageContainer>
        <PageHeader title="Communications" subtitle="Stay connected with your dedicated success manager" gradient />

        <div className="grid grid-cols-1 gap-6">
          {/* CSM Contact Card */}
          <Card className="border-border shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Your Customer Success Manager
              </CardTitle>
              <CardDescription>
                Your dedicated point of contact for all campaign needs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border border-border">
                    <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                      <User className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-lg">{csmInfo.name}</p>
                      <p className="text-sm text-muted-foreground">Customer Success Manager</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <a href={`mailto:${csmInfo.email}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm">{csmInfo.email}</span>
                    </a>
                    {csmInfo.phone && (
                      <a href={`tel:${csmInfo.phone}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                        <Phone className="h-5 w-5 text-muted-foreground" />
                        <span className="text-sm">{csmInfo.phone}</span>
                      </a>
                    )}
                  </div>

                  <Button className="w-full mt-4" onClick={() => setBookingOpen(true)}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Book a call with {csmInfo.name}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    A 30-minute catch-up. Pick a time and the invite lands in your inbox.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <CatchupBookingDialog
          open={bookingOpen}
          onOpenChange={setBookingOpen}
          csmName={csmInfo.name}
          csmEmail={csmInfo.email}
          demo={demo}
          onBooked={handleBooked}
        />

        {/* Scheduled Catch-ups */}
        <div className="mt-6">
          <Card className="border-border shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5 text-primary" />
                Scheduled Catch-ups
              </CardTitle>
              <CardDescription>
                Your upcoming review sessions with the team
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : visibleCatchups.length > 0 ? (
                <div className="space-y-3">
                  {visibleCatchups.map(catchup => (
                    <div key={catchup.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Video className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {format(new Date(catchup.scheduled_date), "EEEE, MMMM do, yyyy")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          at {catchup.scheduled_time?.slice(0, 5)}
                        </p>
                      </div>
                      {getCatchupBadge(catchup)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Video className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No catch-ups scheduled</p>
                  <p className="text-sm">Your CSM will schedule catch-ups as needed</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
};

const ClientCommunications = () => {
  const [loading, setLoading] = useState(true);
  const [csmInfo, setCsmInfo] = useState<CSMInfo>({
    name: "Daniel",
    email: "daniel@meridiansales.example",
    phone: null
  });
  const [catchups, setCatchups] = useState<Catchup[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch CSM contact info
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-system-settings`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.settings) {
              setCsmInfo({
                name: data.settings.csm_name || "Daniel",
                email: data.settings.csm_email || "daniel@meridiansales.example",
                phone: data.settings.csm_phone || null
              });
            }
          }
        } catch (e) {
          console.log("Using default CSM info");
        }
      }

      // Resolve the client profile id — the catch-ups query below depends on it
      const { data: linkedProfiles } = await supabase
        .from("client_profile_users")
        .select("client_profile_id")
        .eq("user_id", user.id);
      const { data: directProfile } = await supabase
        .from("client_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      let clientProfileId: string | null = null;

      if (linkedProfiles && linkedProfiles.length > 0) {
        clientProfileId = linkedProfiles[0].client_profile_id;
      } else if (directProfile) {
        clientProfileId = directProfile.id;
      }

      // Load upcoming catch-ups
      if (clientProfileId) {
        const { data: catchupData } = await supabase
          .from("client_catchups" as any)
          .select("id, scheduled_date, scheduled_time, status")
          .eq("client_profile_id", clientProfileId)
          .eq("status", "scheduled")
          .order("scheduled_date", { ascending: true });

        setCatchups((catchupData as any[]) || []);
      }
    } catch (error) {
      console.error("Failed to load communications data:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ClientCommunicationsView
      loading={loading}
      csmInfo={csmInfo}
      catchups={catchups}
      // Pull the mirrored client_catchups row (written by booking-create) so
      // the list is server truth, not just the optimistic entry.
      onBooked={() => { void loadData(); }}
    />
  );
};
export default ClientCommunications;
