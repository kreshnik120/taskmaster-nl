

# Error Handling ai-task-scorer + Subtiele Design Verfijningen

## Overzicht

Twee onderdelen: (1) verbetering van de AI scorer error handling zodat de 500 error niet als uncaught exception door de catch chain valt, en (2) 6 subtiele CSS/component verfijningen.

---

## DEEL 1: ai-task-scorer Error Handling

### Huidige situatie
De `useAiScoring` hook heeft al try-catch met toast meldingen. Het probleem is specifiek: wanneer de edge function een 500 retourneert, matcht de error message niet op "429", "402", of "timeout", waardoor `throw error` op regel 144 wordt uitgevoerd. Dit wordt wel opgevangen door de buitenste catch op regel 178, maar de error wordt dubbel gelogd.

### Wijzigingen in `src/hooks/useAiScoring.tsx`
- **Regel 144**: Verwijder `throw error` en vervang door een graceful return met toast melding. De generieke 500/network errors moeten NIET re-thrown worden.
- Dit zorgt ervoor dat bij elke error-variant de hook netjes stopt zonder te crashen.
- De `EmbeddedOpvolgingView` en `Kanban.tsx` gebruiken al null-safe access (`??` operators), dus geen wijzigingen nodig daar.

### Wijzigingen in `supabase/functions/ai-task-scorer/index.ts`
- Wrap de fetch naar de AI gateway in een try-catch die connection errors opvangt en een JSON error response retourneert (status 200 met `{ error: "..." }`) in plaats van een 500 te laten doorvallen.

---

## DEEL 2: Subtiele Design Verfijningen

Alle wijzigingen in `src/index.css` tenzij anders aangegeven.

### 2a. Glass-card border kleurtint
De glass-card-* classes hebben al gekleurde borders (bijv. `hsla(234, 45%, 88%, 0.5)` voor indigo). Deze zijn al correct. Geen wijziging nodig.

### 2b. Hover states verbeteren
- `.glass-hover-lift:hover`: voeg gekleurde shadow toe met CSS custom property `--tab-hue`:
  ```css
  box-shadow: 0 8px 32px hsla(var(--tab-hue, 234), 40%, 50%, 0.12), ...;
  ```
- `.glass-task-card:hover`: `border-color` iets feller maken (`hsla(234, 45%, 80%, 0.6)`)

### 2c. Scroll fade effect
Nieuwe CSS utility class `.scroll-fade` met `mask-image` gradient aan boven- en onderkant:
```css
.scroll-fade {
  mask-image: linear-gradient(to bottom, transparent, black 20px, black calc(100% - 20px), transparent);
}
```
Toepassen op kanban kolom scroll containers en modal scroll areas.

### 2d. Input focus glow
De `.glass-input:focus-visible` en `.glass-search-input:focus` classes bestaan al met gekleurde rings. Versterking:
- `.glass-search-input:focus`: ring opacity verhogen van 0.15 naar 0.20, border kleur toevoegen
- Globale shadcn Input component: al correct gestyled met `focus-visible:ring-2`

### 2e. Tab switch animatie
In `src/components/ui/tabs.tsx`: voeg `data-[state=inactive]:animate-out data-[state=inactive]:fade-out-0 data-[state=active]:animate-in data-[state=active]:fade-in-0` toe aan TabsContent, of simpeler: `transition-opacity duration-300` class.

### 2f. Badge glow
In `src/index.css`: nieuwe utility classes voor urgente badges:
```css
.badge-glow-critical {
  box-shadow: 0 0 8px hsla(0, 70%, 50%, 0.25);
}
.badge-glow-high {
  box-shadow: 0 0 8px hsla(38, 70%, 50%, 0.20);
}
```
In `src/components/PriorityBadge.tsx` of de urgency-badge component: de glow classes toepassen op CRITICAL/HIGH priorities.

---

## Technisch Overzicht

| Bestand | Wijziging |
|---------|-----------|
| `src/hooks/useAiScoring.tsx` | Verwijder throw op regel 144, graceful fallback voor alle error types |
| `supabase/functions/ai-task-scorer/index.ts` | Wrap AI gateway fetch in try-catch, retourneer JSON error ipv 500 |
| `src/index.css` | `.glass-hover-lift` gekleurde shadow, `.scroll-fade` utility, input focus versterking, badge glow classes |
| `src/components/ui/tabs.tsx` | TabsContent fade-in animatie |
| `src/components/ui/urgency-badge.tsx` | Badge glow classes toepassen op urgente statussen |

## Wat NIET verandert

- Geen database wijzigingen
- Geen routing wijzigingen
- Geen component structuur wijzigingen
- Glass-card border kleuren: al correct geimplementeerd
- Bestaande functionaliteit blijft identiek

