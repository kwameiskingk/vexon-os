import { useState, useMemo, useRef, useEffect } from "react";
import { fetchAllEmployeesRoster, fetchManagedAttendanceRoster } from '@/components/attendance/attendanceRoster';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, Users, CheckCheck } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameMonth, isWeekend, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

type AttendanceStatus = 'present' | 'late' | 'half_day' | 'absent' | null;

interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string;
  status: string;
}

const STATUS_OPTIONS: { value: Exclude<AttendanceStatus, null>; label: string; dot: string }[] = [
  { value: 'present', label: 'Present', dot: 'bg-emerald-500' },
  { value: 'late', label: 'Late', dot: 'bg-amber-500' },
  { value: 'half_day', label: 'Half Day', dot: 'bg-yellow-400' },
  { value: 'absent', label: 'Absent', dot: 'bg-red-500' },
];

interface EmployeeAttendanceTrackerProps {
  /** When true, shows the manager's department roster (for SDR Managers) */
  managerScope?: boolean;
  /** The manager's department(s) (managerScope only); acquisition includes
   *  the AE bench, an array unions a dual-department manager's rosters. */
  managerDepartment?: "fulfilment" | "acquisition" | Array<"fulfilment" | "acquisition">;
  /** Optional list of roles to include (HR/Admin view only). Excludes users whose roles don't intersect. */
  allowedRoles?: string[];
}

