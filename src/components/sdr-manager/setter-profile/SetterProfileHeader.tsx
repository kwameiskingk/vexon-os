import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ArrowLeft, Mail, Calendar, CheckCircle } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { getTitleLabel, getTitleBadgeClasses } from "@/lib/setterTitles";
import SetterQuickActions from "@/components/sdr-manager/setter-profile/SetterQuickActions";
import type { useSetterProfile } from "@/hooks/useSetterProfile";

interface Props {
  setter: NonNullable<ReturnType<typeof useSetterProfile>["setter"]>;
  setterProfileId: string;
  updateTitle: ReturnType<typeof useSetterProfile>["updateTitle"];
  updateStatus: ReturnType<typeof useSetterProfile>["updateStatus"];
  updateCoachingFocus: ReturnType<typeof useSetterProfile>["updateCoachingFocus"];
  updateNotes: ReturnType<typeof useSetterProfile>["updateNotes"];
  onJumpToTargets: () => void;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "active":
      return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Active</Badge>;
    case "trainee":
      return <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30">Trainee</Badge>;
    case "pip":
      return <Badge variant="destructive">PIP</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

const getDepartmentLabel = (dept?: string) =>
  dept === "fulfilment"
    ? "Fulfilment"
    : dept === "acquisition"
      ? "Sales"
      : (dept?.charAt(0).toUpperCase() ?? "") + (dept?.slice(1) ?? "");

const getDepartmentBadgeColor = (dept?: string) => {
  const colors: Record<string, string> = {
    fulfilment: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    acquisition: "bg-purple-500/15 text-purple-500 border-purple-500/30",
  };
  return colors[dept || ""] || "bg-gray-500/15 text-gray-500 border-gray-500/30";
};

export default function SetterProfileHeader({
  setter,
  setterProfileId,
  updateTitle,
  updateStatus,
  updateCoachingFocus,
  updateNotes,
  onJumpToTargets,
}: Props) {
  const navigate = useNavigate();

  // Acquisition setter profiles carry their actions in an Overview-tab card
  // instead of the header bar (rendered by SetterProfilePage).
  const isAcquisition = setter.department === "acquisition";

  const startDate = setter.start_date || setter.created_at;
  const tenureDays = startDate ? differenceInDays(new Date(), new Date(startDate)) : 0;

  return (
    <>
      <Button variant="ghost" className="gap-2 -ml-2" onClick={() => navigate("/sdr-manager/setters")}>
        <ArrowLeft className="h-4 w-4" />
        Back to Setter Management
      </Button>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row items-start gap-6">
            <UserAvatar
              name={setter.full_name || setter.email || "Setter"}
              avatarUrl={setter.userProfile?.avatar_url}
              size="xl"
            />

            <div className="flex-1 space-y-3 min-w-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold truncate">{setter.full_name || "Unnamed Setter"}</h1>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" className={getTitleBadgeClasses(setter.title)}>
                      {getTitleLabel(setter.title)}
                    </Badge>
                    <Badge className={getDepartmentBadgeColor(setter.department)}>
                      {getDepartmentLabel(setter.department)}
                    </Badge>
                    {getStatusBadge(setter.status || "active")}
                  </div>
                </div>

                {/* Quick Actions Bar (fulfilment; acquisition gets an Overview-tab Actions card) */}
                {!isAcquisition && (
                  <SetterQuickActions
                    variant="header"
                    setter={setter}
                    setterProfileId={setterProfileId}
                    updateTitle={updateTitle}
                    updateCoachingFocus={updateCoachingFocus}
                    updateNotes={updateNotes}
                    onJumpToTargets={onJumpToTargets}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span className="truncate">{setter.email}</span>
                </div>
                {startDate && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>
                      Started {format(new Date(startDate), "dd MMM yyyy")} · {tenureDays} days
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>
                    {setter.last_coaching_session
                      ? `Last coached ${format(new Date(setter.last_coaching_session), "dd MMM yyyy")}`
                      : "No coaching yet"}
                  </span>
                </div>
              </div>

              {/* Status quick toggles */}
              <div className="flex flex-wrap gap-2 pt-2">
                {setter.status !== "active" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-emerald-500 h-7"
                    onClick={() => updateStatus.mutate("active")}
                  >
                    Set Active
                  </Button>
                )}
                {setter.status !== "trainee" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-blue-500 h-7"
                    onClick={() => updateStatus.mutate("trainee")}
                  >
                    Mark Trainee
                  </Button>
                )}
                {setter.status !== "pip" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive h-7"
                    onClick={() => updateStatus.mutate("pip")}
                  >
                    Place on PIP
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

    </>
  );
}
