import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GamificationRulesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const GamificationRulesModal = ({ open, onOpenChange }: GamificationRulesModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl">🎮 Gamification Rules</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6">
            <div>
              <h3 className="font-bold text-lg mb-2">🏆 Rankings & Champions</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Rankings are calculated based on meetings booked, then calls made, then conversations</li>
                <li>Monthly champions are crowned for Acquisition, Fulfillment, and Company-Wide</li>
                <li>Weekly champions are highlighted separately</li>
                <li>Admins can manually override automatic winners</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">⚔️ Beat Your Rival</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Choose a rival setter each week to compete against</li>
                <li>Track head-to-head stats: meetings, calls, and warm leads</li>
                <li>Only you can see your rivalry stats</li>
                <li>Admins can view all active rivalries</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">🔥 Bonus Challenges</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Special challenges with cash rewards in USD</li>
                <li>Can be daily, weekly, or monthly</li>
                <li>Progress bars show how close you are to winning</li>
                <li>Created and managed by admins</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">🔥 Performance Streaks</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Consecutive days with meetings booked</li>
                <li>Consecutive days in the top 3</li>
                <li>Streaks reset when you miss a day</li>
                <li>Longer streaks earn special recognition</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">🎖️ Achievement Badges</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li><strong>Power Booker:</strong> 5+ meetings in a week</li>
                <li><strong>Elite Closer:</strong> 10+ meetings in a week</li>
                <li><strong>Machine Mode:</strong> 100+ calls in a single day</li>
                <li><strong>Lead Magnet:</strong> 20+ warm leads</li>
                <li><strong>Rising Star:</strong> Most improved week-over-week</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">👑 Champion Crown</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>The #1 ranked setter company-wide gets a gold crown</li>
                <li>Crown appears on their avatar and in the leaderboard</li>
                <li>Crown updates daily based on current rankings</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">🔵 Consistency Meter</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Measures how regularly you log KPIs</li>
                <li>Based on % of days with logged activity</li>
                <li>Green: 80%+, Yellow: 60-79%, Red: Below 60%</li>
                <li>Higher consistency = more reliable performance</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">📈 Performance Insights</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Automatically identifies top performers in key categories</li>
                <li>Most Consistent Performer: Overall #1 ranked setter</li>
                <li>Highest Conversion: Best call-to-meeting ratio</li>
                <li>Warm Lead Specialist: Most warm leads generated</li>
                <li>Top Rising Performer: Best week-over-week improvement</li>
              </ul>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