export const EmployeeAttendanceTracker = ({ managerScope = false, managerDepartment = "fulfilment", allowedRoles }: EmployeeAttendanceTrackerProps) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [openCell, setOpenCell] = useState<string | null>(null);
  const todayHeaderRef = useRef<HTMLTableCellElement | null>(null);

  const monthKey = format(currentMonth, 'yyyy-MM');

  // Fetch employees - either all (HR view) or the manager's department roster
  // (SDR Manager view; department-scoped per the org ruling, same source as
  // the single-day board so the two attendance views can never disagree).
  const { data: employees = [] } = useQuery({
    queryKey: ['employees-for-attendance', managerScope, managerScope ? (Array.isArray(managerDepartment) ? managerDepartment.join(',') : managerDepartment) : '', allowedRoles?.join(',') ?? ''],
    queryFn: async () => {
      if (managerScope) {
        return fetchManagedAttendanceRoster(managerDepartment);
      }

      // HR/Admin view: shared roster source (attendanceRoster.ts)
      return fetchAllEmployeesRoster(allowedRoles);
    }
  });

  // Get days for the current month
  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  // Fetch attendance for current month
  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ['employee-attendance', monthKey],
    queryFn: async () => {
      const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('employee_attendance')
        .select('*')
        .gte('date', start)
        .lte('date', end);

      if (error) throw error;
      return (data || []) as AttendanceRecord[];
    }
  });

  // Create attendance map for quick lookup
  const attendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceStatus>();
    attendanceRecords.forEach(record => {
      const key = `${record.employee_id}-${record.date}`;
      map.set(key, record.status as AttendanceStatus);
    });
    return map;
  }, [attendanceRecords]);

  // Scroll today's column into view when the current month is shown
  useEffect(() => {
    if (todayHeaderRef.current) {
      todayHeaderRef.current.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  }, [monthKey]);

  // Set a cell to an explicit status (null = clear the mark), with an
  // optimistic cache update so the grid responds instantly.
  const setAttendance = useMutation({
    mutationFn: async ({ employeeId, date, status }: { employeeId: string; date: string; status: AttendanceStatus }) => {
      if (status === null) {
        const { error } = await supabase
          .from('employee_attendance')
          .delete()
          .eq('employee_id', employeeId)
          .eq('date', date);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('employee_attendance')
          .upsert({
            employee_id: employeeId,
            date: date,
            status: status,
            marked_by: user?.id
          }, {
            onConflict: 'employee_id,date'
          });
        if (error) throw error;
      }
      return status;
    },
    onMutate: async ({ employeeId, date, status }) => {
      await queryClient.cancelQueries({ queryKey: ['employee-attendance', monthKey] });
      const previous = queryClient.getQueryData<AttendanceRecord[]>(['employee-attendance', monthKey]);
      queryClient.setQueryData<AttendanceRecord[]>(['employee-attendance', monthKey], (old = []) => {
        const rest = old.filter(r => !(r.employee_id === employeeId && r.date === date));
        if (status === null) return rest;
        return [...rest, { id: `optimistic-${employeeId}-${date}`, employee_id: employeeId, date, status }];
      });
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['employee-attendance', monthKey], context.previous);
      }
      console.error('Error updating attendance:', error);
      toast.error('Failed to update attendance');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-attendance'] });
    }
  });

  // Bulk-fill: mark every visible employee without a mark today as present
  const markAllPresentToday = useMutation({
    mutationFn: async () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const unmarked = filteredEmployees.filter(e => !attendanceMap.has(`${e.id}-${todayStr}`));
      if (unmarked.length === 0) return 0;
      const { error } = await supabase
        .from('employee_attendance')
        .upsert(
          unmarked.map(e => ({
            employee_id: e.id,
            date: todayStr,
            status: 'present',
            marked_by: user?.id
          })),
          { onConflict: 'employee_id,date' }
        );
      if (error) throw error;
      return unmarked.length;
    },
    onSuccess: (count) => {
      if (count === 0) {
        toast.info('Everyone already has a mark for today');
      } else {
        toast.success(`Marked ${count} employee${count === 1 ? '' : 's'} present`);
      }
      queryClient.invalidateQueries({ queryKey: ['employee-attendance'] });
    },
    onError: (error) => {
      console.error('Error bulk-marking attendance:', error);
      toast.error('Failed to mark all present');
    }
  });

  const handleSelect = (employeeId: string, date: Date, status: AttendanceStatus) => {
    setOpenCell(null);
    setAttendance.mutate({ employeeId, date: format(date, 'yyyy-MM-dd'), status });
  };

  const getStatusColor = (status: AttendanceStatus) => {
    if (status === 'present') return 'bg-emerald-500 hover:bg-emerald-600';
    if (status === 'late') return 'bg-amber-500 hover:bg-amber-600';
    if (status === 'half_day') return 'bg-yellow-400 hover:bg-yellow-500';
    if (status === 'absent') return 'bg-red-500 hover:bg-red-600';
    return 'bg-muted hover:bg-muted-foreground/25';
  };

  const statusLabel = (status: AttendanceStatus) =>
    STATUS_OPTIONS.find(o => o.value === status)?.label || 'Not marked';

  const filteredEmployees = selectedEmployee
    ? employees.filter(e => e.id === selectedEmployee)
    : employees;

  const viewingCurrentMonth = isSameMonth(currentMonth, new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-lg font-semibold min-w-[160px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {viewingCurrentMonth && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllPresentToday.mutate()}
              disabled={markAllPresentToday.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-1.5 text-emerald-500" />
              Mark all present today
            </Button>
          )}
          <Select value={selectedEmployee || "all"} onValueChange={(val) => setSelectedEmployee(val === "all" ? null : val)}>
            <SelectTrigger className="w-[200px]">
              <Users className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {employees.map(emp => (
                <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="text-sm text-muted-foreground flex gap-4 flex-wrap">
        {STATUS_OPTIONS.map(opt => (
          <span key={opt.value} className="flex items-center gap-1">
            <span className={cn("w-4 h-4 rounded inline-block", opt.dot)} /> {opt.label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-muted inline-block" /> Not marked
        </span>
      </div>

      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 bg-background z-30 text-left p-2 border-b border-r min-w-[150px]">
                Employee
              </th>
              {daysInMonth.map(day => {
                const today = isToday(day);
                return (
                  <th
                    key={day.toISOString()}
                    ref={today ? todayHeaderRef : undefined}
                    className={cn(
                      "sticky top-0 bg-background z-20 p-1 border-b text-center min-w-[36px]",
                      isWeekend(day) && "bg-muted/30",
                      today && "bg-primary/10"
                    )}
                  >
                    <div className={cn("text-xs", today ? "text-primary font-semibold" : "text-muted-foreground")}>{format(day, 'EEE')}</div>
                    <div className={cn(today && "text-primary font-semibold")}>{format(day, 'd')}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map(employee => (
              <tr key={employee.id} className="hover:bg-muted/20">
                <td className="sticky left-0 bg-background z-10 p-2 border-r font-medium whitespace-nowrap">
                  {employee.name}
                </td>
                {daysInMonth.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const key = `${employee.id}-${dateStr}`;
                  const status = attendanceMap.get(key) || null;
                  const isFuture = day > new Date();

                  return (
                    <td
                      key={day.toISOString()}
                      className={cn(
                        "p-1 text-center",
                        isWeekend(day) && "bg-muted/30",
                        isToday(day) && "bg-primary/5"
                      )}
                    >
                      <Popover open={openCell === key} onOpenChange={(o) => setOpenCell(o ? key : null)}>
                        <PopoverTrigger asChild>
                          <button
                            disabled={isFuture}
                            className={cn(
                              "w-7 h-7 rounded-md transition-colors",
                              getStatusColor(status),
                              isFuture ? "opacity-30 cursor-not-allowed" : "cursor-pointer",
                              openCell === key && "ring-2 ring-primary ring-offset-1"
                            )}
                            title={`${employee.name} — ${format(day, 'MMM d')}: ${statusLabel(status)}`}
                          />
                        </PopoverTrigger>
                        <PopoverContent className="w-44 p-1.5" align="center">
                          <div className="px-2 py-1 text-xs text-muted-foreground border-b mb-1">
                            {employee.name} · {format(day, 'EEE, MMM d')}
                          </div>
                          {STATUS_OPTIONS.map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => handleSelect(employee.id, day, opt.value)}
                              className={cn(
                                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-muted transition-colors",
                                status === opt.value && "bg-muted font-medium"
                              )}
                            >
                              <span className={cn("w-3 h-3 rounded", opt.dot)} />
                              {opt.label}
                            </button>
                          ))}
                          {status !== null && (
                            <button
                              onClick={() => handleSelect(employee.id, day, null)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left text-muted-foreground hover:bg-muted transition-colors border-t mt-1"
                            >
                              <span className="w-3 h-3 rounded bg-muted border" />
                              Clear mark
                            </button>
                          )}
                        </PopoverContent>
                      </Popover>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {filteredEmployees.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            No employees found
          </div>
        )}
      </div>
    </div>
  );
};
