import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { WhatsAppChatList } from "@/components/whatsapp/WhatsAppChatList";
import { WhatsAppChatDetail } from "@/components/whatsapp/WhatsAppChatDetail";
import { WhatsAppEmptyState } from "@/components/whatsapp/WhatsAppEmptyState";
import { WhatsAppContactProfile } from "@/components/whatsapp/WhatsAppContactProfile";
import { WhatsAppGroupProfile } from "@/components/whatsapp/WhatsAppGroupProfile";
import { WhatsAppConnectionStatus } from "@/components/whatsapp/WhatsAppConnectionStatus";
import { WhatsAppErrorBoundary } from "@/components/whatsapp/WhatsAppErrorBoundary";
import { WhatsAppCommandPalette } from "@/components/whatsapp/WhatsAppCommandPalette";
import { WhatsAppKeyboardHelp } from "@/components/whatsapp/WhatsAppKeyboardHelp";
import { useWhatsAppChats } from "@/hooks/whatsapp/useWhatsAppChats";
import { useWhatsAppRealtimeStatus } from "@/hooks/whatsapp/useWhatsAppRealtimeStatus";
import { useUpdateChatStatus } from "@/hooks/whatsapp/useUpdateChatStatus";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import type { WhatsAppContact } from "@/types/whatsapp";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";

