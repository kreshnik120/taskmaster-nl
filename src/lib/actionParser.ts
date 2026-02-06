import { addDays, setHours, setMinutes, startOfDay } from "date-fns";

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

export type ParsedActionType = 'action' | 'subtask' | 'note';

export interface ParsedAction {
  cleanText: string;
  type: ParsedActionType;
  assignee_id: string | null;
  assignee_name: string | null;
  deadline: Date | null;
}

/**
 * Parse action input text to extract:
 * - @mentions for assignee
 * - /s or /subtaak prefix for subtask
 * - /n or /notitie prefix for note
 * - #deadline keywords (vandaag, morgen, volgendeweek, overmorgen)
 */
export function parseActionInput(text: string, teamMembers: TeamMember[]): ParsedAction {
  let cleanText = text.trim();
  let type: ParsedActionType = 'action';
  let assignee_id: string | null = null;
  let assignee_name: string | null = null;
  let deadline: Date | null = null;

  // Check for /s or /subtaak prefix → force subtask
  if (/^\/s(?:ubtaak)?\s+/i.test(cleanText)) {
    type = 'subtask';
    cleanText = cleanText.replace(/^\/s(?:ubtaak)?\s+/i, '');
  }

  // Check for /n or /notitie prefix → force note
  if (/^\/n(?:otitie)?\s+/i.test(cleanText)) {
    type = 'note';
    cleanText = cleanText.replace(/^\/n(?:otitie)?\s+/i, '');
  }

  // Check for @mention → find team member and set as subtask
  const mentionMatch = cleanText.match(/@(\w+)/);
  if (mentionMatch) {
    const mentionName = mentionMatch[1].toLowerCase();
    
    // Find matching team member (by name or email prefix)
    const member = teamMembers.find(m => {
      const nameLower = m.name?.toLowerCase() || '';
      const emailPrefix = m.email?.split('@')[0]?.toLowerCase() || '';
      return nameLower.includes(mentionName) || 
             mentionName.includes(nameLower) ||
             emailPrefix.includes(mentionName) ||
             mentionName.includes(emailPrefix);
    });

    if (member) {
      assignee_id = member.id;
      assignee_name = member.name;
      type = 'subtask'; // @mention always creates a subtask
      cleanText = cleanText.replace(/@\w+\s*/g, '').trim();
    }
  }

  // Check for #deadline keywords
  const deadlineMatch = cleanText.match(/#(vandaag|morgen|overmorgen|volgendeweek|volgendweek)/i);
  if (deadlineMatch) {
    const keyword = deadlineMatch[1].toLowerCase();
    const now = new Date();
    const today = startOfDay(now);
    
    switch (keyword) {
      case 'vandaag':
        // Today at 17:00
        deadline = setMinutes(setHours(today, 17), 0);
        break;
      case 'morgen':
        // Tomorrow at 17:00
        deadline = setMinutes(setHours(addDays(today, 1), 17), 0);
        break;
      case 'overmorgen':
        // Day after tomorrow at 17:00
        deadline = setMinutes(setHours(addDays(today, 2), 17), 0);
        break;
      case 'volgendeweek':
      case 'volgendweek':
        // Next Monday at 9:00
        const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
        deadline = setMinutes(setHours(addDays(today, daysUntilMonday), 9), 0);
        break;
    }

    cleanText = cleanText.replace(/#(vandaag|morgen|overmorgen|volgendeweek|volgendweek)\s*/gi, '').trim();
  }

  return {
    cleanText,
    type,
    assignee_id,
    assignee_name,
    deadline
  };
}

/**
 * Get a preview description of what will be created
 */
export function getActionPreview(parsed: ParsedAction): string {
  const parts: string[] = [];
  
  switch (parsed.type) {
    case 'subtask':
      if (parsed.assignee_name) {
        parts.push(`📌 Subtaak voor ${parsed.assignee_name}`);
      } else {
        parts.push('📌 Subtaak (eigen)');
      }
      break;
    case 'note':
      parts.push('📝 Notitie');
      break;
    case 'action':
      parts.push('⚡ Vervolgactie');
      break;
  }

  if (parsed.deadline) {
    const dateStr = parsed.deadline.toLocaleDateString('nl-NL', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
    parts.push(`📅 ${dateStr}`);
  }

  return parts.join(' • ');
}
