import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Clock, MapPin, Video, Phone, Building2, Mail, Download, Loader2, Send } from "lucide-react";
import { format, addDays } from "date-fns";
import { nl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface InterviewSchedulingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  functieNiveau?: string;
  onScheduled: () => void;
}

const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00"
];

const DURATION_OPTIONS = [
  { value: "15", label: "15 minuten" },
  { value: "30", label: "30 minuten" },
  { value: "45", label: "45 minuten" },
  { value: "60", label: "60 minuten" },
];

const LOCATION_TYPES = [
  { value: "kantoor", label: "Op kantoor", icon: Building2 },
  { value: "video", label: "Microsoft Teams / Videobellen", icon: Video },
  { value: "telefoon", label: "Telefonisch", icon: Phone },
];

export function InterviewSchedulingModal({
  open,
  onOpenChange,
  applicationId,
  candidateName,
  candidateEmail,
  candidatePhone,
  functieNiveau,
  onScheduled,
}: InterviewSchedulingModalProps) {
  const [date, setDate] = useState<Date | undefined>(addDays(new Date(), 2));
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("30");
  const [locationType, setLocationType] = useState("video");
  const [locationDetails, setLocationDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [createCalendarEvent, setCreateCalendarEvent] = useState(true);
  const [sendReminder, setSendReminder] = useState(true);
  const [sending, setSending] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const recruiterName = "Het recruitmentteam"; // Could be fetched from user profile

  // Generate live email preview
  const getEmailPreview = () => {
    if (!date) return "";
    
    const formattedDate = format(date, "EEEE d MMMM yyyy", { locale: nl });
    const locationText = locationType === "kantoor" 
      ? `Locatie: ${locationDetails || "[Adres invullen]"}`
      : locationType === "video"
      ? "Via: Microsoft Teams (link volgt)"
      : `Telefonisch op: ${candidatePhone || "[Telefoonnummer]"}`;

    return `Beste ${candidateName},

Graag bevestigen we de interview afspraak:

📅 Datum: ${formattedDate}
🕐 Tijd: ${time} uur
⏱️ Duur: ${duration} minuten
${locationText}

${functieNiveau ? `Betreft: Interview voor de functie ${functieNiveau}` : ""}

${notes ? `Opmerking: ${notes}` : ""}

${locationType === "video" ? "Je ontvangt voor aanvang een Teams-uitnodiging met de link om in te bellen." : ""}

We kijken ernaar uit om je te spreken!

Met vriendelijke groet,
${recruiterName}
ABCzorg / CitoZorg`;
  };

  const generateICSFile = () => {
    if (!date) return;

    const [hours, minutes] = time.split(':').map(Number);
    const startDate = new Date(date);
    startDate.setHours(hours, minutes, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + parseInt(duration));

    const formatICSDate = (d: Date) => {
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const locationText = locationType === "kantoor" 
      ? locationDetails || "Kantoor"
      : locationType === "video"
      ? "Microsoft Teams"
      : "Telefonisch";

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ABCzorg//Interview//NL
BEGIN:VEVENT
UID:${applicationId}-${Date.now()}@abczorg.nl
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(startDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:Interview ${candidateName}${functieNiveau ? ` - ${functieNiveau}` : ''}
DESCRIPTION:Interview afspraak met ${candidateName}\\n\\n${notes ? `Notities: ${notes}` : ''}
LOCATION:${locationText}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `interview-${candidateName.replace(/\s+/g, '-').toLowerCase()}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success("Kalenderbestand gedownload");
  };

  const handleSchedule = async () => {
    if (!date) {
      toast.error("Selecteer een datum");
      return;
    }

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Niet ingelogd");

      // Get user's first organization (use limit(1) instead of single() to handle multiple orgs)
      const { data: userOrgData } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1);
      
      if (!userOrgData || userOrgData.length === 0) {
        throw new Error("Geen organisatie gevonden");
      }
      const orgId = userOrgData[0].org_id;

      // Combine date and time
      const [hours, minutes] = time.split(':').map(Number);
      const scheduledAt = new Date(date);
      scheduledAt.setHours(hours, minutes, 0, 0);

      const interviewDetails = {
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: parseInt(duration),
        location_type: locationType,
        location_details: locationDetails,
        notes,
        send_reminder: sendReminder,
        email_sent: sendEmail,
        calendar_exported: false,
      };

      // Create task with interview details
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .insert([{
          org_id: orgId,
          application_id: applicationId,
          recruitment_action_type: 'interview',
          title: `Interview met ${candidateName}`,
          description: `Interview afspraak: ${format(scheduledAt, "d MMMM 'om' HH:mm", { locale: nl })}\n${notes}`,
          priority: 'HIGH',
          category: 'recruitment',
          status: 'todo',
          reporter_id: user.id,
          due_at: scheduledAt.toISOString(),
          interview_details: interviewDetails,
        }])
        .select()
        .single();

      if (taskError) throw taskError;

      // Create AI Agent goal to send interview email via n8n
      if (sendEmail && candidateEmail) {
        try {
          const { error: goalError } = await supabase
            .from('agent_goals')
            .insert({
              org_id: orgId,
              goal_type: 'send_interview_email',
              goal_description: `Stuur interview bevestigingsmail naar ${candidateName}`,
              status: 'pending',
              priority: 8,
              input_data: {
                applicationId,
                taskId: taskData.id,
                candidateEmail,
                candidateName,
                candidatePhone,
                functieNiveau,
                scheduledAt: scheduledAt.toISOString(),
                duration: parseInt(duration),
                locationType,
                locationDetails,
                notes,
                recruiterName,
                emailPreview: getEmailPreview(),
              }
            });

          if (goalError) {
            logger.error('Goal creation error:', goalError);
            toast.warning("Interview gepland, maar email taak kon niet worden aangemaakt");
          } else {
            logger.log('Interview email goal created - AI Agent will process');
          }
        } catch (emailError) {
          logger.error('Goal creation error:', emailError);
          toast.warning("Interview gepland, maar email kon niet worden verzonden");
        }
      }

      // Download calendar file if enabled
      if (createCalendarEvent) {
        generateICSFile();
      }

      toast.success("Interview succesvol ingepland!");
      onScheduled();
      onOpenChange(false);
      
      // Reset form
      setDate(addDays(new Date(), 2));
      setTime("10:00");
      setDuration("30");
      setLocationType("video");
      setLocationDetails("");
      setNotes("");
    } catch (error: any) {
      logger.error('Error scheduling interview:', error);
      toast.error(error.message || "Fout bij inplannen interview");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Interview inplannen met {candidateName}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          {/* Left column: Form */}
          <div className="space-y-4">
            {/* Date picker */}
            <div className="space-y-2">
              <Label>Datum</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "EEEE d MMMM yyyy", { locale: nl }) : "Selecteer datum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                      setDate(d);
                      setCalendarOpen(false);
                    }}
                    disabled={(d) => d < new Date()}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time picker */}
            <div className="space-y-2">
              <Label>Tijd</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        {slot}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label>Duur</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location type */}
            <div className="space-y-2">
              <Label>Locatie type</Label>
              <div className="grid grid-cols-3 gap-2">
                {LOCATION_TYPES.map((loc) => (
                  <Button
                    key={loc.value}
                    variant={locationType === loc.value ? "default" : "outline"}
                    className="flex flex-col h-auto py-3 gap-1"
                    onClick={() => setLocationType(loc.value)}
                  >
                    <loc.icon className="h-4 w-4" />
                    <span className="text-xs">{loc.label.split('/')[0]}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Location details (if kantoor) */}
            {locationType === "kantoor" && (
              <div className="space-y-2">
                <Label>Adres / Locatie</Label>
                <Input
                  value={locationDetails}
                  onChange={(e) => setLocationDetails(e.target.value)}
                  placeholder="Bijv. Kantoor Utrecht, Vergaderzaal 1"
                />
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notities (optioneel)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Extra informatie voor de kandidaat..."
                rows={2}
              />
            </div>

            {/* Options */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sendEmail"
                  checked={sendEmail}
                  onCheckedChange={(checked) => setSendEmail(checked === true)}
                />
                <label htmlFor="sendEmail" className="text-sm cursor-pointer">
                  Bevestigingsmail naar kandidaat sturen
                </label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="createCalendar"
                  checked={createCalendarEvent}
                  onCheckedChange={(checked) => setCreateCalendarEvent(checked === true)}
                />
                <label htmlFor="createCalendar" className="text-sm cursor-pointer">
                  Kalenderbestand downloaden (.ics)
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sendReminder"
                  checked={sendReminder}
                  onCheckedChange={(checked) => setSendReminder(checked === true)}
                />
                <label htmlFor="sendReminder" className="text-sm cursor-pointer">
                  Automatische reminder 24 uur vooraf
                </label>
              </div>
            </div>
          </div>

          {/* Right column: Email preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Email preview</Label>
              <Badge variant="outline" className="text-xs">
                <Mail className="h-3 w-3 mr-1" />
                {candidateEmail}
              </Badge>
            </div>
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    <strong>Onderwerp:</strong> Bevestiging interview afspraak
                  </div>
                  <div className="border-t pt-2">
                    <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">
                      {getEmailPreview()}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button
            variant="outline"
            onClick={generateICSFile}
            disabled={!date}
          >
            <Download className="h-4 w-4 mr-2" />
            .ICS downloaden
          </Button>
          <Button onClick={handleSchedule} disabled={sending || !date}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Bezig...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Interview inplannen
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
