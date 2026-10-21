import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gift, Calendar, DollarSign, Clock, CreditCard, Sun } from "lucide-react";
import { differenceInDays } from "date-fns";
import { BonusChallengeDetailModal } from "./BonusChallengeDetailModal";

interface BonusChallengesProps {
  bonuses: any[];
  isAdmin?: boolean;
}

export const BonusChallenges = ({ bonuses, isAdmin = false }: BonusChallengesProps) => {
  const [selectedBonus, setSelectedBonus] = useState<any>(null);

  if (!bonuses || bonuses.length === 0) return null;

  const getRewardIcon = (rewardType: string) => {
    switch (rewardType) {
      case 'cash': return <DollarSign className="h-4 w-4" />;
      case 'early_day_off': return <Clock className="h-4 w-4" />;
      case 'gift_card': return <CreditCard className="h-4 w-4" />;
      case 'extra_pto': return <Sun className="h-4 w-4" />;
      default: return <Gift className="h-4 w-4" />;
    }
  };

  const getRewardLabel = (rewardType: string) => {
    switch (rewardType) {
      case 'cash': return 'Cash Bonus';
      case 'early_day_off': return 'Early Day Off';
      case 'gift_card': return 'Gift Card';
      case 'extra_pto': return 'Extra PTO';
      default: return 'Reward';
    }
  };

  return (
    <>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="h-6 w-6 text-primary" />
          Active Bonus Challenges
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bonuses.map((bonus) => {
            const daysRemaining = differenceInDays(new Date(bonus.end_date), new Date());
            const rewardType = bonus.reward_type || 'cash';
            
            return (
              <Card
                key={bonus.id}
                className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background hover:shadow-lg transition-all cursor-pointer hover:-translate-y-0.5"
                onClick={() => setSelectedBonus(bonus)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{bonus.title}</CardTitle>
                    <Badge variant="outline" className="bg-primary/10">
                      {bonus.type}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{bonus.description}</p>
                  
                  <div className="flex items-center justify-between pt-3 border-t">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-primary">
                        {getRewardIcon(rewardType)}
                        <div className="flex flex-col">
                          <span className="font-bold text-lg">
                            {rewardType === 'cash' 
                              ? `$${parseFloat(bonus.amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                              : bonus.amount
                            }
                          </span>
                          <span className="text-xs text-muted-foreground">{getRewardLabel(rewardType)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{daysRemaining} days left</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <BonusChallengeDetailModal
        open={!!selectedBonus}
        onOpenChange={(open) => !open && setSelectedBonus(null)}
        bonus={selectedBonus}
        isAdmin={isAdmin}
      />
    </>
  );
};
