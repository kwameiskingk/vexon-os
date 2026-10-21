import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Pencil, Trash2, ExternalLink, CheckCircle2 } from "lucide-react";
import { ReactNode } from "react";

export interface PipelineCardProps {
  id: string;
  title: string;
  subtitle?: string;
  avatarSrc?: string | null;
  avatarFallback: string;
  avatarGradient?: string;
  progress?: number;
  progressLabel?: string;
  icon?: ReactNode;
  onClick?: () => void;
  isDragOverlay?: boolean;
  showActions?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpen?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getGradientFromName(name: string): string {
  const gradients = [
    "from-violet-500 to-purple-600",
    "from-blue-500 to-cyan-600",
    "from-emerald-500 to-teal-600",
    "from-orange-500 to-amber-600",
    "from-pink-500 to-rose-600",
    "from-indigo-500 to-blue-600",
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

export function PipelineCard({
  id,
  title,
  subtitle,
  avatarSrc,
  avatarFallback,
  avatarGradient,
  progress,
  progressLabel,
  icon,
  onClick,
  isDragOverlay = false,
  showActions = false,
  onEdit,
  onDelete,
  onOpen,
}: PipelineCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const gradient = avatarGradient || getGradientFromName(title);

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className={`group relative cursor-grab active:cursor-grabbing touch-none transition-all duration-200 bg-background border hover:shadow-md ${
          isDragging ? "opacity-40 scale-95" : ""
        } ${isDragOverlay ? "shadow-2xl rotate-2 scale-105 cursor-grabbing" : ""}`}
        onClick={onClick}
      >
        <div className="p-2">
          {/* Header Row */}
          <div className="flex items-center gap-2">
            {/* Icon or Avatar */}
            <div className="shrink-0">
              {icon ? (
                <div className="w-6 h-6 rounded flex items-center justify-center bg-muted">
                  {icon}
                </div>
              ) : (
                <Avatar className="h-6 w-6 rounded border border-border/50">
                  {avatarSrc ? (
                    <AvatarImage src={avatarSrc} alt={title} className="object-cover" />
                  ) : null}
                  <AvatarFallback
                    className={`rounded bg-gradient-to-br ${gradient} text-white text-[8px] font-bold`}
                  >
                    {getInitials(avatarFallback || title)}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-xs text-foreground truncate">{title}</p>
              {subtitle && <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>}
            </div>

            {/* Action Icons (visible on hover) */}
            {showActions && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {onEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                    className="p-0.5 rounded hover:bg-muted"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="p-0.5 rounded hover:bg-muted"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
                {onOpen && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen();
                    }}
                    className="p-0.5 rounded hover:bg-muted"
                    title="Complete"
                  >
                    <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Progress Section */}
          {progress !== undefined && (
            <div className="mt-1.5 pt-1.5 border-t border-border/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">{progressLabel}</span>
                <span className="text-[10px] font-medium text-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-1" />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
