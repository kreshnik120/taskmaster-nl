import { useEffect, useRef, useState } from "react";
import { Search, User, Briefcase } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { WhatsAppContact } from "@/types/whatsapp";

interface WhatsAppContactSearchResultsProps {
  results: WhatsAppContact[];
  isLoading: boolean;
  searchQuery: string;
  onSelectContact: (contact: WhatsAppContact) => void;
  onClose: () => void;
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

export function WhatsAppContactSearchResults({
  results,
  isLoading,
  searchQuery,
  onSelectContact,
  onClose,
}: WhatsAppContactSearchResultsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Reset focus when results change
  useEffect(() => {
    setFocusedIndex(0);
  }, [results]);

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
      // Don't handle if in input (except navigation keys)
      const isInput = document.activeElement?.tagName === "INPUT";
      
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case "ArrowUp":
          event.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          if (results[focusedIndex]) {
            event.preventDefault();
            onSelectContact(results[focusedIndex]);
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
  }, [results, focusedIndex, onSelectContact, onClose]);

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

  // Empty state
  if (results.length === 0) {
    return (
      <div
        ref={containerRef}
        className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50"
      >
        <EmptySearchState query={searchQuery} />
      </div>
    );
  }

  // Results list
  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 max-h-[320px] overflow-y-auto"
      role="listbox"
      aria-label="Zoekresultaten contacten"
    >
      <div className="p-1">
        {results.map((contact, index) => (
          <button
            key={contact.id}
            onClick={() => onSelectContact(contact)}
            onMouseEnter={() => setFocusedIndex(index)}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors",
              focusedIndex === index
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted"
            )}
            role="option"
            aria-selected={focusedIndex === index}
          >
            <Avatar className="h-10 w-10">
              <AvatarImage
                src={contact.profile_picture_url || undefined}
                alt={contact.display_name || contact.phone_number}
              />
              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                {getInitials(contact)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">
                  {contact.display_name || contact.push_name || contact.phone_number}
                </span>
                {contact.is_business_account && (
                  <Briefcase className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                )}
              </div>
              <span className="text-xs text-muted-foreground truncate block">
                {contact.phone_number}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
