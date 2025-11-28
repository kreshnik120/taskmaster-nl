import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, addHours, addDays, addWeeks, setHours, setMinutes } from "date-fns";
import { Calendar as CalendarIcon, Bell, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const reminderSchema = z.object({
  title: z.string().optional(),
  at: z.date({
    required_error: "Selecteer een datum en tijd voor de herinnering",
  }),
  channel: z.enum(["IN_APP", "EMAIL"]),
  repeat_interval: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]),
});

type ReminderFormData = z.infer<typeof reminderSchema>;

interface ReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId?: string;
  subtaskId?: string;
  onSuccess: () => void;
}

export function ReminderDialog({
  open,
  onOpenChange,
  taskId,
  subtaskId,
  onSuccess,
}: ReminderDialogProps) {
  const [loading, setLoading] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const { toast } = useToast();

  const form = useForm<ReminderFormData>({
    resolver: zodResolver(reminderSchema),
    defaultValues: {
      channel: "IN_APP",
      repeat_interval: "NONE",
    },
  });

  const presets = [
    {
      label: "Over 1 uur",
      icon: Zap,
      getDate: () => addHours(new Date(), 1),
    },
    {
      label: "Morgen 9:00",
      icon: Bell,
      getDate: () => setMinutes(setHours(addDays(new Date(), 1), 9), 0),
    },
    {
      label: "Volgende week",
      icon: CalendarIcon,
      getDate: () => setMinutes(setHours(addWeeks(new Date(), 1), 9), 0),
    },
  ];

  const handleQuickPreset = async (date: Date) => {
    if (!taskId && !subtaskId) {
      toast({
        title: "Fout",
        description: "Geen taak of subtaak geselecteerd",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from("reminders").insert({
        task_id: taskId || null,
        subtask_id: subtaskId || null,
        title: null,
        at: date.toISOString(),
        channel: "IN_APP",
        repeat_interval: "NONE",
      });

      if (error) throw error;

      toast({
        title: "Herinnering toegevoegd",
        description: `Je ontvangt een herinnering op ${format(date, "PPP 'om' HH:mm")}`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating reminder:", error);
      toast({
        title: "Fout",
        description: "Kon herinnering niet aanmaken",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: ReminderFormData) => {
    if (!taskId && !subtaskId) {
      toast({
        title: "Fout",
        description: "Geen taak of subtaak geselecteerd",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from("reminders").insert({
        task_id: taskId || null,
        subtask_id: subtaskId || null,
        title: data.title || null,
        at: data.at.toISOString(),
        channel: data.channel,
        repeat_interval: data.repeat_interval,
      });

      if (error) throw error;

      toast({
        title: "Herinnering toegevoegd",
        description: `Je ontvangt een herinnering op ${format(data.at, "PPP 'om' HH:mm")}`,
      });

      form.reset();
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating reminder:", error);
      toast({
        title: "Fout",
        description: "Kon herinnering niet aanmaken",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Herinnering toevoegen
          </DialogTitle>
        </DialogHeader>

        {!showCustom ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Snelle herinnering instellen
            </p>
            <div className="grid grid-cols-1 gap-2">
              {presets.map((preset) => {
                const Icon = preset.icon;
                return (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="outline"
                    className="justify-start h-auto p-4 hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => handleQuickPreset(preset.getDate())}
                    disabled={loading}
                  >
                    <Icon className="h-4 w-4 mr-3" />
                    <div className="text-left">
                      <div className="font-medium">{preset.label}</div>
                      <div className="text-xs opacity-70">
                        {format(preset.getDate(), "PPP 'om' HH:mm")}
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setShowCustom(true)}
            >
              Aangepaste tijd kiezen...
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Aangepaste titel (optioneel)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Bijvoorbeeld: Check voortgang..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="at"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Datum en tijd</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP 'om' HH:mm")
                          ) : (
                            <span>Kies datum en tijd</span>
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
                        disabled={(date) => date < new Date()}
                        initialFocus
                        className="pointer-events-auto"
                      />
                      <div className="p-3 border-t">
                        <Input
                          type="time"
                          value={
                            field.value
                              ? format(field.value, "HH:mm")
                              : "09:00"
                          }
                          onChange={(e) => {
                            const [hours, minutes] = e.target.value.split(":");
                            const newDate = field.value || new Date();
                            newDate.setHours(parseInt(hours));
                            newDate.setMinutes(parseInt(minutes));
                            field.onChange(newDate);
                          }}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="channel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Herinnering via</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecteer kanaal" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="IN_APP">In de app</SelectItem>
                      <SelectItem value="EMAIL">E-mail</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="repeat_interval"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Herhaling</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecteer herhaling" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="NONE">Geen herhaling</SelectItem>
                      <SelectItem value="DAILY">Dagelijks</SelectItem>
                      <SelectItem value="WEEKLY">Wekelijks</SelectItem>
                      <SelectItem value="MONTHLY">Maandelijks</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCustom(false)}
                >
                  Terug
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Bezig..." : "Toevoegen"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
