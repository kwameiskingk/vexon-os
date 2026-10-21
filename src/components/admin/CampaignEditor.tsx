import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Calendar } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  meetings_booked: number;
  meetings_sat: number;
  start_date: string | null;
  end_date: string | null;
  progress_manual_pct: number;
}

interface CampaignEditorProps {
  campaign: Campaign;
  onUpdate: () => void;
}

export const CampaignEditor = ({ campaign, onUpdate }: CampaignEditorProps) => {
  const [editedCampaign, setEditedCampaign] = useState(campaign);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("campaigns")
        .update({
          meetings_booked: editedCampaign.meetings_booked,
          meetings_sat: editedCampaign.meetings_sat,
          start_date: editedCampaign.start_date,
          launch_date: editedCampaign.start_date, // Sync launch_date with start_date for health tracking
          end_date: editedCampaign.end_date,
          progress_manual_pct: editedCampaign.progress_manual_pct,
        })
        .eq("id", campaign.id);

      if (error) throw error;
      toast.success("Campaign updated successfully");
      onUpdate();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {campaign.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="meetings_booked">Meetings Booked</Label>
            <Input
              id="meetings_booked"
              type="number"
              min="0"
              value={editedCampaign.meetings_booked}
              onChange={(e) =>
                setEditedCampaign({
                  ...editedCampaign,
                  meetings_booked: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="meetings_sat">Meetings Sat</Label>
            <Input
              id="meetings_sat"
              type="number"
              min="0"
              value={editedCampaign.meetings_sat}
              onChange={(e) =>
                setEditedCampaign({
                  ...editedCampaign,
                  meetings_sat: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="start_date">Start Date</Label>
            <Input
              id="start_date"
              type="date"
              value={editedCampaign.start_date || ""}
              className="[color-scheme:dark]"
              onChange={(e) =>
                setEditedCampaign({
                  ...editedCampaign,
                  start_date: e.target.value,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="end_date">End Date</Label>
            <Input
              id="end_date"
              type="date"
              value={editedCampaign.end_date || ""}
              className="[color-scheme:dark]"
              onChange={(e) =>
                setEditedCampaign({
                  ...editedCampaign,
                  end_date: e.target.value,
                })
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label>Progress: {editedCampaign.progress_manual_pct}%</Label>
          </div>
          <Slider
            value={[editedCampaign.progress_manual_pct]}
            min={0}
            max={100}
            step={1}
            onValueChange={(value) =>
              setEditedCampaign({
                ...editedCampaign,
                progress_manual_pct: value[0],
              })
            }
            className="w-full"
          />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
};
