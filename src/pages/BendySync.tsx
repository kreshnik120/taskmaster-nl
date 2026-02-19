import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Power, Play, Database, Clock, AlertTriangle, CheckCircle2, MinusCircle, Users, FileText, Shield } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHero } from "@/components/ui/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface SyncConfig {
  id: string;
  tenant: string;
  enabled: boolean;
  sync_status: string;
  sync_interval_minutes: number;
  last_full_sync_at: string | null;
  last_incremental_sync_at: string | null;
  error_message: string | null;
  error_count: number;
  updated_at: string;
}

interface SyncLog {
  id: string;
  tenant: string;
  sync_type: string;
  entity_type: string;
  started_at: string;
  completed_at: string | null;
  records_fetched: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  records_failed: number;
  status: string;
  duration_ms: number | null;
}

interface PendingMapping {
  id: string;
  bendy_id: string;
  company_name: string;
  kvk: string | null;
  town: string;
  created_at: string;
}

interface KvkBreakdown {
  kvk_nummer: string;
  org_name: string | null;
  org_found: boolean;
  bendy_count: number;
  bendy_examples: string[];
  local_sublocations: number;
}

interface Diagnostics {
  config_org_id: string | null;
  config_org_name: string | null;
  local_clients_total: number;
  local_clients_with_kvk: number;
  bendy_clients_with_kvk: number;
  bendy_clients_without_kvk: number;
  kvk_breakdown?: KvkBreakdown[];
  sample_attributes?: string[];
  sample_record?: any;
  field_fill_rates?: Array<{
    field: string;
    filled: number;
    total: number;
    percentage: number;
    examples: string[];
  }>;
  user_statistics?: {
    total_synced: number;
    total_pending: number;
    total_cached: number;
  };
  user_field_fill_rates?: Array<{
    field: string;
    filled: number;
    total: number;
    percentage: number;
    examples: string[];
  }>;
}

const SYNCED_FIELDS = [
  'company_name', 'address', 'zipcode', 'town', 'telephone', 'mobile',
  'email', 'chamber_of_commerce_number', 'updated_at',
  'firstname', 'middlename', 'surname', 'status',
  'comment_public', 'comment', 'website',
  'invoice_company_name', 'invoice_address', 'invoice_zipcode', 'invoice_town',
  'crm_stage', 'abbreviation', 'external_id', 'parent_id', 'color',
];

interface StatusData {
  configs: SyncConfig[];
  recent_logs: SyncLog[];
  statistics: {
    total_synced: number;
    total_pending: number;
    total_cached: number;
  };
  diagnostics?: Diagnostics;
  pending_mappings?: PendingMapping[];
}

interface SyncResult {
  records_fetched: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  records_failed: number;
}

const statusBadgeVariant: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

