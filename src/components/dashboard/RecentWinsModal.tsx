import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trophy, Building2, PoundSterling, Calendar, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getUniqueRecentWins, sumConvertedDealValue } from "@/lib/convertedDeals";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

interface RecentWin {
  id: string;
  company_name: string;
  contract_value: number;
  closed_date: string;
  client_name: string;
  source: "discovery" | "followup";
}

interface RecentWinsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecentWinsModal({ open, onOpenChange }: RecentWinsModalProps) {
  const [wins, setWins] = useState<RecentWin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalValue, setTotalValue] = useState(0);

  useEffect(() => {
    if (open) {
      loadRecentWins();
    }
  }, [open]);

  const loadRecentWins = async () => {
    setIsLoading(true);

    const [discoveryWinsResult, pitchWinsResult] = await Promise.all([
      supabase
        .from("sales_discovery_logs")
        .select("id, client_name, contract_value, updated_at")
        .eq("converted_to_client", true)
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase
        .from("pitch_calls")
        .select("id, discovery_log_id, client_name, company_name, contract_value, updated_at")
        .eq("converted_to_client", true)
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);

    const uniqueWins = getUniqueRecentWins(
      pitchWinsResult.data || [],
      discoveryWinsResult.data || [],
    ).slice(0, 15);

    const allWins: RecentWin[] = uniqueWins.map((win) => ({
      id: `${win.source}:${win.id}`,
      company_name: win.companyName,
      contract_value: win.contractValue,
      closed_date: win.closedDate || "",
      client_name: win.clientName,
      source: win.source === "discovery_log" ? "discovery" : "followup",
    }));

    setWins(allWins);
    setTotalValue(sumConvertedDealValue(uniqueWins));
    setIsLoading(false);
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `£${(value / 1000).toFixed(1)}k`;
    }
    return `£${value.toLocaleString()}`;
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "MMM d, yyyy");
    } catch {
      return "Recent";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Recent Wins
            {wins.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {wins.length} deals
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : wins.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium">No closed deals yet</p>
            <p className="text-sm mt-1">Your wins will appear here when you close deals</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-amber-500/5 border border-amber-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Closed Value</p>
                  <p className="text-2xl font-bold text-amber-500">{formatCurrency(totalValue)}</p>
                </div>
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/20">
                  <Trophy className="h-6 w-6 text-amber-500" />
                </div>
              </div>
            </div>

            {/* Wins List */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">All Closed Deals</p>
              {wins.map((win, index) => (
                <div
                  key={win.id}
                  className="flex items-center gap-4 p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/20"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/20 text-amber-500 font-bold text-sm shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <p className="font-medium truncate">{win.company_name}</p>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {win.source === "discovery" ? "Discovery" : "Follow-up"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <PoundSterling className="h-3 w-3" />
                        {formatCurrency(win.contract_value)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(win.closed_date)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
