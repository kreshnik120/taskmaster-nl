import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { WhatsAppChatList } from "@/components/whatsapp/WhatsAppChatList";
import { WhatsAppChatDetail } from "@/components/whatsapp/WhatsAppChatDetail";
import { WhatsAppEmptyState } from "@/components/whatsapp/WhatsAppEmptyState";
import { useWhatsAppChats } from "@/hooks/whatsapp/useWhatsAppChats";

export default function WhatsApp() {
  const { chatId: urlChatId } = useParams();
  const navigate = useNavigate();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(urlChatId || null);

  const {
    filteredChats,
    isLoading,
    searchQuery,
    setSearchQuery,
    filter,
    setFilter,
    stats,
  } = useWhatsAppChats();

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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if no input is focused
      if (document.activeElement?.tagName === 'INPUT') return;

      switch (e.key) {
        case 'Escape':
          if (selectedChatId) {
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredChats, selectedChatId, handleSelectChat, handleBack]);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Chat List - responsive width */}
      <div className={cn(
        "border-r bg-background flex-shrink-0",
        // Mobile: full width when no chat selected, hidden when chat is selected
        "w-full md:w-[380px]",
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
          />
        ) : (
          <WhatsAppEmptyState stats={stats} />
        )}
      </div>
    </div>
  );
}
