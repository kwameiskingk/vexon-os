import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';

// 'ops_command' (8 Sep 2026) is Elena's Ops Command portal as a slot of its
// own — it used to be the 'ceo' slot relabelled for one hard-coded user id,
// which made CEO Command and Ops Command mutually exclusive.
export type Department = 'sales' | 'operations' | 'accounting' | 'hr' | 'gtm' | 'ceo' | 'ops_command';

interface DepartmentContextType {
  selectedDepartment: Department;
  setSelectedDepartment: (dept: Department) => void;
}

const DepartmentContext = createContext<DepartmentContextType | undefined>(undefined);

export const DepartmentProvider = ({ children }: { children: ReactNode }) => {
  const [selectedDepartment, setSelectedDepartment] = useState<Department>('operations');
  const { userRole, isLoading } = useAuth();

  // Set default department based on user role
  useEffect(() => {
    if (!isLoading) {
      if (userRole === 'account_executive') {
        setSelectedDepartment('sales');
      } else if (userRole === 'accounting') {
        setSelectedDepartment('accounting');
      } else if (userRole === 'hr') {
        setSelectedDepartment('hr');
      } else if (userRole === 'gtm_engineer') {
        setSelectedDepartment('gtm');
      } else if (userRole === 'ops_assistant') {
        setSelectedDepartment('operations');
      }
    }
  }, [userRole, isLoading]);

  return (
    <DepartmentContext.Provider value={{ selectedDepartment, setSelectedDepartment }}>
      {children}
    </DepartmentContext.Provider>
  );
};

export const useDepartment = () => {
  const context = useContext(DepartmentContext);
  if (!context) {
    throw new Error('useDepartment must be used within DepartmentProvider');
  }
  return context;
};
