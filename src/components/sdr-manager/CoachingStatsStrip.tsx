import { Card, CardContent } from "@/components/ui/card";
import { CalendarCheck, Star, ListChecks, AlertCircle } from "lucide-react";

interface CoachingStatsStripProps {
  completedThisMonth: number;
  scheduledThisMonth: number;
  averageRating: number | null;
  openActionItems: number;
  settersNeedingAttention: { name: string; daysSince: number }[];
}

const CoachingStatsStrip = ({
  completedThisMonth,
  scheduledThisMonth,
  averageRating,
  openActionItems,
  settersNeedingAttention,
}: CoachingStatsStripProps) => {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedThisMonth}<span className="text-sm font-normal text-muted-foreground">/{scheduledThisMonth + completedThisMonth}</span></p>
                <p className="text-xs text-muted-foreground">Sessions This Month</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <Star className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{averageRating ? averageRating.toFixed(1) : '—'}<span className="text-sm font-normal text-muted-foreground">/5</span></p>
                <p className="text-xs text-muted-foreground">Avg Session Rating</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <ListChecks className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{openActionItems}</p>
                <p className="text-xs text-muted-foreground">Open Action Items</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`bg-card/50 backdrop-blur border-border/50 ${settersNeedingAttention.length > 0 ? 'border-red-500/30' : ''}`}>
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${settersNeedingAttention.length > 0 ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                <AlertCircle className={`h-5 w-5 ${settersNeedingAttention.length > 0 ? 'text-red-400' : 'text-green-400'}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{settersNeedingAttention.length}</p>
                <p className="text-xs text-muted-foreground">Need Coaching</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
};

export default CoachingStatsStrip;
