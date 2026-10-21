import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface AchievementInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin?: boolean;
  context?: 'achievements' | 'leaderboard';
}

export const AchievementInfoModal = ({ 
  open, 
  onOpenChange, 
  isAdmin = false,
  context = 'achievements' 
}: AchievementInfoModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            🎖️ {context === 'achievements' ? 'Achievement System Guide' : 'Leaderboard Guide'}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Achievement Progress Section */}
            <div>
              <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                📊 How Progress Works
              </h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Progress bars show your current completion percentage</li>
                <li>Each achievement has a target value to reach (e.g., 10 meetings, 100 calls)</li>
                <li>Progress resets automatically at the start of each month</li>
                <li>Once earned, badges remain visible but progress resets for the next month</li>
              </ul>
            </div>

            {/* Achievement Types */}
            <div>
              <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                🏆 Achievement Types
              </h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li><strong>Streak Achievements:</strong> Consecutive days meeting a goal (e.g., booking meetings daily)</li>
                <li><strong>Quantity Achievements:</strong> Cumulative totals (e.g., 50 meetings in a month)</li>
                <li><strong>Rate Achievements:</strong> Performance ratios (e.g., 80% show rate)</li>
                <li><strong>Improvement Achievements:</strong> Week-over-week growth</li>
              </ul>
            </div>

            {/* Tiers */}
            <div>
              <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                🥇 Achievement Tiers
              </h3>
              <div className="flex gap-2 mb-2">
                <Badge className="bg-amber-700 text-white">Bronze</Badge>
                <Badge className="bg-slate-400 text-white">Silver</Badge>
                <Badge className="bg-yellow-500 text-black">Gold</Badge>
                <Badge className="bg-purple-600 text-white">Platinum</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Higher tiers require greater targets and represent elite performance levels.
              </p>
            </div>

            {/* Role-Specific */}
            <div>
              <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                👤 Role-Specific Badges
              </h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li><strong>Setters:</strong> Tracked by dials, meetings booked, talk time, and show rate</li>
                <li><strong>Account Executives:</strong> Tracked by closes, conversion rate, and pipeline value</li>
                <li><strong>CSMs:</strong> Tracked by client health, retention, and onboarding success</li>
              </ul>
            </div>

            {context === 'leaderboard' && (
              <>
                {/* Rankings & Champions */}
                <div>
                  <h3 className="font-bold text-lg mb-2">🏆 Rankings & Champions</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li><strong>Primary:</strong> Meetings booked (highest first)</li>
                    <li><strong>Secondary:</strong> Conversations / warm leads</li>
                    <li><strong>Tertiary:</strong> Dials / calls made</li>
                    <li><strong>Tiebreaker:</strong> Achievement score — earned badges weighted by tier (Bronze 0.5, Silver 1, Gold 1.5, Platinum 2 points)</li>
                    <li>Monthly champions are crowned for Acquisition, Fulfillment, and Company-Wide</li>
                    <li>Weekly champions are highlighted separately</li>
                  </ul>
                </div>

                {/* Achievement Integration */}
                <div>
                  <h3 className="font-bold text-lg mb-2">🏅 Achievements & Leaderboard</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>Earned achievement badges contribute to your leaderboard standing as a tiebreaker</li>
                    <li>Each badge adds points based on its tier: Bronze (0.5), Silver (1.0), Gold (1.5), Platinum (2.0)</li>
                    <li>Achievement scores reset monthly alongside achievement progress</li>
                    <li>The "Achievement Hunter" insight highlights the setter with the most badges this month</li>
                  </ul>
                </div>

                {/* Beat Your Rival */}
                <div>
                  <h3 className="font-bold text-lg mb-2">⚔️ Beat Your Rival</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>Choose a rival setter each week to compete against</li>
                    <li>Track head-to-head stats: meetings, calls, and warm leads</li>
                    <li>Only you can see your rivalry stats</li>
                  </ul>
                </div>

                {/* Bonus Challenges */}
                <div>
                  <h3 className="font-bold text-lg mb-2">🔥 Bonus Challenges</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>Special challenges with cash rewards in USD</li>
                    <li>Can be daily, weekly, or monthly</li>
                    <li>Progress bars show how close you are to winning</li>
                  </ul>
                </div>
              </>
            )}

            {/* Admin Section */}
            {isAdmin && (
              <div className="border-t pt-4 mt-4">
                <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                  ⚙️ Admin Management
                </h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li><strong>Achievement Definitions:</strong> Go to <span className="font-medium text-primary">Operations → Achievements</span> to create, edit, and manage achievement definitions</li>
                  <li><strong>Setter Targets:</strong> Go to <span className="font-medium text-primary">Operations → Setter Management</span> to set custom daily targets (dials, meetings, talk time) for each setter</li>
                  <li><strong>Progress Calculation:</strong> Achievements are calculated based on the targets set in setter profiles. Ensure targets are configured for the achievement system to work correctly.</li>
                  <li><strong>Monthly Reset:</strong> All non-permanent achievement progress resets on the 1st of each month at midnight UTC</li>
                </ul>
              </div>
            )}

            {/* Tips */}
            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-bold text-sm mb-2">💡 Pro Tips</h3>
              <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                <li>Focus on consistency - streak achievements reward daily effort</li>
                <li>Quality over quantity - show rate achievements reward reliable bookings</li>
                <li>Check your progress regularly to stay motivated</li>
              </ul>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
