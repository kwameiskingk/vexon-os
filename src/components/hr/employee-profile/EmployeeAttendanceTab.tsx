import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth, isBefore, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Clock, Check, AlertCircle, X } from "lucide-react";

interface EmployeeAttendanceTabProps {
  employee: any;
}

type AttendanceStatus = 'present' | 'late' | 'half_day' | 'absent' | null;

export function EmployeeAttendanceTab({ employee }: EmployeeAttendanceTabProps) {
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Use auth user id (employee.id) to match the main attendance tracker
  const employeeUserId = employee.id;

  // Fetch attendance for current month
  const { data: attendance = [], isLoading } = useQuery({
    queryKey: ['employee-attendance', employeeUserId, format(currentMonth, 'yyyy-MM')],
    queryFn: async () => {
      if (!employeeUserId) return [];
      
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);
      
      const { data, error } = await supabase
        .from('employee_attendance')
        .select('*')
        .eq('employee_id', employeeUserId)
        .gte('date', format(start, 'yyyy-MM-dd'))
        .lte('date', format(end, 'yyyy-MM-dd'));
      
      if (error) throw error;
      return data;
    },
    enabled: !!employeeUserId
  });

  // Create attendance map for easy lookup
  const attendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceStatus>();
    attendance.forEach((record: any) => {
      map.set(record.date, record.status as AttendanceStatus);
    });
    return map;
  }, [attendance]);

  // Generate days in current month
  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  // Calculate stats
  const stats = useMemo(() => {
    const presentDays = attendance.filter((a: any) => a.status === 'present').length;
    const lateDays = attendance.filter((a: any) => a.status === 'late').length;
    const halfDays = attendance.filter((a: any) => a.status === 'half_day').length;
    const absentDays = attendance.filter((a: any) => a.status === 'absent').length;
    const workingDays = daysInMonth.filter(d => {
      const day = getDay(d);
      return day !== 0 && day !== 6 && (isBefore(d, new Date()) || isToday(d));
    }).length;

    return {
      present: presentDays,
      late: lateDays,
      halfDays,
      absent: absentDays,
      workingDays,
      attendanceRate: workingDays > 0 ? Math.round(((presentDays + lateDays + halfDays) / workingDays) * 100) : 0
    };
  }, [attendance, daysInMonth]);

  // Toggle attendance mutation
  const toggleAttendance = useMutation({
    mutationFn: async ({ date, currentStatus }: { date: string; currentStatus: AttendanceStatus }) => {
      const { data: user } = await supabase.auth.getUser();
      
      // Cycle: null -> present -> late -> half_day -> absent -> null
      let newStatus: AttendanceStatus;
      if (currentStatus === null) {
        newStatus = 'present';
      } else if (currentStatus === 'present') {
        newStatus = 'late';
      } else if (currentStatus === 'late') {
        newStatus = 'half_day';
      } else if (currentStatus === 'half_day') {
        newStatus = 'absent';
      } else {
        newStatus = null;
      }

      if (newStatus === null) {
        const { error } = await supabase
          .from('employee_attendance')
          .delete()
          .eq('employee_id', employeeUserId)
          .eq('date', date);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('employee_attendance')
          .upsert({
            employee_id: employeeUserId,
            date,
            status: newStatus,
            marked_by: user.user?.id
          }, { onConflict: 'employee_id,date' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', employeeUserId, format(currentMonth, 'yyyy-MM')] });
    },
    onError: () => {
      toast.error('Failed to update attendance');
    }
  });

  const handleDayClick = (day: Date) => {
    // Don't allow marking future dates
    if (day > new Date()) return;
    
    const dateStr = format(day, 'yyyy-MM-dd');
    const currentStatus = attendanceMap.get(dateStr) || null;
    toggleAttendance.mutate({ date: dateStr, currentStatus });
  };

  const getStatusColor = (status: AttendanceStatus) => {
    switch (status) {
      case 'present':
        return 'bg-emerald-500 hover:bg-emerald-600 text-white';
      case 'late':
        return 'bg-amber-500 hover:bg-amber-600 text-white';
      case 'half_day':
        return 'bg-yellow-500 hover:bg-yellow-600 text-white';
      case 'absent':
        return 'bg-red-500 hover:bg-red-600 text-white';
      default:
        return 'bg-muted hover:bg-muted/80';
    }
  };

  const getStatusIcon = (status: AttendanceStatus) => {
    switch (status) {
      case 'present':
        return <Check className="h-3 w-3" />;
      case 'late':
        return <AlertCircle className="h-3 w-3" />;
      case 'half_day':
        return <Clock className="h-3 w-3" />;
      case 'absent':
        return <X className="h-3 w-3" />;
      default:
        return null;
    }
  };

  if (!employeeUserId) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Attendance tracking is not available for this employee.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-500">{stats.present}</p>
            <p className="text-sm text-muted-foreground">Days Present</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-500">{stats.late}</p>
            <p className="text-sm text-muted-foreground">Days Late</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-500">{stats.halfDays}</p>
            <p className="text-sm text-muted-foreground">Half Days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{stats.absent}</p>
            <p className="text-sm text-muted-foreground">Days Absent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.workingDays}</p>
            <p className="text-sm text-muted-foreground">Working Days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{stats.attendanceRate}%</p>
            <p className="text-sm text-muted-foreground">Attendance Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {format(currentMonth, 'MMMM yyyy')}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Legend */}
          <div className="flex gap-4 mb-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-emerald-500" />
              <span>Present</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-amber-500" />
              <span>Late</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-yellow-500" />
              <span>Half Day</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-500" />
              <span>Absent</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-muted" />
              <span>Not Marked</span>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2">
            {/* Day Headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-sm text-muted-foreground font-medium py-2">
                {day}
              </div>
            ))}
            
            {/* Empty cells for days before start of month */}
            {Array.from({ length: getDay(daysInMonth[0]) }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            
            {/* Day cells */}
            {daysInMonth.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const status = attendanceMap.get(dateStr) || null;
              const isWeekend = getDay(day) === 0 || getDay(day) === 6;
              const isFuture = day > new Date();
              const today = isToday(day);
              
              return (
                <button
                  key={dateStr}
                  onClick={() => handleDayClick(day)}
                  disabled={isFuture || isWeekend}
                  className={`
                    aspect-square rounded-lg flex flex-col items-center justify-center text-sm
                    transition-colors relative
                    ${isWeekend ? 'opacity-30 cursor-not-allowed' : ''}
                    ${isFuture ? 'opacity-50 cursor-not-allowed' : ''}
                    ${!isWeekend && !isFuture ? 'cursor-pointer' : ''}
                    ${getStatusColor(status)}
                    ${today ? 'ring-2 ring-primary ring-offset-2' : ''}
                  `}
                >
                  <span className="font-medium">{format(day, 'd')}</span>
                  {status && (
                    <span className="absolute bottom-1">
                      {getStatusIcon(status)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            Click on a day to cycle through: Not Marked → Present → Late → Half Day → Absent → Not Marked
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
