import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const ADMIN_NUMBERS = ["+31648005001", "+31618710360"];

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
    if (action === "lookup_sender") {
      return await handleLookupSender(supabase, body);
    } else if (action === "query_db") {
      return await handleQueryDb(supabase, body);
    } else {
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

  // 1. Hardcoded admins
  if (ADMIN_NUMBERS.includes(telefoon)) {
    return jsonResponse({ role: "admin", naam: "Admin" });
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

async function getSchedule(supabase: ReturnType<typeof createClient>, professionalId: string, dateFrom?: string, dateTo?: string) {
  if (!professionalId) {
    return jsonResponse({ error: "Missing professional_id" }, 400);
  }

  // Get toewijzingen for this professional
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

  // Date filtering via the nested diensten.datum
  if (dateFrom) {
    query = query.gte("diensten.datum", dateFrom);
  }
  if (dateTo) {
    query = query.lte("diensten.datum", dateTo);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) {
    console.error("get_schedule error:", error);
    return jsonResponse({ error: "Failed to fetch schedule" }, 500);
  }

  // Flatten the nested response
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
