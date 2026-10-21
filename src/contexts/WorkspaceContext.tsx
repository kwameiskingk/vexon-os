import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';

// Workspace types for KPI/Leaderboard view switching (only 2 options)
export type Workspace = 'setters' | 'closers';

interface WorkspaceContextType {
  selectedWorkspace: Workspace;
  setSelectedWorkspace: (ws: Workspace) => void;
  canSwitchWorkspace: boolean;
  isLoading: boolean;
  userRole: string | null;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

// Only dev, admin, and ops can switch between Setters and Closers views
const WORKSPACE_SWITCH_ROLES = ['dev', 'admin', 'ops'];

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace>('setters');
  const [canSwitchWorkspace, setCanSwitchWorkspace] = useState(false);
  const { userRole, userRoles, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    const canSwitch = userRoles.some(role => WORKSPACE_SWITCH_ROLES.includes(role));
    const isAccountExecutive = userRoles.includes('account_executive');
    const isSetter = userRoles.includes('setter');

    if (isAccountExecutive) {
      // Account executives are locked to closers view - check first before canSwitch
      setCanSwitchWorkspace(false);
      setSelectedWorkspace('closers');
    } else if (canSwitch) {
      // dev, admin, ops can switch freely
      setCanSwitchWorkspace(true);
      setSelectedWorkspace('setters');
    } else if (isSetter) {
      // Setters are locked to setters view
      setCanSwitchWorkspace(false);
      setSelectedWorkspace('setters');
    } else {
      // Default to setters view
      setCanSwitchWorkspace(false);
      setSelectedWorkspace('setters');
    }
  }, [userRoles, isLoading]);

  const handleSetWorkspace = (ws: Workspace) => {
    // Only allow switching if user has permission
    if (canSwitchWorkspace) {
      setSelectedWorkspace(ws);
    }
  };

  return (
    <WorkspaceContext.Provider value={{ 
      selectedWorkspace, 
      setSelectedWorkspace: handleSetWorkspace, 
      canSwitchWorkspace,
      isLoading,
      userRole
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
};
