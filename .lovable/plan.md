
# Glass Design Polish (5 stappen)

## Overzicht

5 kleine visuele fixes die het glass-patroon consistent doorvoeren. Alleen CSS classes, geen functionaliteit.

---

## Stap 1: Topbar Blur Versterken

**Bestand:** `src/components/Layout.tsx` (regel 69)

Wijzig `backdrop-blur-sm` naar `backdrop-blur-xl` in de topbar div.

---

## Stap 2: Sidebar Active State

**Bestand:** `src/components/AppSidebar.tsx` (regels 181-183)

- Active class: van `"bg-primary/10 text-primary font-medium"` naar `"bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm text-primary font-medium border-l-[3px] border-primary shadow-[0_1px_4px_rgba(0,0,0,0.04)]"`
- Inactive hover: van `"hover:text-sidebar-foreground hover:bg-sidebar-accent/50"` naar `"hover:text-sidebar-foreground hover:bg-white/40 dark:hover:bg-slate-800/40"`

---

## Stap 3: Notificatie Items Hover

**Bestand:** `src/components/notifications/NotificationBell.tsx` (regel 107)

Van: `"flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50"`
Naar: `"flex cursor-pointer items-start gap-3 px-4 py-3 rounded-lg transition-all duration-150 hover:bg-white/60 dark:hover:bg-slate-800/60 hover:shadow-[0_1px_4px_rgba(0,0,0,0.04)]"`

---

## Stap 4: Kanban Kolommen Glass

**Bestand:** `src/components/ApplicationKanbanColumn.tsx`

A) Kolom Card (regel 70): Vervang `bg-card border shadow-none` met glass styling (`bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]`)

B) Sticky header (regel 72): Vervang `bg-card/95 backdrop-blur-sm border-b` met `bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border-b border-white/20 dark:border-white/10`

C) Lege kolom state (regel 104): Voeg glass classes toe aan de empty state wrapper.

---

## Stap 5: Empty States Glass

Glass patroon toepassen op 5 locaties:

| Bestand | Regel | Huidige state |
|---------|-------|---------------|
| `src/pages/Professionals.tsx` | 690 | Platte `text-center py-12` div |
| `src/components/whatsapp/WhatsAppEmptyState.tsx` | 53 (ChatListEmptyState) | `py-12 px-4 text-center` div |
| `src/components/dashboard/EmbeddedListView.tsx` | 983 | `Card className="border-dashed"` wrapper |
| `src/components/dashboard/EmbeddedOpvolgingView.tsx` | 344 | Platte `<p>` element |
| `src/pages/Bijlagen.tsx` | 394 | Platte `p-8 text-center` div |

Elk krijgt: `rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]`

De EmbeddedListView Card wordt vervangen door een div met glass classes (de `border-dashed` Card past niet in het glass systeem). De EmbeddedOpvolgingView `<p>` wordt een `<div>` met glass styling.

`TaskListEmptyState.tsx` wordt NIET aangeraakt (heeft al glass).

---

## Technisch Overzicht

| Bestand | Wijziging |
|---------|-----------|
| `src/components/Layout.tsx` | backdrop-blur-sm naar backdrop-blur-xl |
| `src/components/AppSidebar.tsx` | Active/hover classes sidebar items |
| `src/components/notifications/NotificationBell.tsx` | Notification item hover glass |
| `src/components/ApplicationKanbanColumn.tsx` | 3 class wijzigingen (card, header, empty) |
| `src/pages/Professionals.tsx` | Empty state glass |
| `src/components/whatsapp/WhatsAppEmptyState.tsx` | ChatListEmptyState glass |
| `src/components/dashboard/EmbeddedListView.tsx` | Empty state glass |
| `src/components/dashboard/EmbeddedOpvolgingView.tsx` | Empty state glass |
| `src/pages/Bijlagen.tsx` | Empty state glass |

Totaal: 9 bestanden, alleen CSS class wijzigingen.
