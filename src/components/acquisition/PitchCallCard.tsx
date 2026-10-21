import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format, isToday } from "date-fns";
import { Calendar, Mail, Building, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PitchCall {
  id: string;
  client_name: string;
  client_email: string;
  company_name: string | null;
  pitch_call_date: string;
  pitch_call_time: string | null;
  original_outcome: string | null;
  original_interest: string | null;
  contract_value: number | null;
  contract_term: string | null;
  status: string | null;
  pitch_outcome: string | null;
  pitch_interest: string | null;
  converted_to_client: boolean | null;
  marked_not_proceeding: boolean | null;
}

interface PitchCallCardProps {
  pitchCall: PitchCall;
  onClick: (pitchCall: PitchCall) => void;
  onDelete?: (id: string) => void;
}

export function PitchCallCard({ pitchCall, onClick, onDelete }: PitchCallCardProps) {
  const isScheduledForToday = isToday(new Date(pitchCall.pitch_call_date));
  const isCompleted = pitchCall.status === 'completed';
  const isConverted = pitchCall.converted_to_client;
  const isNotProceeding = pitchCall.marked_not_proceeding;

  const getStatusBadge = () => {
    if (isConverted) {
      return <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">Converted</Badge>;
    }
    if (isNotProceeding) {
      return <Badge className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30">Not Proceeding</Badge>;
    }
    if (isCompleted) {
      return <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30">Completed</Badge>;
    }
    if (isScheduledForToday) {
      return <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">Today</Badge>;
    }
    return <Badge className="bg-primary/20 text-primary border-primary/30">Scheduled</Badge>;
  };

  const getInterestBadge = (interest: string | null) => {
    if (!interest) return null;
    switch (interest) {
      case 'interested':
        return <span className="text-green-400">Interested</span>;
      case 'unsure':
        return <span className="text-yellow-400">Unsure</span>;
      case 'not_interested':
        return <span className="text-red-400">Not Interested</span>;
      default:
        return <span>{interest}</span>;
    }
  };

  return (
    <Card
      className={cn(
        "bg-card border-border cursor-pointer transition-all hover:border-primary/50 hover:bg-muted/30",
        isScheduledForToday && !isCompleted && "border-yellow-500/50"
      )}
      onClick={() => onClick(pitchCall)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Building className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <h3 className="font-semibold truncate">{pitchCall.client_name}</h3>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{pitchCall.client_email}</span>
            </div>
          </div>
          <div className="flex items-start gap-2 flex-shrink-0 ml-2">
            <div className="flex flex-col items-end gap-1">
              {getStatusBadge()}
              <div className="text-sm text-muted-foreground text-right">
                <div>{format(new Date(pitchCall.pitch_call_date), 'MMM d, yyyy')}</div>
                {pitchCall.pitch_call_time && (
                  <div>{pitchCall.pitch_call_time.slice(0, 5)}</div>
                )}
              </div>
            </div>
            {onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Follow-up Call?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the follow-up call for "{pitchCall.client_name}". This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(pitchCall.id);
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-3 pt-3 border-t border-border">
          <div>
            <span className="text-muted-foreground">Outcome: </span>
            <span className={cn(
              "font-medium",
              (pitchCall.pitch_outcome || pitchCall.original_outcome) === 'sat' && "text-green-400"
            )}>
              {pitchCall.pitch_outcome || pitchCall.original_outcome || 'N/A'}
            </span>
          </div>
          {pitchCall.contract_value && (
            <div>
              <span className="text-muted-foreground">Contract Value: </span>
              <span className="font-medium">£{pitchCall.contract_value.toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Follow-up Date: </span>
            <span className="font-medium">{format(new Date(pitchCall.pitch_call_date), 'MMM d')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
