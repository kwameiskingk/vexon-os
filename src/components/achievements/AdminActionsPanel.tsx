import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Settings, Award, Gift, Trash2, Swords, Sparkles, ChevronDown, ChevronUp, Trophy, Star } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ManageRivalriesModal } from "@/components/admin/ManageRivalriesModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AdminActionsPanelProps {
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

export const AdminActionsPanel = ({ 
  setters = [], 
  allUsers = [], 
  achievements = [],
  recognitionAwards = [],
  onCreateBonus, 
  onAssignAward, 
  onAssignBadge, 
  onRemoveBadge, 
  onAssignRecognition,
  onRemoveRecognition
}: AdminActionsPanelProps) => {
  const [isOpen, setIsOpen] = usePersistedState('admin-actions-panel-open', true);
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
    meetingGoal: "",
    startDate: new Date(),
    endDate: new Date(),
  });

  // Fetch dynamic achievement definitions for badge assignment
  const { data: achievementDefinitions = [] } = useQuery({
    queryKey: ['achievement-definitions-for-assignment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('achievement_definitions')
        .select('*')
        .eq('is_active', true)
        .order('target_role')
        .order('name');
      
      if (error) throw error;
      return data;
    },
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
      meetingGoal: "",
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
        toast.success(`Badge detection complete! ${data.new_proposals} new proposals created.`);
      }
    } catch (error) {
      console.error('Error detecting badges:', error);
      toast.error('Error detecting badges. Please try again.');
    } finally {
      setIsDetectingBadges(false);
    }
  };

  // Group achievement definitions by role for better UX
  const groupedDefinitions = achievementDefinitions.reduce((acc: Record<string, any[]>, def) => {
    const role = def.target_role || 'all';
    if (!acc[role]) acc[role] = [];
    acc[role].push(def);
    return acc;
  }, {});

  const roleLabels: Record<string, string> = {
    setter: 'Setters',
    account_executive: 'Account Executives',
    csm: 'CSMs',
    ops: 'Operations',
    all: 'All Roles',
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border border-primary/20 bg-card/50 backdrop-blur-sm">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/30 transition-colors rounded-t-lg">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Settings className="h-4 w-4 text-primary" />
                </div>
                Admin Actions
                <Badge variant="secondary" className="ml-2 text-xs">
                  6 tools
                </Badge>
              </CardTitle>
              {isOpen ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-0">
            {/* Detect Badges */}
            <Button 
              variant="outline"
              onClick={handleDetectBadges}
              disabled={isDetectingBadges}
              className="justify-start gap-2"
            >
              <Sparkles className="h-4 w-4 text-amber-500" />
              {isDetectingBadges ? 'Detecting...' : 'Detect Badges'}
            </Button>

            {/* Manage Rivalries */}
            <Button 
              variant="outline"
              onClick={() => setShowRivalriesModal(true)}
              className="justify-start gap-2"
            >
              <Swords className="h-4 w-4 text-red-500" />
              Manage Rivalries
            </Button>
            
            {/* Create Bonus Challenge */}
            <Dialog open={showBonusDialog} onOpenChange={setShowBonusDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="justify-start gap-2">
                  <Gift className="h-4 w-4 text-green-500" />
                  Create Bonus
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Gift className="h-5 w-5 text-primary" />
                    Create Bonus Challenge
                  </DialogTitle>
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
                  <div>
                    <Label>Meeting Goal (optional)</Label>
                    <Input 
                      type="number"
                      value={bonusData.meetingGoal}
                      onChange={(e) => setBonusData({ ...bonusData, meetingGoal: e.target.value })}
                      placeholder="e.g., 10 meetings to win"
                    />
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

            {/* Assign Manual Winner */}
            <Dialog open={showAwardDialog} onOpenChange={setShowAwardDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="justify-start gap-2">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  Manual Winner
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-primary" />
                    Assign Manual Winner
                  </DialogTitle>
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
                            {setter.name || setter.full_name || setter.email}
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

            {/* Assign Achievement Badge */}
            <Dialog open={showBadgeDialog} onOpenChange={setShowBadgeDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="justify-start gap-2">
                  <Award className="h-4 w-4 text-purple-500" />
                  Assign Badge
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary" />
                    Assign Achievement Badge
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Badge Type</Label>
                    <Select value={selectedBadge} onValueChange={setSelectedBadge}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select badge" />
                      </SelectTrigger>
                      <SelectContent className="max-h-80">
                        {Object.entries(groupedDefinitions).map(([role, defs]) => (
                          <div key={role}>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
                              {roleLabels[role] || role}
                            </div>
                            {defs.map((def: any) => (
                              <SelectItem key={def.key} value={def.key}>
                                <span className="flex items-center gap-2">
                                  <span>{def.icon}</span>
                                  <span>{def.name}</span>
                                  {def.tier && (
                                    <Badge variant="outline" className="text-xs ml-1">
                                      {def.tier}
                                    </Badge>
                                  )}
                                </span>
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Recipient</Label>
                    <Select value={selectedBadgeSetter} onValueChange={setSelectedBadgeSetter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select user" />
                      </SelectTrigger>
                      <SelectContent>
                        {allUsers.map((user: any) => (
                          <SelectItem key={user.email} value={user.email}>
                            {user.name || user.full_name || user.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAssignBadge} className="w-full" disabled={!selectedBadge || !selectedBadgeSetter}>
                    Assign Badge
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Remove Achievement Badge */}
            <Dialog open={showRemoveBadgeDialog} onOpenChange={setShowRemoveBadgeDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="justify-start gap-2">
                  <Trash2 className="h-4 w-4 text-destructive" />
                  Remove Badge
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Trash2 className="h-5 w-5 text-destructive" />
                    Remove Achievement Badge
                  </DialogTitle>
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
                  <Button onClick={handleRemoveBadge} className="w-full" variant="destructive" disabled={!selectedAchievementId}>
                    Remove Badge
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Assign Recognition Award */}
            <Dialog open={showRecognitionDialog} onOpenChange={setShowRecognitionDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="justify-start gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  Recognition Award
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-primary" />
                    Assign Recognition Award
                  </DialogTitle>
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
                  <Button onClick={handleAssignRecognition} className="w-full" disabled={!recognitionData.recipientEmail || !recognitionData.awardTitle || !recognitionData.badgeType}>
                    Assign Recognition
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Remove Recognition Award */}
            <Dialog open={showRemoveRecognitionDialog} onOpenChange={setShowRemoveRecognitionDialog}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline"
                  disabled={recognitionAwards.length === 0}
                  className="justify-start gap-2"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                  Remove Recognition
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Trash2 className="h-5 w-5 text-destructive" />
                    Remove Recognition Award
                  </DialogTitle>
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
                  <Button onClick={handleRemoveRecognition} className="w-full" variant="destructive" disabled={!selectedRecognitionId}>
                    Remove Recognition
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </CollapsibleContent>
        
        <ManageRivalriesModal 
          open={showRivalriesModal}
          onOpenChange={setShowRivalriesModal}
        />
      </Card>
    </Collapsible>
  );
};
