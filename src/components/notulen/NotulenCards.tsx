 import { format } from 'date-fns';
 import { nl } from 'date-fns/locale';
 import { FileText, Users, Eye } from 'lucide-react';
 import { Badge } from '@/components/ui/badge';
 import { Button } from '@/components/ui/button';
 import { MobileTableCard, MobileTableCardList } from '@/components/ui/mobile-table-card';
 import type { MeetingMinute } from '@/hooks/useMeetingMinutes';
 
 interface NotulenCardsProps {
   minutes: MeetingMinute[];
   onSelectMinute: (minute: MeetingMinute) => void;
 }
 
 // Status badge helper
 function getStatusBadge(status: string | null) {
   switch (status) {
     case 'draft':
       return <Badge variant="secondary">Concept</Badge>;
     case 'pending_approval':
       return (
         <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-transparent">
           Wacht op goedkeuring
         </Badge>
       );
     case 'approved':
       return (
         <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-transparent">
           Goedgekeurd
         </Badge>
       );
     case 'archived':
       return (
         <Badge variant="outline" className="text-muted-foreground">
           Gearchiveerd
         </Badge>
       );
     default:
       return <Badge variant="outline">Onbekend</Badge>;
   }
 }
 
 // Meeting type badge helper
 function getTypeBadge(type: string | null) {
   const config: Record<string, { label: string; className: string }> = {
     team: {
       label: 'Team',
       className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
     },
     board: {
       label: 'Bestuur',
       className: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
     },
     project: {
       label: 'Project',
       className: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
     },
     klant: {
       label: 'Klant',
       className: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
     },
     overig: {
       label: 'Overig',
       className: 'bg-gray-500/10 text-gray-700 dark:text-gray-400',
     },
   };
   const c = config[type || 'overig'] || config.overig;
   return <Badge className={`${c.className} border-transparent`}>{c.label}</Badge>;
 }
 
 export function NotulenCards({ minutes, onSelectMinute }: NotulenCardsProps) {
   return (
     <MobileTableCardList ariaLabel="Vergadernotulen">
       {minutes.map((minute) => (
         <MobileTableCard
           key={minute.id}
           ariaLabel={`Notulen: ${minute.tasks?.title || 'Geen titel'}`}
           onClick={() => onSelectMinute(minute)}
           leading={
             <div className="p-2 rounded-lg bg-primary/10">
               <FileText className="h-5 w-5 text-primary" />
             </div>
           }
           primary={minute.tasks?.title || 'Geen titel'}
           trailing={getStatusBadge(minute.status)}
           meta={
             <>
               {getTypeBadge(minute.meeting_type)}
               {minute.tasks?.start_at && (
                 <span className="text-muted-foreground">
                   {format(new Date(minute.tasks.start_at), 'd MMM yyyy', { locale: nl })}
                 </span>
               )}
               <div className="flex items-center gap-1 text-muted-foreground">
                 <Users className="h-3.5 w-3.5" />
                 <span>{minute.meeting_attendees?.length || 0} deelnemers</span>
               </div>
             </>
           }
           actions={
             <Button
               variant="outline"
               size="sm"
               className="w-full h-10"
               onClick={(e) => {
                 e.stopPropagation();
                 onSelectMinute(minute);
               }}
             >
               <Eye className="h-4 w-4 mr-2" />
               Bekijken
             </Button>
           }
         />
       ))}
     </MobileTableCardList>
   );
 }