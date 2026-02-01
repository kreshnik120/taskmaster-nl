import { useEffect, useRef, useState, ReactNode } from "react";
import { Search, User, Briefcase, AlertCircle, Clock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WhatsAppContact } from "@/types/whatsapp";

interface WhatsAppContactSearchResultsProps {
  results: WhatsAppContact[];
  isLoading: boolean;
  isError?: boolean;
  searchQuery: string;
  onSelectContact: (contact: WhatsAppContact) => void;
  onClose: () => void;
  onRetry?: () => void;
  recentContacts?: WhatsAppContact[];
  showRecent?: boolean;
}

function getInitials(contact: WhatsAppContact): string {
  const name = contact.display_name || contact.push_name || contact.phone_number;
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Escape special regex characters in user input
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Highlight matching text in search results
function highlightMatch(text: string | null, query: string): ReactNode {
  if (!text || !query || query.length < 2) return text;
  
  try {
    const escapedQuery = escapeRegExp(query);
    const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));
    
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded-sm px-0.5">{part}</mark>
        : part
    );
  } catch {
    return text;
  }
}

function ContactResultSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

function EmptySearchState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="rounded-full bg-muted p-3 mb-3">
        <Search className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">Geen contacten gevonden</p>
      <p className="text-xs text-muted-foreground mt-1">
        Geen resultaten voor "{query}"
      </p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="rounded-full bg-destructive/10 p-3 mb-3">
        <AlertCircle className="h-5 w-5 text-destructive" />
      </div>
      <p className="text-sm font-medium text-foreground">Er ging iets mis</p>
      <p className="text-xs text-muted-foreground mt-1">
        Kon contacten niet laden
      </p>
      {onRetry && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onRetry}
          className="mt-3"
        >
          Probeer opnieuw
        </Button>
      )}
    </div>
  );
}

function RecentContactsHeader() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground border-b">
      <Clock className="h-3.5 w-3.5" />
      <span>Recent gecontacteerd</span>
    </div>
  );
}

interface ContactItemProps {
  contact: WhatsAppContact;
  isFocused: boolean;
  searchQuery: string;
  onSelect: () => void;
  onMouseEnter: () => void;
}

function ContactItem({ contact, isFocused, searchQuery, onSelect, onMouseEnter }: ContactItemProps) {
  const displayName = contact.display_name || contact.push_name || contact.phone_number;
  
  return (
    <button
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors",
        isFocused
          ? "bg-accent text-accent-foreground"
          : "hover:bg-muted"
      )}
      role="option"
      aria-selected={isFocused}
    >
      <Avatar className="h-10 w-10">
        <AvatarImage
          src={contact.profile_picture_url || undefined}
          alt={displayName}
        />
        <AvatarFallback className="bg-primary/10 text-primary text-sm">
          {getInitials(contact)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">
            {highlightMatch(displayName, searchQuery)}
          </span>
          {contact.is_business_account && (
            <Briefcase className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          )}
        </div>
        <span className="text-xs text-muted-foreground truncate block">
          {highlightMatch(contact.phone_number, searchQuery)}
        </span>
      </div>
    </button>
  );
}

export function WhatsAppContactSearchResults({
  results,
  isLoading,
  isError = false,
  searchQuery,
  onSelectContact,
  onClose,
  onRetry,
  recentContacts = [],
  showRecent = false,
}: WhatsAppContactSearchResultsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Determine which contacts to display
  const displayContacts = showRecent && searchQuery.length < 2 ? recentContacts : results;
  const isShowingRecent = showRecent && searchQuery.length < 2 && recentContacts.length > 0;

  // Reset focus when results change
  useEffect(() => {
    setFocusedIndex(0);
  }, [results, recentContacts, showRecent]);

  // Handle click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        // Check if click is on the search input
        const target = event.target as HTMLElement;
        if (target.closest('[data-search-input]')) return;
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, displayContacts.length - 1));
          break;
        case "ArrowUp":
          event.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          if (displayContacts[focusedIndex]) {
            event.preventDefault();
            onSelectContact(displayContacts[focusedIndex]);
          }
          break;
        case "Escape":
          event.preventDefault();
          onClose();
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [displayContacts, focusedIndex, onSelectContact, onClose]);

  // Error state
  if (isError) {
    return (
      <div
        ref={containerRef}
        className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50"
      >
        <ErrorState onRetry={onRetry} />
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        ref={containerRef}
        className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 max-h-[320px] overflow-y-auto"
      >
        <div className="p-1">
          <ContactResultSkeleton />
          <ContactResultSkeleton />
          <ContactResultSkeleton />
        </div>
      </div>
    );
  }

  // Empty state (only for search, not recent)
  if (!isShowingRecent && displayContacts.length === 0 && searchQuery.length >= 2) {
    return (
      <div
        ref={containerRef}
        className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50"
      >
        <EmptySearchState query={searchQuery} />
      </div>
    );
  }

  // No recent contacts and no search
  if (isShowingRecent && recentContacts.length === 0) {
    return null;
  }

  // Hide if no results and short query (not showing recent)
  if (!isShowingRecent && displayContacts.length === 0) {
    return null;
  }

  // Results list
  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 max-h-[320px] overflow-y-auto"
      role="listbox"
      aria-label={isShowingRecent ? "Recente contacten" : "Zoekresultaten contacten"}
    >
      {isShowingRecent && <RecentContactsHeader />}
      <div className="p-1">
        {displayContacts.map((contact, index) => (
          <ContactItem
            key={contact.id}
            contact={contact}
            isFocused={focusedIndex === index}
            searchQuery={isShowingRecent ? "" : searchQuery}
            onSelect={() => onSelectContact(contact)}
            onMouseEnter={() => setFocusedIndex(index)}
          />
        ))}
      </div>
    </div>
  );
}
