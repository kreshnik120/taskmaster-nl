// ABCzorg Sublocations Import - processes sublocation records
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

// ABCzorg org_id
const ABCZORG_ORG_ID = "550e8400-e29b-41d4-a716-446655440000";

// Organization mapping from "Fact. bedrijfsnaam" to normalized name
const ORG_MAPPING: Record<string, string> = {
  "S'heerenloo": "'s Heeren Loo",
  "Rosales Zorg B.V.": "Rosales Zorg B.V.",
  "Leger des Heils Welzijns- en Gezondheidszorg": "Leger des Heils",
  "Stichting Siza": "Stichting Siza",
  "Stichting Kentalis Zorg": "Kentalis",
  "Stichting Amarant": "Amarant",
  "Amarant": "Amarant",
  "Stichting Dimence Groep": "Dimence",
  "Stichting ORO": "Stichting ORO",
  "Pluryn": "Pluryn",
  "Stichting Pluryn": "Pluryn",
  "Stichting Driestroom": "Stichting Driestroom",
  "De Gezusters van den Berg": "De Gezusters van den Berg",
  "Stichting de Hoeve": "Stichting de Hoeve",
  "De Rooyse Wissel": "De Rooyse Wissel",
  "Stichting Mesazorg": "Stichting Mesazorg",
  "Multiflexx B.V.": "Multiflexx B.V.",
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
    .replace(/\\@/g, "@")
    .replace(/\\/g, "")
    .trim();
}

// Parse phone number
function parsePhone(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d\s\-\+]/g, "").trim();
  if (cleaned.length < 8) return null;
  return cleaned;
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
  if (lower.includes("ouderen") || lower.includes("dementi") || lower.includes("verpleeg")) {
    sectors.push("VVT");
  }
  if (lower.includes("jeugd") || lower.includes("kind") || lower.includes("jong")) {
    sectors.push("Jeugdzorg");
  }
  
  return sectors.length > 0 ? sectors : ["GHZ"];
}

// Detect doelgroep from description
function detectDoelgroep(beschrijving: string | null): string[] {
  if (!beschrijving) return [];
  const lower = beschrijving.toLowerCase();
  const doelgroep: string[] = [];
  
  if (lower.includes("lvb") || lower.includes("lvg") || lower.includes("verstandelijk beperking")) {
    doelgroep.push("LVB");
  }
  if (lower.includes("psychiatr") || lower.includes("ggz") || lower.includes("psychos") || lower.includes("depres")) {
    doelgroep.push("Psychiatrie");
  }
  if (lower.includes("verslav") || lower.includes("middelen")) {
    doelgroep.push("Verslaving");
  }
  if (lower.includes("ouderen") || lower.includes("dementi")) {
    doelgroep.push("Ouderen");
  }
  if (lower.includes("autis") || lower.includes("ass")) {
    doelgroep.push("Autisme");
  }
  if (lower.includes("emb") || lower.includes("ernstig meervoudig")) {
    doelgroep.push("EMB");
  }
  if (lower.includes("nah") || lower.includes("hersenletsel")) {
    doelgroep.push("NAH");
  }
  if (lower.includes("doof") || lower.includes("auditief") || lower.includes("afasie")) {
    doelgroep.push("Auditief");
  }
  
  return doelgroep;
}

