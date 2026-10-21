import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Plus, X, Check, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ActionItem {
  id?: string;
  description: string;
  due_date?: string | null;
  status: string;
  completed_at?: string | null;
}

interface CoachingActionItemsProps {
  items: ActionItem[];
  onChange?: (items: ActionItem[]) => void;
  sessionId?: string;
  setterProfileId?: string;
  managerId?: string;
  mode: 'edit' | 'view' | 'setter';
}

const CoachingActionItems = ({
  items,
  onChange,
  sessionId,
  setterProfileId,
  managerId,
  mode,
}: CoachingActionItemsProps) => {
  const queryClient = useQueryClient();

  const toggleCompleteMutation = useMutation({
    mutationFn: async (item: ActionItem) => {
      if (!item.id) return;
      const newStatus = item.status === 'completed' ? 'open' : 'completed';
      const { error } = await supabase
        .from('coaching_action_items')
        .update({
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaching-action-items'] });
      queryClient.invalidateQueries({ queryKey: ['sdr-manager-coaching-sessions'] });
      toast.success('Action item updated');
    },
    onError: () => toast.error('Failed to update action item'),
  });

  const addItem = () => {
    onChange?.([...items, { description: '', due_date: null, status: 'open' }]);
  };

  const removeItem = (index: number) => {
    onChange?.(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ActionItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    onChange?.(updated);
  };

  const statusColor: Record<string, string> = {
    open: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    carried_forward: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  if (mode === 'edit') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Action Items</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
        {items.map((item, index) => (
          <div key={index} className="flex gap-2 items-start">
            <div className="flex-1 space-y-2">
              <Input
                placeholder={`Action item ${index + 1}`}
                value={item.description}
                onChange={(e) => updateItem(index, 'description', e.target.value)}
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "text-xs h-7",
                      !item.due_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {item.due_date ? format(new Date(item.due_date), 'MMM d') : 'Due date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={item.due_date ? new Date(item.due_date) : undefined}
                    onSelect={(date) => updateItem(index, 'due_date', date ? format(date, 'yyyy-MM-dd') : null)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button type="button" variant="ghost" size="icon" className="mt-1" onClick={() => removeItem(index)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">No action items yet</p>
        )}
      </div>
    );
  }

  // View or setter mode
  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold">Action Items</Label>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={item.id || index}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                item.status === 'completed'
                  ? 'bg-green-500/5 border-green-500/20'
                  : 'bg-card/50 border-border/50'
              )}
            >
              {mode === 'setter' && item.id && (
                <button
                  onClick={() => toggleCompleteMutation.mutate(item)}
                  className={cn(
                    "mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                    item.status === 'completed'
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-muted-foreground/40 hover:border-primary'
                  )}
                >
                  {item.status === 'completed' && <Check className="h-3 w-3" />}
                </button>
              )}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm",
                  item.status === 'completed' && 'line-through text-muted-foreground'
                )}>
                  {item.description}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {item.due_date && (
                    <span className="text-xs text-muted-foreground">
                      Due: {format(new Date(item.due_date), 'MMM d')}
                    </span>
                  )}
                  <Badge variant="outline" className={cn("text-[10px] h-5", statusColor[item.status])}>
                    {item.status === 'carried_forward' ? (
                      <><ArrowRight className="h-2.5 w-2.5 mr-0.5" /> Carried</>
                    ) : item.status}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">No action items</p>
      )}
    </div>
  );
};

export default CoachingActionItems;
