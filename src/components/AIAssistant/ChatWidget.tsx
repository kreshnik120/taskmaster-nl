import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Sparkles, Calendar, ListTodo, Clock, RotateCcw, Image as ImageIcon, X as XIcon, GripVertical, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RobotIcon } from './RobotIcon';
import { ChatDatePicker, ChatTimePicker, ChatSelect, ChatButtonGroup } from './InteractiveChatElements';
import { MessageFeedback } from './MessageFeedback';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

interface InteractiveElement {
  type: 'date_picker' | 'time_picker' | 'select' | 'button_group';
  label?: string;
  options?: { value: string; label: string }[];
}

interface ProcessingJob {
  id: string;
  status: string;
  progress_pct: number;
  chunk_index: number;
  total_chunks: number;
  items_processed?: number;
  error_message?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  interactive?: InteractiveElement;
  showInteractive?: boolean;
  image?: string; // Base64 image data
  usedKnowledge?: string[]; // Knowledge IDs used for this response
  messageId?: string; // UUID from chat_messages table for feedback persistence
  isProcessing?: boolean; // Document verwerking actief
  jobIds?: string[]; // Processing job IDs voor realtime tracking
}

const QUICK_ACTIONS = [
  { icon: ListTodo, label: 'Mijn taken vandaag', prompt: 'Wat zijn mijn belangrijkste taken voor vandaag?' },
  { icon: Calendar, label: 'Planning deze week', prompt: 'Geef me een overzicht van mijn planning deze week' },
  { icon: Clock, label: 'Maak nieuwe taak', prompt: 'Help me een nieuwe taak aan te maken' },
];

// Helper functions for conversation session management
const getConversationId = (): string => {
  let conversationId = localStorage.getItem('chat_conversation_id');
  if (!conversationId) {
    conversationId = crypto.randomUUID();
    localStorage.setItem('chat_conversation_id', conversationId);
    console.log('🆕 New conversation started:', conversationId);
  }
  return conversationId;
};

const startNewConversation = (): string => {
  const newConversationId = crypto.randomUUID();
  localStorage.setItem('chat_conversation_id', newConversationId);
  console.log('🔄 Conversation reset:', newConversationId);
  return newConversationId;
};

