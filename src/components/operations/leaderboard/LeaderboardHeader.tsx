import { Trophy, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { AchievementInfoModal } from "@/components/achievements/AchievementInfoModal";

export const LeaderboardHeader = () => {
  const [showRules, setShowRules] = useState(false);

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background p-8 mb-8 border border-border/50">
        <div className="absolute top-0 right-0 opacity-10">
          <Trophy className="h-48 w-48 text-primary" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Trophy className="h-8 w-8 text-primary" />
                <h1 className="text-4xl font-bold">Leaderboard</h1>
              </div>
              <p className="text-lg text-muted-foreground">Competition that drives revenue</p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowRules(true)}
              className="rounded-full"
            >
              <Info className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
      <AchievementInfoModal 
        open={showRules} 
        onOpenChange={setShowRules} 
        isAdmin={true}
        context="leaderboard"
      />
    </>
  );
};
