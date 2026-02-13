import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Send, Loader2, Sparkles, Calendar, CalendarDays, CalendarCheck2, ListTodo, Clock, RotateCcw, Image as ImageIcon, X as XIcon, GripVertical, Bot, MapPin, Users, Briefcase, Building2, Brain, LayoutDashboard, Receipt, Euro } from 'lucide-react';
import { useLocation } from 'react-router-dom';
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
import { SimpleChatIcon } from './SimpleChatIcon';
import { ChatDatePicker, ChatTimePicker, ChatSelect, ChatButtonGroup } from './InteractiveChatElements';
import { MessageFeedback } from './MessageFeedback';
import { AIMemoryPanel } from './AIMemoryPanel';
import { AgentActionCard, AgentActionData } from './AgentActionCard';
import { FeedbackReminderBanner } from './FeedbackReminderBanner';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { logger } from '@/lib/logger';

const log = logger.create('ChatWidget');

// Page context configuration for context-aware AI responses
interface PageContext {
  label: string;
  description: string;
  icon: React.ElementType;
  quickActions: { icon: React.ElementType; label: string; prompt: string }[];
}

const PAGE_CONTEXTS: Record<string, PageContext> = {
  '/': {
    label: 'Dashboard',
    description: 'Overzichtspagina met KPIs, taken en recruitment metrics',
    icon: LayoutDashboard,
    quickActions: [
      { icon: ListTodo, label: 'Mijn prioriteiten vandaag', prompt: 'Wat zijn mijn belangrijkste taken voor vandaag?' },
      { icon: Calendar, label: 'Planning deze week', prompt: 'Geef me een overzicht van mijn planning deze week' },
      { icon: Briefcase, label: 'Recruitment status', prompt: 'Wat is de huidige status van mijn recruitment pipeline?' },
    ]
  },
  '/sollicitaties': {
    label: 'Sollicitaties',
    description: 'Kandidaat pipeline en screening van nieuwe professionals',
    icon: Users,
    quickActions: [
      { icon: Users, label: 'Kandidaat zoeken', prompt: 'Help me een geschikte kandidaat te vinden voor een vacature' },
      { icon: Briefcase, label: 'Screening tips', prompt: 'Wat moet ik letten bij het screenen van een kandidaat?' },
      { icon: Clock, label: 'Openstaande acties', prompt: 'Welke sollicitaties hebben actie nodig?' },
    ]
  },
  '/professionals': {
    label: 'Professionals',
    description: 'Professionalsbestand met zorgprofessionals. Features: talent search (zoek op functieniveau, regio, werkvorm, specialismen), bulk-acties (status wijzigen, email, CSV export, verwijderen), profiel completeness score, CV upload, beschikbaarheidsintegratie, plaatsingshistorie. Functieniveaus: Helpende 2, VIG, VP3, VP4, HBO-V. Werkvormen: ZZP, Uitzendkracht, Beide. Statussen: actief, inactief, op_pauze. KPIs: totaal professionals, beschikbaar, gekoppeld (plaatsingen), nieuw (7 dagen). Zoek-fallback: als geen professionals gevonden, zoekt automatisch in sollicitaties.',
    icon: Users,
    quickActions: [
      { icon: Users, label: 'Talent zoeken', prompt: 'Hoe kan ik het beste een professional zoeken? Leg de talent search functie uit en welke filters ik kan gebruiken (functieniveau, regio, werkvorm, specialismen).' },
      { icon: Sparkles, label: 'Profiel tips', prompt: 'Geef tips voor het opbouwen van een compleet professionalprofiel. Welke velden zijn het belangrijkst voor goede matching met diensten?' },
      { icon: MapPin, label: 'Beschikbaarheid', prompt: 'Leg uit hoe de beschikbaarheid van professionals werkt. Hoe wordt dit gekoppeld aan de dienstenplanning en AI matching?' },
    ]
  },
  '/klanten': {
    label: 'Klanten',
    description: 'Klantenbeheer met 3-level hiërarchie: organisaties → locaties → werklocaties (sublocaties). Features: kaarten- en hiërarchieweergave, vacaturebeheer per werklocatie, matching criteria (sector, doelgroep, gezochte functies), tarieven per werklocatie, logo fetching, website verrijking via Firecrawl, Excel import. Sectoren: VVT, GGZ, GHZ, Jeugdzorg, Ziekenhuis/Klinisch, Thuiszorg. Doelgroepen: Ouderen, LVB, Psychiatrie, Somatiek, Kinderen/Jeugd, Verslaving. Bureaus: ABCzorg en CitoZorg. KPIs: totale organisaties, per bureau, werklocaties.',
    icon: Building2,
    quickActions: [
      { icon: Building2, label: 'Hiërarchie uitleg', prompt: 'Leg de organisatiestructuur uit: hoe werkt de hiërarchie van organisaties, locaties en werklocaties? Waar stel ik sectoren, doelgroepen en tarieven in?' },
      { icon: Sparkles, label: 'Matching tips', prompt: 'Hoe kan ik de matching criteria van werklocaties optimaliseren? Geef tips voor het instellen van sectoren, doelgroepen en gezochte functies.' },
      { icon: MapPin, label: 'Vacature beheer', prompt: 'Hoe werkt het vacaturebeheer per werklocatie? Hoe maak ik een vacature aan en hoe worden professionals gematcht?' },
    ]
  },
  '/plaatsingen': {
    label: 'Plaatsingen',
    description: 'Actieve en historische plaatsingen van professionals',
    icon: Briefcase,
    quickActions: [
      { icon: Briefcase, label: 'Plaatsing status', prompt: 'Wat is de status van de lopende plaatsingen?' },
      { icon: Clock, label: 'Aflopende plaatsingen', prompt: 'Welke plaatsingen lopen binnenkort af?' },
      { icon: Users, label: 'Evaluaties', prompt: 'Zijn er plaatsingen die geëvalueerd moeten worden?' },
    ]
  },
  '/ai-training': {
    label: 'AI Training',
    description: 'Kennisbeheer en AI configuratie dashboard',
    icon: Brain,
    quickActions: [
      { icon: Brain, label: 'Kennisbank status', prompt: 'Hoeveel kennis heb ik al geleerd en wat is de kwaliteit?' },
      { icon: ListTodo, label: 'Conflicten', prompt: 'Zijn er conflicten in de kennisbank die ik moet oplossen?' },
      { icon: Clock, label: 'Recente leerevents', prompt: 'Wat heb ik recent geleerd van gebruikersinteracties?' },
    ]
  },
  '/kanban': {
    label: 'Kanban',
    description: 'Visueel takenbord voor projectbeheer',
    icon: LayoutDashboard,
    quickActions: [
      { icon: ListTodo, label: 'Openstaande taken', prompt: 'Welke taken staan er open in het kanban bord?' },
      { icon: Clock, label: 'Deadlines vandaag', prompt: 'Welke taken hebben vandaag een deadline?' },
      { icon: Calendar, label: 'Nieuwe taak', prompt: 'Help me een nieuwe taak aan te maken' },
    ]
  },
  '/kalender': {
    label: 'Kalender',
    description: 'Kalenderweergave van taken en afspraken',
    icon: Calendar,
    quickActions: [
      { icon: Calendar, label: 'Afspraken vandaag', prompt: 'Wat staat er vandaag op de planning?' },
      { icon: Clock, label: 'Deze week', prompt: 'Geef een overzicht van mijn week' },
      { icon: ListTodo, label: 'Planning optimaliseren', prompt: 'Help me mijn planning te optimaliseren' },
    ]
  },
  '/opvolging': {
    label: 'Opvolging',
    description: 'Follow-up taken en herinneringen',
    icon: Clock,
    quickActions: [
      { icon: Clock, label: 'Openstaande opvolgingen', prompt: 'Welke opvolgingen staan er open?' },
      { icon: Calendar, label: 'Herinneringen vandaag', prompt: 'Welke herinneringen heb ik vandaag?' },
      { icon: ListTodo, label: 'Prioriteren', prompt: 'Help me mijn opvolgingen te prioriteren' },
    ]
  },
  '/tijdregistratie': {
    label: 'Tijdregistratie',
    description: 'Urenregistratie en tijdsbeheer',
    icon: Clock,
    quickActions: [
      { icon: Clock, label: 'Uren vandaag', prompt: 'Hoeveel uren heb ik vandaag geregistreerd?' },
      { icon: Calendar, label: 'Weekoverzicht', prompt: 'Geef een overzicht van mijn uren deze week' },
      { icon: ListTodo, label: 'Nieuwe registratie', prompt: 'Help me uren te registreren' },
    ]
  },
  '/lijst': {
    label: 'Lijstweergave',
    description: 'Taken in lijstformaat',
    icon: ListTodo,
    quickActions: [
      { icon: ListTodo, label: 'Alle taken', prompt: 'Geef een overzicht van al mijn taken' },
      { icon: Clock, label: 'Urgent', prompt: 'Welke taken zijn urgent?' },
      { icon: Calendar, label: 'Sorteren', prompt: 'Help me mijn taken te sorteren op prioriteit' },
    ]
  },
  '/sollicitaties-archief': {
    label: 'Sollicitaties Archief',
    description: 'Gearchiveerde en afgeronde sollicitaties',
    icon: Users,
    quickActions: [
      { icon: Users, label: 'Zoek in archief', prompt: 'Help me een kandidaat te vinden in het archief' },
      { icon: Clock, label: 'Recent afgerond', prompt: 'Welke sollicitaties zijn recent afgerond?' },
      { icon: Briefcase, label: 'Statistieken', prompt: 'Geef statistieken van afgeronde sollicitaties' },
    ]
  },
  '/planning': {
    label: 'Diensten Planning',
    description: 'Dienstenplanning module met weekkalender, maandoverzicht en lijstweergave. Features: AI matching suggesties met 100-punts scoring (functieniveau 30pt, beschikbaarheid 25pt, certificeringen 20pt, regio 15pt, historie 10pt), spoed markering, kleur codering, templates, multi-date aanmaak, pauze auto-berekening, per-positie tracking. Dienst statussen: concept, open_voor_aanmelding, in_behandeling, bevestigd, geannuleerd, voltooid. Bezetting wordt visueel weergegeven per dienst.',
    icon: CalendarDays,
    quickActions: [
      { icon: CalendarDays, label: 'Onbezette diensten', prompt: 'Welke diensten deze week zijn nog niet volledig bezet en hebben professionals nodig?' },
      { icon: Sparkles, label: 'Matching uitleg', prompt: 'Leg uit hoe de AI matching suggesties werken. Wat betekenen de scores en hoe kan ik de beste professional kiezen?' },
      { icon: Users, label: 'Planning tips', prompt: 'Geef tips voor efficiënt roosteren in de zorgsector. Waar moet ik op letten bij het plannen van dag-, avond- en nachtdiensten?' },
    ]
  },
  '/beschikbaarheid': {
    label: 'Beschikbaarheid',
    description: 'Beschikbaarheidsoverzicht van professionals per week. Matrix met professionals (rijen) × 7 dagen (kolommen), per dag 3 shifts: dag, avond, nacht. Status per shift: beschikbaar (groen), niet beschikbaar (rood), onbekend (grijs). Integratie met dienstenplanning — beschikbaarheid wordt meegewogen in AI matching score.',
    icon: CalendarCheck2,
    quickActions: [
      { icon: CalendarCheck2, label: 'Beschikbaarheid tips', prompt: 'Hoe kan ik het beste de beschikbaarheid van mijn team beheren? Geef tips voor het invullen en bijhouden van shifts.' },
      { icon: Users, label: 'Shift planning', prompt: 'Leg de verschillende shift types uit (dag, avond, nacht, hele dag) en hoe ze gekoppeld zijn aan de dienstenplanning.' },
      { icon: Clock, label: 'Week optimaliseren', prompt: 'Hoe optimaliseer ik de weekplanning? Waar moet ik op letten qua beschikbaarheid, functieniveaus en certificeringen?' },
    ]
  },
  '/facturatie': {
    label: 'Facturatie',
    description: 'Facturatie module voor beheer van facturen, betalingen en herinneringen. Features: auto-facturatie (vanuit voltooide diensten), concept→definitief→verzonden workflow, 3 herinneringsniveaus, betaling registratie, PDF export, CSV/XLSX export. Factuur types: verkoopfactuur, self-billing, inkoopfactuur, creditnota. Statussen: concept, definitief, verzonden, herinnering 1/2/3, betwist, betaald, afgeboekt. KPIs: openstaand bedrag, vervallen facturen, betaald deze week, omzet dit kwartaal.',
    icon: Receipt,
    quickActions: [
      { icon: Euro, label: 'Openstaand overzicht', prompt: 'Geef uitleg over de factuurstatussen en wat ik moet doen met vervallen facturen. Wanneer stuur ik herinnering 1, 2 en 3?' },
      { icon: Receipt, label: 'Auto-facturatie uitleg', prompt: 'Leg uit hoe de auto-facturatie werkt. Hoe worden diensten automatisch omgezet naar concept facturen?' },
      { icon: Sparkles, label: 'Facturatie tips', prompt: 'Geef tips voor efficiënt factuurbeheer in de zorgsector. Hoe zorg ik dat facturen op tijd betaald worden?' },
    ]
  },
};

