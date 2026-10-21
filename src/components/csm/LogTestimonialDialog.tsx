import { useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface LogTestimonialDialogProps {
  clientId: string;
  onLogged?: () => void;
}

// The ONLY writer to the testimonials table. A row here means a testimonial
// was actually collected — that is exactly what the CEO tiles count. The
// catch-up form's checkbox is a pure agreement flag and never inserts here.
export const LogTestimonialDialog = ({ clientId, onLogged }: LogTestimonialDialogProps) => {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"video" | "written">("video");
  const [link, setLink] = useState("");
  const [content, setContent] = useState("");
  const [obtainedAt, setObtainedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setType("video");
    setLink("");
    setContent("");
    setObtainedAt(format(new Date(), "yyyy-MM-dd"));
  };

  const handleSave = async () => {
    if (type === "video" && !link.trim()) {
      toast.error("Add a link to the video testimonial");
      return;
    }
    if (type === "written" && !content.trim()) {
      toast.error("Paste the written testimonial text");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("testimonials").insert({
        client_profile_id: clientId,
        type,
        link: type === "video" ? link.trim() : null,
        content: type === "written" ? content.trim() : null,
        obtained_at: obtainedAt,
        obtained_by: user?.id ?? null,
      });
      if (error) throw error;

      toast.success("Testimonial logged");
      setOpen(false);
      resetForm();
      onLogged?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to log testimonial");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Log Testimonial
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Testimonial</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Type</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as "video" | "written")}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="video" id="testimonial-type-video" />
                <Label htmlFor="testimonial-type-video" className="text-sm font-normal">Video</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="written" id="testimonial-type-written" />
                <Label htmlFor="testimonial-type-written" className="text-sm font-normal">Written</Label>
              </div>
            </RadioGroup>
          </div>

          {type === "video" ? (
            <div className="space-y-2">
              <Label htmlFor="testimonial-link">Link</Label>
              <Input
                id="testimonial-link"
                placeholder="Link to the video (Drive, Loom, ...)"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="testimonial-content">Testimonial</Label>
              <Textarea
                id="testimonial-content"
                placeholder="Paste the written testimonial..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="testimonial-obtained-at">Date obtained</Label>
            <Input
              id="testimonial-obtained-at"
              type="date"
              value={obtainedAt}
              onChange={(e) => setObtainedAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Backdate this if the testimonial arrived earlier — the dashboard counts it in
              the period it was obtained.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Log Testimonial
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
