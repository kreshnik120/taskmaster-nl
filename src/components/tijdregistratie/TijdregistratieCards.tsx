 import { format } from 'date-fns';
 import { nl } from 'date-fns/locale';
 import { Clock, Trash2 } from 'lucide-react';
 import { Badge } from '@/components/ui/badge';
 import { Button } from '@/components/ui/button';
 import { MobileTableCard, MobileTableCardList } from '@/components/ui/mobile-table-card';
 
 interface TimeEntry {
   id: string;
   task_id: string;
   start: string;
   end: string | null;
   duration_min: number | null;
   note: string | null;
   tasks: {
     id: string;
     title: string;
   } | null;
 }
 
 interface TijdregistratieCardsProps {
   entries: TimeEntry[];
   onDelete: (id: string) => void;
   formatMinutes: (minutes: number) => string;
 }
 
 export function TijdregistratieCards({
   entries,
   onDelete,
   formatMinutes,
 }: TijdregistratieCardsProps) {
   return (
     <MobileTableCardList ariaLabel="Tijdregistraties">
       {entries.map((entry) => {
         const startDate = new Date(entry.start);
         const endDate = entry.end ? new Date(entry.end) : null;
         const duration = entry.duration_min || 0;
 
         return (
           <MobileTableCard
             key={entry.id}
             ariaLabel={`Tijdregistratie: ${entry.tasks?.title || 'Onbekende taak'}`}
             leading={
               <div className="p-2 rounded-lg bg-amber-500/10">
                 <Clock className="h-5 w-5 text-amber-600" />
               </div>
             }
             primary={entry.tasks?.title || 'Onbekende taak'}
             trailing={
               <Badge variant="secondary" className="text-base font-semibold">
                 {formatMinutes(duration)}
               </Badge>
             }
             secondary={entry.note}
             meta={
               <>
                 <span>{format(startDate, 'd MMM yyyy', { locale: nl })}</span>
                 <span>
                   {format(startDate, 'HH:mm', { locale: nl })}
                   {endDate && ` - ${format(endDate, 'HH:mm', { locale: nl })}`}
                 </span>
               </>
             }
             actions={
               <Button
                 variant="ghost"
                 size="sm"
                 className="w-full h-10 text-destructive hover:text-destructive hover:bg-destructive/10"
                 onClick={(e) => {
                   e.stopPropagation();
                   onDelete(entry.id);
                 }}
               >
                 <Trash2 className="h-4 w-4 mr-1" />
                 Verwijderen
               </Button>
             }
           />
         );
       })}
     </MobileTableCardList>
   );
 }