import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCreateMeetingMinute } from "@/hooks/useCreateMeetingMinute";

interface CreateMeetingMinuteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (minuteId: string) => void;
}

const MEETING_TYPES = [
  { value: "team", label: "Teamoverleg" },
  { value: "board", label: "Bestuursvergadering" },
  { value: "project", label: "Projectvergadering" },
  { value: "klant", label: "Klantvergadering" },
  { value: "overig", label: "Overig" },
] as const;

const createMeetingMinuteSchema = z.object({
  title: z
    .string()
    .min(1, "Titel is verplicht")
    .max(200, "Titel mag maximaal 200 karakters zijn"),
  meeting_type: z.enum(["team", "board", "project", "klant", "overig"], {
    required_error: "Selecteer een type vergadering",
  }),
  start_at: z.date({
    required_error: "Selecteer een datum",
  }),
  start_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Gebruik formaat HH:MM")
    .default("14:00"),
  location: z.string().max(200).optional(),
  meeting_link: z
    .string()
    .url("Ongeldige URL")
    .optional()
    .or(z.literal("")),
});

type CreateMeetingMinuteFormData = z.infer<typeof createMeetingMinuteSchema>;

export function CreateMeetingMinuteDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateMeetingMinuteDialogProps) {
  const { createMeetingMinute, isCreating } = useCreateMeetingMinute();

  const form = useForm<CreateMeetingMinuteFormData>({
    resolver: zodResolver(createMeetingMinuteSchema),
    defaultValues: {
      title: "",
      meeting_type: undefined,
      start_at: new Date(),
      start_time: "14:00",
      location: "",
      meeting_link: "",
    },
  });

  const onSubmit = async (values: CreateMeetingMinuteFormData) => {
    try {
      // Combineer datum en tijd
      const [hours, minutes] = values.start_time.split(":").map(Number);
      const startDateTime = new Date(values.start_at);
      startDateTime.setHours(hours, minutes, 0, 0);

      const minuteId = await createMeetingMinute({
        title: values.title,
        meeting_type: values.meeting_type,
        start_at: startDateTime,
        location: values.location || undefined,
        meeting_link: values.meeting_link || undefined,
      });

      toast.success("Notulen aangemaakt", {
        description: `"${values.title}" is toegevoegd als concept`,
      });

      onOpenChange(false);
      form.reset();
      onSuccess?.(minuteId);
    } catch (error: any) {
      toast.error("Kon notulen niet aanmaken", {
        description: error.message,
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nieuwe vergadernotulen</DialogTitle>
          <DialogDescription>
            Maak notulen aan voor een nieuwe vergadering. Na aanmaken kun je
            agenda, beslissingen en deelnemers toevoegen.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titel *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Bijv. Teamoverleg Q1 2026"
                      {...field}
                      disabled={isCreating}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Meeting Type */}
            <FormField
              control={form.control}
              name="meeting_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type vergadering *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={isCreating}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecteer type..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MEETING_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Date and Time row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Date */}
              <FormField
                control={form.control}
                name="start_at"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Datum *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isCreating}
                          >
                            {field.value ? (
                              format(field.value, "d MMM yyyy", { locale: nl })
                            ) : (
                              <span>Kies datum</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          locale={nl}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Time */}
              <FormField
                control={form.control}
                name="start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tijd *</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        {...field}
                        disabled={isCreating}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Location */}
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Locatie (optioneel)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Bijv. Kantoor Amsterdam"
                      {...field}
                      disabled={isCreating}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Meeting Link */}
            <FormField
              control={form.control}
              name="meeting_link"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meeting link (optioneel)</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="https://meet.google.com/..."
                      {...field}
                      disabled={isCreating}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isCreating}
              >
                Annuleren
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Aanmaken
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
