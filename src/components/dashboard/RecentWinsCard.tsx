import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Building2, PoundSterling, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getUniqueRecentWins } from "@/lib/convertedDeals";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { RecentWinsModal } from "./RecentWinsModal";
import { useAuth } from "@/contexts/AuthContext";

interface RecentWin {
  id: string;
  company_name: string;
  contract_value: number;
  closed_date: string;
  client_name: string;
}

export function RecentWinsCard() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const isAE = userRole === 'account_executive';
  
  const [wins, setWins] = useState<RecentWin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadRecentWins();
  }, []);

  const loadRecentWins = async () => {
    setIsLoading(true);

    const [discoveryWinsResult, pitchWinsResult] = await Promise.all([
      supabase
        .from("sales_discovery_logs")
        .select("id, client_name, contract_value, updated_at")
        .eq("converted_to_client", true)
        .order("updated_at", { ascending: false })
        .limit(10),
      supabase
        .from("pitch_calls")
        .select("id, discovery_log_id, client_name, company_name, contract_value, updated_at")
        .eq("converted_to_client", true)
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);

    const allWins: RecentWin[] = getUniqueRecentWins(
      pitchWinsResult.data || [],
      discoveryWinsResult.data || [],
    )
      .slice(0, 3)
      .map((win) => ({
        id: `${win.source}:${win.id}`,
        company_name: win.companyName,
        contract_value: win.contractValue,
        closed_date: win.closedDate || "",
        client_name: win.clientName,
      }));

    setWins(allWins);
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
      return format(new Date(dateStr), "MMM d");
    } catch {
      return "Recent";
    }
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-base font-semibold">Recent Wins</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const handleCardClick = () => {
    if (isAE) {
      navigate('/ae/leaderboard');
    } else {
      setIsModalOpen(true);
    }
  };

  return (
    <>
    <Card className="h-full cursor-pointer hover:shadow-md hover:border-primary/30 transition-all duration-200" onClick={handleCardClick}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-amber-500/10">
            <Trophy className="h-4.5 w-4.5 text-amber-500" />
          </div>
          <CardTitle className="text-base font-semibold">Recent Wins</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {wins.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Trophy className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No closed deals yet</p>
            <p className="text-xs mt-1">Your wins will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {wins.map((win, index) => (
              <div
                key={win.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/20"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-500 font-bold text-sm">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                    <p className="font-medium text-sm truncate">{win.company_name}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
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
        )}
      </CardContent>
    </Card>
    <RecentWinsModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </>
  );
}
