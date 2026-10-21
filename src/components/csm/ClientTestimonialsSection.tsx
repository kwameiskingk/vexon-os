import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogTestimonialDialog } from "@/components/csm/LogTestimonialDialog";
import { Video, FileText, ExternalLink, Trash2, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface ClientTestimonialsSectionProps {
  clientId: string;
}

interface Testimonial {
  id: string;
  type: string;
  link: string | null;
  content: string | null;
  obtained_at: string;
}

export const ClientTestimonialsSection = ({ clientId }: ClientTestimonialsSectionProps) => {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  // Set when the latest completed catch-up flagged an agreed testimonial and
  // nothing has been logged since — the CSM's "promised, chase it" signal.
  const [promisedAt, setPromisedAt] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [clientId]);

  const loadData = async () => {
    try {
      const { data, error } = await supabase
        .from("testimonials")
        .select("id, type, link, content, obtained_at")
        .eq("client_profile_id", clientId)
        .order("obtained_at", { ascending: false });
      if (error) throw error;
      const rows = (data as Testimonial[]) || [];
      setTestimonials(rows);
      await checkPromised(rows);
    } catch (error: any) {
      toast.error("Failed to load testimonials");
    } finally {
      setLoading(false);
    }
  };

  // Degrades silently pre-migration (testimonial_agreed column missing):
  // the banner simply doesn't show, the list is unaffected.
  const checkPromised = async (rows: Testimonial[]) => {
    const { data, error } = await supabase
      .from("client_catchups")
      .select("completed_at")
      .eq("client_profile_id", clientId)
      .eq("status", "completed")
      .eq("testimonial_agreed", true)
      .order("completed_at", { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) {
      setPromisedAt(null);
      return;
    }
    const flaggedAt = (data[0] as any).completed_at as string | null;
    if (!flaggedAt) {
      setPromisedAt(null);
      return;
    }
    const flaggedDate = flaggedAt.slice(0, 10);
    const collectedSince = rows.some((t) => t.obtained_at >= flaggedDate);
    setPromisedAt(collectedSince ? null : flaggedDate);
  };

  const handleDelete = async (testimonialId: string) => {
    if (!confirm("Delete this testimonial? It will no longer count on the dashboard.")) return;
    try {
      const { error } = await supabase
        .from("testimonials")
        .delete()
        .eq("id", testimonialId);
      if (error) throw error;
      toast.success("Testimonial deleted");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete testimonial");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Testimonials</h2>
          <p className="text-sm text-muted-foreground">
            Collected testimonials for this client. Logging here is what counts on the
            dashboard — the catch-up checkbox is only an agreement flag.
          </p>
        </div>
        <LogTestimonialDialog clientId={clientId} onLogged={loadData} />
      </div>

      {promisedAt && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            Testimonial promised at the {format(new Date(promisedAt), "d MMM yyyy")} catch-up
            — not yet collected.
          </span>
        </div>
      )}

      {testimonials.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No testimonials logged for this client yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {testimonials.map((t) => (
            <Card key={t.id} className="border-border">
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      {t.type === "video" ? (
                        <Video className="h-3 w-3" />
                      ) : (
                        <FileText className="h-3 w-3" />
                      )}
                      {t.type === "video" ? "Video" : "Written"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Obtained {format(new Date(t.obtained_at), "d MMM yyyy")}
                    </span>
                  </div>
                  {t.type === "video" && t.link && (
                    <a
                      href={t.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline break-all"
                    >
                      {t.link}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  )}
                  {t.type === "written" && t.content && (
                    <p className="text-sm whitespace-pre-wrap">{t.content}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(t.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