export default function WhatsApp() {
  const { chatId: urlChatId } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(urlChatId || null);
  
  // Profile panel state with localStorage persistence
  const [showProfile, setShowProfile] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('whatsapp-profile-open') === 'true';
    }
    return false;
  });

  // Command palette state
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);

  const {
    filteredChats,
    isLoading,
    searchQuery,
    setSearchQuery,
    filter,
    setFilter,
    tagFilter,
    setTagFilter,
    availableTags,
    stats,
    refetch,
  } = useWhatsAppChats();

  // Realtime connection status
  const { status: connectionStatus, reconnect } = useWhatsAppRealtimeStatus();

  // Chat status mutations for keyboard shortcuts
  const updateStatus = useUpdateChatStatus();

  // Persist profile state
  useEffect(() => {
    localStorage.setItem('whatsapp-profile-open', String(showProfile));
  }, [showProfile]);

  // Sync URL with selected chat
  useEffect(() => {
    if (urlChatId && urlChatId !== selectedChatId) {
      setSelectedChatId(urlChatId);
    }
  }, [urlChatId]);

  // Find selected chat
  const selectedChat = useMemo(() => {
    if (!selectedChatId) return null;
    return filteredChats.find(c => c.id === selectedChatId) || null;
  }, [filteredChats, selectedChatId]);

  // Handle chat selection
  const handleSelectChat = useCallback((chatId: string) => {
    setSelectedChatId(chatId);
    // Update URL for deep linking
    navigate(`/whatsapp/chat/${chatId}`, { replace: true });
  }, [navigate]);

  // Handle back button (mobile)
  const handleBack = useCallback(() => {
    setSelectedChatId(null);
    navigate('/whatsapp', { replace: true });
  }, [navigate]);

  // Handle contact selection from search
  const handleSelectContact = useCallback((contact: WhatsAppContact) => {
    // Find existing chat with this contact
    const existingChat = filteredChats.find(c => c.contact_id === contact.id);
    
    if (existingChat) {
      // Open existing chat
      handleSelectChat(existingChat.id);
    } else {
      // Show notification that no chat exists yet
      toast.info(`Nog geen gesprek met ${contact.display_name || contact.phone_number}`, {
        description: "Start een nieuw gesprek door een bericht te sturen",
      });
    }
  }, [filteredChats, handleSelectChat]);

  // Toggle profile panel
  const toggleProfile = useCallback(() => {
    setShowProfile(prev => !prev);
  }, []);

  // Close profile when no chat is selected
  useEffect(() => {
    if (!selectedChatId) {
      setShowProfile(false);
    }
  }, [selectedChatId]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // STAP 1: Shortcuts die ALTIJD werken (ook in inputs)
      
      // Command palette shortcut
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // Focus search input shortcut
      if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement;
        searchInput?.focus();
        return;
      }

      // STAP 2: Stop als we in een input zitten
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      // STAP 3: Shortcuts die NIET in inputs werken
      switch (e.key) {
        case 'p':
          if ((e.metaKey || e.ctrlKey) && selectedChatId && selectedChat) {
            e.preventDefault();
            updateStatus.mutate({
              chatId: selectedChatId,
              field: 'is_pinned',
              value: !selectedChat.is_pinned,
            });
          }
          break;
        case 'm':
          if ((e.metaKey || e.ctrlKey) && selectedChatId && selectedChat) {
            e.preventDefault();
            updateStatus.mutate({
              chatId: selectedChatId,
              field: 'is_muted',
              value: !selectedChat.is_muted,
            });
          }
          break;
        case 'a':
          if ((e.metaKey || e.ctrlKey) && e.shiftKey && selectedChatId) {
            e.preventDefault();
            updateStatus.mutate({
              chatId: selectedChatId,
              field: 'is_archived',
              value: true,
            });
          }
          break;
        case 'Escape':
          if (showProfile) {
            e.preventDefault();
            setShowProfile(false);
          } else if (selectedChatId) {
            e.preventDefault();
            handleBack();
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (filteredChats.length > 0) {
            const currentIndex = selectedChatId 
              ? filteredChats.findIndex(c => c.id === selectedChatId)
              : -1;
            const nextIndex = Math.min(currentIndex + 1, filteredChats.length - 1);
            handleSelectChat(filteredChats[nextIndex].id);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (filteredChats.length > 0) {
            const currentIndex = selectedChatId 
              ? filteredChats.findIndex(c => c.id === selectedChatId)
              : filteredChats.length;
            const prevIndex = Math.max(currentIndex - 1, 0);
            handleSelectChat(filteredChats[prevIndex].id);
          }
          break;
        case 'i':
          // Toggle profile with 'i' key when a chat is selected
          if (selectedChatId && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            toggleProfile();
          }
          break;
        case '?':
          // Show keyboard help overlay
          e.preventDefault();
          setKeyboardHelpOpen(true);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredChats, selectedChatId, selectedChat, handleSelectChat, handleBack, showProfile, toggleProfile, updateStatus]);

  // Check if we're on a larger screen for 3-column layout
  const isLargeScreen = !isMobile;

  return (
    <WhatsAppErrorBoundary>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Connection Status - fixed position */}
        <div className="fixed top-20 right-4 z-50">
          <WhatsAppConnectionStatus 
            status={connectionStatus} 
            onReconnect={() => {
              reconnect();
              refetch();
            }} 
          />
        </div>

        {/* Chat List - responsive width */}
        <div className={cn(
          "border-r bg-background flex-shrink-0",
          // Mobile: full width when no chat selected, hidden when chat is selected
          "w-full md:w-[320px] lg:w-[280px]",
          selectedChatId && "hidden md:block"
        )}>
        <WhatsAppChatList
          chats={filteredChats}
          isLoading={isLoading}
          selectedChatId={selectedChatId}
          onSelectChat={handleSelectChat}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filter={filter}
          onFilterChange={setFilter}
          unreadCount={stats.unreadChats}
          tagFilter={tagFilter}
          onTagFilterChange={setTagFilter}
          availableTags={availableTags}
          onSelectContact={handleSelectContact}
        />
      </div>

      {/* Chat Detail - fills remaining space */}
      <div className={cn(
        "flex-1 min-w-0",
        // Mobile: only show when chat is selected
        !selectedChatId && "hidden md:flex"
      )}>
        {selectedChat ? (
          <WhatsAppChatDetail 
            chat={selectedChat} 
            onBack={handleBack}
            showBackButton={true}
            onToggleProfile={toggleProfile}
            showProfileButton={true}
          />
        ) : (
          <WhatsAppEmptyState stats={stats} />
        )}
      </div>

      {/* Contact/Group Profile - Desktop: inline panel */}
      {isLargeScreen && showProfile && selectedChat && (
        <div className="hidden lg:block w-[320px] border-l flex-shrink-0">
          {selectedChat.chat_type === 'group' ? (
            <WhatsAppGroupProfile
              chat={selectedChat}
              onClose={() => setShowProfile(false)}
            />
          ) : (
            <WhatsAppContactProfile
              chat={selectedChat}
              onClose={() => setShowProfile(false)}
            />
          )}
        </div>
      )}

      {/* Contact/Group Profile - Mobile/Tablet: Sheet overlay */}
      <Sheet open={showProfile && !!selectedChat && isMobile} onOpenChange={setShowProfile}>
        <SheetContent side="right" className="w-[320px] p-0">
          {selectedChat && (
            selectedChat.chat_type === 'group' ? (
              <WhatsAppGroupProfile
                chat={selectedChat}
                onClose={() => setShowProfile(false)}
              />
            ) : (
              <WhatsAppContactProfile
                chat={selectedChat}
                onClose={() => setShowProfile(false)}
              />
            )
          )}
        </SheetContent>
      </Sheet>

      {/* Command Palette */}
      <WhatsAppCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        chats={filteredChats}
        selectedChatId={selectedChatId}
        onSelectChat={handleSelectChat}
        onFilterChange={setFilter}
        currentFilter={filter}
      />

      {/* Keyboard Help Overlay */}
      <WhatsAppKeyboardHelp
        open={keyboardHelpOpen}
        onOpenChange={setKeyboardHelpOpen}
      />
      </div>
    </WhatsAppErrorBoundary>
  );
}
