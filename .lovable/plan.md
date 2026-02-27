

# Document-badges verfijnen naar Apple-stijl

De huidige document-badges zijn platte gekleurde pills zonder diepte. Ze passen niet bij het Liquid Glass systeem. Hieronder de verfijningen — puur className-wijzigingen in één bestand.

## Bestand: `src/components/recruitment/ProfessionalCard.tsx`

### 1. Verlopen docs — zachter destructive met icoon
Huidige stijl: harde rode badge. 
Nieuw: Subtielere glasachtige rode tint met `FileWarning` icoon erbij.
```
bg-red-500/8 text-red-600 dark:text-red-400 border border-red-200/40 dark:border-red-800/40
```
Voeg `FileWarning` icoon (h-3 w-3) toe voor de tekst.

### 2. Docs OK — zachter success met icoon
Huidige stijl: groene badge zonder icoon.
Nieuw: Glasachtige groene tint met `CheckCircle2` icoon.
```
bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 border border-emerald-200/40 dark:border-emerald-800/40
```

### 3. Docs niet gepubliceerd — zachter warning met icoon
Huidige stijl: oranje outline badge.
Nieuw: Glasachtige amber tint met `AlertCircle` icoon.
```
bg-amber-500/8 text-amber-600 dark:text-amber-400 border border-amber-200/40 dark:border-amber-800/40
```

### 4. Geen docs — zachter neutral met icoon
Huidige stijl: generieke secondary badge.
Nieuw: Ultra-subtiele muted tint met `FileX` icoon.
```
bg-muted/50 text-muted-foreground/60 border border-border/30
```

### 5. Gedeelde badge-stijl
Alle 4 badges krijgen uniforme sizing: `text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-medium backdrop-blur-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)]` — de subtiele shadow en blur geven een glasachtig zwevend effect passend bij het visionOS design.

### 6. Timestamp verfijning
Wijzig opacity van `/50` naar `/40` en voeg `text-[11px]` toe voor nog subtielere hiërarchie ten opzichte van de document-badge.

Alle wijzigingen zijn puur visueel — geen logica, geen data-flow.

