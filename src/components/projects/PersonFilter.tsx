import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCoreTeam } from "@/hooks/useCoreTeam";
import { CORE_TEAM_CAPTION, coreTeamDisplayName } from "@/lib/coreTeam";

export const EVERYONE = "all";

interface Props {
  value: string; // EVERYONE or a user id
  onChange: (value: string) => void;
  className?: string;
}

/**
 * "Everyone" (= the whole core team) or one core-team member — toggles the
 * tab to their projects and tasks. Pool is rule-based: src/lib/coreTeam.ts.
 */
export function PersonFilter({ value, onChange, className }: Props) {
  const { data: team = [], isLoading } = useCoreTeam();
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full sm:w-56 text-[12.5px]" aria-label="Show projects for">
          <span className="inline-flex items-center gap-2 min-w-0">
            <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <SelectValue placeholder={isLoading ? "Loading…" : "Everyone"} />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EVERYONE}>Everyone</SelectItem>
          {team.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {coreTeamDisplayName(u)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-[10.5px] text-muted-foreground/80 pl-0.5">{CORE_TEAM_CAPTION}</span>
    </div>
  );
}