const DEFAULT_PAGE_CONTEXT: PageContext = {
  label: 'ABCzorg',
  description: 'Algemene pagina',
  icon: LayoutDashboard,
  quickActions: [
    { icon: ListTodo, label: 'Mijn taken vandaag', prompt: 'Wat zijn mijn belangrijkste taken voor vandaag?' },
    { icon: Calendar, label: 'Planning deze week', prompt: 'Geef me een overzicht van mijn planning deze week' },
    { icon: Clock, label: 'Maak nieuwe taak', prompt: 'Help me een nieuwe taak aan te maken' },
  ]
};

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
  agentAction?: AgentActionData; // Agent action card data for confirmation flow
  // Fast Path metadata for feedback
  isFastPath?: boolean;
  fastPathLogId?: string;
  patternId?: string;
}

// Legacy static quick actions removed - now using PAGE_CONTEXTS for dynamic actions

// Helper functions for conversation session management
const getConversationId = (): string => {
  let conversationId = localStorage.getItem('chat_conversation_id');
  if (!conversationId) {
    conversationId = crypto.randomUUID();
    localStorage.setItem('chat_conversation_id', conversationId);
    log.log('🆕 New conversation started:', conversationId);
  }
  return conversationId;
};

const startNewConversation = (): string => {
  const newConversationId = crypto.randomUUID();
  localStorage.setItem('chat_conversation_id', newConversationId);
  log.log('🔄 Conversation reset:', newConversationId);
  return newConversationId;
};

