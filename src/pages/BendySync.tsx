import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, Power, Play, Database, Clock, AlertTriangle, CheckCircle2, MinusCircle, Users, FileText, Shield, ChevronDown, Calendar } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { PageContainer } from "@/components/ui/page-container";
import { PageHero } from "@/components/ui/page-hero";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
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
  errors?: any[];
  metadata?: any;
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

interface SkipDiag {
  sublocation_miss: number;
  datum_ontbreekt: number;
  tijd_ontbreekt: number;
  missing_client_ids: string[];
  bendy_status_verdeling: Record<string, number>;
}

interface SyncResult {
  records_fetched: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  records_failed: number;
  toewijzingen_created?: number;
  toewijzingen_skipped?: number;
  toewijzingen_no_match?: number;
  toewijzingen_overlap?: number;
  skip_diag?: SkipDiag;
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
  const [pollingSyncLogId, setPollingSyncLogId] = useState<string | null>(null);
  const [pollingAction, setPollingAction] = useState<string | null>(null);
  const [resettingLock, setResettingLock] = useState(false);
  const [bsnStatus, setBsnStatus] = useState<{
    total: number; encrypted: number; plaintext: number; fully_encrypted: boolean; loading: boolean;
  }>({ total: 0, encrypted: 0, plaintext: 0, fully_encrypted: false, loading: false });
  const [migrating, setMigrating] = useState(false);
  const [unusedFieldsAnalysis, setUnusedFieldsAnalysis] = useState<any[] | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [reqAnalysisLoading, setReqAnalysisLoading] = useState(false);
  const [reqAnalysisResult, setReqAnalysisResult] = useState<any>(null);
  const [userTestLoading, setUserTestLoading] = useState(false);
  const [userTestResult, setUserTestResult] = useState<any>(null);
  const [companyMatchLoading, setCompanyMatchLoading] = useState(false);
  const [companyMatchResult, setCompanyMatchResult] = useState<any>(null);
  const [clientMatchLoading, setClientMatchLoading] = useState(false);
  const [clientMatchResult, setClientMatchResult] = useState<any>(null);
  const [syncingReqs, setSyncingReqs] = useState(false);
  const [reqSyncResult, setReqSyncResult] = useState<SyncResult | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{ total_deleted: number; duplicates_remaining: number; unique_index_created: boolean; index_error: string | null } | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchUnusedFieldsAnalysis = async () => {
    setAnalysisLoading(true);
    try {
      const { data, error } = await supabase
        .from('bendy_raw_cache')
        .select('raw_data')
        .eq('entity_type', 'users')
        .order('fetched_at', { ascending: false })
        .limit(500);

      if (error || !data) {
        toast.error('Analyse mislukt: ' + (error?.message || 'Geen data'));
        return;
      }

      const UNUSED_FIELDS = [
        'languages', 'region', 'working_hours_per_week', 'working_hours_custom',
        'shift', 'transportation', 'description', 'function',
        'employment_history', 'locale', 'bookkeeping_email', 'website_url', 'custom_fields'
      ];

      const analysis = UNUSED_FIELDS.map(field => {
        const values = data
          .map(row => {
            const attrs = (row.raw_data as any)?.attributes || {};
            return attrs[field];
          })
          .filter(v => v !== null && v !== undefined && v !== '');

        const uniqueExamples = [...new Set(values.map(v =>
          typeof v === 'object' ? JSON.stringify(v) : String(v)
        ))].slice(0, 5);

        return {
          field,
          filled: values.length,
          total: data.length,
          percentage: Math.round((values.length / data.length) * 100),
          examples: uniqueExamples,
        };
      });

      setUnusedFieldsAnalysis(analysis.sort((a, b) => b.percentage - a.percentage));
      toast.success(`Analyse voltooid: ${data.length} records geanalyseerd`);
    } catch (err) {
      console.error('Analyse error:', err);
      toast.error('Analyse mislukt');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const fetchRequisitionSample = async () => {
    setReqAnalysisLoading(true);
    try {
      const results: any = { open: [], assigned: [] };

      const { data: openData, error: openError } = await supabase.functions.invoke('bendy-proxy', {
        body: { endpoint: '/api/v2/requisitions/open', method: 'GET', params: {} }
      });
      if (!openError && openData?.data) {
        const nested = openData.data;
        results.open = Array.isArray(nested?.data) ? nested.data.slice(0, 50) : (Array.isArray(nested) ? nested.slice(0, 50) : []);
        results.openIncluded = nested?.included || openData?.included || [];
        results.openMeta = nested?.meta || openData?.meta || null;
      }

      const { data: assignedData, error: assignedError } = await supabase.functions.invoke('bendy-proxy', {
        body: { endpoint: '/api/v2/requisitions/assigned', method: 'GET', params: {} }
      });
      if (!assignedError && assignedData?.data) {
        const nested = assignedData.data;
        results.assigned = Array.isArray(nested?.data) ? nested.data.slice(0, 50) : (Array.isArray(nested) ? nested.slice(0, 50) : []);
        results.assignedIncluded = nested?.included || assignedData?.included || [];
        results.assignedMeta = nested?.meta || assignedData?.meta || null;
      }

      const analyzeFields = (records: any[]) => {
        if (records.length === 0) return [];
        const allFields = new Set<string>();
        records.forEach(r => { Object.keys(r.attributes || {}).forEach(k => allFields.add(k)); });
        return Array.from(allFields).map(field => {
          const values = records.map(r => (r.attributes || {})[field]).filter(v => v !== null && v !== undefined && v !== '');
          const examples = [...new Set(values.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)))].slice(0, 3);
          return { field, filled: values.length, total: records.length, percentage: Math.round((values.length / records.length) * 100), examples };
        }).sort((a, b) => b.percentage - a.percentage);
      };

      const analyzeRelationships = (records: any[]) => {
        if (records.length === 0) return [];
        const allRels = new Set<string>();
        records.forEach(r => { Object.keys(r.relationships || {}).forEach(k => allRels.add(k)); });
        return Array.from(allRels).map(rel => {
          const samples = records.map(r => r.relationships?.[rel]?.data).filter(v => v !== null && v !== undefined).slice(0, 3).map(v => JSON.stringify(v));
          return { name: rel, present: records.filter(r => r.relationships?.[rel]?.data).length, total: records.length, samples };
        });
      };

      setReqAnalysisResult({
        openCount: results.open.length,
        assignedCount: results.assigned.length,
        openFields: analyzeFields(results.open),
        assignedFields: analyzeFields(results.assigned),
        openRelationships: analyzeRelationships(results.open),
        assignedRelationships: analyzeRelationships(results.assigned),
        openIncluded: results.openIncluded,
        assignedIncluded: results.assignedIncluded,
        openMeta: results.openMeta,
        assignedMeta: results.assignedMeta,
        openRaw: results.open.slice(0, 2),
        assignedRaw: results.assigned.slice(0, 2),
      });

      toast.success(`Requisitions opgehaald: ${results.open.length} open, ${results.assigned.length} assigned`);
    } catch (err) {
      console.error('Requisition analyse error:', err);
      toast.error('Requisition analyse mislukt: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setReqAnalysisLoading(false);
    }
  };

  const fetchAssignedUserTest = async () => {
    setUserTestLoading(true);
    try {
      const testResults: any[] = [];

      // Test 1: include=user
      const { data: t1, error: e1 } = await supabase.functions.invoke('bendy-proxy', {
        body: { endpoint: '/api/v2/requisitions/assigned', method: 'GET', params: { include: 'user' } }
      });
      const t1data = t1?.data;
      const t1records = Array.isArray(t1data?.data) ? t1data.data : (Array.isArray(t1data) ? t1data : []);
      const t1included = t1data?.included || t1?.included || [];
      const t1users = t1included.filter((i: any) => i.type === 'users');
      const t1userRel = t1records.length > 0 ? t1records[0]?.relationships?.user : null;
      testResults.push({
        name: 'include=user',
        success: !e1 && t1records.length > 0,
        error: e1?.message || null,
        recordCount: t1records.length,
        includedUsers: t1users.length,
        includedTypes: t1included.reduce((acc: Record<string, number>, i: any) => { acc[i.type || 'unknown'] = (acc[i.type || 'unknown'] || 0) + 1; return acc; }, {}),
        userRelationship: t1userRel ? JSON.stringify(t1userRel) : 'niet aanwezig',
        sampleRelationships: t1records.length > 0 ? Object.keys(t1records[0]?.relationships || {}) : [],
        rawFirstRecord: t1records.length > 0 ? t1records[0] : null,
      });

      // Test 2: include=flex_user
      const { data: t2, error: e2 } = await supabase.functions.invoke('bendy-proxy', {
        body: { endpoint: '/api/v2/requisitions/assigned', method: 'GET', params: { include: 'flex_user' } }
      });
      const t2data = t2?.data;
      const t2records = Array.isArray(t2data?.data) ? t2data.data : (Array.isArray(t2data) ? t2data : []);
      const t2included = t2data?.included || t2?.included || [];
      const t2users = t2included.filter((i: any) => i.type === 'users');
      const t2userRel = t2records.length > 0 ? t2records[0]?.relationships?.flex_user : null;
      testResults.push({
        name: 'include=flex_user',
        success: !e2 && t2records.length > 0,
        error: e2?.message || null,
        recordCount: t2records.length,
        includedUsers: t2users.length,
        includedTypes: t2included.reduce((acc: Record<string, number>, i: any) => { acc[i.type || 'unknown'] = (acc[i.type || 'unknown'] || 0) + 1; return acc; }, {}),
        userRelationship: t2userRel ? JSON.stringify(t2userRel) : 'niet aanwezig',
        sampleRelationships: t2records.length > 0 ? Object.keys(t2records[0]?.relationships || {}) : [],
        rawFirstRecord: t2records.length > 0 ? t2records[0] : null,
      });

      // Test 3: include=client,user,flex_user
      const { data: t3, error: e3 } = await supabase.functions.invoke('bendy-proxy', {
        body: { endpoint: '/api/v2/requisitions/assigned', method: 'GET', params: { include: 'client,user,flex_user' } }
      });
      const t3data = t3?.data;
      const t3records = Array.isArray(t3data?.data) ? t3data.data : (Array.isArray(t3data) ? t3data : []);
      const t3included = t3data?.included || t3?.included || [];
      const t3users = t3included.filter((i: any) => i.type === 'users');
      const t3userRel = t3records.length > 0 ? t3records[0]?.relationships?.user : null;
      const t3flexUserRel = t3records.length > 0 ? t3records[0]?.relationships?.flex_user : null;
      testResults.push({
        name: 'include=client,user,flex_user',
        success: !e3 && t3records.length > 0,
        error: e3?.message || null,
        recordCount: t3records.length,
        includedUsers: t3users.length,
        includedTypes: t3included.reduce((acc: Record<string, number>, i: any) => { acc[i.type || 'unknown'] = (acc[i.type || 'unknown'] || 0) + 1; return acc; }, {}),
        userRelationship: t3userRel ? JSON.stringify(t3userRel) : 'niet aanwezig',
        flexUserRelationship: t3flexUserRel ? JSON.stringify(t3flexUserRel) : 'niet aanwezig',
        sampleRelationships: t3records.length > 0 ? Object.keys(t3records[0]?.relationships || {}) : [],
        rawFirstRecord: t3records.length > 0 ? t3records[0] : null,
      });

      // Test 4: Alle relationship keys over alle records
      const allRecords = [...t1records, ...t2records, ...t3records];
      const allRelKeys = new Set<string>();
      allRecords.forEach(r => Object.keys(r?.relationships || {}).forEach(k => allRelKeys.add(k)));

      // Test 5: flex_user_company IDs
      const flexCompanyIds = t1records
        .map((r: any) => r.relationships?.flex_user_company?.data?.id)
        .filter((v: any) => v)
        .slice(0, 5);

      setUserTestResult({
        tests: testResults,
        allRelationshipKeys: Array.from(allRelKeys),
        flexCompanyIds,
        totalRecordsTested: allRecords.length,
      });

      const foundUsers = testResults.some(t => t.includedUsers > 0);
      if (foundUsers) {
        toast.success('User data GEVONDEN! Bekijk de resultaten.');
      } else {
        toast.warning('Geen user data gevonden in alle 3 tests. Bekijk details.');
      }
    } catch (err) {
      console.error('User test error:', err);
      toast.error('User test mislukt: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUserTestLoading(false);
    }
  };

  const fetchCompanyMatchTest = async () => {
    setCompanyMatchLoading(true);
    try {
      // Stap A: Haal assigned requisitions op
      const { data: assignedData, error: assignedError } = await supabase.functions.invoke('bendy-proxy', {
        body: { endpoint: '/api/v2/requisitions/assigned', method: 'GET', params: {} }
      });
      if (assignedError) throw new Error('Assigned requisitions ophalen mislukt');

      const nested = assignedData?.data;
      const assignedRecords = Array.isArray(nested?.data) ? nested.data : (Array.isArray(nested) ? nested : []);

      // Verzamel alle unieke flex_user_company IDs
      const flexCompanyIds = new Set<string>();
      assignedRecords.forEach((r: any) => {
        const id = r.relationships?.flex_user_company?.data?.id;
        if (id) flexCompanyIds.add(String(id));
      });

      // Stap B: Haal ALLE user records uit bendy_raw_cache
      const { data: cachedUsers, error: cacheError } = await supabase
        .from('bendy_raw_cache')
        .select('bendy_id, raw_data')
        .eq('entity_type', 'users')
        .order('fetched_at', { ascending: false })
        .limit(2000);

      if (cacheError) throw new Error('Cache ophalen mislukt: ' + cacheError.message);

      // Stap C: Bouw een map van company_id → users
      const companyToUsers: Record<string, Array<{ bendy_id: string; name: string; email: string; type: string }>> = {};
      (cachedUsers || []).forEach((row: any) => {
        const attrs = row.raw_data?.attributes || {};
        const rels = row.raw_data?.relationships || {};
        const companyId = rels?.company?.data?.id;
        if (companyId) {
          if (!companyToUsers[String(companyId)]) companyToUsers[String(companyId)] = [];
          companyToUsers[String(companyId)].push({
            bendy_id: row.bendy_id,
            name: `${attrs.firstname || ''} ${attrs.middlename || ''} ${attrs.lastname || ''}`.replace(/\s+/g, ' ').trim(),
            email: attrs.email || '',
            type: attrs.professional_type || '',
          });
        }
      });

      // Stap D: Voor elke flex_user_company, zoek de matchende users
      const companyFrequency: Record<string, number> = {};
      assignedRecords.forEach((r: any) => {
        const id = r.relationships?.flex_user_company?.data?.id;
        if (id) companyFrequency[String(id)] = (companyFrequency[String(id)] || 0) + 1;
      });

      const matchResults = Array.from(flexCompanyIds).map(companyId => {
        const users = companyToUsers[companyId] || [];
        return {
          companyId,
          userCount: users.length,
          users: users.slice(0, 5),
          matchType: users.length === 1 ? 'exact' : users.length === 0 ? 'geen' : 'meerdere',
          requisitionCount: companyFrequency[companyId] || 0,
        };
      });

      // Stap F: Samenvatting
      const exact = matchResults.filter(m => m.matchType === 'exact').length;
      const geen = matchResults.filter(m => m.matchType === 'geen').length;
      const meerdere = matchResults.filter(m => m.matchType === 'meerdere').length;

      setCompanyMatchResult({
        totalFlexCompanies: flexCompanyIds.size,
        totalAssignedReqs: assignedRecords.length,
        totalCachedUsers: (cachedUsers || []).length,
        totalCompaniesInCache: Object.keys(companyToUsers).length,
        summary: { exact, geen, meerdere },
        matches: matchResults.sort((a, b) => b.requisitionCount - a.requisitionCount),
      });

      toast.success(`Matching klaar: ${exact} exact, ${meerdere} meerdere, ${geen} geen match`);
    } catch (err) {
      console.error('Company match test error:', err);
      toast.error('Matching test mislukt: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCompanyMatchLoading(false);
    }
  };

  const fetchClientMatchTest = async () => {
    setClientMatchLoading(true);
    try {
      const { data: openData } = await supabase.functions.invoke('bendy-proxy', {
        body: { endpoint: '/api/v2/requisitions/open', method: 'GET', params: {} }
      });
      const { data: assignedData } = await supabase.functions.invoke('bendy-proxy', {
        body: { endpoint: '/api/v2/requisitions/assigned', method: 'GET', params: {} }
      });

      const openNested = openData?.data;
      const openRecords = Array.isArray(openNested?.data) ? openNested.data : (Array.isArray(openNested) ? openNested : []);
      const assignedNested = assignedData?.data;
      const assignedRecords = Array.isArray(assignedNested?.data) ? assignedNested.data : (Array.isArray(assignedNested) ? assignedNested : []);
      const allRecords = [...openRecords, ...assignedRecords];

      const clientIdCounts: Record<string, { open: number; assigned: number; name: string }> = {};
      openRecords.forEach((r: any) => {
        const id = r.relationships?.client?.data?.id;
        if (id) {
          if (!clientIdCounts[id]) clientIdCounts[id] = { open: 0, assigned: 0, name: '' };
          clientIdCounts[id].open++;
          if (!clientIdCounts[id].name) clientIdCounts[id].name = r.attributes?.name || '';
        }
      });
      assignedRecords.forEach((r: any) => {
        const id = r.relationships?.client?.data?.id;
        if (id) {
          if (!clientIdCounts[id]) clientIdCounts[id] = { open: 0, assigned: 0, name: '' };
          clientIdCounts[id].assigned++;
          if (!clientIdCounts[id].name) clientIdCounts[id].name = r.attributes?.name || '';
        }
      });

      const uniqueClientIds = Object.keys(clientIdCounts);

      const { data: sublocations, error: subError } = await supabase
        .from('client_sublocations')
        .select('id, bendy_id, naam, plaats, client_locations!inner(client_organizations!inner(name))')
        .not('bendy_id', 'is', null);

      if (subError) throw new Error('Sublocations ophalen mislukt: ' + subError.message);

      const subMap: Record<string, any> = {};
      (sublocations || []).forEach((s: any) => {
        subMap[s.bendy_id] = {
          id: s.id,
          naam: s.naam,
          plaats: s.plaats,
          organisatie: s.client_locations?.client_organizations?.name || '—',
        };
      });

      const matchResults: any[] = uniqueClientIds.map(clientId => {
        const sub = subMap[clientId];
        const counts = clientIdCounts[clientId];
        return {
          clientId,
          matched: !!sub,
          sublocation: sub || null,
          reqName: counts.name,
          openCount: counts.open,
          assignedCount: counts.assigned,
          totalCount: counts.open + counts.assigned,
          isPending: false,
        };
      }).sort((a, b) => b.totalCount - a.totalCount);

      const { data: pendingMappings } = await supabase
        .from('bendy_id_mapping')
        .select('bendy_id, conflict_data')
        .eq('entity_type', 'sublocation')
        .eq('sync_status', 'pending');

      const pendingBendyIds = new Set((pendingMappings || []).map((p: any) => p.bendy_id));
      matchResults.forEach(m => {
        m.isPending = pendingBendyIds.has(m.clientId);
      });

      const matched = matchResults.filter(m => m.matched).length;
      const unmatched = matchResults.filter(m => !m.matched && !m.isPending).length;
      const pending = matchResults.filter(m => m.isPending).length;
      const matchedReqs = matchResults.filter(m => m.matched).reduce((sum: number, m: any) => sum + m.totalCount, 0);
      const unmatchedReqs = matchResults.filter(m => !m.matched).reduce((sum: number, m: any) => sum + m.totalCount, 0);

      setClientMatchResult({
        totalUniqueClients: uniqueClientIds.length,
        totalOpenReqs: openRecords.length,
        totalAssignedReqs: assignedRecords.length,
        totalSublocations: (sublocations || []).length,
        summary: { matched, unmatched, pending },
        reqCoverage: { matched: matchedReqs, unmatched: unmatchedReqs, total: allRecords.length },
        matches: matchResults,
      });

      toast.success(`Client matching klaar: ${matched} gematcht, ${unmatched} niet gematcht, ${pending} pending`);
    } catch (err) {
      console.error('Client match test error:', err);
      toast.error('Client matching mislukt: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setClientMatchLoading(false);
    }
  };

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
    const interval = setInterval(fetchStatus, 120000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Refresh status wanneer tab weer zichtbaar wordt
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Poll elke 3s voor sync resultaat nadat de backend "accepted" heeft geretourneerd
  useEffect(() => {
    if (!pollingSyncLogId || !pollingAction) return;

    const interval = setInterval(async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bendy-sync`;
        const response = await fetch(url, { method: "GET" });
        const json = await response.json();
        if (!json.success) return;

        const log = (json.data?.recent_logs || []).find(
          (l: SyncLog) => l.id === pollingSyncLogId
        );

        if (log && log.status !== 'running') {
          const meta = log.metadata || {};
          const result: SyncResult = {
            records_fetched: log.records_fetched,
            records_created: log.records_created,
            records_updated: log.records_updated,
            records_skipped: log.records_skipped,
            records_failed: log.records_failed,
            toewijzingen_created: meta.toewijzingen_created,
            toewijzingen_skipped: meta.toewijzingen_skipped,
            toewijzingen_no_match: meta.toewijzingen_no_match,
            toewijzingen_overlap: meta.toewijzingen_overlap,
          };

          // Extract skip diagnostiek from errors array
          if (log.errors && Array.isArray(log.errors)) {
            const diagEntry = log.errors.find((e: string) => typeof e === 'string' && e.startsWith('SKIP_DIAG:'));
            if (diagEntry) {
              try {
                result.skip_diag = JSON.parse(diagEntry.replace('SKIP_DIAG:', ''));
              } catch { /* ignore parse errors */ }
            }
          }

          if (pollingAction === 'sync_clients') {
            setSyncResult(result);
            setSyncing(false);
            toast.success(`Client sync voltooid: ${log.records_fetched} records opgehaald`);
          } else if (pollingAction === 'sync_users') {
            setUserSyncResult(result);
            setSyncingUsers(false);
            toast.success(`Professional sync voltooid: ${log.records_fetched} users opgehaald`);
          } else if (pollingAction === 'sync_documents') {
            setDocSyncResult(result);
            setSyncingDocs(false);
            toast.success(`Document sync voltooid: ${log.records_fetched} documenten opgehaald`);
          } else if (pollingAction === 'sync_requisitions') {
            setReqSyncResult(result);
            setSyncingReqs(false);
            toast.success(`Requisition sync voltooid: ${log.records_fetched} diensten opgehaald`);
          }

          setPollingSyncLogId(null);
          setPollingAction(null);
          fetchStatus();
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Sync polling error:', err);
      }
    }, 10000);

    // Timeout na 5 minuten
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setPollingSyncLogId(null);
      setPollingAction(null);
      if (pollingAction === 'sync_clients') setSyncing(false);
      if (pollingAction === 'sync_users') setSyncingUsers(false);
      if (pollingAction === 'sync_documents') setSyncingDocs(false);
      if (pollingAction === 'sync_requisitions') setSyncingReqs(false);
      toast.error('Sync timeout — check de logs voor de status');
      fetchStatus();
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [pollingSyncLogId, pollingAction]);

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
        body: { action: "sync_clients", tenant: "citozorg", sync_type: "incremental" },
      });
      if (error) throw error;
      if (data?.success) {
        if (data.data?.status === 'accepted') {
          toast.info('Client sync gestart op de achtergrond...');
          setPollingSyncLogId(data.data.sync_log_id);
          setPollingAction('sync_clients');
        } else {
          setSyncResult(data.data);
          setSyncing(false);
          toast.success(`Sync voltooid: ${data.data.records_fetched} records opgehaald`);
          fetchStatus();
        }
      } else {
        toast.error(`Sync mislukt: ${data?.error || "Onbekende fout"}`);
        setSyncing(false);
      }
    } catch (err: any) {
      toast.error(`Sync mislukt: ${err.message || "Onbekende fout"}`);
      setSyncing(false);
    }
  };

  const handleUserSync = async () => {
    setSyncingUsers(true);
    setUserSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("bendy-sync", {
        body: { action: "sync_users", tenant: "citozorg", sync_type: "incremental" },
      });
      if (error) throw error;
      if (data?.success) {
        if (data.data?.status === 'accepted') {
          toast.info('Professional sync gestart op de achtergrond...');
          setPollingSyncLogId(data.data.sync_log_id);
          setPollingAction('sync_users');
        } else {
          setUserSyncResult(data.data);
          setSyncingUsers(false);
          toast.success(`User sync voltooid: ${data.data.records_fetched} users opgehaald`);
          fetchStatus();
        }
      } else {
        toast.error(data?.error || "User sync mislukt");
        setSyncingUsers(false);
      }
    } catch (err: any) {
      toast.error(`Fout: ${err.message}`);
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
              {syncing ? (pollingAction === 'sync_clients' ? "Sync draait op achtergrond..." : "Verbinden...") : "Client Sync Starten"}
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
              {syncingUsers ? (pollingAction === 'sync_users' ? "Sync draait op achtergrond..." : "Verbinden...") : "Professional Sync Starten"}
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
                    body: { action: "sync_documents", tenant: "citozorg", sync_type: "incremental" },
                  });
                  if (error) throw error;
                  if (data?.success) {
                    if (data.data?.status === 'accepted') {
                      toast.info('Document sync gestart op de achtergrond...');
                      setPollingSyncLogId(data.data.sync_log_id);
                      setPollingAction('sync_documents');
                    } else {
                      setDocSyncResult(data.data);
                      setSyncingDocs(false);
                      toast.success(`Document sync voltooid: ${data.data.records_fetched} documenten opgehaald`);
                      fetchStatus();
                    }
                  } else {
                    toast.error(data?.error || "Document sync mislukt");
                    setSyncingDocs(false);
                  }
                } catch (err: any) {
                  toast.error(`Fout: ${err.message}`);
                  setSyncingDocs(false);
                }
              }}
              disabled={syncingDocs}
              variant="outline"
              className="w-full sm:w-auto"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncingDocs ? "animate-spin" : ""}`} />
              {syncingDocs ? (pollingAction === 'sync_documents' ? "Sync draait op achtergrond..." : "Verbinden...") : "Document Sync Starten"}
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

        {/* Requisition Sync */}
        <Card className="glass-layer-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Requisition Sync (Diensten)
            </CardTitle>
            <p className="text-xs text-muted-foreground">Importeer open en assigned requisitions als diensten</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Cleanup Diensten Duplicaten */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full border-amber-500/50 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                disabled={cleaningUp || (!!cleanupResult && cleanupResult.unique_index_created)}
                onClick={async () => {
                  setCleaningUp(true);
                  let totalDeleted = cleanupResult?.total_deleted || 0;
                  let iterations = 0;
                  const MAX_ITERATIONS = 1000;
                  try {
                    let hasMore = true;
                    while (hasMore && iterations < MAX_ITERATIONS) {
                      iterations++;
                      const { data, error } = await supabase.functions.invoke('bendy-sync', {
                        body: { action: 'cleanup_diensten' },
                      });
                      if (error) throw error;
                      if (!data?.success) throw new Error(data?.error || 'Onbekende fout');
                      const result = data.result;
                      totalDeleted += result.deleted_this_batch;
                      hasMore = result.has_more;
                      setCleanupResult({
                        total_deleted: totalDeleted,
                        duplicates_remaining: hasMore ? -1 : 0,
                        unique_index_created: result.unique_index_created || false,
                        index_error: result.index_error || null,
                      });
                      if (hasMore) await new Promise(r => setTimeout(r, 100));
                    }
                    if (!hasMore) {
                      const indexMsg = cleanupResult?.index_error 
                        ? ` (index waarschuwing: ${cleanupResult.index_error})` 
                        : ', UNIQUE index aangemaakt';
                      toast.success(`✅ ${totalDeleted} duplicaten verwijderd${indexMsg}`);
                    } else {
                      toast.info(`⏸️ ${totalDeleted} verwijderd na ${MAX_ITERATIONS} batches — klik opnieuw om door te gaan`);
                    }
                  } catch (err: any) {
                    toast.error(`❌ Cleanup fout: ${err.message}`);
                    setCleanupResult(prev => prev ? { ...prev, total_deleted: totalDeleted } : { total_deleted: totalDeleted, duplicates_remaining: -1, unique_index_created: false, index_error: null });
                  } finally {
                    setCleaningUp(false);
                  }
                }}
              >
                {cleaningUp ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" /> ⏳ Cleanup... {cleanupResult ? `${cleanupResult.total_deleted} verwijderd` : 'starten...'}</>
                ) : cleanupResult?.unique_index_created ? (
                  <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> ✅ {cleanupResult.total_deleted} duplicaten verwijderd, index aangemaakt</>
                ) : cleanupResult?.index_error ? (
                  <>⚠️ Cleanup klaar ({cleanupResult.total_deleted} verwijderd) — index fout: {cleanupResult.index_error}</>
                ) : cleanupResult ? (
                  <>⚠️ {cleanupResult.total_deleted} verwijderd (onderbroken — klik opnieuw)</>
                ) : (
                  <>🧹 Cleanup Diensten Duplicaten</>
                )}
              </Button>
            </div>
            <Button
              onClick={async () => {
                setSyncingReqs(true);
                setReqSyncResult(null);
                try {
                  const { data, error } = await supabase.functions.invoke('bendy-sync', {
                    body: { action: 'sync_requisitions', tenant: 'citozorg', sync_type: 'incremental' },
                  });
                  if (error) throw error;
                  if (data?.success) {
                    if (data.data?.sync_log_id) {
                      setPollingSyncLogId(data.data.sync_log_id);
                      setPollingAction('sync_requisitions');
                      toast.info('Requisition sync gestart op achtergrond...');
                    } else {
                      setReqSyncResult(data.data);
                      setSyncingReqs(false);
                      toast.success(`Requisition sync voltooid: ${data.data.records_fetched} diensten opgehaald`);
                      fetchStatus();
                    }
                  } else {
                    toast.error(data?.error || "Requisition sync mislukt");
                    setSyncingReqs(false);
                  }
                } catch (err: any) {
                  toast.error(`Fout: ${err.message}`);
                  setSyncingReqs(false);
                }
              }}
              disabled={syncingReqs}
              variant="outline"
              className="w-full sm:w-auto"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncingReqs ? "animate-spin" : ""}`} />
              {syncingReqs ? (pollingAction === 'sync_requisitions' ? "Sync draait op achtergrond..." : "Verbinden...") : "Requisition Sync Starten"}
            </Button>
            {reqSyncResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 rounded-lg bg-muted/50">
                  <div><span className="text-xs text-muted-foreground">Opgehaald</span><p className="font-semibold">{reqSyncResult.records_fetched}</p></div>
                  <div><span className="text-xs text-muted-foreground">Aangemaakt</span><p className="font-semibold text-emerald-600 dark:text-emerald-400">{reqSyncResult.records_created}</p></div>
                  <div><span className="text-xs text-muted-foreground">Bijgewerkt</span><p className="font-semibold">{reqSyncResult.records_updated}</p></div>
                  <div><span className="text-xs text-muted-foreground">Overgeslagen</span><p className="font-semibold">{reqSyncResult.records_skipped}</p></div>
                  <div><span className="text-xs text-muted-foreground">Mislukt</span><p className="font-semibold text-destructive">{reqSyncResult.records_failed}</p></div>
                </div>
                {(reqSyncResult.toewijzingen_created || reqSyncResult.toewijzingen_skipped || reqSyncResult.toewijzingen_no_match || reqSyncResult.toewijzingen_overlap) ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-muted/50">
                    <div><span className="text-xs text-muted-foreground">Toewijzingen aangemaakt</span><p className="font-semibold text-emerald-600 dark:text-emerald-400">{reqSyncResult.toewijzingen_created ?? 0}</p></div>
                    <div><span className="text-xs text-muted-foreground">Toewijzingen overgeslagen</span><p className="font-semibold text-muted-foreground">{reqSyncResult.toewijzingen_skipped ?? 0}</p></div>
                    <div><span className="text-xs text-muted-foreground">Toewijzingen geen match</span><p className="font-semibold text-amber-600 dark:text-amber-400">{reqSyncResult.toewijzingen_no_match ?? 0}</p></div>
                    <div><span className="text-xs text-muted-foreground">Toewijzingen overlap</span><p className="font-semibold text-destructive">{reqSyncResult.toewijzingen_overlap ?? 0}</p></div>
                  </div>
                ) : null}
                {reqSyncResult?.skip_diag && (
                  <div className="space-y-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Diagnostiek: Overgeslagen diensten</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div><span className="text-xs text-muted-foreground">Sublocation niet gevonden</span><p className="font-semibold text-amber-600">{reqSyncResult.skip_diag.sublocation_miss}</p></div>
                      <div><span className="text-xs text-muted-foreground">Datum ontbreekt</span><p className="font-semibold text-amber-600">{reqSyncResult.skip_diag.datum_ontbreekt}</p></div>
                      <div><span className="text-xs text-muted-foreground">Tijd ontbreekt</span><p className="font-semibold text-amber-600">{reqSyncResult.skip_diag.tijd_ontbreekt}</p></div>
                    </div>
                    {Object.keys(reqSyncResult.skip_diag.bendy_status_verdeling).length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Bendy status verdeling:</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(reqSyncResult.skip_diag.bendy_status_verdeling).map(([status, count]) => (
                            <Badge key={status} variant="outline" className="text-xs">{status}: {count as number}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {reqSyncResult.skip_diag.missing_client_ids.length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-amber-700 dark:text-amber-400 font-medium">
                          {reqSyncResult.skip_diag.missing_client_ids.length} ontbrekende sublocaties (klik om te tonen)
                        </summary>
                        <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5 font-mono text-muted-foreground">
                          {reqSyncResult.skip_diag.missing_client_ids.map((entry, i) => {
                            const [clientId, name, date] = entry.split('|');
                            return <div key={i}>Client {clientId} — {name} — {date}</div>;
                          })}
                        </div>
                      </details>
                    )}
                  </div>
                )}
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
                      <React.Fragment key={log.id}>
                        <TableRow 
                          className="cursor-pointer hover:bg-muted/60"
                          onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                        >
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
                        {expandedLogId === log.id && (
                          <TableRow>
                            <TableCell colSpan={9} className="p-0">
                              <div className="bg-muted/30 dark:bg-muted/10 p-4 max-h-[400px] overflow-y-auto">
                                {log.errors && log.errors.length > 0 && (
                                  <div className="mb-3">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Checkpoints / Errors</p>
                                    <pre className="text-xs font-mono whitespace-pre-wrap break-all">{JSON.stringify(log.errors, null, 2)}</pre>
                                  </div>
                                )}
                                {log.metadata && (
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Metadata</p>
                                    <pre className="text-xs font-mono whitespace-pre-wrap break-all">{JSON.stringify(log.metadata, null, 2)}</pre>
                                  </div>
                                )}
                                {(!log.errors || log.errors.length === 0) && !log.metadata && (
                                  <p className="text-xs text-muted-foreground italic">Geen extra data beschikbaar</p>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
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

        {/* Diagnostisch paneel: Ongebruikte velden */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Bendy Data Analyse — Ongebruikte velden
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Velden die Bendy levert maar die we nog niet gebruiken bij professionals
            </p>
          </CardHeader>
          <CardContent>
            <Button
              onClick={fetchUnusedFieldsAnalysis}
              disabled={analysisLoading}
              variant="outline"
              className="mb-4"
            >
              {analysisLoading ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Analyseren...</>
              ) : (
                <><Play className="h-4 w-4" /> Analyse starten</>
              )}
            </Button>

            {unusedFieldsAnalysis && (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Veld</TableHead>
                      <TableHead>Gevuld</TableHead>
                      <TableHead>%</TableHead>
                      <TableHead>Voorbeelden</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unusedFieldsAnalysis.map((item) => (
                      <TableRow key={item.field}>
                        <TableCell className="font-mono text-sm">{item.field}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {item.filled}/{item.total}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.percentage > 50 ? "success" :
                              item.percentage >= 10 ? "warning" : "secondary"
                            }
                          >
                            {item.percentage}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-md">
                            {item.examples.length > 0 ? (
                              item.examples.map((ex: string, i: number) => (
                                <Badge key={i} variant="outline" className="text-xs font-mono max-w-[200px] truncate">
                                  {ex}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-xs italic">geen data</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ===== BENDY REQUISITIONS VERKENNING ===== */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Bendy Requisitions Verkenning
            </CardTitle>
            <CardDescription>
              Verken open en toegewezen diensten uit Bendy voordat we de sync bouwen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Button onClick={fetchRequisitionSample} disabled={reqAnalysisLoading} variant="outline">
              {reqAnalysisLoading ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" /> Ophalen...</> : 'Requisitions Ophalen'}
            </Button>

            {reqAnalysisResult && (
              <>
                {/* Sectie A: Overzicht */}
                <div className="flex gap-3">
                  <Badge variant="info">{reqAnalysisResult.openCount} open requisitions</Badge>
                  <Badge variant="success">{reqAnalysisResult.assignedCount} assigned requisitions</Badge>
                </div>

                {/* Sectie B: Open Requisitions Velden */}
                {reqAnalysisResult.openFields.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 text-sm">Open Requisitions — Velden</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Veld</TableHead>
                            <TableHead>Gevuld</TableHead>
                            <TableHead>%</TableHead>
                            <TableHead>Voorbeelden</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reqAnalysisResult.openFields.map((f: any) => (
                            <TableRow key={f.field}>
                              <TableCell className="font-mono text-xs">{f.field}</TableCell>
                              <TableCell className="text-xs">{f.filled}/{f.total}</TableCell>
                              <TableCell>
                                <Badge variant={f.percentage > 50 ? 'success' : f.percentage >= 10 ? 'warning' : 'secondary'}>
                                  {f.percentage}%
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {f.examples.length > 0 ? f.examples.map((ex: string, i: number) => (
                                    <Badge key={i} variant="outline" className="text-xs max-w-[200px] truncate">{ex}</Badge>
                                  )) : <span className="text-muted-foreground text-xs italic">geen data</span>}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Sectie C: Assigned Requisitions Velden */}
                {reqAnalysisResult.assignedFields.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 text-sm">Assigned Requisitions — Velden</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Veld</TableHead>
                            <TableHead>Gevuld</TableHead>
                            <TableHead>%</TableHead>
                            <TableHead>Voorbeelden</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reqAnalysisResult.assignedFields.map((f: any) => (
                            <TableRow key={f.field}>
                              <TableCell className="font-mono text-xs">{f.field}</TableCell>
                              <TableCell className="text-xs">{f.filled}/{f.total}</TableCell>
                              <TableCell>
                                <Badge variant={f.percentage > 50 ? 'success' : f.percentage >= 10 ? 'warning' : 'secondary'}>
                                  {f.percentage}%
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {f.examples.length > 0 ? f.examples.map((ex: string, i: number) => (
                                    <Badge key={i} variant="outline" className="text-xs max-w-[200px] truncate">{ex}</Badge>
                                  )) : <span className="text-muted-foreground text-xs italic">geen data</span>}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Sectie D: Relationships */}
                {(reqAnalysisResult.openRelationships.length > 0 || reqAnalysisResult.assignedRelationships.length > 0) && (
                  <div>
                    <h4 className="font-semibold mb-2 text-sm">Relationships</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {reqAnalysisResult.openRelationships.length > 0 && (
                        <div className="border rounded-lg overflow-hidden">
                          <div className="p-2 bg-muted/50 text-xs font-semibold">Open</div>
                          <Table>
                            <TableHeader><TableRow><TableHead>Relatie</TableHead><TableHead>Aanwezig</TableHead><TableHead>Voorbeelden</TableHead></TableRow></TableHeader>
                            <TableBody>
                              {reqAnalysisResult.openRelationships.map((r: any) => (
                                <TableRow key={r.name}>
                                  <TableCell className="font-mono text-xs">{r.name}</TableCell>
                                  <TableCell className="text-xs">{r.present}/{r.total}</TableCell>
                                  <TableCell><div className="flex flex-col gap-1">{r.samples.slice(0, 2).map((s: string, i: number) => (
                                    <code key={i} className="text-xs bg-muted p-1 rounded block max-w-[250px] truncate">{s}</code>
                                  ))}</div></TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                      {reqAnalysisResult.assignedRelationships.length > 0 && (
                        <div className="border rounded-lg overflow-hidden">
                          <div className="p-2 bg-muted/50 text-xs font-semibold">Assigned</div>
                          <Table>
                            <TableHeader><TableRow><TableHead>Relatie</TableHead><TableHead>Aanwezig</TableHead><TableHead>Voorbeelden</TableHead></TableRow></TableHeader>
                            <TableBody>
                              {reqAnalysisResult.assignedRelationships.map((r: any) => (
                                <TableRow key={r.name}>
                                  <TableCell className="font-mono text-xs">{r.name}</TableCell>
                                  <TableCell className="text-xs">{r.present}/{r.total}</TableCell>
                                  <TableCell><div className="flex flex-col gap-1">{r.samples.slice(0, 2).map((s: string, i: number) => (
                                    <code key={i} className="text-xs bg-muted p-1 rounded block max-w-[250px] truncate">{s}</code>
                                  ))}</div></TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sectie E: Included data */}
                {(reqAnalysisResult.openIncluded?.length > 0 || reqAnalysisResult.assignedIncluded?.length > 0) && (
                  <div>
                    <h4 className="font-semibold mb-2 text-sm">Included Data (JSON:API sideloading)</h4>
                    <div className="flex gap-4">
                      {reqAnalysisResult.openIncluded?.length > 0 && (
                        <div>
                          <span className="text-xs font-medium">Open: </span>
                          {Object.entries(
                            (reqAnalysisResult.openIncluded as any[]).reduce((acc: Record<string, number>, item: any) => {
                              const t = item.type || 'unknown';
                              acc[t] = (acc[t] || 0) + 1;
                              return acc;
                            }, {})
                          ).map(([type, count]) => (
                            <Badge key={type} variant="outline" className="mr-1 text-xs">{count as number}x {type}</Badge>
                          ))}
                        </div>
                      )}
                      {reqAnalysisResult.assignedIncluded?.length > 0 && (
                        <div>
                          <span className="text-xs font-medium">Assigned: </span>
                          {Object.entries(
                            (reqAnalysisResult.assignedIncluded as any[]).reduce((acc: Record<string, number>, item: any) => {
                              const t = item.type || 'unknown';
                              acc[t] = (acc[t] || 0) + 1;
                              return acc;
                            }, {})
                          ).map(([type, count]) => (
                            <Badge key={type} variant="outline" className="mr-1 text-xs">{count as number}x {type}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {reqAnalysisResult.openIncluded?.length === 0 && reqAnalysisResult.assignedIncluded?.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">Geen included data — include= parameters werken mogelijk niet</p>
                    )}
                  </div>
                )}

                {/* Sectie F: Ruwe JSON */}
                <div>
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold hover:underline">
                      <ChevronDown className="h-4 w-4" />
                      Ruwe JSON (eerste 2 records)
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-3">
                      {reqAnalysisResult.openRaw?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">Open Requisitions:</p>
                          <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-[400px]">
                            {JSON.stringify(reqAnalysisResult.openRaw, null, 2)}
                          </pre>
                        </div>
                      )}
                      {reqAnalysisResult.assignedRaw?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">Assigned Requisitions:</p>
                          <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-[400px]">
                            {JSON.stringify(reqAnalysisResult.assignedRaw, null, 2)}
                          </pre>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </div>

                {/* Sectie G: Assigned User Koppeling Test */}
                <Separator className="my-6" />
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold">Assigned User Koppeling Test</h4>
                    <p className="text-xs text-muted-foreground">Test welke include= parameter de toegewezen professional oplevert</p>
                  </div>
                  <Button onClick={fetchAssignedUserTest} disabled={userTestLoading} variant="outline" size="sm">
                    {userTestLoading ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" /> Testen...</> : 'User Koppeling Testen'}
                  </Button>

                  {userTestResult && (
                    <div className="space-y-4">
                      {userTestResult.tests.map((test: any, idx: number) => (
                        <div key={idx} className="border border-border rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold font-mono">{test.name}</span>
                            {test.error ? (
                              <Badge variant="secondary">Fout</Badge>
                            ) : test.includedUsers > 0 ? (
                              <Badge variant="success">Users gevonden: {test.includedUsers}</Badge>
                            ) : (
                              <Badge variant="destructive">Geen users</Badge>
                            )}
                            <span className="text-xs text-muted-foreground">{test.recordCount} records</span>
                          </div>

                          {Object.keys(test.includedTypes).length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-xs text-muted-foreground">Included:</span>
                              {Object.entries(test.includedTypes).map(([type, count]) => (
                                <Badge key={type} variant="outline" className="text-xs">{String(count)}x {type}</Badge>
                              ))}
                            </div>
                          )}

                          <div className="text-xs">
                            <span className="text-muted-foreground">user relationship: </span>
                            <code className="bg-muted px-1 py-0.5 rounded text-xs">{test.userRelationship}</code>
                          </div>
                          {test.flexUserRelationship && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">flex_user relationship: </span>
                              <code className="bg-muted px-1 py-0.5 rounded text-xs">{test.flexUserRelationship}</code>
                            </div>
                          )}

                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-xs text-muted-foreground">Relationships:</span>
                            {test.sampleRelationships.map((k: string) => (
                              <Badge key={k} variant="secondary" className="text-xs">{k}</Badge>
                            ))}
                          </div>

                          {test.rawFirstRecord && (
                            <Collapsible>
                              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                                <ChevronDown className="h-3 w-3" />
                                Ruwe response — {test.name}
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-1">
                                <pre className="text-xs bg-muted p-2 rounded-lg overflow-auto max-h-[300px]">
                                  {JSON.stringify(test.rawFirstRecord, null, 2)}
                                </pre>
                              </CollapsibleContent>
                            </Collapsible>
                          )}
                        </div>
                      ))}

                      {/* Samenvatting */}
                      <div className="border-t border-border pt-3 space-y-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-xs font-medium">Alle unieke relationship keys:</span>
                          {userTestResult.allRelationshipKeys.map((k: string) => (
                            <Badge key={k} variant="info" className="text-xs">{k}</Badge>
                          ))}
                        </div>
                        {userTestResult.flexCompanyIds.length > 0 && (
                          <div className="text-xs">
                            <span className="font-medium">flex_user_company IDs (eerste 5): </span>
                            <span className="font-mono">{userTestResult.flexCompanyIds.join(', ')}</span>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Totaal records getest: {userTestResult.totalRecordsTested}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Sectie H: Flex Company → Professional Matching ── */}
                <Separator className="my-6" />
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-sm">Flex Company → Professional Matching</h4>
                      <p className="text-xs text-muted-foreground">Test of flex_user_company IDs matchen met precies 1 professional in onze cache</p>
                    </div>
                    <Button onClick={fetchCompanyMatchTest} disabled={companyMatchLoading} variant="outline" size="sm">
                      {companyMatchLoading ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" /> Testen...</> : 'Matching Testen'}
                    </Button>
                  </div>

                  {companyMatchResult && (
                    <div className="space-y-4">
                      {/* Samenvatting badges */}
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="info">{companyMatchResult.totalFlexCompanies} unieke bedrijven</Badge>
                        <Badge variant="success">{companyMatchResult.summary.exact} exact match (1 user)</Badge>
                        <Badge variant="warning">{companyMatchResult.summary.meerdere} meerdere users</Badge>
                        <Badge variant="destructive">{companyMatchResult.summary.geen} geen match</Badge>
                      </div>

                      {/* Stats rij */}
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Assigned requisitions: {companyMatchResult.totalAssignedReqs}</span>
                        <span>Users in cache: {companyMatchResult.totalCachedUsers}</span>
                        <span>Bedrijven in cache: {companyMatchResult.totalCompaniesInCache}</span>
                      </div>

                      {/* Resultaten tabel */}
                      {companyMatchResult.matches.length > 0 && (
                        <div className="rounded-lg border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Company ID</TableHead>
                                <TableHead>Match</TableHead>
                                <TableHead>Professional(s)</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Diensten</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {companyMatchResult.matches.map((m: any) => (
                                <TableRow key={m.companyId}>
                                  <TableCell className="font-mono text-xs">{m.companyId}</TableCell>
                                  <TableCell>
                                    {m.matchType === 'exact' && <Badge variant="success">1 user</Badge>}
                                    {m.matchType === 'meerdere' && <Badge variant="warning">{m.userCount} users</Badge>}
                                    {m.matchType === 'geen' && <Badge variant="destructive">geen</Badge>}
                                  </TableCell>
                                  <TableCell className="text-xs max-w-[250px]">
                                    {m.users.slice(0, 3).map((u: any, i: number) => (
                                      <div key={i}>{u.name} {u.email && <span className="text-muted-foreground">({u.email})</span>}</div>
                                    ))}
                                    {m.users.length > 3 && <div className="text-muted-foreground">+{m.users.length - 3} meer</div>}
                                    {m.users.length === 0 && <span className="text-muted-foreground">—</span>}
                                  </TableCell>
                                  <TableCell className="text-xs">{m.users[0]?.type || '—'}</TableCell>
                                  <TableCell className="text-xs">{m.requisitionCount}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              {/* ===== Sectie I: Client ID → Sublocation Matching ===== */}
              {reqAnalysisResult && (
                <div className="space-y-4">
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold">I. Client ID → Sublocation Matching</h4>
                      <p className="text-xs text-muted-foreground">Test of requisition client_ids matchen met onze client_sublocations.bendy_id</p>
                    </div>
                    <Button onClick={fetchClientMatchTest} disabled={clientMatchLoading} variant="outline" size="sm">
                      {clientMatchLoading ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" /> Testen...</> : 'Client Matching Testen'}
                    </Button>
                  </div>

                  {clientMatchResult && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="success">{clientMatchResult.summary.matched} gematcht</Badge>
                        <Badge variant="warning">{clientMatchResult.summary.pending} pending review</Badge>
                        <Badge variant="destructive">{clientMatchResult.summary.unmatched} niet gematcht</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const pct = clientMatchResult.reqCoverage.total > 0
                            ? Math.round((clientMatchResult.reqCoverage.matched / clientMatchResult.reqCoverage.total) * 100)
                            : 0;
                          const variant = pct > 90 ? 'success' : pct > 70 ? 'warning' : 'destructive';
                          return (
                            <Badge variant={variant as any}>
                              Requisition dekking: {clientMatchResult.reqCoverage.matched}/{clientMatchResult.reqCoverage.total} ({pct}%)
                            </Badge>
                          );
                        })()}
                      </div>

                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Open requisitions: {clientMatchResult.totalOpenReqs}</span>
                        <span>Assigned requisitions: {clientMatchResult.totalAssignedReqs}</span>
                        <span>Sublocations met bendy_id: {clientMatchResult.totalSublocations}</span>
                      </div>

                      {clientMatchResult.matches.length > 0 && (
                        <div className="border rounded-lg overflow-auto max-h-96">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Client ID</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Requisition naam</TableHead>
                                <TableHead>Sublocation</TableHead>
                                <TableHead>Open</TableHead>
                                <TableHead>Assigned</TableHead>
                                <TableHead>Totaal</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {clientMatchResult.matches.map((m: any, i: number) => (
                                <TableRow key={i} className={!m.matched && !m.isPending ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                                  <TableCell className="font-mono text-xs">{m.clientId}</TableCell>
                                  <TableCell>
                                    {m.matched ? (
                                      <Badge variant="success">Gematcht</Badge>
                                    ) : m.isPending ? (
                                      <Badge variant="warning">Pending</Badge>
                                    ) : (
                                      <Badge variant="destructive">Niet gevonden</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs max-w-48 truncate">{m.reqName || '—'}</TableCell>
                                  <TableCell className="text-xs">
                                    {m.sublocation ? (
                                      <span>{m.sublocation.naam}, {m.sublocation.plaats} <span className="text-muted-foreground">({m.sublocation.organisatie})</span></span>
                                    ) : '—'}
                                  </TableCell>
                                  <TableCell>{m.openCount}</TableCell>
                                  <TableCell>{m.assignedCount}</TableCell>
                                  <TableCell className="font-medium">{m.totalCount}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
