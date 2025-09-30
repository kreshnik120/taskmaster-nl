import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const taskSchema = z.object({
  title: z.string().min(1, "Titel is verplicht").max(200, "Titel mag maximaal 200 karakters zijn"),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  assignee_id: z.string().optional(),
  start_at: z.string().optional(),
  due_at: z.string().optional(),
  next_action: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  taskId?: string;
  columnId?: string;
}

interface Profile {
  id: string;
  name: string | null;
}

export function TaskDialog({ open, onOpenChange, onSuccess, taskId, columnId }: TaskDialogProps) {
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [defaultOrgId, setDefaultOrgId] = useState<string | null>(null);

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "MEDIUM",
      assignee_id: "",
      start_at: "",
      due_at: "",
      next_action: "",
    },
  });

  useEffect(() => {
    if (open) {
      loadProfiles();
      loadDefaultOrg();
      if (taskId) {
        loadTask();
      } else {
        form.reset({
          title: "",
          description: "",
          priority: "MEDIUM",
          assignee_id: "",
          start_at: "",
          due_at: "",
          next_action: "",
        });
      }
    }
  }, [open, taskId]);

  const loadProfiles = async () => {
    const { data } = await supabase.from("profiles").select("id, name");
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
      form.reset({
        title: data.title,
        description: data.description || "",
        priority: data.priority,
        assignee_id: data.assignee_id || "",
        start_at: data.start_at ? data.start_at.slice(0, 16) : "",
        due_at: data.due_at ? data.due_at.slice(0, 16) : "",
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
      const taskData = {
        title: values.title,
        description: values.description || null,
        priority: values.priority,
        assignee_id: values.assignee_id || null,
        start_at: values.start_at || null,
        due_at: values.due_at || null,
        next_action: values.next_action || null,
        org_id: defaultOrgId,
        column_id: columnId || null,
      };

      if (taskId) {
        // Update existing task
        const { error } = await supabase.from("tasks").update(taskData).eq("id", taskId);
        if (error) throw error;
        toast.success("Taak bijgewerkt");
      } else {
        // Create new task
        const { error } = await supabase.from("tasks").insert(taskData);
        if (error) throw error;
        toast.success("Taak aangemaakt");
      }

      onSuccess();
      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast.error("Fout: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{taskId ? "Taak bewerken" : "Nieuwe taak"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titel *</FormLabel>
                  <FormControl>
                    <Input placeholder="Taak titel" {...field} />
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
                    <Textarea placeholder="Beschrijving van de taak" rows={4} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioriteit</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="LOW">Laag</SelectItem>
                        <SelectItem value="MEDIUM">Gemiddeld</SelectItem>
                        <SelectItem value="HIGH">Hoog</SelectItem>
                        <SelectItem value="CRITICAL">Kritiek</SelectItem>
                      </SelectContent>
                    </Select>
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
                        <SelectItem value="">Niet toegewezen</SelectItem>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start datum/tijd</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="due_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deadline</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
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
                    <Input placeholder="Wat is de volgende actie?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Annuleren
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {taskId ? "Bijwerken" : "Aanmaken"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
