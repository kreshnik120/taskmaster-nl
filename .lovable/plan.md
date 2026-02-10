
# Glass Empty States Batch 2 (10 bestanden, 13 wijzigingen)

## Overzicht

Hetzelfde glass patroon uit Prompt #71 toepassen op alle overige platte empty states en de Taken KanbanColumn. Alleen CSS class wijzigingen, geen functionaliteit.

---

## Stap 1: Klanten.tsx

**A) Cards view empty state (regel 817)**
- Van: `"text-center py-12 text-muted-foreground"`
- Naar: `"flex flex-col items-center justify-center py-12 px-8 text-center rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-muted-foreground"`

**B) Hierarchy view empty state (regel 854)**
- Van: `"text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg"`
- Naar: `"flex flex-col items-center justify-center py-12 px-8 text-center rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-muted-foreground"`

---

## Stap 2: Plaatsingen + Notulen

**A) Plaatsingen.tsx (regel 271)**
- Van: `"text-center py-12 text-muted-foreground"`
- Naar: `"flex flex-col items-center justify-center py-12 px-8 text-center rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-muted-foreground"`

**B) Notulen.tsx (regel 313)**
- Van: `"p-12 text-center text-muted-foreground"`
- Naar: `"p-12 text-center text-muted-foreground rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"`

---

## Stap 3: Archief Pagina's

**A) AfgerondeTaken.tsx - 3 empty states:**
1. Regel 264: `"text-center py-8 text-muted-foreground"` naar `"text-center py-8 px-6 rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-muted-foreground"`
2. Regel 289: zelfde wijziging
3. Regel 299: zelfde wijziging

**B) VerwijderdeTaken.tsx (regel 232)**
- Van: `"text-center py-8 text-muted-foreground"`
- Naar: `"text-center py-8 px-6 rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-muted-foreground"`

---

## Stap 4: Facturatie + Tijdregistratie + SollicitatiesArchief

**A) Facturatie.tsx (regel 442)**
- Van: `"flex flex-col items-center justify-center py-12 text-center"`
- Naar: `"flex flex-col items-center justify-center py-12 px-8 text-center rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"`

**B) Tijdregistratie.tsx (regel 528)**
- Van: `"text-center text-muted-foreground py-8"`
- Naar: `"text-center text-muted-foreground py-8 px-6 rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"`

**C) SollicitatiesArchief.tsx (regels 267-275)**
- `<Card className="p-12 text-center">` wordt `<div className="p-12 text-center rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">`
- Closing `</Card>` wordt `</div>`

---

## Stap 5: Taken KanbanColumn.tsx

**A) Kolom Card (regel 162)**
- Van: `flex-shrink-0 w-80 bg-card ${statusBorderColors[status] || ""}`
- Naar: `flex-shrink-0 w-80 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] ${statusBorderColors[status] || ""}`

**B) Lege kolom state (regel 214)**
- Van: `"flex flex-col items-center justify-center py-12 text-center"`
- Naar: `"flex flex-col items-center justify-center py-12 text-center bg-white/30 dark:bg-slate-900/30 backdrop-blur-sm rounded-lg border border-white/20 dark:border-white/8 mx-2 mb-2"`

---

## Technisch Overzicht

| Bestand | Wijzigingen |
|---------|-------------|
| `src/pages/Klanten.tsx` | 2x empty state glass |
| `src/pages/Plaatsingen.tsx` | 1x empty state glass |
| `src/pages/Notulen.tsx` | 1x empty state glass |
| `src/pages/AfgerondeTaken.tsx` | 3x empty state glass |
| `src/pages/VerwijderdeTaken.tsx` | 1x empty state glass |
| `src/pages/Facturatie.tsx` | 1x empty state glass |
| `src/pages/Tijdregistratie.tsx` | 1x empty state glass |
| `src/pages/SollicitatiesArchief.tsx` | 1x Card naar div + glass |
| `src/components/KanbanColumn.tsx` | 1x kolom glass + 1x empty state glass |

Totaal: 10 bestanden, 13 class-wijzigingen. Geen functionaliteit, database, hooks of types wijzigingen.
