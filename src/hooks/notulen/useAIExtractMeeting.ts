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
    // Fase 7C: Classificatie velden voor Notulen Assistent
    classification?: 'TAAK' | 'IDEE' | 'INFORMATIE';
    urgency?: 'critical' | 'high' | 'medium' | 'low';
    source_quote?: string;
    confidence?: number; // 0.0 - 1.0
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

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Extract base64 part from data URL (format: "data:mime;base64,CONTENT")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Kon bestand niet lezen'));
    reader.readAsDataURL(file);
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
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    const isTextFile = file.type === 'text/plain' || file.type === 'text/markdown' || 
                       ext === '.txt' || ext === '.md';
    const isPdfOrWord = file.type === 'application/pdf' || 
                        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                        file.type === 'application/msword' ||
                        ext === '.pdf' || ext === '.doc' || ext === '.docx';
    
    if (!isTextFile && !isPdfOrWord) {
      toast.error("Alleen PDF, Word (.docx, .doc) en tekst (.txt, .md) worden ondersteund");
      return null;
    }

    setIsExtracting(true);
    setError(null);

    try {
      // Voor tekst bestanden: lees als tekst en stuur documentText
      if (isTextFile) {
        const text = await readFileAsText(file);
        setIsExtracting(false);
        return await extractFromText(text);
      }
      
      // Voor PDF/Word: encode als base64 en stuur fileContent + mimeType
      const base64Content = await fileToBase64(file);
      const mimeType = file.type || (ext === '.pdf' ? 'application/pdf' : 
                       ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                       'application/msword');
      
      const { data, error: invokeError } = await supabase.functions.invoke('ai-extract-meeting-minute', {
        body: { fileContent: base64Content, mimeType }
      });

      if (invokeError) {
        console.error('Edge function invoke error:', invokeError);
        throw new Error(invokeError.message || 'Fout bij verbinding met AI service');
      }

      // Check voor specifieke extraction errors
      if (data?.error) {
        console.error('Extraction error from edge function:', data.error);
        setError(data.error);
        toast.error("Document verwerking mislukt", {
          description: data.error,
          duration: 6000,
        });
        return null;
      }

      if (!data?.data) {
        console.error('No data returned from edge function');
        setError('Geen data ontvangen van AI service');
        toast.error("Kon document niet analyseren");
        return null;
      }

      console.log(`✅ Extraction successful via ${data.extraction_method || 'unknown'}`);
      setExtractedData(data.data);
      return data.data;
    } catch (err) {
      console.error('AI extraction error:', err);
      const message = err instanceof Error ? err.message : 'Extractie mislukt';
      setError(message);
      toast.error("Document verwerking mislukt", {
        description: message.length > 100 
          ? "Probeer een ander bestand of kopieer de tekst naar .txt" 
          : message,
        duration: 5000,
      });
      return null;
    } finally {
      setIsExtracting(false);
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
