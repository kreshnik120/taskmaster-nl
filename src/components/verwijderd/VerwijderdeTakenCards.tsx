 import { format } from 'date-fns';
 import { nl } from 'date-fns/locale';
 import { Trash2, Undo2 } from 'lucide-react';
 import { Badge } from '@/components/ui/badge';
 import { Button } from '@/components/ui/button';
 import { MobileTableCard, MobileTableCardList } from '@/components/ui/mobile-table-card';
 import { getPrioritySolidClass, getPriorityLabel } from '@/hooks/usePriorityConfig';
 
 interface DeletedTask {
   id: string;
   title: string;
   priority: string;
   deleted_at: string;
   org_id: string;
   organizations?: {
     name: string;
   };
 }
 
 interface VerwijderdeTakenCardsProps {
   tasks: DeletedTask[];
   onRestore: (taskId: string) => void;
   onDelete: (taskId: string) => void;
 }
 
 export function VerwijderdeTakenCards({
   tasks,
   onRestore,
   onDelete,
 }: VerwijderdeTakenCardsProps) {
   return (
     <MobileTableCardList ariaLabel="Verwijderde taken">
       {tasks.map((task) => (
         <MobileTableCard
           key={task.id}
           ariaLabel={`Verwijderde taak: ${task.title}`}
           leading={
             <div className="p-2 rounded-lg bg-muted">
               <Trash2 className="h-5 w-5 text-muted-foreground" />
             </div>
           }
           primary={task.title}
           trailing={
             <Badge className={getPrioritySolidClass(task.priority)}>
               {getPriorityLabel(task.priority)}
             </Badge>
           }
           meta={
             <>
               {task.organizations?.name && (
                 <span>{task.organizations.name}</span>
               )}
               <span>
                 Verwijderd: {format(new Date(task.deleted_at), 'dd MMM yyyy HH:mm', { locale: nl })}
               </span>
             </>
           }
           actions={
             <div className="flex items-center gap-2 w-full">
               <Button
                 variant="outline"
                 size="sm"
                 className="flex-1 h-10 text-primary hover:text-primary hover:bg-primary/10"
                 onClick={(e) => {
                   e.stopPropagation();
                   onRestore(task.id);
                 }}
               >
                 <Undo2 className="h-4 w-4 mr-1" />
                 Terugzetten
               </Button>
               <Button
                 variant="ghost"
                 size="sm"
                 className="flex-1 h-10 text-destructive hover:text-destructive hover:bg-destructive/10"
                 onClick={(e) => {
                   e.stopPropagation();
                   onDelete(task.id);
                 }}
               >
                 <Trash2 className="h-4 w-4 mr-1" />
                 Definitief
               </Button>
             </div>
           }
         />
       ))}
     </MobileTableCardList>
   );
 }