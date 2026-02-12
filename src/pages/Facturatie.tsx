import { useState, useMemo, useEffect, useRef } from "react";
 import { useIsMobile } from "@/hooks/use-mobile";
import { useSearchParams, useNavigate } from "react-router-dom";
import { format, differenceInDays } from "date-fns";
import { nl } from "date-fns/locale";

// UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { KPICard } from "@/components/ui/kpi-card";
import { PageHero } from "@/components/ui/page-hero";
import { PageContainer } from "@/components/ui/page-container";

// Icons
import {
  Search,
  Plus,
  X,
  Receipt,
  Euro,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  FileText,
  Settings,
  Download,
  Zap,
} from "lucide-react";

// Facturatie Components
import { FactuurExportDialog } from "@/components/facturatie";
 import { FacturatieCards } from "@/components/facturatie/FacturatieCards";
import { AutoFacturatieDialog } from "@/components/facturatie/AutoFacturatieDialog";

// Hooks & Types
import { useFacturen } from "@/hooks/facturatie/useFacturen";
import { useFactuurStats } from "@/hooks/facturatie/useFactuurStats";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  type Factuur,
  type FactuurStatus,
  type FactuurType,
  FACTUUR_STATUS_LABELS,
  FACTUUR_TYPE_LABELS,
} from "@/types/facturatie";
import { cn } from "@/lib/utils";

// Status badge component
function StatusBadge({ status }: { status: FactuurStatus }) {
  const colorMap: Record<FactuurStatus, string> = {
    CONCEPT: "bg-gray-100 text-gray-700 border-gray-200",
    DEFINITIEF: "bg-blue-100 text-blue-700 border-blue-200",
    VERZONDEN: "bg-cyan-100 text-cyan-700 border-cyan-200",
    HERINNERING_1: "bg-yellow-100 text-yellow-700 border-yellow-200",
    HERINNERING_2: "bg-orange-100 text-orange-700 border-orange-200",
    HERINNERING_3: "bg-red-100 text-red-700 border-red-200",
    BETWIST: "bg-purple-100 text-purple-700 border-purple-200",
    BETAALD: "bg-green-100 text-green-700 border-green-200",
    AFGEBOEKT: "bg-gray-100 text-gray-500 border-gray-200",
  };

  return (
    <Badge variant="outline" className={cn("font-medium", colorMap[status])}>
      {FACTUUR_STATUS_LABELS[status]}
    </Badge>
  );
}

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

// Skeleton row component
function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
    </TableRow>
  );
}