interface ChatWidgetProps {
  embedded?: boolean;      // Toon als embedded (geen floating window)
  trainingMode?: boolean;  // Admin training mode (enable tool calling)
}

export const ChatWidget = ({ embedded = false, trainingMode = false }: ChatWidgetProps = {}) => {
  const location = useLocation();
  const currentPath = location.pathname;
  
  // Get page context based on current route (supports dashboard tabs)
  const currentPageContext = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    
    // Handle dashboard tabs - map to virtual paths
    if (currentPath === '/dashboard' && tab) {
      const tabMapping: Record<string, string> = {
        'lijst': '/lijst',
        'kalender': '/kalender',
        'opvolging': '/opvolging',
      };
      const mappedPath = tabMapping[tab];
      if (mappedPath && PAGE_CONTEXTS[mappedPath]) {
        return PAGE_CONTEXTS[mappedPath];
      }
    }
    
    // Resolve page context
    let context: PageContext;
    if (PAGE_CONTEXTS[currentPath]) {
      context = PAGE_CONTEXTS[currentPath];
    } else {
      const basePath = '/' + currentPath.split('/')[1];
      context = PAGE_CONTEXTS[basePath] || DEFAULT_PAGE_CONTEXT;
    }

    // Enrich /planning with current week from URL params
    if (currentPath === '/planning') {
      const weekParam = params.get('week');
      if (weekParam) {
        try {
          const weekLabel = format(parseISO(weekParam), 'd MMMM yyyy', { locale: nl });
          return {
            ...context,
            description: context.description + ` De gebruiker bekijkt de week van ${weekLabel}.`,
          };
        } catch {
          // Invalid date, return default context
        }
      }
    }

    // Enrich /facturatie with current filter from URL params
    if (currentPath === '/facturatie') {
      const statusParam = params.get('status');
      if (statusParam) {
        const statusLabels: Record<string, string> = {
          'CONCEPT': 'concept',
          'DEFINITIEF': 'definitief',
          'VERZONDEN': 'verzonden',
          'HERINNERING_1': 'herinnering 1',
          'HERINNERING_2': 'herinnering 2',
          'HERINNERING_3': 'herinnering 3',
          'BETWIST': 'betwist',
          'BETAALD': 'betaald',
          'AFGEBOEKT': 'afgeboekt',
        };
        const label = statusLabels[statusParam] || statusParam;
        return {
          ...context,
          description: context.description + ` De gebruiker bekijkt facturen met status "${label}".`,
        };
      }
    }

    // Enrich /professionals with current filter from URL params
    if (currentPath === '/professionals') {
      const parts: string[] = [];
      const statusParam = params.get('status');
      const functieParam = params.get('functie_niveau');

      if (statusParam) {
        const statusLabels: Record<string, string> = {
          'actief': 'actief',
          'inactief': 'inactief',
          'op_pauze': 'op pauze',
        };
        parts.push(`status "${statusLabels[statusParam] || statusParam}"`);
      }

      if (functieParam) {
        parts.push(`functieniveau "${functieParam}"`);
      }

      if (parts.length > 0) {
        return {
          ...context,
          description: context.description + ` De gebruiker filtert op ${parts.join(' en ')}.`,
        };
      }
    }

    // Enrich /klanten with current filter from URL params
    if (currentPath === '/klanten') {
      const parts: string[] = [];
      const bureauParam = params.get('bureau');
      const sectorParam = params.get('sector');

      if (bureauParam) {
        parts.push(`bureau "${bureauParam}"`);
      }

      if (sectorParam) {
        parts.push(`sector "${sectorParam}"`);
      }

      if (parts.length > 0) {
        return {
          ...context,
          description: context.description + ` De gebruiker filtert op ${parts.join(' en ')}.`,
        };
      }
    }

    return context;
  }, [currentPath, location.search]);
  
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
  const [messagesWithoutFeedback, setMessagesWithoutFeedback] = useState(0);
  const [feedbackReminderDismissed, setFeedbackReminderDismissed] = useState(false);
  const [lastMessageIndex, setLastMessageIndex] = useState(-1); // Track latest message for pulse animation
  const [processingJobs, setProcessingJobs] = useState<Record<string, ProcessingJob>>({});
  
  // Robot context states voor contextuele animaties
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [justOpened, setJustOpened] = useState(false);
  const [lastMessageReceived, setLastMessageReceived] = useState(0);
  
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
  const jobTrackingCleanupRef = useRef<(() => void) | null>(null);
  const { toast } = useToast();

  // Cleanup job tracking on unmount
  useEffect(() => {
    return () => {
      jobTrackingCleanupRef.current?.();
    };
  }, []);

  // Training mode indicator
  useEffect(() => {
    if (trainingMode) {
      log.log('🎓 Training mode enabled - tool calling active');
    }
  }, [trainingMode]);

  // Track robot context: justOpened state
  useEffect(() => {
    if (isOpen) {
      setJustOpened(true);
      const timeout = setTimeout(() => setJustOpened(false), 1500);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  // Track robot context: typing state
  useEffect(() => {
    if (input.length > 0) {
      setIsUserTyping(true);
      const timeout = setTimeout(() => setIsUserTyping(false), 1000);
      return () => clearTimeout(timeout);
    } else {
      setIsUserTyping(false);
    }
  }, [input]);

  // Open chat from external components via custom event
  useEffect(() => {
    const handleOpenChatWithContext = (event: Event) => {
      const customEvent = event as CustomEvent<{ prompt: string }>;
      if (customEvent.detail?.prompt) {
        setIsOpen(true);
        setShowWelcome(false);
        setInput(customEvent.detail.prompt);
      }
    };
    window.addEventListener('open-chat-with-context', handleOpenChatWithContext);
    return () => window.removeEventListener('open-chat-with-context', handleOpenChatWithContext);
  }, []);

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

  // ⚡ LAZY LOADING: Load conversation history only when widget opens (skip for embedded mode)
  useEffect(() => {
    const loadConversationHistory = async () => {
      if (!isAuthenticated || (!embedded && !isOpen) || messages.length > 0) return;
      
      const conversationId = getConversationId();
      
      // Uses idx_chat_messages_conv_created for fast lookup
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, role, content, metadata')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) {
        log.error('⚠️ Error loading conversation history:', error.code, error.message);
        return;
      }
      
      if (data && data.length > 0) {
        log.log(`📚 Loaded ${data.length} messages (lazy)`);
        setMessages(data.reverse().map(m => ({
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
  }, [isAuthenticated, isOpen, embedded]);

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

  // Track messages without feedback for reminder banner
  useEffect(() => {
    if (!feedbackReminderDismissed) {
      // Count AI messages that don't have feedback yet (heuristic based on messageId presence)
      const aiMessagesCount = messages.filter(m => m.role === 'assistant' && m.messageId).length;
      setMessagesWithoutFeedback(aiMessagesCount);
    }
  }, [messages, feedbackReminderDismissed]);

  // Track latest message index for pulse animation
  useEffect(() => {
    if (messages.length > 0) {
      const lastIdx = messages.length - 1;
      if (messages[lastIdx].role === 'assistant' && lastIdx > lastMessageIndex) {
        setLastMessageIndex(lastIdx);
      }
    }
  }, [messages, lastMessageIndex]);

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
      log.log('🗑️ Cleared conversation:', oldConversationId);
      
      // 2️⃣ Clear UI state
      setMessages([]);
      setShowWelcome(true);
      setShowResetDialog(false);
      
      // 3️⃣ Genereer nieuwe ID (wordt automatisch gedaan bij volgende message via getConversationId)
      
      toast({
        description: '✅ Chat gewist - nieuwe conversatie gestart',
      });
    } catch (error) {
      log.error('Error clearing chat:', error);
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

  const parseAssistantResponse = (content: string): { content: string; interactive?: InteractiveElement; agentAction?: AgentActionData } => {
    // Check for agent action card markers FIRST
    const agentActionMatch = content.match(/\[AGENT_ACTION_CARD\]([\s\S]*?)\[\/AGENT_ACTION_CARD\]/);
    if (agentActionMatch) {
      try {
        const actionData = JSON.parse(agentActionMatch[1]) as AgentActionData;
        const cleanedContent = content.replace(/\[AGENT_ACTION_CARD\][\s\S]*?\[\/AGENT_ACTION_CARD\]/, '').trim();
        return { content: cleanedContent, agentAction: actionData };
      } catch (e) {
        log.error('Failed to parse agent action card:', e);
      }
    }
    
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
    setLastMessageReceived(Date.now()); // Track for robot acknowledgment nod
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
      log.error('Stream timeout after 120s');
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

      log.log('🤖 AI Request:', {
        messageCount: newMessages.length,
        timestamp: new Date().toISOString()
      });
      
      const conversationId = getConversationId();
      log.log('🔑 Sending conversation_id to ai-chat:', conversationId);
      
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
            pageContext: {
              path: currentPath,
              label: currentPageContext.label,
              description: currentPageContext.description,
            }, // ✅ Stuur page context mee voor relevantere antwoorden
          }),
        }
      );

      if (!response.ok) {
        clearTimeout(timeoutId);
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        log.error('AI response error:', response.status, errorData);
        
        // Auto-retry voor missing conversation_id
        if (response.status === 400 && errorData.error?.includes('conversation_id') && retryCount === 0) {
          log.warn('⚠️ Missing conversation_id, regenerating and retrying...');
          startNewConversation();
          setMessages(prev => prev.slice(0, -1));
          return streamChat(userMessage, 1);
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
      // Fast Path metadata
      let isFastPath = false;
      let fastPathLogId: string | undefined;
      let patternId: string | undefined;

      // Add empty assistant message that we'll update
      setMessages(prev => [...prev, { role: 'assistant', content: '', showInteractive: false, usedKnowledge: [] }]);

      log.log('📡 Starting stream...');

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            log.log('✅ Stream complete:', { totalChunks: chunkCount, messageLength: assistantMessage.length });
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
              
              // 🆕 Handle Fast Path metadata event
              if (parsed.type === 'fast_path_metadata' && parsed.data) {
                const fpMeta = parsed.data;
                isFastPath = fpMeta.isFastPath === true;
                fastPathLogId = fpMeta.fastPathLogId;
                patternId = fpMeta.patternId;
                if (fpMeta.messageId) messageId = fpMeta.messageId;
                log.log('⚡ Fast Path metadata:', { isFastPath, fastPathLogId, patternId });
              }
              
              const content = parsed.choices?.[0]?.delta?.content;
              const metadata = parsed.choices?.[0]?.delta?.metadata;
              
              // Capture usedKnowledge metadata
              if (metadata?.usedKnowledge) {
                usedKnowledge = metadata.usedKnowledge;
                log.log('📚 Knowledge used:', usedKnowledge.length, 'items');
              }
              
              // Capture messageId metadata
              if (metadata?.messageId) {
                messageId = metadata.messageId;
                log.log('🆔 Message ID received:', messageId);
              }
              
              if (content) {
                assistantMessage += content;
                const parsedResponse = parseAssistantResponse(assistantMessage);
                
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: parsedResponse.content, // Use cleaned content (without markers)
                    interactive: parsedResponse.interactive,
                    showInteractive: !!parsedResponse.interactive,
                    usedKnowledge: usedKnowledge.length > 0 ? usedKnowledge : [],
                    messageId: messageId || undefined,
                    agentAction: parsedResponse.agentAction,
                    // Fast Path metadata
                    isFastPath,
                    fastPathLogId,
                    patternId,
                  };
                  return updated;
                });
              }
            } catch (parseError) {
              log.warn('Parse error for chunk:', jsonStr.substring(0, 50));
            }
          }
        }
      } catch (streamError) {
        log.error('Stream reading error:', streamError);
        throw new Error('Fout bij het ontvangen van AI-antwoord');
      }

      clearTimeout(timeoutId);
      setIsLoading(false);

      // ============================================
      // FALLBACK: Ensure messageId is set
      // ============================================
      if (!messageId) {
        log.warn('⚠️ No messageId received during stream, fetching from DB...');
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
            log.log('✅ Fetched messageId from DB:', messageId);
            
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

      // ✅ FIX: Removed duplicate continuous-learner call - backend (ai-chat) handles this already

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
      log.log('📄 Starting document processing via queue...');
      
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
      
      log.log('✅ Uploaded to storage:', filePath);
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
      
      log.log(`✅ Queued ${jobIds.length} jobs, total chunks: ${totalChunks}`);
      
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
      jobTrackingCleanupRef.current?.();
      jobTrackingCleanupRef.current = startJobProgressTracking(jobIds, totalChunks);
      
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
    log.log('📡 Starting realtime tracking for jobs:', jobIds);
    
    const channel = supabase
      .channel('chat-widget-job-progress')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'processing_jobs',
          filter: `id=in.(${jobIds.join(',')})`
        },
        (payload) => {
          log.log('📊 Job update:', payload.new);
          
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
    log.log('🧠 Fetching processed knowledge...');
    
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


  // Embedded mode rendering (voor AI Training pagina)
  if (embedded) {
    return (
      <div className="h-[600px] flex flex-col border rounded-lg bg-background">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {msg.role === 'assistant' && (
                  <Avatar className="h-8 w-8 border border-primary/20 shrink-0">
                    <AvatarFallback className="bg-primary/10">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className={`rounded-lg px-4 py-2.5 max-w-[85%] ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 border border-primary/20">
                  <AvatarFallback className="bg-primary/10"><Sparkles className="h-4 w-4 text-primary" /></AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-lg px-4 py-2.5 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-xs">Bezig...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        <form onSubmit={handleSubmit} className="p-4 border-t">
          <div className="flex gap-2">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Stel je vraag..." className="min-h-[60px]" disabled={isLoading} />
            <Button type="submit" disabled={!input.trim() || isLoading}>{isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <>
      {/* Chat Icon */}
      <SimpleChatIcon 
        onClick={() => setIsOpen(!isOpen)} 
        isActive={isOpen}
      />

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
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">ABCzorg Assistent</h3>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                    {currentPageContext.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{currentPageContext.description}</p>
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
                      👋 Hallo! Ik ben de <strong>ABCzorg Assistent</strong>. 
                      {currentPageContext.label !== 'ABCzorg' && (
                        <> Je bent nu op <strong>{currentPageContext.label}</strong>.</>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground mb-3">
                      {currentPageContext.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Kies een snelle actie of stel je eigen vraag!
                    </p>
                  </div>
                </div>

                {/* Dynamic Quick Actions based on current page */}
                <div className="space-y-2 pl-11">
                  {currentPageContext.quickActions.map((action, idx) => {
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
                      {/* Agent Action Card for confirmation flow */}
                      {msg.agentAction && (
                        <AgentActionCard
                          actionData={msg.agentAction}
                          onConfirm={(goalId) => {
                            log.log('✅ Agent action confirmed:', goalId);
                          }}
                          onCancel={() => {
                            log.log('❌ Agent action cancelled');
                            setMessages(prev => prev.map((m, i) => 
                              i === idx ? { ...m, agentAction: undefined } : m
                            ));
                          }}
                        />
                      )}
                      
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
                        <>
                          <MessageFeedback 
                            messageContent={msg.content} 
                            messageId={msg.messageId}
                            usedKnowledge={msg.usedKnowledge}
                            isNewMessage={idx === lastMessageIndex}
                            isFastPath={msg.isFastPath}
                            fastPathLogId={msg.fastPathLogId}
                            patternId={msg.patternId}
                          />
                          {msg.usedKnowledge && msg.usedKnowledge.length > 0 && (
                            <AIMemoryPanel knowledgeIds={msg.usedKnowledge} />
                          )}
                        </>
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

          {/* Feedback Reminder Banner */}
          <FeedbackReminderBanner
            messagesWithoutFeedback={messagesWithoutFeedback}
            onDismiss={() => {
              setFeedbackReminderDismissed(true);
              setMessagesWithoutFeedback(0);
            }}
          />

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
