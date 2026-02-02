import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { PageHero } from "@/components/ui/page-hero";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AttachmentPreviewModal } from "@/components/AttachmentPreviewModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Search, 
  Paperclip, 
  Download, 
  Eye, 
  Trash2, 
  FileText, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  File,
  ExternalLink,
  Loader2,
  Filter,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isThisWeek, isThisMonth } from "date-fns";
import { nl } from "date-fns/locale";
import { getFileCategory, getFileCategoryLabel, getFileCategoryColor, canPreview, formatFileSize, FileCategory } from "@/lib/fileHelpers";
import { cn } from "@/lib/utils";

const log = logger.create('Bijlagen');

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

type DateFilter = 'all' | 'today' | 'week' | 'month';
type TypeFilter = 'all' | FileCategory;
type SortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc';

const PAGE_SIZE = 20;

export default function Bijlagen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [previewAttachment, setPreviewAttachment] = useState<AttachmentWithTask | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    open: boolean;
    attachment: AttachmentWithTask | null;
  }>({ open: false, attachment: null });
  const [currentPage, setCurrentPage] = useState(1);
  
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, typeFilter, dateFilter, sortOption]);

  // Fetch all attachments with linked task info
  const { data: attachments, isLoading, error } = useQuery({
    queryKey: ['all-attachments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attachments')
        .select(`
          *,
          tasks!inner(id, title, status)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AttachmentWithTask[];
    }
  });

  // === REALTIME SYNC with 200ms debounce (consistent with useTasksQuery) ===
  // Subscribe to attachments table changes for cross-user sync
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout | null = null;

    const channel = supabase
      .channel('bijlagen-realtime-updates')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'attachments',
        },
        (payload) => {
          log.debug('Realtime update:', payload.eventType, payload.new);
          
          // Debounce invalidation to 200ms (match useTasksQuery pattern)
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }
          
          debounceTimer = setTimeout(() => {
            log.debug('Invalidating cache after debounce');
            queryClient.invalidateQueries({ queryKey: ['all-attachments'] });
          }, 200);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          log.log('Realtime channel subscribed');
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('[Bijlagen] Realtime channel error');
        }
      });

    // Cleanup on unmount
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      log.debug('Unsubscribing realtime channel');
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Filter and sort attachments
  const filteredAttachments = useMemo(() => {
    if (!attachments) return [];

    let result = [...attachments];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(att => 
        att.name.toLowerCase().includes(query) ||
        att.tasks?.title.toLowerCase().includes(query)
      );
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter(att => getFileCategory(att.name) === typeFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      result = result.filter(att => {
        const date = new Date(att.created_at);
        switch (dateFilter) {
          case 'today': return isToday(date);
          case 'week': return isThisWeek(date, { locale: nl });
          case 'month': return isThisMonth(date);
          default: return true;
        }
      });
    }

    // Sort
    result.sort((a, b) => {
      switch (sortOption) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });

    return result;
  }, [attachments, searchQuery, typeFilter, dateFilter, sortOption]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredAttachments.length / PAGE_SIZE);
  const paginatedAttachments = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filteredAttachments.slice(start, end);
  }, [filteredAttachments, currentPage]);

  const getFileIcon = (filename: string) => {
    const category = getFileCategory(filename);
    switch (category) {
      case 'pdf': return <FileText className="h-4 w-4 text-red-500" />;
      case 'word': return <FileText className="h-4 w-4 text-blue-500" />;
      case 'excel': return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
      case 'image': return <ImageIcon className="h-4 w-4 text-purple-500" />;
      default: return <File className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const downloadAttachment = async (attachment: AttachmentWithTask) => {
    try {
      const { data, error } = await supabase.storage
        .from('task-attachments')
        .download(attachment.url);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Download error:', err);
      toast({
        title: "Fout",
        description: "Kon bestand niet downloaden",
        variant: "destructive"
      });
    }
  };

  const handleDeleteClick = (attachment: AttachmentWithTask) => {
    setDeleteConfirmation({ open: true, attachment });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation.attachment) return;
    await deleteAttachment(deleteConfirmation.attachment);
    setDeleteConfirmation({ open: false, attachment: null });
  };

  const deleteAttachment = async (attachment: AttachmentWithTask) => {
    setDeletingId(attachment.id);
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('task-attachments')
        .remove([attachment.url]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('attachments')
        .delete()
        .eq('id', attachment.id);

      if (dbError) throw dbError;

      toast({ title: "Bijlage verwijderd" });
      queryClient.invalidateQueries({ queryKey: ['all-attachments'] });
    } catch (err: any) {
      console.error('Delete error:', err);
      toast({
        title: "Fout",
        description: "Kon bijlage niet verwijderen",
        variant: "destructive"
      });
    } finally {
      setDeletingId(null);
    }
  };

  const navigateToTask = (taskId: string) => {
    navigate(`/dashboard?tab=mijn-werk&taskId=${taskId}`);
  };

  // Stats
  const stats = useMemo(() => {
    if (!attachments) return { total: 0, images: 0, pdfs: 0, docs: 0 };
    return {
      total: attachments.length,
      images: attachments.filter(a => getFileCategory(a.name) === 'image').length,
      pdfs: attachments.filter(a => getFileCategory(a.name) === 'pdf').length,
      docs: attachments.filter(a => ['word', 'excel'].includes(getFileCategory(a.name))).length
    };
  }, [attachments]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHero
        title="Documentenbeheer"
        subtitle={`${stats.total} documenten • ${stats.images} afbeeldingen • ${stats.pdfs} PDFs • ${stats.docs} documenten`}
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoek op bestandsnaam of taaknaam..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
              <SelectTrigger className="w-[150px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle types</SelectItem>
                <SelectItem value="image">Afbeeldingen</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="word">Word</SelectItem>
                <SelectItem value="excel">Excel</SelectItem>
                <SelectItem value="other">Overig</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Filter */}
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Periode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle datums</SelectItem>
                <SelectItem value="today">Vandaag</SelectItem>
                <SelectItem value="week">Deze week</SelectItem>
                <SelectItem value="month">Deze maand</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Sorteren" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Nieuwste eerst</SelectItem>
                <SelectItem value="oldest">Oudste eerst</SelectItem>
                <SelectItem value="name-asc">Naam A-Z</SelectItem>
                <SelectItem value="name-desc">Naam Z-A</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Documents Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>Er ging iets mis bij het laden van de bijlagen.</p>
            </div>
          ) : filteredAttachments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Paperclip className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Geen bijlagen gevonden</p>
              <p className="text-sm mt-1">
                {searchQuery || typeFilter !== 'all' || dateFilter !== 'all'
                  ? "Probeer andere filters"
                  : "Upload bijlagen bij taken om ze hier te zien"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[35%]">Bestand</TableHead>
                  <TableHead>Taak</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Grootte</TableHead>
                  <TableHead>Geüpload</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedAttachments.map((attachment) => {
                  const category = getFileCategory(attachment.name);
                  const previewable = canPreview(attachment.name);
                  
                  return (
                    <TableRow key={attachment.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {getFileIcon(attachment.name)}
                          <span className="font-medium truncate max-w-[300px]">
                            {attachment.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="link"
                          className="p-0 h-auto text-foreground hover:text-primary"
                          onClick={() => navigateToTask(attachment.tasks?.id || '')}
                        >
                          <span className="truncate max-w-[200px]">
                            {attachment.tasks?.title || 'Onbekende taak'}
                          </span>
                          <ExternalLink className="h-3 w-3 ml-1 opacity-50" />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="secondary"
                          className={cn("text-xs", getFileCategoryColor(category))}
                        >
                          {getFileCategoryLabel(category)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {attachment.file_size ? formatFileSize(attachment.file_size) : '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{format(new Date(attachment.created_at), 'd MMM yyyy', { locale: nl })}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(attachment.created_at), { 
                              locale: nl, 
                              addSuffix: true 
                            })}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {previewable && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setPreviewAttachment(attachment)}
                              title="Bekijken"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => downloadAttachment(attachment)}
                            title="Downloaden"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteClick(attachment)}
                            disabled={deletingId === attachment.id || deleteConfirmation.open}
                            title="Verwijderen"
                          >
                            {deletingId === attachment.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          
          {/* Pagination Controls */}
          {filteredAttachments.length > 0 && (
            <div className="flex items-center justify-between px-4 py-4 border-t">
              {/* Info text */}
              <p className="text-sm text-muted-foreground">
                Pagina {currentPage} van {totalPages} • {filteredAttachments.length} resultaten
              </p>
              
              {/* Pagination buttons */}
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Vorige
                  </Button>
                  
                  {/* Page numbers - show max 5 */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "ghost"}
                          size="sm"
                          className="w-8 h-8 p-0"
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Volgende
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirmation.open}
        onOpenChange={(open) => !open && setDeleteConfirmation({ open: false, attachment: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bijlage verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteConfirmation.attachment?.name}" wordt permanent verwijderd.
              Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview Modal */}
      <AttachmentPreviewModal
        attachment={previewAttachment}
        open={!!previewAttachment}
        onOpenChange={(open) => !open && setPreviewAttachment(null)}
        onDownload={() => previewAttachment && downloadAttachment(previewAttachment)}
      />
    </div>
  );
}
