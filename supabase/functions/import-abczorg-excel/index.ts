import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ABCzorg org_id
const ABCZORG_ORG_ID = "550e8400-e29b-41d4-a716-446655440000";

// Organization mapping from "Fact. bedrijfsnaam" to normalized name
const ORG_MAPPING: Record<string, string> = {
  "S'heerenloo": "'s Heeren Loo",
  "'s Heerenloo, Stichting": "'s Heeren Loo",
  "Rosales Zorg B.V.": "Rosales Zorg",
  "Leger des Heils Welzijns- en Gezondheidszorg": "Leger des Heils",
  "Stichting Siza": "Stichting Siza",
  "Stichting Kentalis Zorg": "Kentalis",
  "Stichting Amarant": "Amarant",
  "Amarant": "Amarant",
  "Stichting Dimence Groep": "Dimence",
  "Stichting ORO": "Stichting ORO",
  "Pluryn": "Pluryn",
  "Stichting Pluryn": "Pluryn",
  "Stichting Driestroom": "Driestroom",
  "De Gezusters van den Berg": "De Gezusters van den Berg",
  "Stichting de Hoeve": "Stichting de Hoeve",
  "De Rooyse Wissel": "De Rooyse Wissel",
  "Stichting Mesazorg": "Stichting Mesazorg",
  "Multiflexx B.V.": "Multiflexx",
  "Sherpa": "Sherpa",
  "Stichting Sherpa": "Sherpa",
  "Cello": "Cello",
  "Stichting Cello": "Cello",
  "ZorgSpectrum": "ZorgSpectrum",
  "Stichting ZorgSpectrum": "ZorgSpectrum",
  "Tactus Verslavingszorg": "Tactus Verslavingszorg",
  "Stichting Tactus": "Tactus Verslavingszorg",
  "Iriszorg": "Iriszorg",
  "XTRN BV": "Iriszorg",
  "Reinier van Arkel": "Reinier van Arkel",
  "Stichting Reinier van Arkel": "Reinier van Arkel",
  "Stichting Herenhuis Tiel": "Stichting Herenhuis Tiel",
  "Mare zorg Nijmegen": "Mare Zorg",
  "Kwintes": "Kwintes",
  "Stichting Kwintes": "Kwintes",
  "Atlant Zorggroep": "Atlant Zorggroep",
  "De Tussenvoorziening": "De Tussenvoorziening",
  "Pro Persona": "Pro Persona",
  "Stichting Pro Persona": "Pro Persona",
  "Mutsaersstichting": "Mutsaersstichting",
  "Lister": "Lister",
  "Stichting Lister": "Lister",
  "Dichterbij": "Dichterbij",
  "Stichting Dichterbij": "Dichterbij",
  "RIBW": "RIBW",
  "Eleos": "Eleos",
  "GGNet": "GGNet",
  "Triade Vitree": "Triade Vitree",
  "Zorggroep Raalte": "Zorggroep Raalte",
  "Emergis": "Emergis",
  "Opella": "Opella",
  "Vincent van Gogh": "Vincent van Gogh",
  "Aveleijn": "Aveleijn",
  "JP van den Bent stichting": "JP van den Bent Stichting",
};

