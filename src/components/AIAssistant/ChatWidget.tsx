import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Sparkles, Calendar, ListTodo, Clock, RotateCcw, Image as ImageIcon, X as XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { MiniRobotIcon } from './MiniRobotIcon';
import { ChatDatePicker, ChatTimePicker, ChatSelect, ChatButtonGroup } from './InteractiveChatElements';
import { MessageFeedback } from './MessageFeedback';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

interface InteractiveElement {
  type: 'date_picker' | 'time_picker' | 'select' | 'button_group';
  label?: string;
  options?: { value: string; label: string }[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  interactive?: InteractiveElement;
  showInteractive?: boolean;
  image?: string; // Base64 image data
}

const QUICK_ACTIONS = [
  { icon: ListTodo, label: 'Mijn taken vandaag', prompt: 'Wat zijn mijn belangrijkste taken voor vandaag?' },
  { icon: Calendar, label: 'Planning deze week', prompt: 'Geef me een overzicht van mijn planning deze week' },
  { icon: Clock, label: 'Maak nieuwe taak', prompt: 'Help me een nieuwe taak aan te maken' },
];

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  // Load conversation history on mount
  useEffect(() => {
    const loadHistory = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: history } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(20);

      if (history && history.length > 0) {
        setMessages(history as Message[]);
        setShowWelcome(false);
        console.log('📚 Loaded chat history:', history.length, 'messages');
      }
    };

    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast({
          title: "Fout",
          description: "Je moet ingelogd zijn om de chat te wissen",
          variant: "destructive",
        });
        return;
      }

      // Wis alleen chat_messages (training data blijft behouden)
      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .eq('user_id', session.user.id);

      if (error) throw error;

      // Reset lokale state
      setMessages([]);
      setShowWelcome(true);
      setShowResetDialog(false);

      toast({
        title: "✅ Chat gewist",
        description: "Verse start - AI trainingsdata is behouden",
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

  const streamChat = async (userMessage: string) => {
    const newMessage: Message = { 
      role: 'user' as const, 
      content: userMessage,
      image: uploadedImage || undefined
    };
    const newMessages = [...messages, newMessage];
    setMessages(newMessages);
    setIsLoading(true);
    setInput('');
    
    // Show confirmation if image is included
    if (uploadedImage) {
      toast({
        description: '🖼️ Afbeelding meegestuurd naar AI',
      });
    }
    
    // Clear image after sending
    const currentImage = uploadedImage;
    removeImage();

    // Timeout mechanism for robustness
    const timeoutId = setTimeout(() => {
      console.error('Stream timeout after 60s');
      setIsLoading(false);
      toast({
        title: 'Time-out',
        description: 'AI-assistent reageert te langzaam. Probeer het opnieuw.',
        variant: 'destructive',
      });
    }, 60000);

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error('Authenticatie fout. Probeer opnieuw in te loggen.');
      }
      
      if (!session?.access_token) {
        console.error('No valid session or access token');
        throw new Error('Je moet ingelogd zijn om de AI-assistent te gebruiken');
      }

      console.log('🤖 AI Request:', {
        messageCount: newMessages.length,
        timestamp: new Date().toISOString()
      });
      
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
          }),
        }
      );

      if (!response.ok) {
        clearTimeout(timeoutId);
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('AI response error:', response.status, errorData);
        
        // Enhanced error messages
        if (response.status === 429) {
          throw new Error('🚦 Te veel verzoeken. Even wachten voordat je opnieuw probeert.');
        } else if (response.status === 402) {
          throw new Error('💳 AI credits op. Neem contact op met support.');
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

      // Add empty assistant message that we'll update
      setMessages(prev => [...prev, { role: 'assistant', content: '', showInteractive: false }]);

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

      // Save to database for learning and context
      const { data: { user } } = await supabase.auth.getUser();
      if (user && assistantMessage) {
        console.log('💾 Saving conversation to database');
        const { error: insertError } = await supabase.from('chat_messages').insert([
          { role: 'user', content: userMessage, user_id: user.id },
          { role: 'assistant', content: assistantMessage, user_id: user.id },
        ]);
        
        if (insertError) {
          console.error('Failed to save chat history:', insertError);
          // Non-fatal - continue anyway
        }
      }

    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Chat error:', error);
      setIsLoading(false);
      const errorMessage = error instanceof Error ? error.message : 'Kon geen antwoord krijgen van AI-assistent';
      toast({
        title: 'Fout',
        description: errorMessage,
        variant: 'destructive',
      });
      // Remove the user message if we failed to get a response
      setMessages(prev => prev.slice(0, -1));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !uploadedImage) || isLoading) return;
    setShowWelcome(false);
    const messageText = input.trim() || "Wat zie je in deze afbeelding?";
    streamChat(messageText);
  };


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
          className="fixed bottom-6 right-28 w-96 h-[600px] bg-background border rounded-lg shadow-xl flex flex-col animate-in slide-in-from-right duration-300 z-[2147483647]"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
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
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <MiniRobotIcon isActive={isLoading} />
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
                        <MessageFeedback messageContent={msg.content} messageIndex={idx} />
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
