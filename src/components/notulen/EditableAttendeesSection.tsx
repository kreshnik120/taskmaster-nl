import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Plus, Trash2, Loader2, Check, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MeetingMinute } from "@/hooks/useMeetingMinutes";
import { useManageAttendees, AttendeeRole } from "@/hooks/notulen/useManageAttendees";
import { useOrgMembers } from "@/hooks/notulen/useOrgMembers";

interface EditableAttendeesSectionProps {
  minute: MeetingMinute;
  isEditMode: boolean;
}

const ROLE_OPTIONS: { value: AttendeeRole; label: string }[] = [
  { value: 'voorzitter', label: 'Voorzitter' },
  { value: 'notulist', label: 'Notulist' },
  { value: 'deelnemer', label: 'Deelnemer' },
  { value: 'gast', label: 'Gast' },
];

export function EditableAttendeesSection({ minute, isEditMode }: EditableAttendeesSectionProps) {
  const { addInternalAttendee, addExternalAttendee, updateAttendee, removeAttendee, isUpdating } =
    useManageAttendees();
  const { data: orgMembers = [], isLoading: isLoadingMembers } = useOrgMembers();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [attendeeType, setAttendeeType] = useState<"internal" | "external">("internal");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [externalName, setExternalName] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState<AttendeeRole>("deelnemer");

  // Filter out users who are already attendees
  const existingUserIds = minute.meeting_attendees
    .map((a) => a.user_id)
    .filter(Boolean);
  const availableMembers = orgMembers.filter((m) => !existingUserIds.includes(m.id));

  const handleAdd = async () => {
    if (attendeeType === "internal" && selectedUserId) {
      await addInternalAttendee({
        meeting_id: minute.id,
        user_id: selectedUserId,
        role: selectedRole,
      });
    } else if (attendeeType === "external" && externalName.trim()) {
      await addExternalAttendee({
        meeting_id: minute.id,
        external_name: externalName.trim(),
        external_email: externalEmail.trim() || undefined,
        role: selectedRole,
      });
    }

    // Reset form
    setSelectedUserId("");
    setExternalName("");
    setExternalEmail("");
    setSelectedRole("deelnemer");
    setIsAddOpen(false);
  };

  const handleCancel = () => {
    setSelectedUserId("");
    setExternalName("");
    setExternalEmail("");
    setSelectedRole("deelnemer");
    setIsAddOpen(false);
  };

  const getAttendeeName = (attendee: MeetingMinute["meeting_attendees"][0]) => {
    return attendee.profiles?.name || attendee.external_name || "Onbekend";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>Deelnemers ({minute.meeting_attendees.length})</span>
        </div>
      </div>

      <Card className="p-4">
        {minute.meeting_attendees.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Geen deelnemers toegevoegd
          </p>
        ) : (
          <div className="space-y-2">
            {minute.meeting_attendees.map((attendee) => (
              <div
                key={attendee.id}
                className="flex items-center gap-3 py-1.5 group"
              >
                <span className="flex-1 text-sm font-medium">
                  {getAttendeeName(attendee)}
                  {attendee.external_name && (
                    <span className="ml-1 text-xs text-muted-foreground">(extern)</span>
                  )}
                </span>

                {isEditMode ? (
                  <>
                    <Select
                      value={attendee.role || "deelnemer"}
                      onValueChange={(value) =>
                        updateAttendee(attendee.id, { role: value })
                      }
                      disabled={isUpdating}
                    >
                      <SelectTrigger className="w-[120px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant={attendee.attended ? "secondary" : "outline"}
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() =>
                        updateAttendee(attendee.id, { attended: !attendee.attended })
                      }
                      disabled={isUpdating}
                    >
                      {attendee.attended ? (
                        <>
                          <Check className="h-3 w-3" />
                          Aanwezig
                        </>
                      ) : (
                        <>
                          <X className="h-3 w-3" />
                          Afwezig
                        </>
                      )}
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                          disabled={isUpdating}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Deelnemer verwijderen?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {getAttendeeName(attendee)} wordt verwijderd van deze
                            vergadering.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuleren</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => removeAttendee(attendee.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Verwijderen
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground capitalize">
                      {attendee.role || "deelnemer"}
                    </span>
                    <span
                      className={`text-xs ${
                        attendee.attended
                          ? "text-green-600 dark:text-green-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {attendee.attended ? "✓ Aanwezig" : "✗ Afwezig"}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {isEditMode && (
          <Popover open={isAddOpen} onOpenChange={setIsAddOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="mt-3 w-full">
                <Plus className="h-4 w-4 mr-2" />
                Deelnemer toevoegen
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-4">
                <h4 className="font-medium">Deelnemer toevoegen</h4>

                <RadioGroup
                  value={attendeeType}
                  onValueChange={(v) => setAttendeeType(v as "internal" | "external")}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="internal" id="internal" />
                    <Label htmlFor="internal" className="text-sm cursor-pointer">
                      Organisatielid
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="external" id="external" />
                    <Label htmlFor="external" className="text-sm cursor-pointer">
                      Externe
                    </Label>
                  </div>
                </RadioGroup>

                {attendeeType === "internal" ? (
                  <div className="space-y-2">
                    <Label className="text-sm">Selecteer medewerker</Label>
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Kies een medewerker..." />
                      </SelectTrigger>
                      <SelectContent>
                        {isLoadingMembers ? (
                          <SelectItem value="loading" disabled>
                            Laden...
                          </SelectItem>
                        ) : availableMembers.length === 0 ? (
                          <SelectItem value="none" disabled>
                            Geen beschikbare medewerkers
                          </SelectItem>
                        ) : (
                          availableMembers.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-sm">Naam *</Label>
                      <Input
                        placeholder="Naam van externe deelnemer"
                        value={externalName}
                        onChange={(e) => setExternalName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Email (optioneel)</Label>
                      <Input
                        type="email"
                        placeholder="email@voorbeeld.nl"
                        value={externalEmail}
                        onChange={(e) => setExternalEmail(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm">Rol</Label>
                  <Select
                    value={selectedRole}
                    onValueChange={(v) => setSelectedRole(v as AttendeeRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={handleCancel}>
                    Annuleren
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAdd}
                    disabled={
                      isUpdating ||
                      (attendeeType === "internal" && !selectedUserId) ||
                      (attendeeType === "external" && !externalName.trim())
                    }
                  >
                    {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Toevoegen
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </Card>
    </div>
  );
}