export default function BendySync() {
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncingUsers, setSyncingUsers] = useState(false);
  const [userSyncResult, setUserSyncResult] = useState<SyncResult | null>(null);
  const [syncingDocs, setSyncingDocs] = useState(false);
  const [docSyncResult, setDocSyncResult] = useState<SyncResult | null>(null);
  const [resettingLock, setResettingLock] = useState(false);
  const [bsnStatus, setBsnStatus] = useState<{
    total: number; encrypted: number; plaintext: number; fully_encrypted: boolean; loading: boolean;
  }>({ total: 0, encrypted: 0, plaintext: 0, fully_encrypted: false, loading: false });
  const [migrating, setMigrating] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bendy-sync`;
      const response = await fetch(url, { method: "GET" });
      const json = await response.json();
      if (json.success) {
        setStatusData(json.data);
      }
    } catch (err) {
      console.error("Status ophalen mislukt:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const config = statusData?.configs?.[0] || null;
  const stats = statusData?.statistics;
  const diagnostics = statusData?.diagnostics;
  const pendingMappings = statusData?.pending_mappings || [];

  const handleResetLock = async () => {
    setResettingLock(true);
    try {
      const { data, error } = await supabase.functions.invoke("bendy-sync", {
        body: { action: "reset_lock", tenant: "citozorg" },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Lock gereset: ${data.data.previous_status} → idle`);
        fetchStatus();
      } else {
        toast.error(data?.error || "Lock reset mislukt");
      }
    } catch (err: any) {
      toast.error(`Fout: ${err.message}`);
    } finally {
      setResettingLock(false);
    }
  };

  const handleToggle = async () => {
    if (!config) return;
    setToggling(true);
    try {
      const { data, error } = await supabase.functions.invoke("bendy-sync", {
        body: { action: "update_config", enabled: !config.enabled },
      });
      if (error) throw error;
      toast.success(`Sync ${data?.data?.enabled ? "geactiveerd" : "gedeactiveerd"}`);
      await fetchStatus();
    } catch (err: any) {
      toast.error(`Toggle mislukt: ${err.message || "Onbekende fout"}`);
    } finally {
      setToggling(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("bendy-sync", {
        body: { action: "sync_clients", tenant: "citozorg", sync_type: "full" },
      });
      if (error) throw error;
      if (data?.success) {
        setSyncResult(data.data);
        toast.success(`Sync voltooid: ${data.data.records_fetched} records opgehaald`);
      } else {
        toast.error(`Sync mislukt: ${data?.error || "Onbekende fout"}`);
      }
      await fetchStatus();
    } catch (err: any) {
      toast.error(`Sync mislukt: ${err.message || "Onbekende fout"}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleUserSync = async () => {
    setSyncingUsers(true);
    setUserSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("bendy-sync", {
        body: { action: "sync_users", tenant: "citozorg", sync_type: "full" },
      });
      if (error) throw error;
      if (data?.success) {
        setUserSyncResult(data.data);
        toast.success(`User sync voltooid: ${data.data.records_fetched} users opgehaald`);
        fetchStatus();
      } else {
        toast.error(data?.error || "User sync mislukt");
      }
    } catch (err: any) {
      toast.error(`Fout: ${err.message}`);
    } finally {
      setSyncingUsers(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      return format(new Date(dateStr), "dd MMM yyyy HH:mm", { locale: nl });
    } catch {
      return "—";
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <PageContainer contextColor="teal">
      <PageHero
        title="Bendy Sync Beheer"
        subtitle="Beheer en monitor de Bendy data synchronisatie"
        icon={RefreshCw}
        contextColor="teal"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setLoading(true); fetchStatus(); }}
          disabled={loading}
          className="glass-layer-1"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Ververs
        </Button>
      </PageHero>

      <div className="space-y-6 px-1">
        {/* Config Card */}
        {config && (
          <Card className="glass-layer-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                Sync Configuratie
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div>
                  <span className="text-xs text-muted-foreground">Tenant</span>
                  <p className="font-medium">{config.tenant}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Status</span>
                  <div className="mt-0.5">
                    <Badge className={config.enabled
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                    }>
                      {config.enabled ? "Actief" : "Inactief"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Sync status</span>
                  <div className="flex items-center gap-2">
                    <p className="font-medium capitalize">{config.sync_status}</p>
                    {config.sync_status === 'running' && (
                      <Button
                        onClick={handleResetLock}
                        disabled={resettingLock}
                        variant="destructive"
                        size="sm"
                        className="h-6 text-xs px-2"
                      >
                        {resettingLock ? "Resetten..." : "Reset Lock"}
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Laatste sync</span>
                  <p className="text-sm">{formatDate(config.last_full_sync_at || config.last_incremental_sync_at)}</p>
                </div>
                {config.error_count > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-destructive" /> Fouten
                    </span>
                    <p className="text-sm text-destructive">{config.error_count}× — {config.error_message || "Onbekend"}</p>
                  </div>
                )}
                <div className="ml-auto">
                  <Button
                    variant={config.enabled ? "outline" : "default"}
                    size="sm"
                    onClick={handleToggle}
                    disabled={toggling}
                  >
                    <Power className={`h-4 w-4 mr-2 ${toggling ? "animate-spin" : ""}`} />
                    {config.enabled ? "Deactiveren" : "Activeren"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="glass-layer-1">
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground mb-1">Gekoppeld</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.total_synced}</p>
              </CardContent>
            </Card>
            <Card className="glass-layer-1">
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground mb-1">Wacht op review</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.total_pending}</p>
              </CardContent>
            </Card>
            <Card className="glass-layer-1">
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground mb-1">In cache</p>
                <p className="text-2xl font-bold text-tab-kalender-500">{stats.total_cached}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Data Kwaliteit Card */}
        {diagnostics && (
          <Card className="glass-layer-1 border-amber-200 dark:border-amber-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Data Kwaliteit — Matching Analyse
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Sync configuratie org_id</p>
                    <p className="text-sm font-mono">{diagnostics.config_org_id || '—'}</p>
                    <p className="text-sm font-medium">{diagnostics.config_org_name || 'Onbekend'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Lokale clients (abcito.io)</p>
                    <p className="text-lg font-bold">{diagnostics.local_clients_total}</p>
                    <p className="text-xs">
                      Waarvan <span className="font-semibold text-emerald-600 dark:text-emerald-400">{diagnostics.local_clients_with_kvk}</span> met KvK-nummer
                      {diagnostics.local_clients_total > 0 && (
                        <span className="text-muted-foreground"> ({Math.round((diagnostics.local_clients_with_kvk / diagnostics.local_clients_total) * 100)}%)</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Bendy clients (opgehaald)</p>
                    <p className="text-lg font-bold">{diagnostics.bendy_clients_with_kvk + diagnostics.bendy_clients_without_kvk}</p>
                    <p className="text-xs">
                      Waarvan <span className="font-semibold text-emerald-600 dark:text-emerald-400">{diagnostics.bendy_clients_with_kvk}</span> met KvK-nummer
                      {(diagnostics.bendy_clients_with_kvk + diagnostics.bendy_clients_without_kvk) > 0 && (
                        <span className="text-muted-foreground"> ({Math.round((diagnostics.bendy_clients_with_kvk / (diagnostics.bendy_clients_with_kvk + diagnostics.bendy_clients_without_kvk)) * 100)}%)</span>
                      )}
                    </p>
                  </div>
                  {diagnostics.local_clients_total === 0 && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
                      <strong>Probleem gevonden:</strong> Geen lokale clients voor deze org_id. Controleer of de sync config naar de juiste organisatie wijst.
                    </div>
                  )}
                  {diagnostics.local_clients_total > 0 && diagnostics.local_clients_with_kvk === 0 && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
                      <strong>Probleem gevonden:</strong> Lokale clients bestaan maar geen enkele heeft een KvK-nummer. Vul KvK-nummers aan voor automatische matching.
                    </div>
                  )}
                  {diagnostics.bendy_clients_with_kvk === 0 && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
                      <strong>Probleem gevonden:</strong> Geen enkele Bendy client heeft een KvK-nummer (chamber_of_commerce_number). Alternatieve matching nodig.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KvK Matching Overzicht */}
        {diagnostics?.kvk_breakdown && diagnostics.kvk_breakdown.length > 0 && (
          <Card className="glass-layer-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                KvK Matching Overzicht ({diagnostics.kvk_breakdown.length} organisaties)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>KvK-nummer</TableHead>
                      <TableHead>Organisatie (abcito)</TableHead>
                      <TableHead className="text-right">Bendy records</TableHead>
                      <TableHead className="text-right">Lokale sublocaties</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diagnostics.kvk_breakdown.map((item) => (
                      <TableRow key={item.kvk_nummer}>
                        <TableCell className="font-mono text-sm">{item.kvk_nummer}</TableCell>
                        <TableCell>
                          {item.org_found ? (
                            <span className="font-medium">{item.org_name}</span>
                          ) : (
                            <span className="text-destructive italic">Niet gevonden</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{item.bendy_count}</TableCell>
                        <TableCell className="text-right font-semibold">{item.local_sublocations}</TableCell>
                        <TableCell>
                          {!item.org_found ? (
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              Org ontbreekt
                            </Badge>
                          ) : item.local_sublocations === 0 ? (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              Geen sublocaties
                            </Badge>
                          ) : item.bendy_count > item.local_sublocations ? (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              Bendy heeft meer
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                              OK
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Bendy voorbeeldnamen */}
              <div className="p-4 space-y-2 border-t">
                <p className="text-xs text-muted-foreground font-medium">Bendy record voorbeelden per organisatie:</p>
                {diagnostics.kvk_breakdown.map((item) => (
                  <div key={item.kvk_nummer} className="text-xs">
                    <span className="font-mono text-muted-foreground">{item.kvk_nummer}</span>:{' '}
                    <span className="text-foreground">
                      {item.bendy_examples.join(', ')}
                      {item.bendy_count > 3 ? ` (+${item.bendy_count - 3} meer)` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bendy Velden Analyse */}
        {diagnostics?.sample_attributes && diagnostics.sample_attributes.length > 0 && (
          <Card className="glass-layer-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                Bendy Velden Analyse
              </CardTitle>
              {(() => {
                const attrs = diagnostics.sample_attributes!;
                const syncedCount = attrs.filter(a => SYNCED_FIELDS.includes(a)).length;
                return (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm text-muted-foreground">{syncedCount} van {attrs.length} velden gesynchroniseerd</span>
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{syncedCount} actief</Badge>
                    <Badge className="bg-muted text-muted-foreground">{attrs.length - syncedCount} niet gesynchroniseerd</Badge>
                  </div>
                );
              })()}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Veld</TableHead>
                      <TableHead>Waarde (voorbeeld)</TableHead>
                      <TableHead className="text-center">Gesynchroniseerd?</TableHead>
                      <TableHead className="text-center">Vulgraad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diagnostics.sample_attributes!.map((attr) => {
                      const isSynced = SYNCED_FIELDS.includes(attr);
                      const rawVal = diagnostics.sample_record?.attributes?.[attr];
                      const displayVal = rawVal != null ? String(rawVal) : '—';
                      const truncated = displayVal.length > 80 ? displayVal.slice(0, 80) + '…' : displayVal;
                      const fillInfo = diagnostics.field_fill_rates?.find(fr => fr.field === attr);
                      const pct = fillInfo?.percentage ?? null;
                      const badgeClass = pct === null ? ''
                        : pct >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : pct >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
                      return (
                        <TableRow key={attr} className={isSynced ? 'bg-teal-50/50 dark:bg-teal-900/10' : ''}>
                          <TableCell className="font-mono text-xs">{attr}</TableCell>
                          <TableCell className="text-xs max-w-[300px] truncate">{truncated}</TableCell>
                          <TableCell className="text-center">
                            {isSynced ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 inline" />
                            ) : (
                              <MinusCircle className="h-4 w-4 text-muted-foreground inline" />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {fillInfo ? (
                              <Badge className={badgeClass}>
                                {fillInfo.filled}/{fillInfo.total} ({pct}%)
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bendy User Velden Analyse */}
        {diagnostics?.user_field_fill_rates && diagnostics.user_field_fill_rates.length > 0 && (
          <Card className="glass-layer-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Bendy User Velden ({diagnostics.user_field_fill_rates.length} velden)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Veld</TableHead>
                      <TableHead className="text-center">Vulgraad</TableHead>
                      <TableHead>Voorbeelden</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diagnostics.user_field_fill_rates.map((fr) => {
                      const pct = fr.percentage;
                      const badgeClass = pct >= 80
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : pct >= 50
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
                      return (
                        <TableRow key={fr.field}>
                          <TableCell className="font-mono text-xs">{fr.field}</TableCell>
                          <TableCell className="text-center">
                            <Badge className={badgeClass}>
                              {fr.filled}/{fr.total} ({pct}%)
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs max-w-[300px] truncate">
                            {fr.examples.slice(0, 2).join(', ').substring(0, 80) || '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="glass-layer-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Play className="h-4 w-4 text-muted-foreground" />
              Sync Nu Starten
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleSync} disabled={syncing} className="w-full sm:w-auto">
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Bezig met synchroniseren..." : "Client Sync Starten"}
            </Button>

            {syncResult && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 rounded-lg bg-muted/50">
                <div><span className="text-xs text-muted-foreground">Opgehaald</span><p className="font-semibold">{syncResult.records_fetched}</p></div>
                <div><span className="text-xs text-muted-foreground">Aangemaakt</span><p className="font-semibold text-emerald-600 dark:text-emerald-400">{syncResult.records_created}</p></div>
                <div><span className="text-xs text-muted-foreground">Bijgewerkt</span><p className="font-semibold">{syncResult.records_updated}</p></div>
                <div><span className="text-xs text-muted-foreground">Overgeslagen</span><p className="font-semibold">{syncResult.records_skipped}</p></div>
                <div><span className="text-xs text-muted-foreground">Mislukt</span><p className="font-semibold text-destructive">{syncResult.records_failed}</p></div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Professional Sync Card */}
        <Card className="glass-layer-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Professional Sync
            </CardTitle>
            {diagnostics?.user_statistics && (
              <div className="flex gap-2 mt-1">
                <Badge variant="outline">{diagnostics.user_statistics.total_cached} in cache</Badge>
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{diagnostics.user_statistics.total_synced} gekoppeld</Badge>
                {diagnostics.user_statistics.total_pending > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{diagnostics.user_statistics.total_pending} pending</Badge>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleUserSync} disabled={syncingUsers} variant="outline" className="w-full sm:w-auto">
              <RefreshCw className={`h-4 w-4 mr-2 ${syncingUsers ? "animate-spin" : ""}`} />
              {syncingUsers ? "Bezig met user sync..." : "Professional Sync Starten"}
            </Button>
            {userSyncResult && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 rounded-lg bg-muted/50">
                <div><span className="text-xs text-muted-foreground">Opgehaald</span><p className="font-semibold">{userSyncResult.records_fetched}</p></div>
                <div><span className="text-xs text-muted-foreground">Aangemaakt</span><p className="font-semibold text-emerald-600 dark:text-emerald-400">{userSyncResult.records_created}</p></div>
                <div><span className="text-xs text-muted-foreground">Bijgewerkt</span><p className="font-semibold">{userSyncResult.records_updated}</p></div>
                <div><span className="text-xs text-muted-foreground">Overgeslagen</span><p className="font-semibold">{userSyncResult.records_skipped}</p></div>
                <div><span className="text-xs text-muted-foreground">Mislukt</span><p className="font-semibold text-destructive">{userSyncResult.records_failed}</p></div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Document Sync Card */}
        <Card className="glass-layer-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Document Sync
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={async () => {
                setSyncingDocs(true);
                setDocSyncResult(null);
                try {
                  const { data, error } = await supabase.functions.invoke("bendy-sync", {
                    body: { action: "sync_documents", tenant: "citozorg", sync_type: "full" },
                  });
                  if (error) throw error;
                  if (data?.success) {
                    setDocSyncResult(data.data);
                    toast.success(`Document sync voltooid: ${data.data.records_fetched} documenten opgehaald`);
                    fetchStatus();
                  } else {
                    toast.error(data?.error || "Document sync mislukt");
                  }
                } catch (err: any) {
                  toast.error(`Fout: ${err.message}`);
                } finally {
                  setSyncingDocs(false);
                }
              }}
              disabled={syncingDocs}
              variant="outline"
              className="w-full sm:w-auto"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncingDocs ? "animate-spin" : ""}`} />
              {syncingDocs ? "Bezig met document sync..." : "Document Sync Starten"}
            </Button>
            {docSyncResult && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 rounded-lg bg-muted/50">
                <div><span className="text-xs text-muted-foreground">Opgehaald</span><p className="font-semibold">{docSyncResult.records_fetched}</p></div>
                <div><span className="text-xs text-muted-foreground">Aangemaakt</span><p className="font-semibold text-emerald-600 dark:text-emerald-400">{docSyncResult.records_created}</p></div>
                <div><span className="text-xs text-muted-foreground">Bijgewerkt</span><p className="font-semibold">{docSyncResult.records_updated}</p></div>
                <div><span className="text-xs text-muted-foreground">Overgeslagen</span><p className="font-semibold">{docSyncResult.records_skipped}</p></div>
                <div><span className="text-xs text-muted-foreground">Mislukt</span><p className="font-semibold text-destructive">{docSyncResult.records_failed}</p></div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* BSN Encryptie Status */}
        <Card className="glass-layer-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-red-500" />
              BSN Encryptie (AVG)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              onClick={async () => {
                setBsnStatus(prev => ({ ...prev, loading: true }));
                try {
                  const { data, error } = await supabase.functions.invoke('bsn-vault', {
                    body: { action: 'status' },
                  });
                  if (!error && data) {
                    setBsnStatus({ ...data, loading: false });
                  } else {
                    setBsnStatus(prev => ({ ...prev, loading: false }));
                  }
                } catch {
                  setBsnStatus(prev => ({ ...prev, loading: false }));
                }
              }}
              disabled={bsnStatus.loading}
              className="w-full sm:w-auto"
            >
              <Database className={`h-4 w-4 mr-2 ${bsnStatus.loading ? "animate-spin" : ""}`} />
              {bsnStatus.loading ? 'Controleren...' : 'Controleer Encryptie Status'}
            </Button>

            {bsnStatus.total > 0 && (
              <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-muted/50">
                <div>
                  <span className="text-xs text-muted-foreground">Totaal</span>
                  <p className="font-semibold">{bsnStatus.total}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Versleuteld</span>
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">{bsnStatus.encrypted}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Plaintext</span>
                  <p className={`font-semibold ${bsnStatus.plaintext > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>{bsnStatus.plaintext}</p>
                </div>
              </div>
            )}

            {bsnStatus.fully_encrypted && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">Alle BSN's zijn versleuteld</span>
              </div>
            )}

            {bsnStatus.plaintext > 0 && (
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!confirm(`Weet je zeker dat je ${bsnStatus.plaintext} BSN's wilt versleutelen? Dit kan niet ongedaan worden.`)) return;
                  setMigrating(true);
                  try {
                    const { data, error } = await supabase.functions.invoke('bsn-vault', {
                      body: { action: 'migrate' },
                    });
                    if (!error && data) {
                      toast.success(`${data.migrated} BSN's versleuteld${data.failed > 0 ? `, ${data.failed} mislukt` : ''}`);
                      setBsnStatus(prev => ({ ...prev, loading: true }));
                      const { data: status } = await supabase.functions.invoke('bsn-vault', {
                        body: { action: 'status' },
                      });
                      if (status) setBsnStatus({ ...status, loading: false });
                    } else {
                      toast.error('Migratie mislukt');
                    }
                  } catch {
                    toast.error('Migratie mislukt');
                  }
                  setMigrating(false);
                }}
                disabled={migrating}
                className="w-full sm:w-auto"
              >
                <AlertTriangle className={`h-4 w-4 mr-2 ${migrating ? "animate-spin" : ""}`} />
                {migrating ? 'Bezig met versleutelen...' : `${bsnStatus.plaintext} BSN's Nu Versleutelen`}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Sync Logs Table */}
        <Card className="glass-layer-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Sync Logs (laatste 20)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Opgehaald</TableHead>
                    <TableHead className="text-right">Bijgewerkt</TableHead>
                    <TableHead className="text-right">Overgeslagen</TableHead>
                    <TableHead className="text-right">Mislukt</TableHead>
                    <TableHead className="text-right">Duur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!statusData?.recent_logs || statusData.recent_logs.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        Geen sync logs gevonden
                      </TableCell>
                    </TableRow>
                  ) : (
                    statusData.recent_logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm whitespace-nowrap">{formatDate(log.started_at)}</TableCell>
                        <TableCell className="capitalize">{log.sync_type}</TableCell>
                        <TableCell className="capitalize">{log.entity_type}</TableCell>
                        <TableCell>
                          <Badge className={statusBadgeVariant[log.status] || "bg-muted text-muted-foreground"}>
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{log.records_fetched}</TableCell>
                        <TableCell className="text-right">{log.records_updated}</TableCell>
                        <TableCell className="text-right">{log.records_skipped}</TableCell>
                        <TableCell className="text-right">
                          {log.records_failed > 0
                            ? <span className="text-destructive font-medium">{log.records_failed}</span>
                            : <span>{log.records_failed}</span>
                          }
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatDuration(log.duration_ms)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Pending Review Tabel */}
        {pendingMappings.length > 0 && (
          <Card className="glass-layer-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                Wacht op Review ({pendingMappings.length} clients)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bendy ID</TableHead>
                      <TableHead>Bedrijfsnaam</TableHead>
                      <TableHead>KvK-nummer</TableHead>
                      <TableHead>Plaats</TableHead>
                      <TableHead>Ontvangen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingMappings.map((mapping) => (
                      <TableRow key={mapping.id}>
                        <TableCell className="font-mono text-xs">{mapping.bendy_id}</TableCell>
                        <TableCell className="font-medium">{mapping.company_name}</TableCell>
                        <TableCell>
                          {mapping.kvk ? (
                            <span className="font-mono text-sm">{mapping.kvk}</span>
                          ) : (
                            <span className="text-muted-foreground italic text-xs">ontbreekt</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{mapping.town}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{formatDate(mapping.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