export const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const [processingJobs, setProcessingJobs] = useState<Record<string, ProcessingJob>>({});
  const [dimensions, setDimensions] = useState(() => ({
    width: parseInt(localStorage.getItem('chatWidth') || '384'),
    height: parseInt(localStorage.getItem('chatHeight') || '600')
  }));
  const [isResizing, setIsResizing] = useState<'width' | 'height' | null>(null);
  const [position, setPosition] = useState(() => ({
    x: parseInt(localStorage.getItem('chatPosX') || `${typeof window !== 'undefined' ? window.innerWidth - 384 - 112 : 800}`),
    y: parseInt(localStorage.getItem('chatPosY') || `${typeof window !== 'undefined' ? window.innerHeight - 600 - 24 : 100}`)
  }));
  const [isDraggingWindow, setIsDraggingWindow] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, windowX: 0, windowY: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef({ width: dimensions.width, height: dimensions.height });
  const { toast } = useToast();

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session?.user);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load conversation history from database
  useEffect(() => {
    const loadConversationHistory = async () => {
      if (!isAuthenticated) return;
      
      const conversationId = getConversationId();
      
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, role, content, metadata')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(20);
      
      if (error) {
        console.error('Error loading conversation history:', error);
        return;
      }
      
      if (data && data.length > 0) {
        console.log(`📚 Loaded ${data.length} messages from history`);
        setMessages(data.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          showInteractive: false,
          messageId: m.id,
          usedKnowledge: Array.isArray((m.metadata as any)?.knowledge_ids_for_feedback) 
            ? (m.metadata as any).knowledge_ids_for_feedback 
            : (Array.isArray((m.metadata as any)?.usedKnowledge) 
              ? (m.metadata as any).usedKnowledge 
              : [])
        })));
        setShowWelcome(false);
      }
    };
    
    loadConversationHistory();
  }, [isAuthenticated]);

  // Sync resizeRef with dimensions state
  useEffect(() => {
    resizeRef.current = { width: dimensions.width, height: dimensions.height };
  }, [dimensions]);

  // Prevent default drag/drop behavior globally
  useEffect(() => {
    const preventDefaults = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('dragover', preventDefaults);
    window.addEventListener('drop', preventDefaults);

    return () => {
      window.removeEventListener('dragover', preventDefaults);
      window.removeEventListener('drop', preventDefaults);
    };
  }, []);

  // ✅ REMOVED: Duplicate history loader that overwrote messageId
  // History is loaded by the first useEffect (lines ~126-164) which properly includes id → messageId

  // Smooth auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
    setShowWelcome(false);
  };

  const handleClearChat = async () => {
    try {
      const oldConversationId = localStorage.getItem('chat_conversation_id');
      
      // 1️⃣ Remove conversation_id EERST (voor nieuwe start)
      localStorage.removeItem('chat_conversation_id');
      console.log('🗑️ Cleared conversation:', oldConversationId);
      
      // 2️⃣ Clear UI state
      setMessages([]);
      setShowWelcome(true);
      setShowResetDialog(false);
      
      // 3️⃣ Genereer nieuwe ID (wordt automatisch gedaan bij volgende message via getConversationId)
      
      toast({
        description: '✅ Chat gewist - nieuwe conversatie gestart',
      });
    } catch (error) {
      console.error('Error clearing chat:', error);
      toast({
        title: "Fout",
        description: "Kon chat niet wissen. Probeer het opnieuw.",
        variant: "destructive",
      });
    }
  };

  const handleInteractiveSelection = (type: string, value: string | Date) => {
    let formattedValue = "";
    
    if (value instanceof Date) {
      formattedValue = format(value, "d MMMM yyyy", { locale: nl });
    } else {
      formattedValue = value;
    }

    // Remove interactive element from last assistant message
    setMessages((prev) => {
      const updated = [...prev];
      const lastMsg = updated[updated.length - 1];
      if (lastMsg?.role === "assistant") {
        lastMsg.showInteractive = false;
      }
      return updated;
    });

    // Send user selection as new message
    streamChat(formattedValue);
  };

  const parseAssistantResponse = (content: string): { content: string; interactive?: InteractiveElement } => {
    const lowerContent = content.toLowerCase();
    
    // Detect date requests
    if (lowerContent.includes("datum") && (lowerContent.includes("?") || lowerContent.includes("wanneer") || lowerContent.includes("kies"))) {
      return {
        content,
        interactive: { type: "date_picker" }
      };
    }
    
    // Detect time requests
    if (lowerContent.includes("tijd") && (lowerContent.includes("?") || lowerContent.includes("hoe laat") || lowerContent.includes("uur"))) {
      return {
        content,
        interactive: { type: "time_picker" }
      };
    }
    
    // Detect priority requests
    if (lowerContent.includes("prioriteit") && lowerContent.includes("?")) {
      return {
        content,
        interactive: {
          type: "select",
          label: "Kies prioriteit",
          options: [
            { value: "LOW", label: "Laag" },
            { value: "MEDIUM", label: "Gemiddeld" },
            { value: "HIGH", label: "Hoog" }
          ]
        }
      };
    }
    
    // Detect yes/no questions
    if (lowerContent.includes("?") && (lowerContent.includes("wil je") || lowerContent.includes("moet") || lowerContent.includes("zal ik"))) {
      return {
        content,
        interactive: {
          type: "button_group",
          label: "Kies een optie",
          options: [
            { value: "ja", label: "Ja" },
            { value: "nee", label: "Nee" }
          ]
        }
      };
    }

    return { content };
  };

  const processImageFile = (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Ongeldig bestand',
        description: 'Upload alleen afbeeldingen (PNG, JPG, WEBP)',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'Bestand te groot',
        description: 'Maximale bestandsgrootte is 10MB',
        variant: 'destructive',
      });
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setUploadedImage(base64);
      setImagePreview(base64);
      toast({
        description: '📷 Afbeelding toegevoegd',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          processImageFile(file);
        }
        break;
      }
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
    
    // Check if dragged items contain images
    const hasImage = Array.from(e.dataTransfer.items || []).some(
      item => item.type.startsWith('image/')
    );
    
    if (hasImage || (e.dataTransfer.files && e.dataTransfer.files.length > 0)) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragCounter(0);

    // Try to get file from items first (handles more drag sources)
    let file: File | null = null;

    // Check dataTransfer.items (more reliable for some drag sources)
    if (e.dataTransfer.items) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        if (e.dataTransfer.items[i].type.startsWith('image/')) {
          file = e.dataTransfer.items[i].getAsFile();
          if (file) break;
        }
      }
    }

    // Fallback to dataTransfer.files
    if (!file && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type.startsWith('image/')) {
        file = droppedFile;
      }
    }

    if (file) {
      processImageFile(file);
    } else {
      toast({
        title: 'Geen afbeelding',
        description: 'Sleep alleen afbeeldingen (PNG, JPG, WEBP)',
        variant: 'destructive',
      });
    }
  };

  const removeImage = () => {
    setUploadedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const streamChat = async (userMessage: string, retryCount = 0) => {
    const newMessage: Message = { 
      role: 'user' as const, 
      content: userMessage,
      image: uploadedImage || undefined
    };
    const newMessages = [...messages, newMessage];
    setMessages(newMessages);
    setIsLoading(true);
    setInput('');
    
    // Document/afbeelding? → Queue
    if (uploadedImage) {
      await handleDocumentProcessing(uploadedImage, userMessage);
      return;
    }

    // Check session validity first
    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        setIsLoading(false);
        toast({
          title: 'Sessie verlopen',
          description: 'Je sessie is verlopen. Log opnieuw in om door te gaan.',
          variant: 'destructive',
          action: (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                window.location.href = '/auth';
              }}
            >
              Opnieuw inloggen
            </Button>
          ),
        });
        return null;
      }
      return session;
    };

    const session = await checkSession();
    if (!session) {
      setMessages(prev => prev.slice(0, -1)); // Remove user message
      return;
    }

    // Timeout mechanism for robustness (increased for bulk validate scenario)
    const timeoutId = setTimeout(() => {
      console.error('Stream timeout after 120s');
      setIsLoading(false);
      toast({
        title: 'Time-out',
        description: 'De AI-assistent reageert te langzaam. Dit kan komen door:\n• Een verlopen sessie (log opnieuw in)\n• Te veel unverified knowledge items (voer Bulk Validate uit)\n• Een complexe vraag (probeer eenvoudiger)',
        variant: 'destructive',
        action: (
          <Button 
            variant="outline" 
            size="sm"
            onClick={async () => {
              const sessionCheck = await checkSession();
              if (sessionCheck) {
                toast({
                  title: 'Sessie OK',
                  description: 'Je sessie is nog geldig. Probeer je vraag opnieuw.',
                });
              }
            }}
          >
            Controleer sessie
          </Button>
        ),
      });
    }, 120000);

    try {

      console.log('🤖 AI Request:', {
        messageCount: newMessages.length,
        timestamp: new Date().toISOString()
      });
      
      const conversationId = getConversationId(); // ✅ Haal huidige conversation_id op
      console.log('🔑 Sending conversation_id to ai-chat:', conversationId);
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            messages: newMessages.map(m => {
              if (m.image) {
                return {
                  role: m.role,
                  content: [
                    { type: 'text', text: m.content },
                    { type: 'image_url', image_url: { url: m.image } }
                  ]
                };
              }
              return { role: m.role, content: m.content };
            }),
            conversation_id: conversationId, // ✅ Stuur conversation_id mee
          }),
        }
      );

      if (!response.ok) {
        clearTimeout(timeoutId);
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('AI response error:', response.status, errorData);
        
        // Auto-retry voor missing conversation_id
        if (response.status === 400 && errorData.error?.includes('conversation_id') && retryCount === 0) {
          console.warn('⚠️ Missing conversation_id, regenerating and retrying...');
          startNewConversation();
          setMessages(prev => prev.slice(0, -1)); // Verwijder user message
          return streamChat(userMessage, 1); // Retry 1x
        }
        
        // Enhanced error messages
        if (response.status === 429) {
          toast({
            title: '🚦 Te veel verzoeken',
            description: 'Even wachten voordat je opnieuw probeert.',
            variant: 'destructive',
          });
          throw new Error('Rate limit');
        } else if (response.status === 402) {
          toast({
            title: '💳 AI credits op',
            description: 'Neem contact op met support.',
            variant: 'destructive',
          });
          throw new Error('Credits');
        }
        
        throw new Error(errorData.error || `AI fout: ${response.status}`);
      }
      
      if (!response.body) {
        clearTimeout(timeoutId);
        throw new Error('No response body received');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';
      let textBuffer = '';
      let chunkCount = 0;
      let usedKnowledge: string[] = [];
      let messageId: string | undefined;

      // Add empty assistant message that we'll update
      setMessages(prev => [...prev, { role: 'assistant', content: '', showInteractive: false, usedKnowledge: [] }]);

      console.log('📡 Starting stream...');

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('✅ Stream complete:', { totalChunks: chunkCount, messageLength: assistantMessage.length });
            break;
          }

          chunkCount++;
          textBuffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);

            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (line.startsWith(':') || line.trim() === '') continue;
            if (!line.startsWith('data: ')) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              const metadata = parsed.choices?.[0]?.delta?.metadata;
              
              // Capture usedKnowledge metadata
              if (metadata?.usedKnowledge) {
                usedKnowledge = metadata.usedKnowledge;
                console.log('📚 Knowledge used:', usedKnowledge.length, 'items');
              }
              
              // Capture messageId metadata
              if (metadata?.messageId) {
                messageId = metadata.messageId;
                console.log('🆔 Message ID received:', messageId);
              }
              
              if (content) {
                assistantMessage += content;
                const parsedResponse = parseAssistantResponse(assistantMessage);
                
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: assistantMessage,
                    interactive: parsedResponse.interactive,
                    showInteractive: !!parsedResponse.interactive,
                    usedKnowledge: usedKnowledge.length > 0 ? usedKnowledge : [],
                    messageId: messageId || undefined,
                  };
                  return updated;
                });
              }
            } catch (parseError) {
              console.warn('Parse error for chunk:', jsonStr.substring(0, 50));
            }
          }
        }
      } catch (streamError) {
        console.error('Stream reading error:', streamError);
        throw new Error('Fout bij het ontvangen van AI-antwoord');
      }

      clearTimeout(timeoutId);
      setIsLoading(false);

      // ============================================
      // FALLBACK: Ensure messageId is set
      // ============================================
      if (!messageId) {
        console.warn('⚠️ No messageId received during stream, fetching from DB...');
        try {
          const conversationId = getConversationId();
          const { data: latestMessage } = await supabase
            .from('chat_messages')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('role', 'assistant')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (latestMessage) {
            messageId = latestMessage.id;
            console.log('✅ Fetched messageId from DB:', messageId);
            
            // Update the last message with the messageId
            setMessages(prev => {
              const updated = [...prev];
              if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  messageId: messageId || undefined,
                };
              }
              return updated;
            });
          }
        } catch (fallbackError) {
          console.error('❌ Failed to fetch messageId fallback:', fallbackError);
        }
      }

      // ============================================
      // FASE 2: TRIGGER CONTINUOUS-LEARNER
      // ============================================
      if (usedKnowledge.length > 0) {
        console.log('🧠 Triggering continuous-learner with', usedKnowledge.length, 'knowledge items');
        
        supabase.functions.invoke('continuous-learner', {
          body: {
            user_question: input,
            ai_response: assistantMessage,
            knowledge_used: usedKnowledge.map(id => ({
              id,
              category: 'auto'
            })),
            user_feedback: null,
            auto_apply: true
          }
        }).catch(err => {
          console.warn('Continuous learner failed (non-blocking):', err);
        });
      }

      // ✅ FIX 3: Removed duplicate storage - backend handles persistence via ai-chat function

    } catch (error) {
      clearTimeout(timeoutId);
      console.error('❌ Chat error:', error);
      setIsLoading(false);
      
      // Check if it's an auth error
      const errorMessage = error instanceof Error ? error.message : 'Kon geen antwoord krijgen van AI-assistent';
      const isAuthError = errorMessage.toLowerCase().includes('authenticatie') || 
                          errorMessage.toLowerCase().includes('ingelogd') ||
                          errorMessage.toLowerCase().includes('sessie');
      
      // Alleen toast als het niet rate-limit/credits is (die hebben al een toast)
      if (!(error instanceof Error && (error.message === 'Rate limit' || error.message === 'Credits'))) {
        toast({
          title: isAuthError ? 'Authenticatie vereist' : 'Fout',
          description: errorMessage,
          variant: 'destructive',
          action: isAuthError ? (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                window.location.href = '/auth';
              }}
            >
              Opnieuw inloggen
            </Button>
          ) : undefined,
        });
      }
      
      // Remove the user message if we failed to get a response
      setMessages(prev => prev.slice(0, -1));
    }
  };

  // ============================================
  // NIEUWE FUNCTIE: Document Processing via Queue
  // ============================================
  const handleDocumentProcessing = async (base64Image: string, userMessage: string) => {
    try {
      console.log('📄 Starting document processing via queue...');
      
      // 1. Upload naar Storage
      const fileName = `chat-upload-${Date.now()}.png`;
      const filePath = `uploads/chat/${fileName}`;
      
      // Convert base64 to blob
      const blob = await fetch(base64Image).then(r => r.blob());
      
      const { error: uploadError } = await supabase.storage
        .from('training-documents')
        .upload(filePath, blob);
      
      if (uploadError) {
        console.error('❌ Storage upload error:', uploadError);
        throw new Error('Kon document niet uploaden');
      }
      
      console.log('✅ Uploaded to storage:', filePath);
      removeImage();
      
      // 2. Queue processing job
      const { data: queueData, error: queueError } = await supabase.functions.invoke('queue-document-processing', {
        body: { filePath, fileName }
      });
      
      if (queueError || !queueData?.success) {
        console.error('❌ Queue error:', queueError);
        throw new Error('Kon document niet in queue plaatsen');
      }
      
      const jobIds = queueData.job_ids as string[];
      const totalChunks = queueData.total_chunks as number;
      
      console.log(`✅ Queued ${jobIds.length} jobs, total chunks: ${totalChunks}`);
      
      // 3. Voeg placeholder-bericht toe
      const placeholderMessage: Message = {
        role: 'assistant',
        content: `⏳ Je document wordt verwerkt (${totalChunks} ${totalChunks === 1 ? 'chunk' : 'chunks'})...`,
        isProcessing: true,
        jobIds
      };
      
      setMessages(prev => [...prev, placeholderMessage]);
      setIsLoading(false);
      
      // 4. Start realtime subscription
      startJobProgressTracking(jobIds, totalChunks);
      
      toast({
        description: `✅ Document in queue (${totalChunks} chunks)`,
      });
      
    } catch (error) {
      console.error('❌ Document processing error:', error);
      setIsLoading(false);
      toast({
        title: 'Fout',
        description: error instanceof Error ? error.message : 'Document verwerking mislukt',
        variant: 'destructive',
      });
      setMessages(prev => prev.slice(0, -1)); // Verwijder user message
    }
  };

  // ============================================
  // REALTIME JOB TRACKING
  // ============================================
  const startJobProgressTracking = (jobIds: string[], totalChunks: number) => {
    console.log('📡 Starting realtime tracking for jobs:', jobIds);
    
    const channel = supabase
      .channel('job-progress')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'processing_jobs',
          filter: `id=in.(${jobIds.join(',')})`
        },
        (payload) => {
          console.log('📊 Job update:', payload.new);
          
          const job = payload.new as ProcessingJob;
          
          // Update local job state
          setProcessingJobs(prev => ({
            ...prev,
            [job.id]: job
          }));
          
          // Update placeholder message
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (!lastMsg?.isProcessing || !lastMsg.jobIds?.includes(job.id)) return prev;
            
            const allJobs = Object.values({ ...processingJobs, [job.id]: job });
            const avgProgress = allJobs.reduce((sum, j) => sum + (j.progress_pct || 0), 0) / totalChunks;
            const completedChunks = allJobs.filter(j => j.status === 'done').length;
            const failedChunks = allJobs.filter(j => j.status === 'failed').length;
            
            if (failedChunks > 0) {
              toast({
                title: '❌ Chunk failed',
                description: job.error_message || 'Verwerking mislukt',
                variant: 'destructive',
              });
            }
            
            // Alle chunks klaar?
            if (completedChunks === totalChunks) {
              // Haal nieuwe kennis op
              fetchProcessedKnowledge(jobIds);
              return prev;
            }
            
            // Update placeholder
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...lastMsg,
              content: `⏳ Verwerking: ${Math.round(avgProgress)}% (${completedChunks}/${totalChunks} chunks)\n${allJobs.filter(j => j.items_processed).reduce((sum, j) => sum + (j.items_processed || 0), 0)} items gevonden`
            };
            
            return updated;
          });
        }
      )
      .subscribe();
    
    // Cleanup bij unmount of close
    return () => {
      supabase.removeChannel(channel);
    };
  };

  const fetchProcessedKnowledge = async (jobIds: string[]) => {
    console.log('🧠 Fetching processed knowledge...');
    
    try {
      // Haal laatste 10 knowledge items op die uit deze jobs komen
      const { data, error } = await supabase
        .from('ai_knowledge_base')
        .select('key, category, value')
        .in('chunk_id', jobIds)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      
      const summaryLines = data?.map(item => `• **${item.category}**: ${item.key}`) || [];
      const summary = summaryLines.length > 0 
        ? `✅ Verwerking voltooid!\n\n**Gevonden kennis:**\n${summaryLines.join('\n')}\n\n💡 Bekijk meer in de Kennis-sectie`
        : '✅ Verwerking voltooid (geen nieuwe kennis gevonden)';
      
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: summary,
          isProcessing: false
        };
        return updated;
      });
      
      // Cleanup
      setProcessingJobs({});
      
    } catch (error) {
      console.error('❌ Knowledge fetch error:', error);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: '✅ Verwerking voltooid (kon samenvatting niet ophalen)',
          isProcessing: false
        };
        return updated;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !uploadedImage) || isLoading) return;
    setShowWelcome(false);
    const messageText = input.trim() || "Wat zie je in deze afbeelding?";
    streamChat(messageText);
  };

  // Drag handlers
  const startDrag = (e: React.PointerEvent) => {
    if (isResizing) return; // Don't drag during resize
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingWindow(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      windowX: position.x,
      windowY: position.y
    };
  };

  useEffect(() => {
    if (!isDraggingWindow) return;

    let isFramePending = false;

    const handleDragMove = (e: PointerEvent) => {
      if (isFramePending) return;
      
      isFramePending = true;
      
      requestAnimationFrame(() => {
        isFramePending = false;
        
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;
        
        let newX = dragStartRef.current.windowX + deltaX;
        let newY = dragStartRef.current.windowY + deltaY;
        
        // Viewport constraints (keep at least 50px visible)
        const minVisible = 50;
        newX = Math.max(-dimensions.width + minVisible, Math.min(newX, window.innerWidth - minVisible));
        newY = Math.max(0, Math.min(newY, window.innerHeight - minVisible));
        
        setPosition({ x: newX, y: newY });
      });
    };

    const handleDragEnd = () => {
      setIsDraggingWindow(false);
      localStorage.setItem('chatPosX', position.x.toString());
      localStorage.setItem('chatPosY', position.y.toString());
    };

    document.addEventListener('pointermove', handleDragMove);
    document.addEventListener('pointerup', handleDragEnd);

    return () => {
      document.removeEventListener('pointermove', handleDragMove);
      document.removeEventListener('pointerup', handleDragEnd);
    };
  }, [isDraggingWindow, position.x, position.y, dimensions.width]);

  // Resize handlers
  const startResize = (type: 'width' | 'height', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsResizing(type);
  };

  useEffect(() => {
    if (!isResizing || !chatWindowRef.current) return;

    let isFramePending = false;

    const handlePointerMove = (e: PointerEvent) => {
      // Skip als er al een frame pending is (throttle)
      if (isFramePending) return;

      isFramePending = true;

      // Schedule update voor volgende frame (60fps)
      requestAnimationFrame(() => {
        isFramePending = false;
        
        if (!chatWindowRef.current) return;

        const rect = chatWindowRef.current.getBoundingClientRect();
        
        if (isResizing === 'width') {
          // Resize from left edge - mouse moves left to increase width
          const newWidth = rect.right - e.clientX;
          const constrainedWidth = Math.min(Math.max(newWidth, 320), 600);
          resizeRef.current.width = constrainedWidth;
          chatWindowRef.current.style.width = `${constrainedWidth}px`;
        } else if (isResizing === 'height') {
          // Resize from top edge - mouse moves up to increase height
          const newHeight = rect.bottom - e.clientY;
          const constrainedHeight = Math.min(Math.max(newHeight, 400), 800);
          resizeRef.current.height = constrainedHeight;
          chatWindowRef.current.style.height = `${constrainedHeight}px`;
        }
      });
    };

    const handlePointerUp = () => {
      setIsResizing(null);
      
      // Nu pas state + localStorage updaten (slechts 1x)
      setDimensions({
        width: resizeRef.current.width,
        height: resizeRef.current.height
      });
      localStorage.setItem('chatWidth', resizeRef.current.width.toString());
      localStorage.setItem('chatHeight', resizeRef.current.height.toString());
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isResizing]);


  return (
    <>
      {/* Robot Assistant - Visible for logged in users */}
      <div className="fixed bottom-6 right-6 z-[2147483647] pointer-events-none">
        <div className="pointer-events-auto drop-shadow-2xl">
          <RobotIcon 
            onClick={() => setIsOpen(!isOpen)} 
            isActive={isLoading}
          />
        </div>
      </div>

      {/* Chat Window */}
      {isOpen && (
        <div 
          ref={chatWindowRef}
          className={`fixed bg-background border rounded-lg shadow-xl flex flex-col animate-in slide-in-from-right duration-300 ${
            showResetDialog ? 'z-40' : 'z-[2147483647]'
          }`}
          style={{
            width: `${dimensions.width}px`, 
            height: `${dimensions.height}px`,
            left: `${position.x}px`,
            top: `${position.y}px`,
            willChange: isResizing || isDraggingWindow ? 'width, height, transform' : 'auto',
            transition: isResizing || isDraggingWindow ? 'none' : 'all 0.3s'
          }}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Resize Handle - Left (Width) */}
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/20 transition-colors group flex items-center justify-center"
            onPointerDown={(e) => startResize('width', e)}
          >
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="h-4 w-4 text-primary rotate-90" />
            </div>
          </div>

          {/* Resize Handle - Top (Height) */}
          <div
            className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-primary/20 transition-colors group flex items-center justify-center"
            onPointerDown={(e) => startResize('height', e)}
          >
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="h-4 w-4 text-primary" />
            </div>
          </div>
          {/* Drag & Drop Overlay */}
          {isDragging && (
            <div className="absolute inset-0 bg-primary/10 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg border-2 border-dashed border-primary">
              <div className="text-center">
                <ImageIcon className="w-16 h-16 mx-auto mb-2 text-primary" />
                <p className="text-lg font-semibold">Sleep je afbeelding hier</p>
                <p className="text-sm text-muted-foreground">Loslaten om te uploaden</p>
              </div>
            </div>
          )}
          
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-primary/5 to-primary/10">
            <div 
              className="flex items-center gap-3 flex-1 cursor-move select-none"
              onPointerDown={startDrag}
            >
              <div className={`shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/30 transition-all ${isLoading ? 'animate-pulse' : ''}`}>
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">TaskFlow Assistent</h3>
                <p className="text-xs text-muted-foreground">Altijd klaar om te helpen</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                onClick={() => setShowResetDialog(true)}
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Chat wissen (training blijft behouden)"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setIsOpen(false)}
                variant="ghost"
                size="icon"
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            {messages.length === 0 && showWelcome && (
              <div className="space-y-4 mt-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8 border border-primary/20">
                    <AvatarFallback className="bg-primary/10">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-lg px-4 py-3 max-w-[85%]">
                    <p className="text-sm mb-3">
                      👋 Hallo! Ik ben je persoonlijke TaskFlow assistent. Ik kan je helpen met:
                    </p>
                    <ul className="text-sm space-y-1.5 mb-3">
                      <li>• 📋 Taken aanmaken en organiseren</li>
                      <li>• 📅 Je planning optimaliseren</li>
                      <li>• 🎯 Prioriteiten stellen</li>
                      <li>• ⏰ Deadlines beheren</li>
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      Kies een snelle actie of stel je eigen vraag!
                    </p>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="space-y-2 pl-11">
                  {QUICK_ACTIONS.map((action, idx) => {
                    const Icon = action.icon;
                    return (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2 h-auto py-2.5"
                        onClick={() => handleQuickAction(action.prompt)}
                      >
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="text-sm">{action.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {msg.role === 'assistant' && (
                    <Avatar className="h-8 w-8 border border-primary/20 shrink-0">
                      <AvatarFallback className="bg-primary/10">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </AvatarFallback>
                    </Avatar>
                   )}
                   <div className="flex flex-col gap-2 max-w-[85%]">
                    {/* Processing Progress Bar */}
                    {msg.isProcessing && msg.jobIds && (
                      <div className="space-y-2">
                        {msg.jobIds.map(jobId => {
                          const job = processingJobs[jobId];
                          return job ? (
                            <div key={jobId} className="text-xs space-y-1">
                              <div className="flex justify-between">
                                <span>Chunk {job.chunk_index + 1}/{job.total_chunks}</span>
                                <span>{job.progress_pct}%</span>
                              </div>
                              <Progress value={job.progress_pct} className="h-1" />
                              {job.items_processed && (
                                <span className="text-muted-foreground">{job.items_processed} items</span>
                              )}
                            </div>
                          ) : null;
                        })}
                      </div>
                    )}
                    <div>
                      <div
                        className={`rounded-lg px-4 py-2.5 ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        {msg.image && (
                          <img 
                            src={msg.image} 
                            alt="Uploaded" 
                            className="max-w-full rounded mb-2 max-h-48 object-contain"
                          />
                        )}
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      </div>
                      {msg.role === 'assistant' && msg.content && !isLoading && (
                        <MessageFeedback 
                          messageContent={msg.content} 
                          messageId={msg.messageId}
                          usedKnowledge={msg.usedKnowledge}
                        />
                      )}
                    </div>
                    
                    {/* Interactive Elements */}
                    {msg.role === 'assistant' && msg.showInteractive && msg.interactive && (
                      <div>
                        {msg.interactive.type === 'date_picker' && (
                          <ChatDatePicker onSelect={(date) => handleInteractiveSelection('date', date)} />
                        )}
                        {msg.interactive.type === 'time_picker' && (
                          <ChatTimePicker onSelect={(time) => handleInteractiveSelection('time', time)} />
                        )}
                        {msg.interactive.type === 'select' && msg.interactive.options && (
                          <ChatSelect
                            label={msg.interactive.label || 'Selecteer'}
                            options={msg.interactive.options}
                            onSelect={(value) => handleInteractiveSelection('select', value)}
                          />
                        )}
                        {msg.interactive.type === 'button_group' && msg.interactive.options && (
                          <ChatButtonGroup
                            label={msg.interactive.label || 'Kies een optie'}
                            options={msg.interactive.options}
                            onSelect={(value) => handleInteractiveSelection('button', value)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <Avatar className="h-8 w-8 border border-primary/20">
                    <AvatarFallback className="bg-primary/10">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-lg px-4 py-2.5 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">Bezig met nadenken...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-4 border-t bg-background/50 backdrop-blur-sm">
            {imagePreview && (
              <div className="mb-2 relative inline-block">
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  className="max-h-24 rounded border"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={removeImage}
                >
                  <XIcon className="h-3 w-3" />
                </Button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={handlePaste}
                  placeholder="Typ, plak of sleep een afbeelding..."
                  className="min-h-[60px] max-h-[120px] resize-none pr-20"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  disabled={isLoading}
                />
                <div className="absolute bottom-2 right-2 flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className="h-8 w-8 hover:bg-primary/10"
                    title="Voeg afbeelding toe (of sleep/plak)"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button
                type="submit"
                size="icon"
                disabled={(!input.trim() && !uploadedImage) || isLoading}
                className="shrink-0 h-[60px] w-[60px]"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Reset Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chat wissen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit wist je conversatiegeschiedenis voor een verse start. 
              Je trainingsdata en feedback blijven behouden zodat de AI blijft leren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearChat}>
              Wis Chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
