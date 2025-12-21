/**
 * Parser voor beschikbaarheid strings naar gestructureerd JSON
 */

export interface BeschikbaarheidUren {
  min: number;
  max: number;
  flexibel?: boolean;
  dagen_per_week?: number;
  opmerkingen?: string;
}

/**
 * Parse beschikbaarheid string naar gestructureerd formaat
 * Voorbeelden:
 * - "24-32 uur" → { min: 24, max: 32 }
 * - "Fulltime" → { min: 36, max: 40 }
 * - "Parttime 2-3 dagen" → { min: 16, max: 24, dagen_per_week: 3 }
 * - "16 uur per week" → { min: 16, max: 16 }
 */
export function parseBeschikbaarheid(beschikbaarheid: string | null | undefined): BeschikbaarheidUren | null {
  if (!beschikbaarheid || typeof beschikbaarheid !== 'string') {
    return null;
  }

  const input = beschikbaarheid.toLowerCase().trim();

  // Fulltime varianten
  if (input.includes('fulltime') || input.includes('full-time') || input.includes('voltijd')) {
    return { min: 36, max: 40, flexibel: false };
  }

  // Pattern: "24-32 uur" of "24 - 32 uur"
  const rangeMatch = input.match(/(\d+)\s*[-–]\s*(\d+)\s*(?:uur|u)?/);
  if (rangeMatch) {
    return {
      min: parseInt(rangeMatch[1], 10),
      max: parseInt(rangeMatch[2], 10),
      flexibel: input.includes('flexibel')
    };
  }

  // Pattern: "16 uur" of "16 uur per week"
  const singleMatch = input.match(/(\d+)\s*(?:uur|u)/);
  if (singleMatch) {
    const hours = parseInt(singleMatch[1], 10);
    return {
      min: hours,
      max: hours,
      flexibel: input.includes('flexibel')
    };
  }

  // Pattern: "2-3 dagen" of "3 dagen per week"
  const dagenMatch = input.match(/(\d+)(?:\s*[-–]\s*(\d+))?\s*dag(?:en)?/);
  if (dagenMatch) {
    const minDagen = parseInt(dagenMatch[1], 10);
    const maxDagen = dagenMatch[2] ? parseInt(dagenMatch[2], 10) : minDagen;
    // Assumptie: 8 uur per dag
    return {
      min: minDagen * 8,
      max: maxDagen * 8,
      dagen_per_week: maxDagen,
      flexibel: input.includes('flexibel')
    };
  }

  // Parttime varianten zonder specifiek
  if (input.includes('parttime') || input.includes('part-time') || input.includes('deeltijd')) {
    return { min: 16, max: 32, flexibel: true };
  }

  // Minimaal X uur
  const minMatch = input.match(/min(?:imaal)?\s*(\d+)\s*(?:uur|u)?/);
  if (minMatch) {
    const minHours = parseInt(minMatch[1], 10);
    return { min: minHours, max: 40, flexibel: true };
  }

  // Maximaal X uur
  const maxMatch = input.match(/max(?:imaal)?\s*(\d+)\s*(?:uur|u)?/);
  if (maxMatch) {
    const maxHours = parseInt(maxMatch[1], 10);
    return { min: 0, max: maxHours, flexibel: true };
  }

  // Fallback: bewaar als opmerking
  return {
    min: 0,
    max: 40,
    flexibel: true,
    opmerkingen: beschikbaarheid
  };
}

/**
 * Format beschikbaarheid JSON terug naar leesbare string
 */
export function formatBeschikbaarheid(uren: BeschikbaarheidUren | null): string {
  if (!uren) return 'Onbekend';

  if (uren.min === uren.max) {
    return `${uren.min} uur per week`;
  }

  if (uren.min >= 36 && uren.max >= 36) {
    return 'Fulltime';
  }

  return `${uren.min}-${uren.max} uur per week${uren.flexibel ? ' (flexibel)' : ''}`;
}
