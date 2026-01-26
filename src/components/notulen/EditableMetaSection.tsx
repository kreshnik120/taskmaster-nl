import { useState, useEffect } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MapPin, Link2, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MeetingMinute } from "@/hooks/useMeetingMinutes";

interface EditableMetaSectionProps {
  minute: MeetingMinute;
  isEditMode: boolean;
  editedLocation: string;
  editedMeetingLink: string;
  editedNextMeetingDate: Date | null;
  onLocationChange: (value: string) => void;
  onMeetingLinkChange: (value: string) => void;
  onNextMeetingDateChange: (date: Date | null) => void;
}

export function EditableMetaSection({
  minute,
  isEditMode,
  editedLocation,
  editedMeetingLink,
  editedNextMeetingDate,
  onLocationChange,
  onMeetingLinkChange,
  onNextMeetingDateChange,
}: EditableMetaSectionProps) {
  const hasAnyMeta =
    minute.location || minute.meeting_link || minute.next_meeting_date;

  if (!isEditMode && !hasAnyMeta) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <MapPin className="h-4 w-4" />
        <span>Locatie & Details</span>
      </div>

      <Card className="p-4 space-y-4">
        {isEditMode ? (
          <>
            <div className="space-y-2">
              <Label className="text-sm">Locatie</Label>
              <Input
                placeholder="Bijv. Kantoor Amsterdam"
                value={editedLocation}
                onChange={(e) => onLocationChange(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Meeting link</Label>
              <Input
                type="url"
                placeholder="https://meet.google.com/..."
                value={editedMeetingLink}
                onChange={(e) => onMeetingLinkChange(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Volgende vergadering</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !editedNextMeetingDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editedNextMeetingDate
                      ? format(editedNextMeetingDate, "d MMMM yyyy", { locale: nl })
                      : "Selecteer datum..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editedNextMeetingDate || undefined}
                    onSelect={(date) => onNextMeetingDateChange(date || null)}
                    locale={nl}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </>
        ) : (
          <div className="space-y-3 text-sm">
            {minute.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{minute.location}</span>
              </div>
            )}
            {minute.meeting_link && (
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <a
                  href={minute.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline truncate"
                >
                  {minute.meeting_link}
                </a>
              </div>
            )}
            {minute.next_meeting_date && (
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span>
                  Volgende vergadering:{" "}
                  {format(new Date(minute.next_meeting_date), "d MMMM yyyy", {
                    locale: nl,
                  })}
                </span>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
