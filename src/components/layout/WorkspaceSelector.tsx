import { ChevronDown, Users, Briefcase } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkspace, Workspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';

const WORKSPACE_CONFIG: Record<Workspace, { label: string; icon: React.ElementType; color: string }> = {
  setters: { label: 'Setters View', icon: Users, color: 'text-blue-400' },
  closers: { label: 'Closers View', icon: Briefcase, color: 'text-green-400' },
};

export function WorkspaceSelector() {
  const { selectedWorkspace, setSelectedWorkspace, canSwitchWorkspace } = useWorkspace();
  const { userRole, isLoading } = useAuth();

  // Only show for dev, admin, and ops roles
  const allowedRoles = ['dev', 'admin', 'ops'];
  if (!isLoading && (!userRole || !allowedRoles.includes(userRole))) {
    return null;
  }

  if (isLoading) {
    return <Skeleton className="h-9 w-32 rounded-lg" />;
  }

  const currentConfig = WORKSPACE_CONFIG[selectedWorkspace];
  const CurrentIcon = currentConfig.icon;

  if (!canSwitchWorkspace) {
    // Show static badge for locked users
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border">
        <CurrentIcon className={`h-4 w-4 ${currentConfig.color}`} />
        <span className="text-sm font-medium text-foreground">{currentConfig.label}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border hover:bg-accent transition-all duration-200">
          <CurrentIcon className={`h-4 w-4 ${currentConfig.color}`} />
          <span className="text-sm font-medium text-foreground">{currentConfig.label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 bg-popover z-50">
        {(Object.keys(WORKSPACE_CONFIG) as Workspace[]).map((workspace) => {
          const config = WORKSPACE_CONFIG[workspace];
          const Icon = config.icon;
          return (
            <DropdownMenuItem
              key={workspace}
              onClick={() => setSelectedWorkspace(workspace)}
              className={`cursor-pointer ${selectedWorkspace === workspace ? 'bg-primary/20' : ''}`}
            >
              <Icon className={`h-4 w-4 mr-2 ${config.color}`} />
              {config.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
