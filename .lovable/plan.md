

# Subtiele visuele verfijning ProfessionalCard

Puur CSS/className polish. Geen functionaliteit wijzigt.

## Bestand: `src/components/recruitment/ProfessionalCard.tsx`

### 1. Checkbox visueel zachter
De checkbox staat nu hard en kaal naast de avatar. Voeg een subtiele `opacity-60 hover:opacity-100 transition-opacity` toe zodat hij pas opvalt bij interactie.

### 2. Avatar ring verfijnen
De huidige `ring-2 ring-background` is plat. Wijzig naar `ring-2 ring-white/50 dark:ring-white/10 shadow-sm` voor meer diepte en een subtiel zwevend effect.

### 3. Organisatie-badge kleur-codering
De org badge is nu een generieke ghost badge. Voeg kleurcodering toe: ABCzorg krijgt `text-blue-600 bg-blue-50/60 border-blue-200/50`, CitoZorg krijgt `text-green-600 bg-green-50/60 border-green-200/50` — consistent met de HoverCard.

### 4. Functieniveau tekst subtiel kleiner en lichter
De functie-tekst is even prominent als de naam. Wijzig naar `text-[13px] text-muted-foreground/80` voor betere hiërarchie.

### 5. Document badge afronding
De badges zijn nu hoekig. Voeg `rounded-full` toe aan alle document-badges voor een zachtere, meer gepolijste look.

### 6. Timestamp subtiel met klok-icoontje
Voeg een klein `Clock` icoon (h-3 w-3) toe voor de timestamp-tekst voor visuele context.

### 7. Action footer achtergrond verfijnen
De huidige `bg-muted/20` is te vlak. Wijzig naar `bg-gradient-to-t from-muted/30 to-transparent border-t border-border/20` voor een subtiele gradient die de footer natuurlijker laat overgaan.

### 8. Plaatsen-button styling
De "Plaatsen" button in de footer is nu een generieke outline. Voeg `hover:bg-primary/5 hover:border-primary/30` toe voor een subtiele primary-tint bij hover.

Alle wijzigingen zijn uitsluitend className-aanpassingen.

