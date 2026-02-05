 import { format, differenceInDays } from 'date-fns';
 import { nl } from 'date-fns/locale';
 import { Receipt, AlertTriangle, Calendar } from 'lucide-react';
 import { Badge } from '@/components/ui/badge';
 import { MobileTableCard, MobileTableCardList } from '@/components/ui/mobile-table-card';
 import { cn } from '@/lib/utils';
 import {
   type Factuur,
   type FactuurStatus,
   FACTUUR_STATUS_LABELS,
 } from '@/types/facturatie';
 
 interface FacturatieCardsProps {
   facturen: (Factuur & { opdrachtgever?: { name: string } })[];
   onSelectFactuur: (factuur: Factuur) => void;
 }
 
 // Format currency
 function formatCurrency(amount: number): string {
   return new Intl.NumberFormat('nl-NL', {
     style: 'currency',
     currency: 'EUR',
   }).format(amount);
 }
 
 // Status badge component
 function StatusBadge({ status }: { status: FactuurStatus }) {
   const colorMap: Record<FactuurStatus, string> = {
     CONCEPT: 'bg-muted text-muted-foreground border-border',
     DEFINITIEF: 'bg-primary/10 text-primary border-primary/20',
     VERZONDEN: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-transparent',
     HERINNERING_1: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-transparent',
     HERINNERING_2: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-transparent',
     HERINNERING_3: 'bg-destructive/10 text-destructive border-transparent',
     BETWIST: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-transparent',
     BETAALD: 'bg-green-500/10 text-green-700 dark:text-green-400 border-transparent',
     AFGEBOEKT: 'bg-muted text-muted-foreground/70 border-border',
   };
 
   return (
     <Badge variant="outline" className={cn('font-medium', colorMap[status])}>
       {FACTUUR_STATUS_LABELS[status]}
     </Badge>
   );
 }
 
 // Calculate days overdue
 function getDaysOverdue(vervaldatum: string, status: FactuurStatus): number | null {
   const openStatuses: FactuurStatus[] = [
     'VERZONDEN',
     'HERINNERING_1',
     'HERINNERING_2',
     'HERINNERING_3',
     'BETWIST',
   ];
   if (!openStatuses.includes(status)) return null;
 
   const days = differenceInDays(new Date(), new Date(vervaldatum));
   return days > 0 ? days : null;
 }
 
 export function FacturatieCards({ facturen, onSelectFactuur }: FacturatieCardsProps) {
   return (
     <MobileTableCardList ariaLabel="Facturen">
       {facturen.map((factuur) => {
         const daysOverdue = getDaysOverdue(factuur.vervaldatum, factuur.status);
         const openstaand = factuur.openstaand_bedrag || 0;
 
         return (
           <MobileTableCard
             key={factuur.id}
             ariaLabel={`Factuur: ${factuur.factuur_nummer}`}
             highlight={daysOverdue ? 'destructive' : undefined}
             onClick={() => onSelectFactuur(factuur)}
             leading={
               <div className={cn(
                 "p-2 rounded-lg",
                 daysOverdue ? "bg-destructive/10" : "bg-emerald-500/10"
               )}>
                 <Receipt className={cn(
                   "h-5 w-5",
                   daysOverdue ? "text-destructive" : "text-emerald-600"
                 )} />
               </div>
             }
             primary={
               <div className="flex flex-col">
                 <span className="font-semibold">{factuur.factuur_nummer}</span>
                 <span className="text-sm text-muted-foreground">
                   {factuur.opdrachtgever?.name || 'Onbekende opdrachtgever'}
                 </span>
               </div>
             }
             trailing={
               <div className="text-right">
                 <div className="font-semibold text-lg">
                   {formatCurrency(factuur.totaal)}
                 </div>
                 {openstaand > 0 && openstaand !== factuur.totaal && (
                   <div className="text-xs text-amber-600">
                     Open: {formatCurrency(openstaand)}
                   </div>
                 )}
               </div>
             }
             meta={
               <>
                 <StatusBadge status={factuur.status} />
                 <div className="flex items-center gap-1 text-muted-foreground">
                   <Calendar className="h-3.5 w-3.5" />
                   <span>{format(new Date(factuur.factuurdatum), 'd MMM', { locale: nl })}</span>
                 </div>
                 <div className={cn(
                   "flex items-center gap-1",
                   daysOverdue ? "text-destructive" : "text-muted-foreground"
                 )}>
                   {daysOverdue && <AlertTriangle className="h-3.5 w-3.5" />}
                   <span>Verval: {format(new Date(factuur.vervaldatum), 'd MMM', { locale: nl })}</span>
                   {daysOverdue && (
                     <Badge variant="destructive" className="text-[10px] px-1 py-0 ml-1">
                       {daysOverdue}d over
                     </Badge>
                   )}
                 </div>
               </>
             }
           />
         );
       })}
     </MobileTableCardList>
   );
 }