import React from "react";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface ChatDatePickerProps {
  onSelect: (date: Date) => void;
}

export const ChatDatePicker: React.FC<ChatDatePickerProps> = ({ onSelect }) => {
  const [selectedDate, setSelectedDate] = React.useState<Date>();

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      onSelect(date);
    }
  };

  return (
    <div className="inline-block bg-card border rounded-lg p-3 my-2">
      <div className="text-sm text-muted-foreground mb-2">Selecteer een datum:</div>
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={handleSelect}
        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
        initialFocus
        className={cn("p-0 pointer-events-auto")}
        locale={nl}
      />
    </div>
  );
};

interface ChatTimePickerProps {
  onSelect: (time: string) => void;
}

export const ChatTimePicker: React.FC<ChatTimePickerProps> = ({ onSelect }) => {
  const timeOptions = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, "0");
    return [`${hour}:00`, `${hour}:30`];
  }).flat();

  return (
    <div className="inline-block bg-card border rounded-lg p-3 my-2 min-w-[200px]">
      <div className="text-sm text-muted-foreground mb-2">Selecteer een tijd:</div>
      <Select onValueChange={onSelect}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Kies een tijd" />
        </SelectTrigger>
        <SelectContent>
          {timeOptions.map((time) => (
            <SelectItem key={time} value={time}>
              {time}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

interface ChatSelectProps {
  label: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
}

export const ChatSelect: React.FC<ChatSelectProps> = ({ label, options, onSelect }) => {
  return (
    <div className="inline-block bg-card border rounded-lg p-3 my-2 min-w-[200px]">
      <div className="text-sm text-muted-foreground mb-2">{label}:</div>
      <Select onValueChange={onSelect}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Kies een optie" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

interface ChatButtonGroupProps {
  label: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
}

export const ChatButtonGroup: React.FC<ChatButtonGroupProps> = ({ label, options, onSelect }) => {
  return (
    <div className="inline-block bg-card border rounded-lg p-3 my-2">
      <div className="text-sm text-muted-foreground mb-2">{label}:</div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            variant="outline"
            size="sm"
            onClick={() => onSelect(option.value)}
            className="hover:bg-primary hover:text-primary-foreground"
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
};
