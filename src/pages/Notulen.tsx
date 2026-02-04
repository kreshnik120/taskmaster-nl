import { useState, useMemo, useEffect } from "react";
import { useMeetingMinutes, MeetingMinute } from "@/hooks/useMeetingMinutes";
import { MeetingMinuteDetail } from "@/components/notulen/MeetingMinuteDetail";
import { CreateMeetingMinuteDialog } from "@/components/notulen/CreateMeetingMinuteDialog";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { format, isToday, isThisWeek, isThisMonth } from "date-fns";
import { nl } from "date-fns/locale";
import { PageHero } from "@/components/ui/page-hero";
import { PageContainer } from "@/components/ui/page-container";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Search,
  FileText,
  Plus,
  Eye,
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";

const PAGE_SIZE = 10;

// Status badge helper
function getStatusBadge(status: string | null) {
  switch (status) {
    case "draft":
      return <Badge variant="secondary">Concept</Badge>;
    case "pending_approval":
      return (
        <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-transparent">
          Wacht op goedkeuring
        </Badge>
      );
    case "approved":
      return (
        <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-transparent">
          Goedgekeurd
        </Badge>
      );
    case "archived":
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
      label: "Team",
      className: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    },
    board: {
      label: "Bestuur",
      className: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    },
    project: {
      label: "Project",
      className: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
    },
    klant: {
      label: "Klant",
      className: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    },
    overig: {
      label: "Overig",
      className: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
    },
  };
  const c = config[type || "overig"] || config.overig;
  return <Badge className={`${c.className} border-transparent`}>{c.label}</Badge>;
}

export default function Notulen() {
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  // Paginatie
  const [currentPage, setCurrentPage] = useState(1);

  // Detail Sheet state
  const [selectedMinute, setSelectedMinute] = useState<MeetingMinute | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Create Dialog state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Data fetching
  const { minutes, isLoading, isError } = useMeetingMinutes();

  // Reset pagina bij filter wijzigingen
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, typeFilter, dateFilter]);

  // Stats berekening
  const stats = useMemo(() => {
    if (!minutes) return { total: 0, draft: 0, pending: 0, approved: 0 };
    return {
      total: minutes.length,
      draft: minutes.filter((m) => m.status === "draft").length,
      pending: minutes.filter((m) => m.status === "pending_approval").length,
      approved: minutes.filter((m) => m.status === "approved").length,
    };
  }, [minutes]);

  // Client-side filtering
  const filteredMinutes = useMemo(() => {
    if (!minutes) return [];

    let result = [...minutes];

    // Zoeken op titel en content
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      result = result.filter(
        (m) =>
          m.tasks?.title.toLowerCase().includes(query) ||
          m.content?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((m) => m.status === statusFilter);
    }

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((m) => m.meeting_type === typeFilter);
    }

    // Datum filter
    if (dateFilter !== "all") {
      result = result.filter((m) => {
        const date = m.tasks?.start_at ? new Date(m.tasks.start_at) : null;
        if (!date) return false;
        switch (dateFilter) {
          case "today":
            return isToday(date);
          case "week":
            return isThisWeek(date, { locale: nl });
          case "month":
            return isThisMonth(date);
          default:
            return true;
        }
      });
    }

    return result;
  }, [minutes, debouncedSearch, statusFilter, typeFilter, dateFilter]);

  // Paginatie berekening
  const totalPages = Math.ceil(filteredMinutes.length / PAGE_SIZE);
  const paginatedMinutes = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredMinutes.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredMinutes, currentPage]);

  // Paginatie navigatie
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Bereken zichtbare pagina-nummers (max 5)
  const getVisiblePages = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <TooltipProvider>
      <PageContainer contextColor="indigo" className="container mx-auto py-6 space-y-6">
        <PageHero
          title="Vergadernotulen"
          subtitle={`${stats.total} notulen • ${stats.draft} concept • ${stats.approved} goedgekeurd`}
        >
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nieuwe notulen
          </Button>
        </PageHero>

        {/* Filter Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-center">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Zoeken op titel of inhoud..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle statussen</SelectItem>
                  <SelectItem value="draft">Concept</SelectItem>
                  <SelectItem value="pending_approval">
                    Wacht op goedkeuring
                  </SelectItem>
                  <SelectItem value="approved">Goedgekeurd</SelectItem>
                  <SelectItem value="archived">Gearchiveerd</SelectItem>
                </SelectContent>
              </Select>

              {/* Type Filter */}
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle types</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                  <SelectItem value="board">Bestuur</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="klant">Klant</SelectItem>
                  <SelectItem value="overig">Overig</SelectItem>
                </SelectContent>
              </Select>

              {/* Date Filter */}
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Datum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle data</SelectItem>
                  <SelectItem value="today">Vandaag</SelectItem>
                  <SelectItem value="week">Deze week</SelectItem>
                  <SelectItem value="month">Deze maand</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table Card */}
        <Card>
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-12 text-center text-destructive">
              <p className="font-medium">
                Er is een fout opgetreden bij het laden van notulen
              </p>
            </div>
          ) : filteredMinutes.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Geen notulen gevonden</p>
              <p className="text-sm mt-1">
                {searchQuery ||
                statusFilter !== "all" ||
                typeFilter !== "all" ||
                dateFilter !== "all"
                  ? "Probeer andere filters"
                  : "Maak je eerste vergadernotulen aan"}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titel</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Deelnemers</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedMinutes.map((minute) => (
                    <TableRow
                      key={minute.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        setSelectedMinute(minute);
                        setIsDetailOpen(true);
                      }}
                    >
                      <TableCell className="font-medium">
                        {minute.tasks?.title || "Geen titel"}
                      </TableCell>
                      <TableCell>{getTypeBadge(minute.meeting_type)}</TableCell>
                      <TableCell>
                        {minute.tasks?.start_at
                          ? format(new Date(minute.tasks.start_at), "d MMM yyyy", {
                              locale: nl,
                            })
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Users className="h-4 w-4" />
                          <span>{minute.meeting_attendees?.length || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(minute.status)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMinute(minute);
                            setIsDetailOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Pagina {currentPage} van {totalPages} •{" "}
                    {filteredMinutes.length} resultaten
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Vorige
                    </Button>
                    {getVisiblePages().map((page) => (
                      <Button
                        key={page}
                        variant={page === currentPage ? "default" : "outline"}
                        size="sm"
                        onClick={() => goToPage(page)}
                        className="min-w-[36px]"
                      >
                        {page}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Volgende
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Detail Sheet */}
        <MeetingMinuteDetail
          minute={selectedMinute}
          open={isDetailOpen}
          onOpenChange={setIsDetailOpen}
        />

        {/* Create Dialog */}
        <CreateMeetingMinuteDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
        />
      </PageContainer>
    </TooltipProvider>
  );
}
