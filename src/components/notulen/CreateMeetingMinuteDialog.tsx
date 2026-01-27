import React, { useState, useRef } from "react";
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
import { Loader2, CalendarIcon, Paperclip, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCreateMeetingMinute } from "@/hooks/useCreateMeetingMinute";
import { useUploadAttachment, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "@/hooks/notulen/useUploadAttachment";
import { formatFileSize } from "@/lib/fileHelpers";
import { supabase } from "@/integrations/supabase/client";
import { useAIExtractMeeting } from "@/hooks/notulen/useAIExtractMeeting";
import { ExtractedDataPreview } from "./ExtractedDataPreview";

interface CreateMeetingMinuteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (minuteId: string) => void;
  defaultTitle?: string;
  linkedTaskId?: string;
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
  defaultTitle,
  linkedTaskId,
}: CreateMeetingMinuteDialogProps) {
  const { createMeetingMinute, isCreating } = useCreateMeetingMinute();
  const { uploadMultiple, isUploading } = useUploadAttachment();
  const { extractFromFile, isExtracting, extractedData, clearExtractedData } = useAIExtractMeeting();
  
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [extractedContent, setExtractedContent] = useState<{
    agenda_items?: Array<{ item: string; discussed: boolean }>;
    decisions?: Array<{ decision: string; owner?: string | null; deadline?: string | null }>;
    content?: string;
    participants?: Array<{ name: string; role?: string | null; present?: boolean }>;
  } | null>(null);
  const aiFileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<CreateMeetingMinuteFormData>({
    resolver: zodResolver(createMeetingMinuteSchema),
    defaultValues: {
      title: defaultTitle || "",
      meeting_type: undefined,
      start_at: new Date(),
      start_time: "14:00",
      location: "",
      meeting_link: "",
    },
  });

  // Reset form with defaultTitle when dialog opens
  React.useEffect(() => {
    if (open) {
      form.reset({
        title: defaultTitle || "",
        meeting_type: undefined,
        start_at: new Date(),
        start_time: "14:00",
        location: "",
        meeting_link: "",
      });
      setPendingFiles([]);
      clearExtractedData();
      setExtractedContent(null);
    }
  }, [open, defaultTitle, form, clearExtractedData]);

  // File selection handlers
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: Bestand te groot (max 10MB)`);
        return false;
      }
      if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
        toast.error(`${file.name}: Bestandstype niet toegestaan`);
        return false;
      }
      return true;
    });
    setPendingFiles(prev => [...prev, ...validFiles].slice(0, 5));
    e.target.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  // AI Import handlers
  const handleAIImportClick = () => {
    aiFileInputRef.current?.click();
  };

  const handleAIImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await extractFromFile(file);
    }
    e.target.value = '';
  };

  const applyExtractedData = () => {
    if (!extractedData) return;
    
    // Form velden toepassen
    if (extractedData.title) form.setValue('title', extractedData.title);
    if (extractedData.meeting_type) form.setValue('meeting_type', extractedData.meeting_type);
    if (extractedData.meeting_date) {
      form.setValue('start_at', new Date(extractedData.meeting_date));
    }
    if (extractedData.meeting_time) {
      form.setValue('start_time', extractedData.meeting_time);
    }
    if (extractedData.location) form.setValue('location', extractedData.location);
    
    // Fallback: als geen decisions, map action_items naar decisions format
    const decisionsToUse = extractedData.decisions && extractedData.decisions.length > 0 
      ? extractedData.decisions 
      : (extractedData.action_items || []).map(a => ({
          decision: a.action,
          owner: a.assignee || null,
          deadline: a.deadline || null
        }));
    
    // Bewaar extracted content voor later gebruik bij submit
    setExtractedContent({
      agenda_items: extractedData.agenda_items,
      decisions: decisionsToUse,
      content: [extractedData.notes, extractedData.summary].filter(Boolean).join('\n\n') || undefined,
      participants: extractedData.participants,
    });
    
    clearExtractedData();
    toast.success("Gegevens toegepast", {
      description: extractedData.agenda_items?.length 
        ? `${extractedData.agenda_items.length} agenda items en ${decisionsToUse.length} beslissingen/acties`
        : undefined
    });
  };

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
        linkedTaskId: linkedTaskId,
        // Pass extracted content
        agenda_items: extractedContent?.agenda_items,
        decisions: extractedContent?.decisions,
        content: extractedContent?.content,
        participants: extractedContent?.participants,
      });

      // Upload pending files after successful creation
      if (pendingFiles.length > 0) {
        const { data: userOrg } = await supabase
          .from('user_organizations')
          .select('org_id')
          .limit(1)
          .maybeSingle();
        
        if (userOrg?.org_id) {
          await uploadMultiple(minuteId, userOrg.org_id, pendingFiles);
        }
      }

      toast.success("Notulen aangemaakt", {
        description: `"${values.title}" is toegevoegd als concept`,
      });

      onOpenChange(false);
      form.reset();
      setPendingFiles([]);
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
      setPendingFiles([]);
      clearExtractedData();
      setExtractedContent(null);
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

        {/* AI Import section */}
        <div className="flex flex-col gap-1 py-2 border-b">
          <div className="flex items-center gap-2">
            <input
              ref={aiFileInputRef}
              type="file"
              accept=".txt,.md,.pdf,.doc,.docx"
              onChange={handleAIImportFile}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAIImportClick}
              disabled={isCreating || isExtracting || isUploading}
            >
              {isExtracting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {isExtracting ? "Analyseren..." : "Importeer van bestand"}
            </Button>
            <span className="text-xs text-muted-foreground">
              (PDF, Word, .txt, .md)
            </span>
          </div>
          <p className="text-xs text-muted-foreground/70 italic">
            Tip: Bij problemen met PDF, kopieer de tekst naar een .txt bestand
          </p>
        </div>

        {/* Show extracted data preview */}
        {extractedData && (
          <ExtractedDataPreview
            data={extractedData}
            onApply={applyExtractedData}
            onCancel={clearExtractedData}
          />
        )}

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

            {/* Bijlagen Sectie */}
            <div className="space-y-2">
              <FormLabel>Bijlagen (optioneel)</FormLabel>
              <div className="space-y-2">
                {/* File input trigger */}
                <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Bestanden toevoegen (PDF, Word, Excel, afbeeldingen)
                  </span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.xls,.xlsx"
                    onChange={handleFilesSelected}
                    className="hidden"
                    disabled={isCreating || isUploading}
                  />
                </label>
                
                {/* Pending files list */}
                {pendingFiles.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {pendingFiles.length} bestand(en) geselecteerd
                    </p>
                    {pendingFiles.map((file, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                        <span className="truncate flex-1">{file.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatFileSize(file.size)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 shrink-0"
                          onClick={() => handleRemoveFile(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isCreating || isUploading}
              >
                Annuleren
              </Button>
              <Button type="submit" disabled={isCreating || isUploading}>
                {(isCreating || isUploading) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isUploading ? "Uploaden..." : "Aanmaken"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
