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
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("openclaw-proxy error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

// ─── lookup_sender ───────────────────────────────────────────────────────────

async function handleLookupSender(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const telefoon = body.telefoon as string;
  if (!telefoon) {
    return jsonResponse({ error: "Missing telefoon parameter" }, 400);
  }

  // 1. Admin check with profile lookup
  const adminInfo = ADMIN_MAP[telefoon];
  if (adminInfo) {
    // Fetch org_ids from user_organizations
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

  // 2. Professionals
  const { data: prof } = await supabase
    .from("professionals")
    .select("id, full_name, functie_niveau, status, telefoonnummer")
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

  // 3. Client contacts → JOIN client_organizations
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

  // 4. Unknown
  return jsonResponse({ role: "unknown" });
}

// ─── query_db ────────────────────────────────────────────────────────────────

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

// ─── get_tasks ───────────────────────────────────────────────────────────────

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

// ─── create_task ─────────────────────────────────────────────────────────────

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

  // Optional fields
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

// ─── update_task ─────────────────────────────────────────────────────────────

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

// ─── get_professionals ───────────────────────────────────────────────────────

async function handleGetProfessionals(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const orgId = body.org_id as string | undefined;

  // SECURITY: Only safe columns — NEVER bsn, iban, iban_tenaamstelling, gewenst_uurloon, geboortedatum
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

// ─── get_clients ─────────────────────────────────────────────────────────────

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

// ─── query_db handlers (unchanged) ──────────────────────────────────────────

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

// ─── get_profile ─────────────────────────────────────────────────────────────

async function getProfile(supabase: ReturnType<typeof createClient>, professionalId: string) {
  if (!professionalId) {
    return jsonResponse({ error: "Missing professional_id" }, 400);
  }

  // SECURITY: Only safe columns — NEVER bsn, iban, iban_tenaamstelling, gewenst_uurloon, geboortedatum
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
