import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

// Admin phone → profile mapping
const ADMIN_MAP: Record<string, { id: string; naam: string }> = {
  "+31648005001": { id: "7095191d-c12f-4df2-a974-9087c0f35455", naam: "Kreshnik Atashi" },
  "+31618710360": { id: "daeb8147-1506-492a-919b-60ca103f9c40", naam: "Leonie Pattipeilohy" },
};

const FALLBACK_ORG_IDS = [
  "650e8400-e29b-41d4-a716-446655440001",
  "550e8400-e29b-41d4-a716-446655440000",
];

// Safe task columns — never expose sensitive data
const TASK_SAFE_COLUMNS = "id, title, description, status, priority, due_at, start_at, assignee_id, reporter_id, category, next_action, project_id, column_id, created_at";

// ============================================================
// SAFE COLUMNS — per tabel, NOOIT SELECT *
// ============================================================
const DIENST_SAFE_COLUMNS = "id, titel, datum, start_tijd, eind_tijd, status, sublocation_id, org_id, created_at, updated_at, publieke_opmerking, dienst_type, is_spoed, gevraagd_aantal";

const DIENST_TOEWIJZING_SAFE_COLUMNS = "id, dienst_id, professional_id, status, created_at, updated_at";

const ASSIGNMENT_SAFE_COLUMNS = "id, professional_id, sublocation_id, status, start_date, end_date, weekly_hours, created_at, updated_at";

const FACTUUR_SAFE_COLUMNS = "id, factuur_nummer, status, factuurdatum, vervaldatum, totaal, btw_bedrag, tenant_id, created_at, updated_at";

const APPLICATION_SAFE_COLUMNS = "id, professional_id, pipeline_stage, status, completeness_score, created_at, updated_at, org_id, source_label";

const VACANCY_SAFE_COLUMNS = "id, titel, status, sublocation_id, created_at, updated_at, beschrijving, functie_niveau, uren_per_week, start_datum";

// PII regex patronen voor server-side scan
const PII_PATTERNS = [
  /\b\d{9}\b/g,          // BSN (9 cijfers)
  /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]{0,3})?\b/g,  // IBAN
];

function stripPII(obj: any): any {
  if (typeof obj === 'string') {
    let clean = obj;
    for (const pattern of PII_PATTERNS) {
      pattern.lastIndex = 0;
      clean = clean.replace(pattern, '[VERBORGEN]');
    }
    return clean;
  }
  if (Array.isArray(obj)) return obj.map(stripPII);
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const lk = key.toLowerCase();
      if (['bsn', 'sofi_nummer', 'iban', 'iban_tenaamstelling', 'bankrekening',
           'tarief', 'uurtarief', 'tarief_per_uur', 'contract_tarief',
           'fee', 'salaris', 'gewenst_uurloon', 'hourly_rate_id'].includes(lk)) {
        continue;
      }
      result[key] = stripPII(value);
    }
    return result;
  }
  return obj;
}

