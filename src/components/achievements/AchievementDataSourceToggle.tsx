import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Database, Cloud } from "lucide-react";

export const AchievementDataSourceToggle = () => {
  const queryClient = useQueryClient();
  const [isRecalculating, setIsRecalculating] = useState(false);

  const { data: dataSource, isLoading } = useQuery({
    queryKey: ["achievement-data-source"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("achievement_data_source")
        .limit(1)
        .single();
      if (error) throw error;
      return (data?.achievement_data_source as string) || "auto";
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (newSource: string) => {
      const { error } = await supabase
        .from("system_settings")
        .update({ achievement_data_source: newSource } as any)
        .not("id", "is", null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["achievement-data-source"] });
      toast.success("Data source updated");
    },
    onError: () => toast.error("Failed to update data source"),
  });

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("You must be logged in");
        return;
      }

      const { data, error } = await supabase.functions.invoke(
        "calculate-achievement-progress",
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (error) throw error;

      toast.success(
        `Recalculated: ${data.progress_updated} progress records, ${data.awards_inserted} new awards`
      );
      queryClient.invalidateQueries({ queryKey: ["admin-achievement-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["awarded-achievements"] });
      queryClient.invalidateQueries({ queryKey: ["user-achievement-progress"] });
    } catch (err: any) {
      console.error("Recalculate error:", err);
      toast.error(err.message || "Failed to recalculate");
    } finally {
      setIsRecalculating(false);
    }
  };

  const isAuto = dataSource === "auto";

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            {isAuto ? (
              <Cloud className="h-5 w-5 text-primary" />
            ) : (
              <Database className="h-5 w-5 text-primary" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">
                Achievement Data Source
              </p>
              <p className="text-xs text-muted-foreground">
                {isAuto
                  ? "Using Google Sheets / Close sync data"
                  : "Using in-app logged meetings"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${!isAuto ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              Manual
            </span>
            <Switch
              checked={isAuto}
              disabled={isLoading || toggleMutation.isPending}
              onCheckedChange={(checked) =>
                toggleMutation.mutate(checked ? "auto" : "manual")
              }
            />
            <span className={`text-xs ${isAuto ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              Auto
            </span>
          </div>
          <Badge variant={isAuto ? "default" : "secondary"} className="text-xs">
            {isAuto ? "Google Sheets" : "App-Logged"}
          </Badge>
        </div>

        <Button
          size="sm"
          onClick={handleRecalculate}
          disabled={isRecalculating}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRecalculating ? "animate-spin" : ""}`} />
          {isRecalculating ? "Recalculating..." : "Recalculate Now"}
        </Button>
      </CardContent>
    </Card>
  );
};
