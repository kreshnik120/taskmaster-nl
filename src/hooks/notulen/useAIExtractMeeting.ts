import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ExtractedMeetingData {
  title: string | null;
  meeting_date: string | null;
  meeting_time: string | null;
  location: string | null;
  meeting_type: 'team' | 'board' | 'project' | 'klant' | 'overig' | null;
  participants: Array<{
    name: string;
    role: string | null;
    present: boolean;
  }>;
  agenda_items: Array<{
    item: string;
    discussed: boolean;
  }>;
  decisions: Array<{
    decision: string;
    owner: string | null;
    deadline: string | null;
  }>;
  action_items: Array<{
    action: string;
    assignee: string | null;
    deadline: string | null;
  }>;
  notes: string | null;
  summary: string | null;
  confidence_scores: {
    title: number;
    meeting_date: number;
    meeting_time: number;
    location: number;
    meeting_type: number;
    participants: number;
    agenda_items: number;
    decisions: number;
    action_items: number;
    overall: number;
  };
}

interface UseAIExtractMeetingReturn {
  extractFromText: (text: string) => Promise<ExtractedMeetingData | null>;
  extractFromFile: (file: File) => Promise<ExtractedMeetingData | null>;
  isExtracting: boolean;
  extractedData: ExtractedMeetingData | null;
  clearExtractedData: () => void;
  error: string | null;
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Kon bestand niet lezen'));
    reader.readAsText(file);
  });
}

export function useAIExtractMeeting(): UseAIExtractMeetingReturn {
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedMeetingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const extractFromText = useCallback(async (text: string): Promise<ExtractedMeetingData | null> => {
    setIsExtracting(true);
    setError(null);
    
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-extract-meeting-minute', {
        body: { documentText: text }
      });

      if (invokeError) throw invokeError;

      if (data?.error) {
        setError(data.error);
        toast.error(data.error);
        return null;
      }

      setExtractedData(data?.data || null);
      return data?.data || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extractie mislukt';
      setError(message);
      toast.error("Kon document niet analyseren");
      return null;
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const extractFromFile = useCallback(async (file: File): Promise<ExtractedMeetingData | null> => {
    // Only support text-based files for now
    const allowedTypes = ['text/plain', 'text/markdown'];
    const allowedExtensions = ['.txt', '.md'];
    
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    const isAllowed = allowedTypes.includes(file.type) || allowedExtensions.includes(ext);
    
    if (!isAllowed) {
      toast.error("Alleen .txt en .md bestanden worden ondersteund voor AI extractie");
      return null;
    }

    try {
      const text = await readFileAsText(file);
      return await extractFromText(text);
    } catch (err) {
      toast.error("Kon bestand niet lezen");
      return null;
    }
  }, [extractFromText]);

  const clearExtractedData = useCallback(() => {
    setExtractedData(null);
    setError(null);
  }, []);

  return {
    extractFromText,
    extractFromFile,
    isExtracting,
    extractedData,
    clearExtractedData,
    error
  };
}