function extractLast8(telefoon: string): string {
  const digits = telefoon.replace(/\D/g, "");
  return digits.slice(-8);
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Validate API key
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("OPENCLAW_API_KEY");
  if (!apiKey || apiKey !== expectedKey) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Service role client to bypass RLS
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { action } = body;

  try {
    switch (action) {
      // ── Bestaande acties (ongewijzigd) ──
      case "lookup_sender":
        return await handleLookupSender(supabase, body);
      case "query_db":
        return await handleQueryDb(supabase, body);
      case "get_tasks":
        return await handleGetTasks(supabase, body);
      case "create_task":
        return await handleCreateTask(supabase, body);
      case "update_task":
        return await handleUpdateTask(supabase, body);
      case "get_professionals":
        return await handleGetProfessionals(supabase, body);
      case "get_clients":
        return await handleGetClients(supabase, body);

      // ── 14 nieuwe acties ──
      case "get_diensten":
        return await handleGetDiensten(supabase, body);
      case "get_dienst_toewijzingen":
        return await handleGetDienstToewijzingen(supabase, body);
      case "get_assignments":
        return await handleGetAssignments(supabase, body);
      case "get_facturen":
        return await handleGetFacturen(supabase, body);
      case "get_applications":
        return await handleGetApplications(supabase, body);
      case "get_vacancies":
        return await handleGetVacancies(supabase, body);
      case "get_dashboard_stats":
        return await handleGetDashboardStats(supabase, body);
      case "search":
        return await handleSearch(supabase, body);
      case "create_dienst":
        return await handleCreateDienst(supabase, body);
      case "update_dienst":
        return await handleUpdateDienst(supabase, body);
      case "assign_professional":
        return await handleAssignProfessional(supabase, body);
      case "update_assignment":
        return await handleUpdateAssignment(supabase, body);
      case "update_factuur_status":
        return await handleUpdateFactuurStatus(supabase, body);
      case "update_application_stage":
        return await handleUpdateApplicationStage(supabase, body);

      // ── 3 nieuwe acties (get_professional, search_professionals, get_team_members) ──
      case "get_professional":
        return await handleGetProfessional(supabase, body);
      case "search_professionals":
        return await handleSearchProfessionals(supabase, body);
      case "get_team_members":
        return await handleGetTeamMembers(supabase, body);

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("openclaw-proxy error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

// ─── lookup_sender (ongewijzigd) ─────────────────────────────────────────────

async function handleLookupSender(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const telefoon = body.telefoon as string;
  if (!telefoon) {
    return jsonResponse({ error: "Missing telefoon parameter" }, 400);
  }

  const adminInfo = ADMIN_MAP[telefoon];
  if (adminInfo) {
    const { data: orgs } = await supabase
      .from("user_organizations")
      .select("org_id")
      .eq("user_id", adminInfo.id);

    const orgIds = orgs && orgs.length > 0
      ? orgs.map((o: { org_id: string }) => o.org_id)
      : FALLBACK_ORG_IDS;

    return jsonResponse({
      role: "admin",
      naam: adminInfo.naam,
      id: adminInfo.id,
      org_ids: orgIds,
    });
  }

  const last8 = extractLast8(telefoon);
  if (last8.length < 8) {
    return jsonResponse({ role: "unknown", reason: "Phone number too short" });
  }

  const pattern = `%${last8}%`;

  const { data: prof } = await supabase
    .from("professionals")
    .select("id, full_name, functie_niveau, status, telefoonnummer, org_id")
    .ilike("telefoonnummer", pattern)
    .limit(1)
    .maybeSingle();

  if (prof) {
    return jsonResponse({
      role: "professional",
      id: prof.id,
      full_name: prof.full_name,
      functie_niveau: prof.functie_niveau,
      status: prof.status,
    });
  }

  const { data: contact } = await supabase
    .from("client_contacts")
    .select("id, naam, functie, organization_id, client_organizations(id, name)")
    .ilike("telefoon", pattern)
    .limit(1)
    .maybeSingle();

  if (contact) {
    const org = contact.client_organizations as { id: string; name: string } | null;
    return jsonResponse({
      role: "client_contact",
      id: contact.id,
      naam: contact.naam,
      functie: contact.functie,
      organization_id: contact.organization_id,
      organization_name: org?.name ?? null,
    });
  }

  return jsonResponse({ role: "unknown" });
}

// ─── query_db (ongewijzigd) ──────────────────────────────────────────────────

async function handleQueryDb(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const queryType = body.query_type as string;
  const professionalId = body.professional_id as string;
  const dateFrom = body.date_from as string;
  const dateTo = body.date_to as string;

  if (!queryType) {
    return jsonResponse({ error: "Missing query_type" }, 400);
  }

  switch (queryType) {
    case "get_schedule":
      return await getSchedule(supabase, professionalId, dateFrom, dateTo);
    case "get_availability":
      return await getAvailability(supabase, professionalId, dateFrom, dateTo);
    case "get_documents":
      return await getDocuments(supabase, professionalId);
    case "get_profile":
      return await getProfile(supabase, professionalId);
    default:
      return jsonResponse({ error: `Unknown query_type: ${queryType}` }, 400);
  }
}

// ─── get_tasks (ongewijzigd) ─────────────────────────────────────────────────

async function handleGetTasks(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const userId = body.user_id as string | undefined;
  const orgId = body.org_id as string | undefined;
  const limit = Math.min(Number(body.limit) || 50, 100);

  let query = supabase
    .from("tasks")
    .select(TASK_SAFE_COLUMNS)
    .is("completed_at", null)
    .is("deleted_at", null);

  if (userId) query = query.eq("assignee_id", userId);
  if (orgId) query = query.eq("org_id", orgId);

  const { data, error } = await query
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error("get_tasks error:", error);
    return jsonResponse({ error: "Failed to fetch tasks" }, 500);
  }

  return jsonResponse({ tasks: data ?? [] });
}

// ─── create_task (ongewijzigd) ───────────────────────────────────────────────

async function handleCreateTask(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const title = body.title as string;
  const orgId = body.org_id as string;

  if (!title || !orgId) {
    return jsonResponse({ error: "Missing required fields: title, org_id" }, 400);
  }

  const insertData: Record<string, unknown> = {
    title,
    org_id: orgId,
    status: (body.status as string) || "open",
  };

  const optionalFields = ["description", "assignee_id", "reporter_id", "due_at", "start_at", "priority", "category", "project_id", "column_id"];
  for (const field of optionalFields) {
    if (body[field] !== undefined && body[field] !== null) {
      insertData[field] = body[field];
    }
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert(insertData)
    .select(TASK_SAFE_COLUMNS)
    .single();

  if (error) {
    console.error("create_task error:", error);
    return jsonResponse({ error: "Failed to create task" }, 500);
  }

  return jsonResponse({ task: data });
}

// ─── update_task (ongewijzigd) ───────────────────────────────────────────────

async function handleUpdateTask(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const taskId = body.task_id as string;
  if (!taskId) {
    return jsonResponse({ error: "Missing task_id" }, 400);
  }

  const allowedFields = ["title", "description", "status", "priority", "due_at", "start_at", "assignee_id", "completed_at", "next_action", "category", "column_id"];
  const updateData: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return jsonResponse({ error: "No fields to update" }, 400);
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(updateData)
    .eq("id", taskId)
    .select(TASK_SAFE_COLUMNS)
    .single();

  if (error) {
    console.error("update_task error:", error);
    return jsonResponse({ error: "Failed to update task" }, 500);
  }

  return jsonResponse({ task: data });
}

// ─── get_professionals (ongewijzigd) ─────────────────────────────────────────

async function handleGetProfessionals(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const orgId = body.org_id as string | undefined;

  let query = supabase
    .from("professionals")
    .select("id, full_name, email, telefoonnummer, functie_niveau, status, org_id")
    .is("deleted_at", null);

  if (orgId) query = query.eq("org_id", orgId);

  const { data, error } = await query.order("full_name", { ascending: true });

  if (error) {
    console.error("get_professionals error:", error);
    return jsonResponse({ error: "Failed to fetch professionals" }, 500);
  }

  return jsonResponse({ professionals: data ?? [] });
}

// ─── get_clients (ongewijzigd) ───────────────────────────────────────────────

async function handleGetClients(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const orgId = body.org_id as string | undefined;

  let query = supabase
    .from("client_organizations")
    .select("id, name, org_id, client_contacts(naam, functie, telefoon, email)");

  if (orgId) query = query.eq("org_id", orgId);

  const { data, error } = await query.order("name", { ascending: true });

  if (error) {
    console.error("get_clients error:", error);
    return jsonResponse({ error: "Failed to fetch clients" }, 500);
  }

  return jsonResponse({ clients: data ?? [] });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 14 NIEUWE ACTIES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1. get_diensten ─────────────────────────────────────────────────────────

async function handleGetDiensten(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const limit = Math.min(Number(body.limit) || 50, 100);

  let query = supabase
    .from("diensten")
    .select(DIENST_SAFE_COLUMNS)
    .order("datum", { ascending: true })
    .limit(limit);

  if (body.org_id) query = query.eq("org_id", body.org_id as string);
  if (body.status) query = query.eq("status", body.status as string);
  if (body.sublocation_id) query = query.eq("sublocation_id", body.sublocation_id as string);
  if (body.is_spoed) query = query.eq("is_spoed", true);
  if (body.datum_van) query = query.gte("datum", body.datum_van as string);
  if (body.datum_tot) query = query.lte("datum", body.datum_tot as string);

  const { data, error } = await query;
  if (error) {
    console.error("get_diensten error:", error);
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse(stripPII({ data: data ?? [] }));
}

// ─── 2. get_dienst_toewijzingen ──────────────────────────────────────────────

async function handleGetDienstToewijzingen(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const limit = Math.min(Number(body.limit) || 50, 100);

  let query = supabase
    .from("dienst_toewijzingen")
    .select(`${DIENST_TOEWIJZING_SAFE_COLUMNS}, professionals(id, full_name, email, functie_niveau)`)
    .limit(limit);

  if (body.dienst_id) query = query.eq("dienst_id", body.dienst_id as string);
  if (body.professional_id) query = query.eq("professional_id", body.professional_id as string);

  const { data, error } = await query;
  if (error) {
    console.error("get_dienst_toewijzingen error:", error);
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse(stripPII({ data: data ?? [] }));
}

// ─── 3. get_assignments ──────────────────────────────────────────────────────

async function handleGetAssignments(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const limit = Math.min(Number(body.limit) || 50, 100);

  let query = supabase
    .from("assignments")
    .select(`${ASSIGNMENT_SAFE_COLUMNS}, professionals(id, full_name, functie_niveau), client_sublocations(id, naam, client_locations(id, naam, client_organizations(id, name)))`)
    .order("start_date", { ascending: false })
    .limit(limit);

  if (body.professional_id) query = query.eq("professional_id", body.professional_id as string);
  if (body.sublocation_id) query = query.eq("sublocation_id", body.sublocation_id as string);
  if (body.status) query = query.eq("status", body.status as string);

  const { data, error } = await query;
  if (error) {
    console.error("get_assignments error:", error);
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse(stripPII({ data: data ?? [] }));
}

// ─── 4. get_facturen ─────────────────────────────────────────────────────────

async function handleGetFacturen(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const limit = Math.min(Number(body.limit) || 50, 100);

  let query = supabase
    .from("factuur")
    .select(`${FACTUUR_SAFE_COLUMNS}, client_organizations!opdrachtgever_id(id, name)`)
    .order("factuurdatum", { ascending: false })
    .limit(limit);

  if (body.tenant_id) query = query.eq("tenant_id", body.tenant_id as string);
  if (body.status) query = query.eq("status", body.status as string);
  if (body.factuurdatum_van) query = query.gte("factuurdatum", body.factuurdatum_van as string);
  if (body.factuurdatum_tot) query = query.lte("factuurdatum", body.factuurdatum_tot as string);

  const { data, error } = await query;
  if (error) {
    console.error("get_facturen error:", error);
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse(stripPII({ data: data ?? [] }));
}

// ─── 5. get_applications ─────────────────────────────────────────────────────

async function handleGetApplications(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const limit = Math.min(Number(body.limit) || 50, 100);

  let query = supabase
    .from("professional_applications")
    .select(APPLICATION_SAFE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (body.org_id) query = query.eq("org_id", body.org_id as string);
  if (body.pipeline_stage) query = query.eq("pipeline_stage", body.pipeline_stage as string);
  if (body.status) query = query.eq("status", body.status as string);

  const { data, error } = await query;
  if (error) {
    console.error("get_applications error:", error);
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse(stripPII({ data: data ?? [] }));
}

// ─── 6. get_vacancies ────────────────────────────────────────────────────────

async function handleGetVacancies(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const limit = Math.min(Number(body.limit) || 50, 100);

  let query = supabase
    .from("vacancies")
    .select(`${VACANCY_SAFE_COLUMNS}, client_sublocations(id, naam)`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (body.status) query = query.eq("status", body.status as string);
  if (body.sublocation_id) query = query.eq("sublocation_id", body.sublocation_id as string);

  const { data, error } = await query;
  if (error) {
    console.error("get_vacancies error:", error);
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse(stripPII({ data: data ?? [] }));
}

// ─── 7. get_dashboard_stats ──────────────────────────────────────────────────

async function handleGetDashboardStats(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const orgId = body.org_id as string | undefined;
  const today = new Date().toISOString().split("T")[0];

  // Build parallel count queries
  let profQ = supabase.from("professionals").select("id", { count: "exact", head: true }).eq("status", "actief");
  let dienstenQ = supabase.from("diensten").select("id", { count: "exact", head: true }).eq("datum", today);
  let facturenQ = supabase.from("factuur").select("id", { count: "exact", head: true }).eq("status", "open");
  let tasksQ = supabase.from("tasks").select("id", { count: "exact", head: true }).is("completed_at", null).is("deleted_at", null);
  let applicationsQ = supabase.from("professional_applications").select("id", { count: "exact", head: true }).eq("status", "active");
  let vacanciesQ = supabase.from("vacancies").select("id", { count: "exact", head: true }).eq("status", "open");

  if (orgId) {
    profQ = profQ.eq("org_id", orgId);
    dienstenQ = dienstenQ.eq("org_id", orgId);
    facturenQ = facturenQ.eq("tenant_id", orgId);
    tasksQ = tasksQ.eq("org_id", orgId);
    applicationsQ = applicationsQ.eq("org_id", orgId);
    // vacancies has no org_id — skip filter
  }

  const [profResult, dienstenResult, facturenResult, tasksResult, applicationsResult, vacanciesResult] = await Promise.all([
    profQ, dienstenQ, facturenQ, tasksQ, applicationsQ, vacanciesQ,
  ]);

  return jsonResponse({
    professionals_actief: profResult.count ?? 0,
    diensten_vandaag: dienstenResult.count ?? 0,
    facturen_openstaand: facturenResult.count ?? 0,
    taken_open: tasksResult.count ?? 0,
    sollicitaties_actief: applicationsResult.count ?? 0,
    vacatures_open: vacanciesResult.count ?? 0,
    datum: today,
    org_filter: orgId || "alle",
  });
}

// ─── 8. search ───────────────────────────────────────────────────────────────

async function handleSearch(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const queryStr = body.query as string;
  if (!queryStr || queryStr.length < 2) {
    return jsonResponse({ error: "Zoekterm moet minimaal 2 tekens zijn" }, 400);
  }

  const q = `%${queryStr}%`;
  const entityType = body.entity_type as string | undefined;
  const results: Record<string, unknown> = {};

  const promises: Promise<void>[] = [];

  if (!entityType || entityType === "professionals") {
    promises.push(
      supabase
        .from("professionals")
        .select("id, full_name, email, functie_niveau, status, org_id")
        .or(`full_name.ilike.${q},email.ilike.${q}`)
        .limit(10)
        .then(({ data }) => { results.professionals = data || []; })
    );
  }

  if (!entityType || entityType === "clients") {
    promises.push(
      supabase
        .from("client_organizations")
        .select("id, name, org_id")
        .ilike("name", q)
        .limit(10)
        .then(({ data }) => { results.clients = data || []; })
    );
  }

  if (!entityType || entityType === "diensten") {
    promises.push(
      supabase
        .from("diensten")
        .select("id, titel, datum, status, org_id")
        .ilike("titel", q)
        .limit(10)
        .then(({ data }) => { results.diensten = data || []; })
    );
  }

  if (!entityType || entityType === "tasks") {
    promises.push(
      supabase
        .from("tasks")
        .select("id, title, status, priority, org_id")
        .ilike("title", q)
        .limit(10)
        .then(({ data }) => { results.tasks = data || []; })
    );
  }

  await Promise.all(promises);
  return jsonResponse(stripPII(results));
}

// ─── 9. create_dienst ────────────────────────────────────────────────────────

async function handleCreateDienst(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  if (!body.titel || !body.datum || !body.start_tijd || !body.eind_tijd || !body.sublocation_id || !body.org_id) {
    return jsonResponse({ error: "Verplichte velden: titel, datum, start_tijd, eind_tijd, sublocation_id, org_id" }, 400);
  }

  const ALLOWED = ["titel", "datum", "start_tijd", "eind_tijd", "sublocation_id", "org_id", "publieke_opmerking", "dienst_type", "is_spoed", "gevraagd_aantal", "status"];
  const insertData: Record<string, unknown> = {};
  for (const field of ALLOWED) {
    if (body[field] !== undefined) insertData[field] = body[field];
  }

  const { data, error } = await supabase
    .from("diensten")
    .insert(insertData)
    .select("id, titel, datum, start_tijd, eind_tijd, status")
    .single();

  if (error) {
    console.error("create_dienst error:", error);
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse({ success: true, dienst: data }, 201);
}

// ─── 10. update_dienst ───────────────────────────────────────────────────────

async function handleUpdateDienst(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const dienstId = body.dienst_id as string;
  if (!dienstId) {
    return jsonResponse({ error: "Verplicht: dienst_id" }, 400);
  }

  const ALLOWED = ["titel", "datum", "start_tijd", "eind_tijd", "status", "publieke_opmerking", "dienst_type", "is_spoed", "gevraagd_aantal", "sublocation_id"];
  const updateData: Record<string, unknown> = {};
  for (const field of ALLOWED) {
    if (body[field] !== undefined) updateData[field] = body[field];
  }
  updateData.updated_at = new Date().toISOString();

  if (Object.keys(updateData).length <= 1) {
    return jsonResponse({ error: "Geen update velden meegegeven" }, 400);
  }

  const { data, error } = await supabase
    .from("diensten")
    .update(updateData)
    .eq("id", dienstId)
    .select("id, titel, datum, status")
    .single();

  if (error) {
    console.error("update_dienst error:", error);
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse({ success: true, dienst: data });
}

// ─── 11. assign_professional ─────────────────────────────────────────────────

async function handleAssignProfessional(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  if (!body.dienst_id || !body.professional_id) {
    return jsonResponse({ error: "Verplicht: dienst_id en professional_id" }, 400);
  }

  const { data, error } = await supabase
    .from("dienst_toewijzingen")
    .insert({
      dienst_id: body.dienst_id as string,
      professional_id: body.professional_id as string,
      status: (body.status as string) || "toegewezen",
    })
    .select("id, dienst_id, professional_id, status")
    .single();

  if (error) {
    console.error("assign_professional error:", error);
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse({ success: true, toewijzing: data }, 201);
}

// ─── 12. update_assignment ───────────────────────────────────────────────────

async function handleUpdateAssignment(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const assignmentId = body.assignment_id as string;
  if (!assignmentId) {
    return jsonResponse({ error: "Verplicht: assignment_id" }, 400);
  }

  const ALLOWED = ["status", "start_date", "end_date", "weekly_hours"];
  const updateData: Record<string, unknown> = {};
  for (const field of ALLOWED) {
    if (body[field] !== undefined) updateData[field] = body[field];
  }
  updateData.updated_at = new Date().toISOString();

  if (Object.keys(updateData).length <= 1) {
    return jsonResponse({ error: "Geen update velden meegegeven" }, 400);
  }

  const { data, error } = await supabase
    .from("assignments")
    .update(updateData)
    .eq("id", assignmentId)
    .select("id, status, start_date, end_date")
    .single();

  if (error) {
    console.error("update_assignment error:", error);
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse({ success: true, assignment: data });
}

// ─── 13. update_factuur_status ───────────────────────────────────────────────

async function handleUpdateFactuurStatus(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  if (!body.factuur_id || !body.status) {
    return jsonResponse({ error: "Verplicht: factuur_id en status" }, 400);
  }

  const ALLOWED_STATUSES = ["open", "verzonden", "betaald", "herinnering", "aanmaning", "gecrediteerd"];
  if (!ALLOWED_STATUSES.includes(body.status as string)) {
    return jsonResponse({ error: `Ongeldige status. Toegestaan: ${ALLOWED_STATUSES.join(", ")}` }, 400);
  }

  const { data, error } = await supabase
    .from("factuur")
    .update({ status: body.status as string, updated_at: new Date().toISOString() })
    .eq("id", body.factuur_id as string)
    .select("id, factuur_nummer, status")
    .single();

  if (error) {
    console.error("update_factuur_status error:", error);
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse({ success: true, factuur: data });
}

// ─── 14. update_application_stage ────────────────────────────────────────────

async function handleUpdateApplicationStage(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  if (!body.application_id || !body.pipeline_stage) {
    return jsonResponse({ error: "Verplicht: application_id en pipeline_stage" }, 400);
  }

  const ALLOWED_STAGES = ["new", "screening", "interview", "assessment", "offer", "hired", "rejected", "withdrawn"];
  if (!ALLOWED_STAGES.includes(body.pipeline_stage as string)) {
    return jsonResponse({ error: `Ongeldige stage. Toegestaan: ${ALLOWED_STAGES.join(", ")}` }, 400);
  }

  const { data, error } = await supabase
    .from("professional_applications")
    .update({ pipeline_stage: body.pipeline_stage as string, updated_at: new Date().toISOString() })
    .eq("id", body.application_id as string)
    .select("id, pipeline_stage, status")
    .single();

  if (error) {
    console.error("update_application_stage error:", error);
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse({ success: true, application: data });
}

// ─── query_db handlers (ongewijzigd) ─────────────────────────────────────────

async function getSchedule(supabase: ReturnType<typeof createClient>, professionalId: string, dateFrom?: string, dateTo?: string) {
  if (!professionalId) {
    return jsonResponse({ error: "Missing professional_id" }, 400);
  }

  let query = supabase
    .from("dienst_toewijzingen")
    .select(`
      id,
      status,
      diensten (
        id,
        datum,
        start_tijd,
        eind_tijd,
        titel,
        status,
        sublocation_id,
        client_sublocations (
          id,
          naam,
          location_id,
          client_locations (
            id,
            naam,
            client_org_id,
            client_organizations (
              id,
              name
            )
          )
        )
      )
    `)
    .eq("professional_id", professionalId);

  if (dateFrom) query = query.gte("diensten.datum", dateFrom);
  if (dateTo) query = query.lte("diensten.datum", dateTo);

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) {
    console.error("get_schedule error:", error);
    return jsonResponse({ error: "Failed to fetch schedule" }, 500);
  }

  const schedule = (data ?? [])
    .filter((t: any) => t.diensten)
    .map((t: any) => {
      const d = t.diensten;
      const sub = d.client_sublocations;
      const loc = sub?.client_locations;
      const org = loc?.client_organizations;
      return {
        toewijzing_id: t.id,
        toewijzing_status: t.status,
        dienst_id: d.id,
        datum: d.datum,
        start_tijd: d.start_tijd,
        eind_tijd: d.eind_tijd,
        titel: d.titel,
        dienst_status: d.status,
        locatie: sub?.naam ?? null,
        vestiging: loc?.naam ?? null,
        organisatie: org?.name ?? null,
      };
    });

  return jsonResponse({ schedule });
}

async function getAvailability(supabase: ReturnType<typeof createClient>, professionalId: string, dateFrom?: string, dateTo?: string) {
  if (!professionalId) {
    return jsonResponse({ error: "Missing professional_id" }, 400);
  }

  let query = supabase
    .from("professional_availability")
    .select("id, date, shift, is_available, opmerking")
    .eq("professional_id", professionalId)
    .order("date", { ascending: true });

  if (dateFrom) query = query.gte("date", dateFrom);
  if (dateTo) query = query.lte("date", dateTo);

  const { data, error } = await query;

  if (error) {
    console.error("get_availability error:", error);
    return jsonResponse({ error: "Failed to fetch availability" }, 500);
  }

  return jsonResponse({ availability: data ?? [] });
}

async function getDocuments(supabase: ReturnType<typeof createClient>, professionalId: string) {
  if (!professionalId) {
    return jsonResponse({ error: "Missing professional_id" }, 400);
  }

  const { data, error } = await supabase
    .from("professional_documents")
    .select("id, document_name, document_type, document_number, issuer, start_date, expires_at, status, source")
    .eq("professional_id", professionalId)
    .order("expires_at", { ascending: true });

  if (error) {
    console.error("get_documents error:", error);
    return jsonResponse({ error: "Failed to fetch documents" }, 500);
  }

  return jsonResponse({ documents: data ?? [] });
}

async function getProfile(supabase: ReturnType<typeof createClient>, professionalId: string) {
  if (!professionalId) {
    return jsonResponse({ error: "Missing professional_id" }, 400);
  }

  const { data, error } = await supabase
    .from("professionals")
    .select("id, full_name, functie_niveau, status, telefoonnummer, email")
    .eq("id", professionalId)
    .maybeSingle();

  if (error) {
    console.error("get_profile error:", error);
    return jsonResponse({ error: "Failed to fetch profile" }, 500);
  }

  if (!data) {
    return jsonResponse({ error: "Professional niet gevonden" }, 404);
  }

  return jsonResponse({ profile: data });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3 NIEUWE ACTIES: get_professional, search_professionals, get_team_members
// ═══════════════════════════════════════════════════════════════════════════════

const PROFESSIONAL_SAFE_COLUMNS = 'id, full_name, telefoonnummer, email, functie_niveau, werkvorm, status, org_id, regio, skills, beschikbaarheidsnotities, certificaten';

// ─── get_professional (zoek op naam) ─────────────────────────────────────────

async function handleGetProfessional(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const name = body.name as string | undefined;
  if (!name || name.length < 2) {
    return jsonResponse({ error: "Verplicht: name (minimaal 2 tekens)" }, 400);
  }

  let query = supabase
    .from("professionals")
    .select(PROFESSIONAL_SAFE_COLUMNS)
    .ilike("full_name", `%${name}%`)
    .is("deleted_at", null)
    .limit(10);

  if (body.org_id) query = query.eq("org_id", body.org_id as string);

  const { data, error } = await query;
  if (error) {
    console.error("get_professional error:", error);
    return jsonResponse({ error: "Zoeken mislukt" }, 500);
  }

  return jsonResponse(stripPII({ professionals: data ?? [] }));
}

// ─── search_professionals (filter op org + optionele criteria) ───────────────

async function handleSearchProfessionals(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const orgId = body.org_id as string | undefined;
  if (!orgId) {
    return jsonResponse({ error: "Verplicht: org_id" }, 400);
  }

  let query = supabase
    .from("professionals")
    .select(PROFESSIONAL_SAFE_COLUMNS)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("full_name", { ascending: true })
    .limit(50);

  if (body.status) query = query.eq("status", body.status as string);
  if (body.functie_niveau) query = query.eq("functie_niveau", body.functie_niveau as string);
  if (body.werkvorm) query = query.eq("werkvorm", body.werkvorm as string);

  const { data, error } = await query;
  if (error) {
    console.error("search_professionals error:", error);
    return jsonResponse({ error: "Zoeken mislukt" }, 500);
  }

  return jsonResponse(stripPII({ professionals: data ?? [] }));
}

// ─── get_team_members (profiles + user_organizations) ────────────────────────

async function handleGetTeamMembers(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const orgId = body.org_id as string | undefined;

  // Stap 1: Haal user_organizations op (optioneel gefilterd op org_id)
  let uoQuery = supabase
    .from("user_organizations")
    .select("user_id, role, org_id");

  if (orgId) uoQuery = uoQuery.eq("org_id", orgId);

  const { data: userOrgs, error: uoError } = await uoQuery;
  if (uoError) {
    console.error("get_team_members uoError:", uoError);
    return jsonResponse({ error: "Kon team niet ophalen" }, 500);
  }

  if (!userOrgs || userOrgs.length === 0) {
    return jsonResponse({ team_members: [] });
  }

  // Stap 2: Haal profiles op voor deze user_ids
  const userIds = [...new Set(userOrgs.map((uo: any) => uo.user_id))];

  const { data: profiles, error: profError } = await supabase
    .from("profiles")
    .select("id, name, email")
    .in("id", userIds);

  if (profError) {
    console.error("get_team_members profError:", profError);
    return jsonResponse({ error: "Kon profielen niet ophalen" }, 500);
  }

  // Stap 3: Combineer profiles met hun rollen
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const teamMembers = userOrgs.map((uo: any) => {
    const profile = profileMap.get(uo.user_id) || {};
    return {
      id: uo.user_id,
      name: (profile as any).name || null,
      email: (profile as any).email || null,
      role: uo.role,
      org_id: uo.org_id,
    };
  });

  return jsonResponse({ team_members: teamMembers });
}
