 /**
  * Centrale prioriteit configuratie voor consistente sortering
  * 
  * Sorteervolgorde:
  * - Lager nummer = hogere urgentie
  * - ascending (asc) = meest urgent eerst (CRITICAL → LOW)
  * - descending (desc) = minst urgent eerst (LOW → CRITICAL)
  */
 export const PRIORITY_ORDER: Record<string, number> = {
   CRITICAL: 0,
   HIGH: 1,
   MEDIUM: 2,
   LOW: 3
} as const;
 
 // Default voor onbekende prioriteiten (komt laatst bij ascending)
 export const PRIORITY_DEFAULT = 4;