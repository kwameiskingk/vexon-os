import { useState } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CalendarIcon, Settings, Award, Gift, Trash2, Swords, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ManageRivalriesModal } from "@/components/admin/ManageRivalriesModal";
import { supabase } from "@/integrations/supabase/client";

interface AdminControlsProps {
  setters: any[];
  allUsers: any[];
  achievements: any[];
  recognitionAwards: any[];
  onCreateBonus: (data: any) => void;
  onAssignAward: (data: any) => void;
  onAssignBadge: (data: any) => void;
  onRemoveBadge: (data: any) => void;
  onAssignRecognition: (data: any) => void;
  onRemoveRecognition: (awardId: string) => void;
}

export const AdminControls = ({ 
  setters, 
  allUsers, 
  achievements,
  recognitionAwards,
  onCreateBonus, 
  onAssignAward, 
  onAssignBadge, 
  onRemoveBadge, 
  onAssignRecognition,
  onRemoveRecognition
}: AdminControlsProps) => {
  const [isOpen, setIsOpen] = usePersistedState('admin-controls-open', true);
  const [showBonusDialog, setShowBonusDialog] = useState(false);
  const [showAwardDialog, setShowAwardDialog] = useState(false);
  const [showBadgeDialog, setShowBadgeDialog] = useState(false);
  const [showRemoveBadgeDialog, setShowRemoveBadgeDialog] = useState(false);
  const [showRecognitionDialog, setShowRecognitionDialog] = useState(false);
  const [showRemoveRecognitionDialog, setShowRemoveRecognitionDialog] = useState(false);
  const [showRivalriesModal, setShowRivalriesModal] = useState(false);
  const [isDetectingBadges, setIsDetectingBadges] = useState(false);
  const [awardType, setAwardType] = useState("");
  const [selectedSetter, setSelectedSetter] = useState("");
  const [selectedBadge, setSelectedBadge] = useState("");
  const [selectedBadgeSetter, setSelectedBadgeSetter] = useState("");
  const [selectedAchievementId, setSelectedAchievementId] = useState("");
  const [selectedRecognitionId, setSelectedRecognitionId] = useState("");
  const [recognitionData, setRecognitionData] = useState({
    recipientEmail: "",
    recipientName: "",
    awardTitle: "",
    badgeType: "",
    notes: ""
  });
  
  const [bonusData, setBonusData] = useState({
    title: "",
    description: "",
    amount: "",
    type: "weekly",
    rewardType: "cash",
    startDate: new Date(),
    endDate: new Date(),
  });

  const handleCreateBonus = () => {
    onCreateBonus(bonusData);
    setShowBonusDialog(false);
    setBonusData({
      title: "",
      description: "",
      amount: "",
      type: "weekly",
      rewardType: "cash",
      startDate: new Date(),
      endDate: new Date(),
    });
  };

  const handleAssignAward = () => {
    if (!awardType || !selectedSetter) return;
    onAssignAward({ type: awardType, email: selectedSetter });
    setShowAwardDialog(false);
    setAwardType("");
    setSelectedSetter("");
  };

  const handleAssignBadge = () => {
    if (!selectedBadge || !selectedBadgeSetter) return;
    onAssignBadge({ achievement_key: selectedBadge, email: selectedBadgeSetter });
    setShowBadgeDialog(false);
    setSelectedBadge("");
    setSelectedBadgeSetter("");
  };

  const handleRemoveBadge = () => {
    if (!selectedAchievementId) return;
    onRemoveBadge({ achievementId: selectedAchievementId });
    setShowRemoveBadgeDialog(false);
    setSelectedAchievementId("");
  };

  const handleAssignRecognition = () => {
    if (!recognitionData.recipientEmail || !recognitionData.awardTitle || !recognitionData.badgeType) return;
    onAssignRecognition(recognitionData);
    setShowRecognitionDialog(false);
    setRecognitionData({
      recipientEmail: "",
      recipientName: "",
      awardTitle: "",
      badgeType: "",
      notes: ""
    });
  };

  const handleRemoveRecognition = () => {
    if (!selectedRecognitionId) return;
    onRemoveRecognition(selectedRecognitionId);
    setShowRemoveRecognitionDialog(false);
    setSelectedRecognitionId("");
  };

  const handleDetectBadges = async () => {
    setIsDetectingBadges(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-detect-badges', {
        body: { time: new Date().toISOString() }
      });
      
      if (error) throw error;
      
      if (data?.success) {
        alert(`Badge detection complete! ${data.new_proposals} new proposals created.`);
        // Refresh the page to show new pending badges
        window.location.reload();
      }
    } catch (error) {
      console.error('Error detecting badges:', error);
      alert('Error detecting badges. Please try again.');
    } finally {
      setIsDetectingBadges(false);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-2 border-primary/20">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Admin Controls
              </CardTitle>
              {isOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3">
        <Button 
          className="w-full" 
          variant="outline"
          onClick={handleDetectBadges}
          disabled={isDetectingBadges}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {isDetectingBadges ? 'Detecting Badges...' : 'Detect Badges Now'}
        </Button>

        <Button 
          className="w-full" 
          variant="outline"
          onClick={() => setShowRivalriesModal(true)}
        >
          <Swords className="h-4 w-4 mr-2" />
          Manage Rivalries
        </Button>
        
        <Dialog open={showBonusDialog} onOpenChange={setShowBonusDialog}>
          <DialogTrigger asChild>
            <Button className="w-full" variant="outline">
              <Gift className="h-4 w-4 mr-2" />
              Create Bonus Challenge
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Bonus Challenge</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input 
                  value={bonusData.title}
                  onChange={(e) => setBonusData({ ...bonusData, title: e.target.value })}
                  placeholder="e.g., Weekend Warrior Bonus"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea 
                  value={bonusData.description}
                  onChange={(e) => setBonusData({ ...bonusData, description: e.target.value })}
                  placeholder="Describe the challenge..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount</Label>
                  <Input 
                    value={bonusData.amount}
                    onChange={(e) => setBonusData({ ...bonusData, amount: e.target.value })}
                    placeholder="$5"
                  />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={bonusData.type} onValueChange={(v) => setBonusData({ ...bonusData, type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reward Type</Label>
                  <Select value={bonusData.rewardType} onValueChange={(v) => setBonusData({ ...bonusData, rewardType: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash Bonus</SelectItem>
                      <SelectItem value="early_day_off">Early Day Off</SelectItem>
                      <SelectItem value="gift_card">Gift Card</SelectItem>
                      <SelectItem value="extra_pto">Extra PTO Day</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(bonusData.startDate, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={bonusData.startDate}
                        onSelect={(date) => date && setBonusData({ ...bonusData, startDate: date })}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>End Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(bonusData.endDate, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={bonusData.endDate}
                        onSelect={(date) => date && setBonusData({ ...bonusData, endDate: date })}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <Button onClick={handleCreateBonus} className="w-full">Create Bonus</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showAwardDialog} onOpenChange={setShowAwardDialog}>
          <DialogTrigger asChild>
            <Button className="w-full" variant="outline">
              <Award className="h-4 w-4 mr-2" />
              Assign Manual Winner
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Manual Winner</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Award Type</Label>
                <Select value={awardType} onValueChange={setAwardType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select award type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="setter_of_day">Setter of the Day</SelectItem>
                    <SelectItem value="setter_of_week">Setter of the Week</SelectItem>
                    <SelectItem value="setter_of_month_acq">Setter of the Month (Acquisition)</SelectItem>
                    <SelectItem value="setter_of_month_ful">Setter of the Month (Fulfillment)</SelectItem>
                    <SelectItem value="setter_of_month_all">Setter of the Month (Company-Wide)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Select Setter</Label>
                <Select value={selectedSetter} onValueChange={setSelectedSetter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select setter" />
                  </SelectTrigger>
                  <SelectContent>
                    {setters.map((setter) => (
                      <SelectItem key={setter.email} value={setter.email}>
                        {setter.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAssignAward} className="w-full" disabled={!awardType || !selectedSetter}>
                Assign Award
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showBadgeDialog} onOpenChange={setShowBadgeDialog}>
          <DialogTrigger asChild>
            <Button className="w-full" variant="outline">
              <Award className="h-4 w-4 mr-2" />
              Assign Achievement Badge
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Achievement Badge</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Badge Type</Label>
                <Select value={selectedBadge} onValueChange={setSelectedBadge}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select badge" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="power_booker">Power Booker</SelectItem>
                    <SelectItem value="elite_closer">Elite Closer</SelectItem>
                    <SelectItem value="machine_mode">Machine Mode</SelectItem>
                    <SelectItem value="lead_magnet">Lead Magnet</SelectItem>
                    <SelectItem value="rising_star">Rising Star</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Setter</Label>
                <Select value={selectedBadgeSetter} onValueChange={setSelectedBadgeSetter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select setter" />
                  </SelectTrigger>
                  <SelectContent>
                    {setters.map((setter: any) => (
                      <SelectItem key={setter.email} value={setter.email}>
                        {setter.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAssignBadge} className="w-full">
                Assign Badge
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showRemoveBadgeDialog} onOpenChange={setShowRemoveBadgeDialog}>
          <DialogTrigger asChild>
            <Button className="w-full" variant="outline">
              <Award className="h-4 w-4 mr-2" />
              Remove Achievement Badge
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Achievement Badge</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Select Achievement to Remove</Label>
                <Select value={selectedAchievementId} onValueChange={setSelectedAchievementId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select achievement" />
                  </SelectTrigger>
                  <SelectContent>
                    {achievements.map((achievement: any) => (
                      <SelectItem key={achievement.id} value={achievement.id}>
                        {achievement.email} - {achievement.achievement_key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleRemoveBadge} className="w-full" variant="destructive">
                Remove Badge
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showRecognitionDialog} onOpenChange={setShowRecognitionDialog}>
          <DialogTrigger asChild>
            <Button className="w-full" variant="outline">
              <Award className="h-4 w-4 mr-2" />
              Assign Recognition Award
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Assign Recognition Award</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Recipient</Label>
                <Select 
                  value={recognitionData.recipientEmail} 
                  onValueChange={(email) => {
                    const user = allUsers.find(u => u.email === email);
                    setRecognitionData({ 
                      ...recognitionData, 
                      recipientEmail: email,
                      recipientName: user?.name || user?.full_name || email
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select recipient" />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers.map((user: any) => (
                      <SelectItem key={user.email} value={user.email}>
                        {user.name || user.full_name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Award Title</Label>
                <Input 
                  value={recognitionData.awardTitle}
                  onChange={(e) => setRecognitionData({ ...recognitionData, awardTitle: e.target.value })}
                  placeholder="e.g., Employee of the Month, Hardest Working Employee"
                />
              </div>
              <div>
                <Label>Badge Type</Label>
                <Select 
                  value={recognitionData.badgeType} 
                  onValueChange={(v) => setRecognitionData({ ...recognitionData, badgeType: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select badge type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excellence">Badge of Excellence</SelectItem>
                    <SelectItem value="loyalty">Badge of Loyalty</SelectItem>
                    <SelectItem value="leadership">Badge of Leadership</SelectItem>
                    <SelectItem value="innovation">Badge of Innovation</SelectItem>
                    <SelectItem value="teamwork">Badge of Teamwork</SelectItem>
                    <SelectItem value="dedication">Badge of Dedication</SelectItem>
                    <SelectItem value="achievement">Badge of Achievement</SelectItem>
                    <SelectItem value="outstanding_performance">Outstanding Performance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes (Optional)</Label>
                <Textarea 
                  value={recognitionData.notes}
                  onChange={(e) => setRecognitionData({ ...recognitionData, notes: e.target.value })}
                  placeholder="Additional notes about the recognition..."
                />
              </div>
              <Button onClick={handleAssignRecognition} className="w-full">
                Assign Recognition
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showRemoveRecognitionDialog} onOpenChange={setShowRemoveRecognitionDialog}>
          <DialogTrigger asChild>
            <Button 
              className="w-full" 
              variant="destructive"
              disabled={recognitionAwards.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove Recognition Award
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Recognition Award</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Select Recognition to Remove</Label>
                <Select value={selectedRecognitionId} onValueChange={setSelectedRecognitionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select recognition award" />
                  </SelectTrigger>
                  <SelectContent>
                    {recognitionAwards.map((award: any) => (
                      <SelectItem key={award.id} value={award.id}>
                        {award.recipient_name} - {award.award_title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleRemoveRecognition} className="w-full" variant="destructive">
                Remove Recognition
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        
        <ManageRivalriesModal 
          open={showRivalriesModal}
          onOpenChange={setShowRivalriesModal}
        />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