// Detect gezochte functies from description
function detectFuncties(beschrijving: string | null): string[] {
  if (!beschrijving) return ["Begeleider"];
  const lower = beschrijving.toLowerCase();
  const functies: string[] = [];
  
  if (lower.includes("verpleeg") || lower.includes("vp")) {
    functies.push("Verpleegkundige");
  }
  if (lower.includes("begeleider") || lower.includes("begeleid")) {
    functies.push("Begeleider");
  }
  if (lower.includes("persoonlijk begeleider") || lower.includes("pb")) {
    functies.push("Persoonlijk begeleider");
  }
  if (lower.includes("ggz-agoog") || lower.includes("agoog")) {
    functies.push("GGZ-agoog");
  }
  if (lower.includes("helpende")) {
    functies.push("Helpende");
  }
  if (lower.includes("vig") || lower.includes("verzorgende ig")) {
    functies.push("VIG");
  }
  
  return functies.length > 0 ? functies : ["Begeleider"];
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();

    const { records, batchNumber, totalBatches } = await req.json();

    if (!records || !Array.isArray(records)) {
      return errorResponse("No records provided", 400);
    }

    console.log(`Processing batch ${batchNumber}/${totalBatches} with ${records.length} records`);

    // Get all existing organizations for ABCzorg
    const { data: existingOrgs } = await supabase
      .from("client_organizations")
      .select("id, name")
      .eq("org_id", ABCZORG_ORG_ID);

    const orgMap = new Map<string, string>();
    existingOrgs?.forEach((org: { id: string; name: string }) => {
      orgMap.set(org.name.toLowerCase(), org.id);
    });

    // Get all existing locations
    const { data: existingLocations } = await supabase
      .from("client_locations")
      .select("id, naam, client_org_id");

    const locationMap = new Map<string, string>();
    existingLocations?.forEach((loc: { id: string; naam: string; client_org_id: string }) => {
      locationMap.set(`${loc.client_org_id}-${loc.naam.toLowerCase()}`, loc.id);
    });

    const results = {
      created: 0,
      skipped: 0,
      errors: [] as string[],
      orgsCreated: [] as string[],
      locationsCreated: [] as string[],
    };

    for (const record of records) {
      try {
        const bedrijfsnaam = record["Bedrijfsnaam"] || "";
        const factBedrijfsnaam = record["Fact. bedrijfsnaam"] || bedrijfsnaam;
        const locatie = record["Locatie"] || bedrijfsnaam;
        
        // Skip records marked as "NIET GEBRUIKEN" or "VERKEERDE"
        if (bedrijfsnaam.includes("NIET GEBRUIKEN") || 
            bedrijfsnaam.includes("VERKEERDE") ||
            locatie.includes("NIET GEBRUIKEN") ||
            locatie.includes("VERKEERDE")) {
          results.skipped++;
          continue;
        }

        // Determine organization name
        let orgName = ORG_MAPPING[factBedrijfsnaam] || factBedrijfsnaam;
        if (!orgName || orgName.trim() === "") {
          orgName = bedrijfsnaam.split(" - ")[0].split(",")[0].trim();
        }

        // Check if this is a main organization record (not a sublocation)
        if (bedrijfsnaam.includes("Hoofdkantoor") || 
            bedrijfsnaam === factBedrijfsnaam ||
            !locatie || locatie === bedrijfsnaam) {
          results.skipped++;
          continue;
        }

        // Find or create organization
        let orgId = orgMap.get(orgName.toLowerCase());
        if (!orgId) {
          // Create organization
          const { data: newOrg, error: orgError } = await supabase
            .from("client_organizations")
            .insert({
              name: orgName,
              org_id: ABCZORG_ORG_ID,
            })
            .select("id")
            .single();

          if (orgError || !newOrg) {
            console.error(`Error creating org ${orgName}:`, orgError);
            results.errors.push(`Org creation failed: ${orgName}`);
            continue;
          }

          orgId = newOrg.id;
          orgMap.set(orgName.toLowerCase(), orgId as string);
          results.orgsCreated.push(orgName);
        }

        if (!orgId) {
          results.errors.push(`No org ID for: ${orgName}`);
          continue;
        }

        const resolvedOrgId = orgId as string;

        // Find or create location (use region from Plaats or default)
        const plaats = record["Plaats"] || "Hoofdlocatie";
        const locationNaam = `${orgName} ${plaats}`;
        const locationKey = `${resolvedOrgId}-${locationNaam.toLowerCase()}`;
        
        let locationId = locationMap.get(locationKey);
        if (!locationId) {
          // Try simpler location name
          const simpleKey = `${resolvedOrgId}-${orgName.toLowerCase()} hoofdlocatie`;
          locationId = locationMap.get(simpleKey);
        }
        
        if (!locationId) {
          // Create location
          const { data: newLoc, error: locError } = await supabase
            .from("client_locations")
            .insert({
              naam: `${orgName} Hoofdlocatie`,
              client_org_id: resolvedOrgId,
              plaats: plaats,
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
          locationMap.set(`${resolvedOrgId}-${orgName.toLowerCase()} hoofdlocatie`, locationId as string);
          results.locationsCreated.push(`${orgName} Hoofdlocatie`);
        }

        // Create sublocation
        const beschrijving = cleanHtml(record["Publieke opmerking"]);
        const telefoon = parsePhone(record["Telefoon"]) || parsePhone(record["Mobiel"]);
        const kostenplaats = record["Kostenplaats"]?.replace("Kostenplaats:", "").trim() || null;
        
        const sublocationData = {
          naam: bedrijfsnaam.substring(0, 255),
          location_id: locationId,
          adres: record["Adres"] || null,
          postcode: record["Postcode"] || null,
          plaats: plaats,
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
          results.errors.push(`Sublocation failed: ${bedrijfsnaam.substring(0, 50)}`);
        } else {
          results.created++;
        }

      } catch (recordError) {
        console.error("Record processing error:", recordError);
        results.errors.push(`Processing error: ${recordError}`);
      }
    }

    console.log(`Batch ${batchNumber} complete: ${results.created} created, ${results.skipped} skipped`);

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
