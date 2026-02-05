 import { format, formatDistanceToNow } from 'date-fns';
 import { nl } from 'date-fns/locale';
 import { FileText, FileSpreadsheet, Image as ImageIcon, File, Download, Eye, Trash2, ExternalLink, Loader2 } from 'lucide-react';
 import { Badge } from '@/components/ui/badge';
 import { Button } from '@/components/ui/button';
 import { MobileTableCard, MobileTableCardList } from '@/components/ui/mobile-table-card';
 import { cn } from '@/lib/utils';
 import { getFileCategory, getFileCategoryLabel, getFileCategoryColor, canPreview, formatFileSize } from '@/lib/fileHelpers';
 
 interface AttachmentWithTask {
   id: string;
   name: string;
   url: string;
   created_at: string;
   task_id: string;
   file_size?: number;
   tasks: {
     id: string;
     title: string;
     status: string;
   } | null;
 }
 
 interface BijlagenCardsProps {
   attachments: AttachmentWithTask[];
   onPreview: (attachment: AttachmentWithTask) => void;
   onDownload: (attachment: AttachmentWithTask) => void;
   onDelete: (attachment: AttachmentWithTask) => void;
   onNavigateToTask: (taskId: string) => void;
   deletingId: string | null;
 }
 
 function getFileIcon(filename: string) {
   const category = getFileCategory(filename);
   switch (category) {
     case 'pdf': return <FileText className="h-5 w-5 text-red-500" />;
     case 'word': return <FileText className="h-5 w-5 text-blue-500" />;
     case 'excel': return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
     case 'image': return <ImageIcon className="h-5 w-5 text-purple-500" />;
     default: return <File className="h-5 w-5 text-muted-foreground" />;
   }
 }
 
 export function BijlagenCards({
   attachments,
   onPreview,
   onDownload,
   onDelete,
   onNavigateToTask,
   deletingId,
 }: BijlagenCardsProps) {
   return (
     <MobileTableCardList ariaLabel="Bijlagen">
       {attachments.map((attachment) => {
         const category = getFileCategory(attachment.name);
         const previewable = canPreview(attachment.name);
 
         return (
           <MobileTableCard
             key={attachment.id}
             ariaLabel={`Bijlage: ${attachment.name}`}
             leading={
               <div className="p-2 rounded-lg bg-muted">
                 {getFileIcon(attachment.name)}
               </div>
             }
             primary={
               <span className="truncate block max-w-[200px]">{attachment.name}</span>
             }
             trailing={
               <Badge
                 variant="secondary"
                 className={cn('text-xs', getFileCategoryColor(category))}
               >
                 {getFileCategoryLabel(category)}
               </Badge>
             }
             secondary={
               <button
                 className="flex items-center gap-1 text-primary hover:underline"
                 onClick={(e) => {
                   e.stopPropagation();
                   if (attachment.tasks?.id) {
                     onNavigateToTask(attachment.tasks.id);
                   }
                 }}
               >
                 <span className="truncate max-w-[180px]">
                   {attachment.tasks?.title || 'Onbekende taak'}
                 </span>
                 <ExternalLink className="h-3 w-3 opacity-50" />
               </button>
             }
             meta={
               <>
                 {attachment.file_size && (
                   <span>{formatFileSize(attachment.file_size)}</span>
                 )}
                 <span>
                   {format(new Date(attachment.created_at), 'd MMM yyyy', { locale: nl })}
                 </span>
                 <span className="text-xs">
                   {formatDistanceToNow(new Date(attachment.created_at), {
                     locale: nl,
                     addSuffix: true,
                   })}
                 </span>
               </>
             }
             actions={
               <div className="flex items-center gap-2 w-full">
                 {previewable && (
                   <Button
                     variant="outline"
                     size="sm"
                     className="flex-1 h-10"
                     onClick={(e) => {
                       e.stopPropagation();
                       onPreview(attachment);
                     }}
                   >
                     <Eye className="h-4 w-4 mr-1" />
                     Bekijken
                   </Button>
                 )}
                 <Button
                   variant="outline"
                   size="sm"
                   className="flex-1 h-10"
                   onClick={(e) => {
                     e.stopPropagation();
                     onDownload(attachment);
                   }}
                 >
                   <Download className="h-4 w-4 mr-1" />
                   Download
                 </Button>
                 <Button
                   variant="ghost"
                   size="sm"
                   className="h-10 w-10 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                   disabled={deletingId === attachment.id}
                   onClick={(e) => {
                     e.stopPropagation();
                     onDelete(attachment);
                   }}
                 >
                   {deletingId === attachment.id ? (
                     <Loader2 className="h-4 w-4 animate-spin" />
                   ) : (
                     <Trash2 className="h-4 w-4" />
                   )}
                 </Button>
               </div>
             }
           />
         );
       })}
     </MobileTableCardList>
   );
 }