// Clean HTML tags from text
function cleanHtml(text: string | null): string | null {
  if (!text) return null;
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\@/g, "@")
    .replace(/\\/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Parse phone number
function parsePhone(phone: string | null): string | null {
  if (!phone) return null;
  // Remove "Plantelefoon" suffix and other text
  let cleaned = phone.replace(/plantelefoon/gi, "").trim();
  cleaned = cleaned.replace(/[^\d\s\-\+\(\)]/g, "").trim();
  if (cleaned.length < 8) return null;
  return cleaned;
}

// Extract KVK nummer
function extractKvk(kvkStr: string | null): string | null {
  if (!kvkStr) return null;
  const match = kvkStr.match(/\d{8}/);
  return match ? match[0] : null;
}

// Detect sector from description
function detectSector(beschrijving: string | null): string[] {
  if (!beschrijving) return ["GHZ"];
  const lower = beschrijving.toLowerCase();
  const sectors: string[] = [];
  
  if (lower.includes("ggz") || lower.includes("psychiatr") || lower.includes("psychos") || lower.includes("verslav")) {
    sectors.push("GGZ");
  }
  if (lower.includes("lvb") || lower.includes("lvg") || lower.includes("verstandelijk") || lower.includes("emb") || lower.includes("evb") || lower.includes("mvg")) {
    sectors.push("GHZ");
  }
  if (lower.includes("ouderen") || lower.includes("dementi") || lower.includes("verpleeg") || lower.includes("vvt")) {
    sectors.push("VVT");
  }
  if (lower.includes("jeugd") || lower.includes("kind") || lower.includes("jong") || lower.includes("tiener")) {
    sectors.push("Jeugdzorg");
  }
  
  return sectors.length > 0 ? [...new Set(sectors)] : ["GHZ"];
}

// Detect doelgroep from description
function detectDoelgroep(beschrijving: string | null): string[] {
  if (!beschrijving) return [];
  const lower = beschrijving.toLowerCase();
  const doelgroep: string[] = [];
  
  if (lower.includes("lvb") || lower.includes("lvg") || lower.includes("verstandelijk beperking") || lower.includes("licht verstandelijk")) {
    doelgroep.push("LVB");
  }
  if (lower.includes("psychiatr") || lower.includes("ggz") || lower.includes("psychos") || lower.includes("depres") || lower.includes("bipola")) {
    doelgroep.push("Psychiatrie");
  }
  if (lower.includes("verslav") || lower.includes("middelen") || lower.includes("alcohol") || lower.includes("drugs")) {
    doelgroep.push("Verslaving");
  }
  if (lower.includes("ouderen") || lower.includes("dementi") || lower.includes("alzheimer")) {
    doelgroep.push("Ouderen");
  }
  if (lower.includes("autis") || lower.includes("ass") || lower.includes("pdd-nos")) {
    doelgroep.push("Autisme");
  }
  if (lower.includes("emb") || lower.includes("ernstig meervoudig")) {
    doelgroep.push("EMB");
  }
  if (lower.includes("nah") || lower.includes("hersenletsel") || lower.includes("cva")) {
    doelgroep.push("NAH");
  }
  if (lower.includes("doof") || lower.includes("auditief") || lower.includes("afasie") || lower.includes("slechthorend")) {
    doelgroep.push("Auditief");
  }
  if (lower.includes("agressie") || lower.includes("gedragsproblema") || lower.includes("odd") || lower.includes("adhd")) {
    doelgroep.push("Gedragsproblematiek");
  }
  if (lower.includes("ptss") || lower.includes("trauma")) {
    doelgroep.push("Trauma");
  }
  
  return [...new Set(doelgroep)];
}

// Detect gezochte functies from description
function detectFuncties(beschrijving: string | null): string[] {
  if (!beschrijving) return ["Begeleider"];
  const lower = beschrijving.toLowerCase();
  const functies: string[] = [];
  
  if (lower.includes("verpleeg") || lower.includes("vp ")) {
    functies.push("Verpleegkundige");
  }
  if (lower.includes("begeleider") || lower.includes("begeleid") || lower.includes("1 op 1")) {
    functies.push("Begeleider");
  }
  if (lower.includes("persoonlijk begeleider") || lower.includes("pb")) {
    functies.push("Persoonlijk begeleider");
  }
  if (lower.includes("ggz-agoog") || lower.includes("agoog") || lower.includes("sociaal agoog")) {
    functies.push("GGZ-agoog");
  }
  if (lower.includes("helpende")) {
    functies.push("Helpende");
  }
  if (lower.includes("vig") || lower.includes("verzorgende ig")) {
    functies.push("VIG");
  }
  if (lower.includes("sociaal werker") || lower.includes("maatschappelijk werk")) {
    functies.push("Sociaal werker");
  }
  
  return functies.length > 0 ? [...new Set(functies)] : ["Begeleider"];
}

// Check if record should be skipped
function shouldSkip(record: Record<string, string>): boolean {
  const bedrijfsnaam = record["Bedrijfsnaam"] || "";
  const locatie = record["Locatie"] || "";
  const status = record["Status"] || "";
  
  // Skip inactive records
  if (status.toLowerCase().includes("inactief") || status.toLowerCase().includes("niet actief")) {
    return true;
  }
  
  // Skip records marked as not to use
  const skipPatterns = ["NIET GEBRUIKEN", "VERKEERDE", "TEST", "DUMMY", "Hoofdkantoor"];
  for (const pattern of skipPatterns) {
    if (bedrijfsnaam.toUpperCase().includes(pattern.toUpperCase()) || 
        locatie.toUpperCase().includes(pattern.toUpperCase())) {
      return true;
    }
  }
  
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { records, batchNumber, totalBatches } = await req.json();

    if (!records || !Array.isArray(records)) {
      return new Response(
        JSON.stringify({ error: "No records provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing batch ${batchNumber}/${totalBatches} with ${records.length} records`);

    // Get all existing organizations for ABCzorg with KVK numbers
    const { data: existingOrgs } = await supabase
      .from("client_organizations")
      .select("id, name, kvk_nummer")
      .eq("org_id", ABCZORG_ORG_ID);

    const orgByName = new Map<string, string>();
    const orgByKvk = new Map<string, string>();
    existingOrgs?.forEach(org => {
      orgByName.set(org.name.toLowerCase(), org.id);
      if (org.kvk_nummer) {
        orgByKvk.set(org.kvk_nummer, org.id);
      }
    });

    // Get all existing locations
    const { data: existingLocations } = await supabase
      .from("client_locations")
      .select("id, naam, client_org_id");

    const locationMap = new Map<string, string>();
    existingLocations?.forEach(loc => {
      locationMap.set(`${loc.client_org_id}-${loc.naam.toLowerCase()}`, loc.id);
    });

    // Get existing sublocations to avoid duplicates (by kostenplaats)
    const { data: existingSubs } = await supabase
      .from("client_sublocations")
      .select("id, kostenplaats, naam, location_id");

    const subByKostenplaats = new Map<string, string>();
    const subByName = new Map<string, string>();
    existingSubs?.forEach(sub => {
      if (sub.kostenplaats) {
        subByKostenplaats.set(sub.kostenplaats.toLowerCase(), sub.id);
      }
      subByName.set(`${sub.location_id}-${sub.naam.toLowerCase()}`, sub.id);
    });

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
      orgsCreated: [] as string[],
      locationsCreated: [] as string[],
    };

    for (const record of records) {
      try {
        // Skip records that should not be imported
        if (shouldSkip(record)) {
          results.skipped++;
          continue;
        }

        const bedrijfsnaam = record["Bedrijfsnaam"] || "";
        const factBedrijfsnaam = record["Fact. bedrijfsnaam"] || bedrijfsnaam;
        const kvkNummer = extractKvk(record["KVK nummer"]);
        const plaats = record["Plaats"] || "";
        
        // Determine organization name
        let orgName = ORG_MAPPING[factBedrijfsnaam] || factBedrijfsnaam;
        if (!orgName || orgName.trim() === "") {
          orgName = bedrijfsnaam.split(" - ")[0].split(",")[0].trim();
        }
        if (!orgName || orgName.trim() === "") {
          results.skipped++;
          continue;
        }

        // Find organization by KVK first, then by name
        let orgId: string | undefined = kvkNummer ? orgByKvk.get(kvkNummer) : undefined;
        if (!orgId) {
          orgId = orgByName.get(orgName.toLowerCase());
        }
        
        // Try variations of the org name
        if (!orgId) {
          const variations = [
            orgName.replace("Stichting ", ""),
            `Stichting ${orgName}`,
            orgName.split(" ")[0],
          ];
          for (const variation of variations) {
            orgId = orgByName.get(variation.toLowerCase());
            if (orgId) break;
          }
        }

        // Create organization if not found
        if (!orgId) {
          const { data: newOrg, error: orgError } = await supabase
            .from("client_organizations")
            .insert({
              name: orgName,
              org_id: ABCZORG_ORG_ID,
              kvk_nummer: kvkNummer,
            })
            .select("id")
            .single();

          if (orgError || !newOrg) {
            console.error(`Error creating org ${orgName}:`, orgError);
            results.errors.push(`Org creation failed: ${orgName}`);
            continue;
          }

          orgId = newOrg.id;
          results.orgsCreated.push(orgName);
        }

        // At this point orgId must be defined
        if (!orgId) {
          results.errors.push(`No org ID for: ${orgName}`);
          continue;
        }

        // Cache the new org
        orgByName.set(orgName.toLowerCase(), orgId);
        if (kvkNummer && !orgByKvk.has(kvkNummer)) {
          orgByKvk.set(kvkNummer, orgId);
        }

        // Ensure orgId is defined at this point
        const resolvedOrgId = orgId as string;

        // Find or create location
        const locationNaam = `${orgName} Hoofdlocatie`;
        const locationKey = `${resolvedOrgId}-${locationNaam.toLowerCase()}`;
        
        let locationId: string | undefined = locationMap.get(locationKey);
        
        // Try finding existing location with variations
        if (!locationId) {
          for (const [key, id] of locationMap.entries()) {
            if (key.startsWith(resolvedOrgId) && (key.includes("hoofdlocatie") || key.includes(orgName.toLowerCase()))) {
              locationId = id;
              break;
            }
          }
        }
        
        if (!locationId) {
          const { data: newLoc, error: locError } = await supabase
            .from("client_locations")
            .insert({
              naam: locationNaam,
              client_org_id: resolvedOrgId,
              plaats: plaats || null,
              is_active: true,
            })
            .select("id")
            .single();

          if (locError || !newLoc) {
            console.error(`Error creating location for ${orgName}:`, locError);
            results.errors.push(`Location creation failed: ${orgName}`);
            continue;
          }

          locationId = newLoc.id;
          results.locationsCreated.push(locationNaam);
        }

        // At this point locationId must be defined
        if (!locationId) {
          results.errors.push(`No location ID for: ${orgName}`);
          continue;
        }
        
        // Cache the location
        locationMap.set(locationKey, locationId);

        // Ensure locationId is defined
        const resolvedLocationId = locationId;

        // Check for duplicate sublocation
        const kostenplaats = record["Kostenplaats"]?.replace("Kostenplaats:", "").replace("Kostenplaats", "").trim() || null;
        const subNameKey = `${resolvedLocationId}-${bedrijfsnaam.toLowerCase()}`;
        
        if (kostenplaats && subByKostenplaats.has(kostenplaats.toLowerCase())) {
          // Update existing sublocation
          const existingSubId = subByKostenplaats.get(kostenplaats.toLowerCase());
          const beschrijving = cleanHtml(record["Publieke opmerking"]);
          const telefoon = parsePhone(record["Telefoon"]) || parsePhone(record["Mobiel"]);
          
          const { error: updateError } = await supabase
            .from("client_sublocations")
            .update({
              adres: record["Adres"] || null,
              postcode: record["Postcode"] || null,
              plaats: plaats || null,
              telefoon: telefoon,
              publieke_opmerking: beschrijving,
              sector: detectSector(beschrijving),
              doelgroep: detectDoelgroep(beschrijving),
              gezochte_functies: detectFuncties(beschrijving),
            })
            .eq("id", existingSubId);

          if (updateError) {
            console.error(`Error updating sublocation:`, updateError);
            results.errors.push(`Update failed: ${bedrijfsnaam.substring(0, 30)}`);
          } else {
            results.updated++;
          }
          continue;
        }

        if (subByName.has(subNameKey)) {
          results.skipped++;
          continue;
        }

        // Create sublocation
        const beschrijving = cleanHtml(record["Publieke opmerking"]);
        const telefoon = parsePhone(record["Telefoon"]) || parsePhone(record["Mobiel"]);
        
        const sublocationData = {
          naam: bedrijfsnaam.substring(0, 255),
          location_id: resolvedLocationId,
          adres: record["Adres"] || null,
          postcode: record["Postcode"] || null,
          plaats: plaats || null,
          telefoon: telefoon,
          kostenplaats: kostenplaats,
          publieke_opmerking: beschrijving,
          sector: detectSector(beschrijving),
          doelgroep: detectDoelgroep(beschrijving),
          gezochte_functies: detectFuncties(beschrijving),
          is_active: true,
        };

        const { error: subError } = await supabase
          .from("client_sublocations")
          .insert(sublocationData);

        if (subError) {
          console.error(`Error creating sublocation ${bedrijfsnaam}:`, subError);
          results.errors.push(`Sublocation failed: ${bedrijfsnaam.substring(0, 30)}`);
        } else {
          results.created++;
          if (kostenplaats) {
            subByKostenplaats.set(kostenplaats.toLowerCase(), "new");
          }
          subByName.set(subNameKey, "new");
        }

      } catch (recordError) {
        console.error("Record processing error:", recordError);
        results.errors.push(`Processing error: ${String(recordError).substring(0, 50)}`);
      }
    }

    console.log(`Batch ${batchNumber} complete: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        batch: batchNumber,
        totalBatches,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Import error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
