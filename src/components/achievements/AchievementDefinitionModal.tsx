import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface AchievementDefinitionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  achievement?: any;
}

const iconOptions = [
  { value: 'flame', label: '🔥 Flame' },
  { value: 'trophy', label: '🏆 Trophy' },
  { value: 'target', label: '🎯 Target' },
  { value: 'trending-up', label: '📈 Trending Up' },
  { value: 'check-circle', label: '✅ Check Circle' },
  { value: 'award', label: '🏅 Award' },
  { value: 'phone', label: '📞 Phone' },
  { value: 'phone-call', label: '📲 Phone Call' },
  { value: 'zap', label: '⚡ Zap' },
  { value: 'users', label: '👥 Users' },
  { value: 'handshake', label: '🤝 Handshake' },
  { value: 'bar-chart-2', label: '📊 Bar Chart' },
  { value: 'dollar-sign', label: '💲 Dollar Sign' },
  { value: 'heart', label: '❤️ Heart' },
  { value: 'user-plus', label: '➕ User Plus' },
  { value: 'shield', label: '🛡️ Shield' },
  { value: 'activity', label: '📈 Activity' },
  { value: 'star', label: '⭐ Star' },
];

const colorOptions = [
  { value: 'orange', label: 'Orange' },
  { value: 'amber', label: 'Amber' },
  { value: 'gold', label: 'Gold' },
  { value: 'slate', label: 'Slate' },
  { value: 'teal', label: 'Teal' },
  { value: 'emerald', label: 'Emerald' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'sky', label: 'Sky' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'purple', label: 'Purple' },
  { value: 'rose', label: 'Rose' },
];

export const AchievementDefinitionModal = ({ 
  open, 
  onOpenChange,
  achievement 
}: AchievementDefinitionModalProps) => {
  const queryClient = useQueryClient();
  const isEditing = !!achievement;

  const [formData, setFormData] = useState({
    key: '',
    name: '',
    description: '',
    icon: 'trophy',
    color: 'teal',
    category: 'quantity',
    tier: '',
    target_role: 'setter',
    target_department: '',
    is_permanent: false,
    reset_period: 'monthly',
    criteria: '{}',
    is_active: true,
    sort_order: 0,
  });

  useEffect(() => {
    if (achievement) {
      setFormData({
        key: achievement.key || '',
        name: achievement.name || '',
        description: achievement.description || '',
        icon: achievement.icon || 'trophy',
        color: achievement.color || 'teal',
        category: achievement.category || 'quantity',
        tier: achievement.tier || '',
        target_role: achievement.target_role || 'setter',
        target_department: achievement.target_department || '',
        is_permanent: achievement.is_permanent || false,
        reset_period: achievement.reset_period || 'monthly',
        criteria: JSON.stringify(achievement.criteria || {}, null, 2),
        is_active: achievement.is_active ?? true,
        sort_order: achievement.sort_order || 0,
      });
    } else {
      setFormData({
        key: '',
        name: '',
        description: '',
        icon: 'trophy',
        color: 'teal',
        category: 'quantity',
        tier: '',
        target_role: 'setter',
        target_department: '',
        is_permanent: false,
        reset_period: 'monthly',
        criteria: '{}',
        is_active: true,
        sort_order: 0,
      });
    }
  }, [achievement, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let parsedCriteria;
      try {
        parsedCriteria = JSON.parse(formData.criteria);
      } catch {
        throw new Error('Invalid JSON in criteria field');
      }

      const payload = {
        key: formData.key,
        name: formData.name,
        description: formData.description,
        icon: formData.icon,
        color: formData.color,
        category: formData.category,
        tier: formData.tier || null,
        target_role: formData.target_role,
        target_department: formData.target_department || null,
        is_permanent: formData.is_permanent,
        reset_period: formData.is_permanent ? null : formData.reset_period,
        criteria: parsedCriteria,
        is_active: formData.is_active,
        sort_order: formData.sort_order,
      };

      if (isEditing) {
        const { error } = await supabase
          .from('achievement_definitions')
          .update(payload)
          .eq('id', achievement.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('achievement_definitions')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-achievement-definitions'] });
      toast.success(isEditing ? 'Achievement updated' : 'Achievement created');
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save achievement');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.key || !formData.name || !formData.description) {
      toast.error('Please fill in all required fields');
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Achievement' : 'Create Achievement'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="key">Key (unique identifier) *</Label>
              <Input
                id="key"
                value={formData.key}
                onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                placeholder="e.g., setter_streak_gold"
                disabled={isEditing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Streak Master"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g., Book meetings 5 days in a row"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Icon</Label>
              <Select value={formData.icon} onValueChange={(v) => setFormData({ ...formData, icon: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {iconOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Select value={formData.color} onValueChange={(v) => setFormData({ ...formData, color: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colorOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tier</Label>
              <Select value={formData.tier || "none"} onValueChange={(v) => setFormData({ ...formData, tier: v === "none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="bronze">Bronze</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="platinum">Platinum</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="streak">Streak</SelectItem>
                  <SelectItem value="quantity">Quantity</SelectItem>
                  <SelectItem value="quality">Quality</SelectItem>
                  <SelectItem value="improvement">Improvement</SelectItem>
                  <SelectItem value="milestone">Milestone</SelectItem>
                  <SelectItem value="recognition">Recognition</SelectItem>
                  <SelectItem value="career">Career</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target Role</Label>
              <Select value={formData.target_role} onValueChange={(v) => setFormData({ ...formData, target_role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="setter">Setters</SelectItem>
                  <SelectItem value="account_executive">Account Executives</SelectItem>
                  <SelectItem value="csm">CSMs</SelectItem>
                  <SelectItem value="ops">Operations</SelectItem>
                  <SelectItem value="all">All Roles</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Department (Setters only)</Label>
              <Select value={formData.target_department || "all"} onValueChange={(v) => setFormData({ ...formData, target_department: v === "all" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="fulfilment">Fulfilment</SelectItem>
                  <SelectItem value="acquisition">Acquisition</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Reset Period</Label>
              <Select 
                value={formData.reset_period} 
                onValueChange={(v) => setFormData({ ...formData, reset_period: v })}
                disabled={formData.is_permanent}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="is_permanent"
                checked={formData.is_permanent}
                onCheckedChange={(v) => setFormData({ ...formData, is_permanent: v })}
              />
              <Label htmlFor="is_permanent">Permanent (Career Achievement)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="criteria">Criteria (JSON)</Label>
            <Textarea
              id="criteria"
              value={formData.criteria}
              onChange={(e) => setFormData({ ...formData, criteria: e.target.value })}
              placeholder='{"type": "streak", "metric": "meetings_booked", "threshold": 5}'
              rows={4}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Define the criteria for unlocking this achievement. See documentation for schema.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : (isEditing ? 'Update' : 'Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
