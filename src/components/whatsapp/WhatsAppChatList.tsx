import { useState, useCallback } from "react";
import { Search } from "lucide-react";
import { Virtuoso } from "react-virtuoso";
import { Input } from "@/components/ui/input";
import { WhatsAppFilterTabs } from "./WhatsAppFilterTabs";
import { WhatsAppTagFilter } from "./WhatsAppTagFilter";
import { WhatsAppChatItem } from "./WhatsAppChatItem";
import { WhatsAppChatContextMenu } from "./WhatsAppChatContextMenu";
import { WhatsAppContactSearchResults } from "./WhatsAppContactSearchResults";
import { ChatListSkeleton } from "./WhatsAppSkeletonLoader";
import { ChatListEmptyState } from "./WhatsAppEmptyState";
import { useSearchContacts } from "@/hooks/whatsapp/useSearchContacts";
import type { WhatsAppChat, WhatsAppFilter, WhatsAppContact } from "@/types/whatsapp";

interface WhatsAppChatListProps {
  chats: WhatsAppChat[];
  isLoading: boolean;
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filter: WhatsAppFilter;
  onFilterChange: (filter: WhatsAppFilter) => void;
  unreadCount: number;
  tagFilter: string | null;
  onTagFilterChange: (tag: string | null) => void;
  availableTags: string[];
  onSelectContact?: (contact: WhatsAppContact) => void;
}

export function WhatsAppChatList({
  chats,
  isLoading,
  selectedChatId,
  onSelectChat,
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
  unreadCount,
  tagFilter,
  onTagFilterChange,
  availableTags,
  onSelectContact,
}: WhatsAppChatListProps) {
  const [isContactSearchMode, setIsContactSearchMode] = useState(false);

  // Contact search hook
  const { data: searchResults = [], isLoading: isSearching } = useSearchContacts({
    query: searchQuery,
    enabled: isContactSearchMode,
  });

  // Show contact results overlay when in search mode and query is long enough
  const showContactResults = isContactSearchMode && searchQuery.length >= 2;

  // Handle contact selection
  const handleSelectContact = useCallback((contact: WhatsAppContact) => {
    onSelectContact?.(contact);
    setIsContactSearchMode(false);
    onSearchChange(""); // Clear search after selection
  }, [onSelectContact, onSearchChange]);

  // Close search overlay
  const handleCloseSearch = useCallback(() => {
    setIsContactSearchMode(false);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b space-y-3 bg-background">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isContactSearchMode 
              ? "Zoek contact op naam of nummer..." 
              : "Zoek in gesprekken..."}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setIsContactSearchMode(true)}
            className="pl-10"
            aria-label="Zoek in gesprekken"
            data-search-input
          />
          
          {/* Contact search results overlay */}
          {showContactResults && (
            <WhatsAppContactSearchResults
              results={searchResults}
              isLoading={isSearching}
              searchQuery={searchQuery}
              onSelectContact={handleSelectContact}
              onClose={handleCloseSearch}
            />
          )}
        </div>

        {/* Filter tabs */}
        <WhatsAppFilterTabs
          filter={filter}
          onFilterChange={onFilterChange}
          unreadCount={unreadCount}
        />

        {/* Tag filter - only show if tags exist */}
        {availableTags.length > 0 && (
          <WhatsAppTagFilter
            selectedTag={tagFilter}
            onSelectTag={onTagFilterChange}
            availableTags={availableTags}
          />
        )}
      </div>

      {/* Chat list */}
      <div 
        className="flex-1 overflow-hidden"
        role="listbox"
        aria-label="WhatsApp gesprekken"
        aria-activedescendant={selectedChatId ? `chat-${selectedChatId}` : undefined}
      >
        {isLoading ? (
          <ChatListSkeleton />
        ) : chats.length === 0 ? (
          <ChatListEmptyState searchQuery={searchQuery} />
        ) : (
          <Virtuoso
            data={chats}
            style={{ height: '100%' }}
            overscan={10}
            className="scrollbar-thin"
            itemContent={(index, chat) => (
              <WhatsAppChatContextMenu chat={chat}>
                <div
                  id={`chat-${chat.id}`}
                  role="option"
                  aria-selected={selectedChatId === chat.id}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectChat(chat.id);
                    }
                  }}
                >
                  <WhatsAppChatItem
                    chat={chat}
                    isSelected={selectedChatId === chat.id}
                    onClick={() => onSelectChat(chat.id)}
                  />
                </div>
              </WhatsAppChatContextMenu>
            )}
          />
        )}
      </div>
    </div>
  );
}
