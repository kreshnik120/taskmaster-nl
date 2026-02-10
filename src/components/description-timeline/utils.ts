import { format, parseISO, differenceInMinutes } from "date-fns";
import { nl } from "date-fns/locale";
import { DescriptionChangeEntry, GroupedEntry } from "./types";

const GROUPING_WINDOW_MINUTES = 5;

/**
 * Groepeer entries binnen 5 minuten van dezelfde gebruiker
 */
export function groupEntries(entries: DescriptionChangeEntry[]): GroupedEntry[] {
  if (entries.length === 0) return [];

  const groups: GroupedEntry[] = [];
  let currentGroup: DescriptionChangeEntry[] = [];
  let currentUser: string | null = null;
  let groupStartTime: Date | null = null;

  // Entries zijn al gesorteerd desc, dus we werken van nieuw naar oud
  for (const entry of entries) {
    const entryTime = parseISO(entry.created_at);
    const entryUser = entry.created_by_name || 'Onbekend';

    // Start nieuwe groep als:
    // 1. Eerste entry
    // 2. Andere gebruiker
    // 3. Meer dan 5 minuten verschil
    const shouldStartNewGroup = 
      currentGroup.length === 0 ||
      currentUser !== entryUser ||
      (groupStartTime && Math.abs(differenceInMinutes(entryTime, groupStartTime)) > GROUPING_WINDOW_MINUTES);

    if (shouldStartNewGroup) {
      // Sla vorige groep op als die bestaat
      if (currentGroup.length > 0) {
        groups.push(createGroup(currentGroup));
      }
      // Start nieuwe groep
      currentGroup = [entry];
      currentUser = entryUser;
      groupStartTime = entryTime;
    } else {
      // Voeg toe aan huidige groep
      currentGroup.push(entry);
    }
  }

  // Voeg laatste groep toe
  if (currentGroup.length > 0) {
    groups.push(createGroup(currentGroup));
  }

  return groups;
}

function createGroup(entries: DescriptionChangeEntry[]): GroupedEntry {
  // Entries zijn desc gesorteerd, dus eerste = nieuwste, laatste = oudste
  const firstEntry = entries[0]; // nieuwste
  const lastEntry = entries[entries.length - 1]; // oudste

  return {
    id: firstEntry.id,
    entries,
    firstEntry,
    lastEntry,
    count: entries.length,
    created_by_name: firstEntry.created_by_name || 'Onbekend',
    startTime: lastEntry.created_at, // oudste tijd
    endTime: firstEntry.created_at, // nieuwste tijd
    isSingle: entries.length === 1,
  };
}

export function formatRelativeDate(dateStr: string): string {
  const date = parseISO(dateStr);
  return format(date, "d MMM 'om' HH:mm", { locale: nl });
}

export function truncateText(text: string | null | undefined, maxLength: number = 100): string | null {
  if (!text) return null;
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function computeChangeSummary(metadata?: {
  old_description?: string | null;
  new_description?: string | null;
  change_type?: string;
}): string {
  if (!metadata) return 'Beschrijving gewijzigd';

  const { old_description, new_description, change_type } = metadata;
  const hasOld = !!old_description?.trim();
  const hasNew = !!new_description?.trim();

  if (change_type === 'added' || (!hasOld && hasNew)) {
    return 'Beschrijving aangemaakt';
  }
  if (change_type === 'removed' || (hasOld && !hasNew)) {
    return 'Beschrijving verwijderd';
  }
  if (hasOld && hasNew) {
    const oldWords = countWords(old_description!);
    const newWords = countWords(new_description!);
    const diff = newWords - oldWords;
    if (diff > 0) return `${diff} woord${diff > 1 ? 'en' : ''} toegevoegd`;
    if (diff < 0) return `${Math.abs(diff)} woord${Math.abs(diff) > 1 ? 'en' : ''} verwijderd`;
    return 'Beschrijving gewijzigd';
  }
  return 'Beschrijving gewijzigd';
}