// Main component
export default function Facturatie() {
  const navigate = useNavigate();
   const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // URL-synced filters
  const searchQuery = searchParams.get("search") || "";
  const statusFilter = searchParams.get("status") || "all";
  const typeFilter = searchParams.get("type") || "all";
  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  // Local state for search input
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showAutoDialog, setShowAutoDialog] = useState(false);
  const debouncedSearch = useDebouncedValue(localSearch, 300);

  // Update URL when debounced search changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (debouncedSearch) {
      params.set("search", debouncedSearch);
    } else {
      params.delete("search");
    }
    params.set("page", "1");
    setSearchParams(params, { replace: true });
  }, [debouncedSearch]);

  // Build filter options for hook
  const filterOptions = useMemo(() => {
    const options: {
      page: number;
      pageSize: number;
      search?: string;
      status?: FactuurStatus;
      type?: FactuurType;
    } = {
      page: currentPage,
      pageSize: 25,
    };

    if (debouncedSearch) {
      options.search = debouncedSearch;
    }

    if (statusFilter !== "all") {
      options.status = statusFilter as FactuurStatus;
    }

    if (typeFilter !== "all") {
      options.type = typeFilter as FactuurType;
    }

    return options;
  }, [currentPage, debouncedSearch, statusFilter, typeFilter]);

  // Fetch data
  const { facturen, count, totalPages, isLoading, isError } = useFacturen(filterOptions);
  const { data: stats, isLoading: statsLoading } = useFactuurStats();

  // Filter handlers
  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.set("page", "1");
    setSearchParams(params);
  };

  const clearFilters = () => {
    setSearchParams({});
    setLocalSearch("");
  };

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", page.toString());
    setSearchParams(params);
  };

  // Check if any filters are active
  const hasActiveFilters = searchQuery || statusFilter !== "all" || typeFilter !== "all";

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Cmd+K or / = Focus search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // n = New invoice
      if (e.key === "n" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        navigate("/facturatie/nieuw");
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  // Calculate days overdue
  const getDaysOverdue = (vervaldatum: string, status: FactuurStatus): number | null => {
    const openStatuses: FactuurStatus[] = [
      "VERZONDEN",
      "HERINNERING_1",
      "HERINNERING_2",
      "HERINNERING_3",
      "BETWIST",
    ];
    if (!openStatuses.includes(status)) return null;

    const days = differenceInDays(new Date(), new Date(vervaldatum));
    return days > 0 ? days : null;
  };

  return (
    <PageContainer contextColor="emerald" className="space-y-6 p-6 overflow-hidden">
      {/* Page Header */}
      <PageHero title="Facturatie" subtitle="Beheer facturen, betalingen en herinneringen">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowAutoDialog(true)}
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
          >
            <Zap className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Auto-factureren</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/facturatie/instellingen")}
          >
            <Settings className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Instellingen</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowExportDialog(true)}
          >
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Exporteren</span>
          </Button>
          <Button onClick={() => navigate("/facturatie/nieuw")}>
            <Plus className="mr-2 h-4 w-4" />
            Nieuwe factuur
          </Button>
        </div>
      </PageHero>

      {/* KPI Dashboard */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 glass-layer-1 p-4 shadow-float-emerald">
        <KPICard
          icon={Euro}
          title="Openstaand"
          value={statsLoading ? 0 : stats?.totaal_openstaand || 0}
          suffix=""
          subtitle={formatCurrency(stats?.totaal_openstaand || 0)}
          variant="facturatie"
          onClick={() => setFilter("status", "VERZONDEN")}
          isActive={statusFilter === "VERZONDEN"}
        />
        <KPICard
          icon={AlertTriangle}
          title="Vervallen"
          value={statsLoading ? 0 : stats?.aantal_vervallen || 0}
          subtitle={formatCurrency(stats?.totaal_vervallen || 0)}
          variant="emerald"
          onClick={() => setFilter("status", "HERINNERING_1")}
          isActive={["HERINNERING_1", "HERINNERING_2", "HERINNERING_3"].includes(statusFilter)}
        />
        <KPICard
          icon={CheckCircle2}
          title="Betaald deze week"
          value={statsLoading ? 0 : stats?.aantal_deze_week_betaald || 0}
          subtitle={formatCurrency(stats?.totaal_deze_week_betaald || 0)}
          variant="emerald"
          onClick={() => setFilter("status", "BETAALD")}
          isActive={statusFilter === "BETAALD"}
        />
        <KPICard
          icon={TrendingUp}
          title="Omzet dit kwartaal"
          value={statsLoading ? 0 : Math.round((stats?.totaal_dit_kwartaal || 0) / 1000)}
          suffix="K"
          subtitle={formatCurrency(stats?.totaal_dit_kwartaal || 0)}
          variant="facturatie"
        />
      </div>

      {/* Filters */}
      <Card className="glass-card-emerald glass-light-bleed-emerald">
        <CardContent className="p-4 relative">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Zoek op factuurnummer..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="pl-10"
              />
              {localSearch && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setLocalSearch("")}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={(v) => setFilter("status", v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                <SelectItem value="CONCEPT">Concept</SelectItem>
                <SelectItem value="DEFINITIEF">Definitief</SelectItem>
                <SelectItem value="VERZONDEN">Verzonden</SelectItem>
                <SelectItem value="HERINNERING_1">Herinnering 1</SelectItem>
                <SelectItem value="HERINNERING_2">Herinnering 2</SelectItem>
                <SelectItem value="HERINNERING_3">Herinnering 3</SelectItem>
                <SelectItem value="BETWIST">Betwist</SelectItem>
                <SelectItem value="BETAALD">Betaald</SelectItem>
                <SelectItem value="AFGEBOEKT">Afgeboekt</SelectItem>
              </SelectContent>
            </Select>

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={(v) => setFilter("type", v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle types</SelectItem>
                <SelectItem value="VERKOOP">Verkoopfactuur</SelectItem>
                <SelectItem value="SELFBILLING">Self-billing</SelectItem>
                <SelectItem value="INKOOP">Inkoopfactuur</SelectItem>
                <SelectItem value="CREDIT">Creditnota</SelectItem>
              </SelectContent>
            </Select>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-2 h-4 w-4" />
                Wis filters
              </Button>
            )}
          </div>

          {/* Active Filters Badges */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 mt-4">
              {searchQuery && (
                <Badge variant="secondary" className="gap-1">
                  Zoek: {searchQuery}
                  <button onClick={() => { setLocalSearch(""); setFilter("search", "all"); }}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {statusFilter !== "all" && (
                <Badge variant="secondary" className="gap-1">
                  Status: {FACTUUR_STATUS_LABELS[statusFilter as FactuurStatus]}
                  <button onClick={() => setFilter("status", "all")}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {typeFilter !== "all" && (
                <Badge variant="secondary" className="gap-1">
                  Type: {FACTUUR_TYPE_LABELS[typeFilter as FactuurType]}
                  <button onClick={() => setFilter("type", "all")}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Facturen Table */}
      <Card className="glass-card-emerald shadow-float-emerald">
        <CardContent className="p-0 relative">
          {isLoading ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Factuurnummer</TableHead>
                  <TableHead>Opdrachtgever</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Vervaldatum</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Totaal</TableHead>
                  <TableHead>Openstaand</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...Array(5)].map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </TableBody>
            </Table>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
              <p className="text-lg font-medium">Er is een fout opgetreden bij het laden van facturen.</p>
              <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
                Opnieuw proberen
              </Button>
            </div>
          ) : facturen.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-8 text-center rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Geen facturen gevonden</p>
              <p className="text-muted-foreground mt-1">
                {hasActiveFilters
                  ? "Probeer je filters aan te passen"
                  : "Maak je eerste factuur aan"}
              </p>
              <div className="flex gap-2 mt-4">
                {hasActiveFilters && (
                  <Button variant="outline" onClick={clearFilters}>
                    <X className="mr-2 h-4 w-4" />
                    Filters wissen
                  </Button>
                )}
                <Button onClick={() => navigate("/facturatie/nieuw")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nieuwe factuur
                </Button>
              </div>
            </div>
           ) : isMobile ? (
             <div className="p-4">
               <FacturatieCards
                 facturen={facturen}
                 onSelectFactuur={(factuur) => navigate(`/facturatie/${factuur.id}`)}
               />
             </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Factuurnummer</TableHead>
                  <TableHead>Opdrachtgever</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Vervaldatum</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Totaal</TableHead>
                  <TableHead className="text-right">Openstaand</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facturen.map((factuur: Factuur & { opdrachtgever?: { name: string } }) => {
                  const daysOverdue = getDaysOverdue(factuur.vervaldatum, factuur.status);

                  return (
                    <TableRow
                      key={factuur.id}
                      className="cursor-pointer table-row-hover-emerald"
                      onClick={() => navigate(`/facturatie/${factuur.id}`)}
                    >
                      <TableCell className="font-medium">
                        {factuur.factuur_nummer}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {factuur.opdrachtgever?.name || "—"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {FACTUUR_TYPE_LABELS[factuur.type]}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(factuur.factuurdatum), "dd MMM yyyy", { locale: nl })}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          {format(new Date(factuur.vervaldatum), "dd MMM yyyy", { locale: nl })}
                          {daysOverdue && (
                            <span className="text-xs text-destructive font-medium">
                              {daysOverdue} dagen over
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={factuur.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(factuur.totaal)}
                      </TableCell>
                      <TableCell className="text-right">
                        {factuur.openstaand_bedrag > 0 ? (
                          <span className="text-destructive font-medium">
                            {formatCurrency(factuur.openstaand_bedrag)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Voldaan</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/facturatie/${factuur.id}`);
                          }}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {currentPage} van {totalPages} ({count} facturen)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Vorige
            </Button>

            {/* Page numbers */}
            <div className="flex items-center gap-1">
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
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
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    className="w-9"
                    onClick={() => goToPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>

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

      {/* Auto-facturatie Dialog */}
      <AutoFacturatieDialog open={showAutoDialog} onOpenChange={setShowAutoDialog} />

      {/* Export Dialog */}
      <FactuurExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        filters={{
          status: statusFilter !== "all" ? statusFilter as any : undefined,
          type: typeFilter !== "all" ? typeFilter as any : undefined,
          search: debouncedSearch || undefined,
        }}
        totalCount={count || 0}
      />
    </PageContainer>
  );
}
