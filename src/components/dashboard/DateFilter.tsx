import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DateFilterProps {
  selectedDate: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  availableDates?: Date[];
  compact?: boolean;
}

const formatDateForComparison = (date: Date) => {
  // Format date in local timezone as YYYY-MM-DD to match database format
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const DateFilter = ({ selectedDate, onDateChange, availableDates, compact = false }: DateFilterProps) => {
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      // Create a new date object at noon local time to avoid timezone issues
      const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
      onDateChange(normalizedDate);
    } else {
      onDateChange(undefined);
    }
  };

  const triggerButton = compact ? (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        "h-9 w-9 rounded-lg border-border/50 bg-card/50 hover:bg-primary/10 hover:border-primary/50 transition-all",
        !selectedDate && "text-muted-foreground"
      )}
      title={selectedDate ? format(selectedDate, "PPP") : "Select date"}
    >
      <CalendarIcon className="h-4 w-4" />
    </Button>
  ) : (
    <Button
      variant="outline"
      className={cn(
        "rounded-full px-6 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all shadow-[0_0_20px_rgba(165,90,251,0.15)] hover:shadow-[0_0_30px_rgba(165,90,251,0.25)]",
        !selectedDate && "text-muted-foreground"
      )}
    >
      <CalendarIcon className="mr-2 h-4 w-4 !text-white" />
      {selectedDate ? format(selectedDate, "PPP") : "Select date"}
    </Button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        {triggerButton}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 glass-card" align="end">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDateSelect}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
          disabled={(date) => {
            // Create normalized date for comparison
            const today = new Date();
            const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const dateNormalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            
            // Disable future dates
            if (dateNormalized > todayNormalized) return true;
            
            // If availableDates is provided, only enable those dates
            if (availableDates && availableDates.length > 0) {
              const dateStr = formatDateForComparison(date);
              return !availableDates.some(
                (availableDate) => formatDateForComparison(availableDate) === dateStr
              );
            }
            return false;
          }}
        />
      </PopoverContent>
    </Popover>
  );
};