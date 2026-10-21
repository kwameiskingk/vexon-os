import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CheckCircle2, User } from "lucide-react";

export interface OnboardingClientData {
  id: string;
  client_profile_id: string;
  company_name: string;
  logo?: string | null;
  current_stage: number;
  started_at: string;
  completed_tasks: number;
  total_tasks: number;
  assigned_csm_name?: string;
  contract_value?: number | null;
  source?: string | null;
}

interface OnboardingClientCardProps {
  client: OnboardingClientData;
  onClick: () => void;
  stageColor?: string;
  isDragOverlay?: boolean;
  compact?: boolean;
}

// Generate a consistent gradient based on company name
function getCompanyGradient(name: string): string {
  const gradients = [
    'from-violet-500 to-purple-600',
    'from-blue-500 to-cyan-600',
    'from-emerald-500 to-teal-600',
    'from-orange-500 to-amber-600',
    'from-pink-500 to-rose-600',
    'from-indigo-500 to-blue-600',
  ];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function OnboardingClientCard({ 
  client, 
  onClick, 
  stageColor = 'text-primary',
  isDragOverlay = false,
  compact = false
}: OnboardingClientCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: client.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const progressPercent = client.total_tasks > 0 
    ? Math.round((client.completed_tasks / client.total_tasks) * 100) 
    : 0;

  const isComplete = client.completed_tasks === client.total_tasks && client.total_tasks > 0;
  const gradient = getCompanyGradient(client.company_name);

  if (compact) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <Card 
          className={`group cursor-grab active:cursor-grabbing touch-none transition-all duration-200 border overflow-hidden ${
            isDragging 
              ? 'opacity-40 scale-95' 
              : 'hover:shadow-md hover:border-primary/30'
          } ${
            isDragOverlay 
              ? 'shadow-2xl border-primary/50 bg-background cursor-grabbing' 
              : ''
          } ${
            isComplete 
              ? 'border-l-2 border-l-emerald-500' 
              : 'border-l-2 border-l-primary/60'
          }`}
          onClick={onClick}
        >
          <CardContent className="p-2">
            <div className="flex items-center gap-2">

              {/* Company Logo/Avatar */}
              <Avatar className="h-7 w-7 rounded-md border border-border/50 shadow-sm shrink-0">
                {client.logo ? (
                  <AvatarImage 
                    src={client.logo} 
                    alt={client.company_name}
                    className="object-cover"
                  />
                ) : null}
                <AvatarFallback className={`rounded-md bg-gradient-to-br ${gradient} text-white text-[9px] font-bold`}>
                  {getInitials(client.company_name)}
                </AvatarFallback>
              </Avatar>

              {/* Company Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[11px] truncate leading-tight">
                  {client.company_name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Progress 
                    value={progressPercent} 
                    className={`h-1 flex-1 ${isComplete ? '[&>div]:bg-emerald-500' : ''}`}
                  />
                  <span className="text-[9px] text-muted-foreground font-medium w-6 text-right">
                    {progressPercent}%
                  </span>
                </div>
              </div>

              {isComplete && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card 
        className={`group cursor-grab active:cursor-grabbing touch-none transition-all duration-200 border overflow-hidden ${
          isDragging 
            ? 'opacity-40 scale-95' 
            : 'hover:shadow-md hover:border-primary/30'
        } ${
          isDragOverlay 
            ? 'shadow-2xl border-primary/50 bg-background cursor-grabbing' 
            : ''
        } ${
          isComplete 
            ? 'border-l-4 border-l-emerald-500' 
            : 'border-l-4 border-l-primary/60'
        }`}
        onClick={onClick}
      >
        <CardContent className="p-3">
          {/* Top Row: Avatar + Company Name */}
          <div className="flex items-center gap-3 mb-3">
            {/* Company Logo/Avatar */}
            <Avatar className="h-10 w-10 rounded-lg border border-border/50 shadow-sm shrink-0">
              {client.logo ? (
                <AvatarImage 
                  src={client.logo} 
                  alt={client.company_name}
                  className="object-cover"
                />
              ) : null}
              <AvatarFallback className={`rounded-lg bg-gradient-to-br ${gradient} text-white text-xs font-bold`}>
                {getInitials(client.company_name)}
              </AvatarFallback>
            </Avatar>

            {/* Company Info */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate leading-tight">
                {client.company_name}
              </p>
              {client.assigned_csm_name && (
                <div className="flex items-center gap-1 mt-0.5">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground truncate">
                    {client.assigned_csm_name}
                  </span>
                </div>
              )}
            </div>

            {/* Completion Badge */}
            {isComplete && (
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            )}
          </div>

          {/* Progress Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">
                {client.completed_tasks} of {client.total_tasks} tasks
              </span>
              <Badge 
                variant="secondary"
                className={`text-[10px] h-5 px-1.5 font-bold ${
                  isComplete 
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
                    : progressPercent >= 50 
                      ? 'bg-primary/10 text-primary' 
                      : ''
                }`}
              >
                {progressPercent}%
              </Badge>
            </div>
            
            <Progress 
              value={progressPercent} 
              className={`h-2 ${isComplete ? '[&>div]:bg-emerald-500' : ''}`}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
