import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ReminderDialog } from "./ReminderDialog";
import { ReminderList } from "./ReminderList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2, ArrowDown, Minus, ArrowUp, AlertCircle, CalendarIcon, Paperclip } from "lucide-react";
import { SubtaskManager } from "./SubtaskManager";
import { TaskAttachmentUpload, uploadTaskAttachments } from "./TaskAttachmentUpload";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { cn } from "@/lib/utils";

const taskSchema = z.object({
  title: z.string().min(1, "Titel is verplicht").max(200, "Titel mag maximaal 200 karakters zijn"),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  assignee_id: z.string().optional(),
  start_at: z.string().optional(),
  start_time: z.string().optional(),
  due_at: z.string().optional(),
  due_time: z.string().optional(),
  next_action: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  taskId?: string;
  columnId?: string;
  defaultStartDate?: Date;
  defaultDueDate?: Date;
}

interface Profile {
  id: string;
  name: string | null;
  email: string | null;
}

const PRIORITIES = [
  { value: "LOW" as const, label: "Laag", icon: ArrowDown, color: "text-muted-foreground" },
  { value: "MEDIUM" as const, label: "Gemiddeld", icon: Minus, color: "text-blue-600" },
  { value: "HIGH" as const, label: "Hoog", icon: ArrowUp, color: "text-orange-600" },
  { value: "CRITICAL" as const, label: "Kritiek", icon: AlertCircle, color: "text-red-600" },
];

interface Attachment {
  id: string;
  name: string;
  url: string;
  created_at: string;
}

export function TaskDialog({ open, onOpenChange, onSuccess, taskId, columnId, defaultStartDate, defaultDueDate }: TaskDialogProps) {
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [defaultOrgId, setDefaultOrgId] = useState<string | null>(null);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [reminderKey, setReminderKey] = useState(0);
  const [currentStep, setCurrentStep] = useState(1);
  const [startDate, setStartDate] = useState<Date>();
  const [dueDate, setDueDate] = useState<Date>();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "MEDIUM",
      assignee_id: "unassigned",
      start_at: "",
      start_time: "09:00",
      due_at: "",
      due_time: "17:00",
      next_action: "",
    },
  });

  useEffect(() => {
    if (open) {
      loadProfiles();
      loadDefaultOrg();
      setPendingFiles([]);
      if (taskId) {
        loadTask();
        loadExistingAttachments();
      } else {
        const startDateValue = defaultStartDate ? format(defaultStartDate, 'yyyy-MM-dd') : "";
        const dueDateValue = defaultDueDate ? format(defaultDueDate, 'yyyy-MM-dd') : "";
        
        form.reset({
          title: "",
          description: "",
          priority: "MEDIUM",
          assignee_id: "unassigned",
          start_at: startDateValue,
          start_time: "09:00",
          due_at: dueDateValue,
          due_time: "17:00",
          next_action: "",
        });
        setCurrentStep(1);
        setStartDate(defaultStartDate);
        setDueDate(defaultDueDate);
        setExistingAttachments([]);
      }
    }
  }, [open, taskId, defaultStartDate, defaultDueDate]);

  const loadExistingAttachments = async () => {
    if (!taskId) return;
    const { data } = await supabase
      .from("attachments")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });
    if (data) setExistingAttachments(data);
  };

  const loadProfiles = async () => {
    const { data } = await supabase.from("profiles").select("id, name, email");
    if (data) setProfiles(data);
  };

  const loadDefaultOrg = async () => {
    const { data, error } = await supabase
      .from("user_organizations")
      .select("org_id")
      .limit(1)
      .maybeSingle();
    
    if (error) {
      console.error("Error loading organization:", error);
      toast.error("Fout bij laden van organisatie");
      return;
    }
    
    if (data) {
      setDefaultOrgId(data.org_id);
    } else {
      toast.error("Geen organisatie gevonden. Neem contact op met de beheerder.");
    }
  };

  const loadTask = async () => {
    if (!taskId) return;
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .single();

    if (error) {
      toast.error("Fout bij laden van taak");
      return;
    }

    if (data) {
      // Parse start_at and due_at
      if (data.start_at) {
        const startDateTime = new Date(data.start_at);
        setStartDate(startDateTime);
        form.setValue("start_at", format(startDateTime, "yyyy-MM-dd"));
        form.setValue("start_time", format(startDateTime, "HH:mm"));
      }
      
      if (data.due_at) {
        const dueDateTime = new Date(data.due_at);
        setDueDate(dueDateTime);
        form.setValue("due_at", format(dueDateTime, "yyyy-MM-dd"));
        form.setValue("due_time", format(dueDateTime, "HH:mm"));
      }

      form.reset({
        title: data.title,
        description: data.description || "",
        priority: data.priority,
        assignee_id: data.assignee_id || "unassigned",
        start_at: data.start_at ? format(new Date(data.start_at), "yyyy-MM-dd") : "",
        start_time: data.start_at ? format(new Date(data.start_at), "HH:mm") : "09:00",
        due_at: data.due_at ? format(new Date(data.due_at), "yyyy-MM-dd") : "",
        due_time: data.due_at ? format(new Date(data.due_at), "HH:mm") : "17:00",
        next_action: data.next_action || "",
      });
    }
  };

  const onSubmit = async (values: TaskFormData) => {
    if (!defaultOrgId) {
      toast.error("Geen organisatie gevonden");
      return;
    }

    setLoading(true);
    try {
      // Haal huidige gebruiker op voor auto-assign/accept logica
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      // Combine date and time for start_at and due_at
      let startAtISO: string | null = null;
      if (values.start_at) {
        const [hours, minutes] = (values.start_time || "09:00").split(":");
        const startDateTime = new Date(values.start_at);
        startDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        startAtISO = startDateTime.toISOString();
      }

      let dueAtISO: string | null = null;
      if (values.due_at) {
        const [hours, minutes] = (values.due_time || "17:00").split(":");
        const dueDateTime = new Date(values.due_at);
        dueDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        dueAtISO = dueDateTime.toISOString();
      }

      // Default to Backlog column if no columnId provided
      const defaultBacklogColumnId = '770e8400-e29b-41d4-a716-446655440001';
      
      // Bepaal assignee: gebruik geselecteerde waarde of default naar huidige user bij nieuwe taken
      const selectedAssigneeId = values.assignee_id && values.assignee_id !== "unassigned" 
        ? values.assignee_id 
        : null;
      
      // Voor nieuwe taken: auto-assign aan huidige user als geen assignee geselecteerd
      const assigneeId = taskId 
        ? selectedAssigneeId  // Bij update: gebruik geselecteerde waarde
        : (selectedAssigneeId || currentUser?.id || null);  // Bij nieuw: default naar huidige user
      
      // Auto-accept logica: accepteer automatisch als aan jezelf toegewezen
      const isAutoAccept = !taskId && assigneeId === currentUser?.id;
      
      // Bepaal auto-accept velden
      const acceptedBy = (!taskId && isAutoAccept) ? currentUser?.id : 
                         (!taskId && assigneeId && assigneeId !== currentUser?.id) ? null : 
                         undefined;
      const acceptedAt = (!taskId && isAutoAccept) ? new Date().toISOString() : 
                         (!taskId && assigneeId && assigneeId !== currentUser?.id) ? null : 
                         undefined;
      
      let savedTaskId = taskId;
      
      if (taskId) {
        // Update existing task
        const { error } = await supabase.from("tasks").update({
          title: values.title,
          description: values.description || null,
          priority: values.priority,
          assignee_id: assigneeId,
          start_at: startAtISO,
          due_at: dueAtISO,
          next_action: values.next_action || null,
          org_id: defaultOrgId,
          column_id: columnId || defaultBacklogColumnId,
        }).eq("id", taskId);
        if (error) throw error;
      } else {
        // Create new task met auto-assign en auto-accept
        const insertData: Database['public']['Tables']['tasks']['Insert'] = {
          title: values.title,
          description: values.description || null,
          priority: values.priority,
          assignee_id: assigneeId,
          start_at: startAtISO,
          due_at: dueAtISO,
          next_action: values.next_action || null,
          org_id: defaultOrgId,
          column_id: columnId || defaultBacklogColumnId,
          accepted_by: acceptedBy ?? null,
          accepted_at: acceptedAt ?? null,
        };
        
        const { data, error } = await supabase.from("tasks").insert(insertData).select('id').single();
        if (error) throw error;
        savedTaskId = data.id;
      }

      // Upload pending files if any
      if (pendingFiles.length > 0 && savedTaskId) {
        const result = await uploadTaskAttachments(savedTaskId, pendingFiles);
        
        if (result.success > 0) {
          toast.success(
            `📎 ${result.success} bijlage${result.success > 1 ? 'n' : ''} succesvol geüpload`,
            { description: result.uploadedFiles.join(', ') }
          );
        }
        
        if (result.failed > 0) {
          toast.warning(`${result.failed} bestand(en) konden niet worden geüpload`);
        }
      }

      toast.success(taskId ? "Taak bijgewerkt" : "Taak aangemaakt");
      onSuccess();
      onOpenChange(false);
      form.reset();
      setCurrentStep(1);
      setStartDate(undefined);
      setDueDate(undefined);
      setPendingFiles([]);
      setExistingAttachments([]);
    } catch (error: any) {
      console.error('[TaskDialog] Create/update task error:', error);
      toast.error("Fout bij opslaan taak", { 
        description: error?.message || 'Onbekende fout - probeer de pagina te herladen' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (currentStep === 1 && !form.watch("title")) {
      toast.error("Vul de titel in");
      return;
    }
    setCurrentStep(prev => Math.min(taskId ? 3 : 2, prev + 1));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(1, prev - 1));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{taskId ? "Taak bewerken" : "Nieuwe taak"}</DialogTitle>
          <DialogDescription>
            {taskId ? "Wijzig de details van deze taak." : "Maak een nieuwe taak aan met titel, beschrijving en planning."}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Indicator */}
        {!taskId && (
          <div className="flex items-center justify-between mb-6">
            {[1, 2].map((step) => (
              <div key={step} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all ${
                  step < currentStep 
                    ? "bg-primary border-primary text-primary-foreground" 
                    : step === currentStep 
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/30 text-muted-foreground"
                }`}>
                  {step < currentStep ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-semibold">{step}</span>
                  )}
                </div>
                {step < 2 && (
                  <div className={`flex-1 h-0.5 mx-2 transition-all ${
                    step < currentStep ? "bg-primary" : "bg-muted-foreground/30"
                  }`} />
                )}
              </div>
            ))}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Step 1: Basis informatie */}
            {currentStep === 1 && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="text-sm font-semibold text-foreground">Basis informatie</h3>
                
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Titel <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Bijv. Website ontwerp afmaken" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Beschrijving</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Geef een uitgebreide beschrijving van wat er gedaan moet worden..." rows={5} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Step 2: Planning & Toewijzing */}
            {currentStep === 2 && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="text-sm font-semibold text-foreground">Planning & Toewijzing</h3>
                
                {/* Priority Badges */}
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioriteit</FormLabel>
                      <FormControl>
                        <div className="flex flex-wrap gap-2">
                          {PRIORITIES.map((priority) => {
                            const Icon = priority.icon;
                            const isSelected = field.value === priority.value;
                            return (
                              <Badge
                                key={priority.value}
                                variant="outline"
                                className={cn(
                                  "cursor-pointer transition-all px-3 py-1.5",
                                  isSelected 
                                    ? "bg-muted border-foreground" 
                                    : "hover:bg-muted/50"
                                )}
                                onClick={() => field.onChange(priority.value)}
                              >
                                <Icon className={cn("h-4 w-4 mr-1.5", priority.color)} />
                                {priority.label}
                              </Badge>
                            );
                          })}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="assignee_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Verantwoordelijke</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecteer persoon" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="unassigned">Niet toegewezen</SelectItem>
                          {profiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.name || "Onbekend"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Start Date & Time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="start_at"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Start datum</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !startDate && "text-muted-foreground"
                                )}
                              >
                                {startDate ? format(startDate, "PPP", { locale: nl }) : "Selecteer datum"}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={startDate}
                              onSelect={(date) => {
                                setStartDate(date);
                                field.onChange(date ? format(date, "yyyy-MM-dd") : "");
                              }}
                              initialFocus
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="start_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start tijd</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Due Date & Time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="due_at"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Deadline</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !dueDate && "text-muted-foreground"
                                )}
                              >
                                {dueDate ? format(dueDate, "PPP", { locale: nl }) : "Selecteer datum"}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={dueDate}
                              onSelect={(date) => {
                                setDueDate(date);
                                field.onChange(date ? format(date, "yyyy-MM-dd") : "");
                              }}
                              initialFocus
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="due_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deadline tijd</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="next_action"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Volgende actie</FormLabel>
                      <FormControl>
                        <Input placeholder="Bijv. Contact opnemen met klant, mockup maken..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Bijlagen sectie */}
                <div className="pt-4 border-t space-y-3">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    <FormLabel className="mb-0">Bijlagen</FormLabel>
                    {(pendingFiles.length > 0 || existingAttachments.length > 0) && (
                      <Badge variant="secondary" className="text-xs">
                        {pendingFiles.length + existingAttachments.length}
                      </Badge>
                    )}
                  </div>
                  <TaskAttachmentUpload
                    taskId={taskId}
                    pendingFiles={pendingFiles}
                    onPendingFilesChange={setPendingFiles}
                    existingAttachments={existingAttachments}
                    onAttachmentDeleted={loadExistingAttachments}
                    compact
                  />
                </div>
              </div>
            )}

            {/* Step 3: Subtaken & Herinneringen (alleen bij bewerken) */}
            {taskId && currentStep === 3 && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="text-sm font-semibold text-foreground">Subtaken & Herinneringen</h3>
                
                <SubtaskManager
                  taskId={taskId}
                  profiles={profiles}
                />
                
                <div className="pt-4 border-t">
                  <ReminderList
                    key={reminderKey}
                    taskId={taskId}
                    onAddClick={() => setReminderDialogOpen(true)}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)} 
                disabled={loading}
              >
                Annuleren
              </Button>
              {currentStep > 1 && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={handleBack}
                  disabled={loading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Vorige
                </Button>
              )}
              {currentStep < (taskId ? 3 : 2) ? (
                <Button 
                  type="button" 
                  onClick={handleNext}
                  disabled={loading}
                >
                  Volgende
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {taskId ? "Bijwerken" : "Aanmaken"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      <ReminderDialog
        open={reminderDialogOpen}
        onOpenChange={setReminderDialogOpen}
        taskId={taskId}
        onSuccess={() => {
          setReminderKey((prev) => prev + 1);
        }}
      />
    </Dialog>
  );
}
