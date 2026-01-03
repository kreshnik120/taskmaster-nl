// Talent Search - Enterprise professional search with fallback and deduplication
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

interface SearchParams {
  functie?: string;
  regio?: string;
  beschikbaarheid?: string;
  specialismen?: string[];
  min_ervaring?: number;
  werkvorm?: string;
  limit?: number;
}

interface ProfessionalResult {
  id: string;
  naam: string;
  email?: string;
  telefoon?: string;
  functie?: string;
  specialismen?: string[];
  regio?: string;
  beschikbaarheid?: string;
  jaren_ervaring?: number;
  werkvorm?: string;
  rating?: number;
  source: 'professional' | 'application';
  match_score?: number;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();
    const params: SearchParams = await req.json().catch(() => ({}));

    console.log("🔍 Talent Search - Params:", JSON.stringify(params));

    const results: ProfessionalResult[] = [];
    const seenEmails = new Set<string>();
    const seenNames = new Set<string>();
    const limit = params.limit || 10;

    // ============================================================
    // PHASE 1: Search in professionals table
    // ============================================================
    let profQuery = supabase
      .from("professionals")
      .select(`
        id, naam, email, telefoon, functie, specialismen,
        regio, beschikbaarheid, jaren_ervaring, werkvorm,
        status
      `)
      .eq("status", "actief")
      .limit(limit * 2); // Get extra to account for filtering

    // Apply filters
    if (params.functie) {
      profQuery = profQuery.ilike("functie", `%${params.functie}%`);
    }
    if (params.regio) {
      profQuery = profQuery.ilike("regio", `%${params.regio}%`);
    }
    if (params.werkvorm) {
      profQuery = profQuery.eq("werkvorm", params.werkvorm);
    }
    if (params.min_ervaring) {
      profQuery = profQuery.gte("jaren_ervaring", params.min_ervaring);
    }
    if (params.beschikbaarheid) {
      profQuery = profQuery.eq("beschikbaarheid", params.beschikbaarheid);
    }

    const { data: professionals, error: profError } = await profQuery;

    if (profError) {
      console.error("❌ Error fetching professionals:", profError);
    } else if (professionals && professionals.length > 0) {
      console.log(`✅ Found ${professionals.length} professionals`);
      
      for (const prof of professionals) {
        const emailKey = prof.email?.toLowerCase() || '';
        const nameKey = prof.naam?.toLowerCase() || '';
        
        // Deduplication check
        if (emailKey && seenEmails.has(emailKey)) continue;
        if (nameKey && seenNames.has(nameKey)) continue;
        
        if (emailKey) seenEmails.add(emailKey);
        if (nameKey) seenNames.add(nameKey);

        // Calculate match score
        let matchScore = 0.5; // Base score
        if (params.functie && prof.functie?.toLowerCase().includes(params.functie.toLowerCase())) {
          matchScore += 0.2;
        }
        if (params.regio && prof.regio?.toLowerCase().includes(params.regio.toLowerCase())) {
          matchScore += 0.15;
        }
        if (params.werkvorm && prof.werkvorm === params.werkvorm) {
          matchScore += 0.15;
        }

        results.push({
          id: prof.id,
          naam: prof.naam,
          email: prof.email,
          telefoon: prof.telefoon,
          functie: prof.functie,
          specialismen: prof.specialismen,
          regio: prof.regio,
          beschikbaarheid: prof.beschikbaarheid,
          jaren_ervaring: prof.jaren_ervaring,
          werkvorm: prof.werkvorm,
          source: 'professional',
          match_score: Math.round(matchScore * 100) / 100
        });
      }
    }

    // ============================================================
    // PHASE 2: Fallback to professional_applications if needed
    // ============================================================
    if (results.length < limit) {
      console.log(`📋 Fallback: Searching applications (have ${results.length}/${limit})`);
      
      let appQuery = supabase
        .from("professional_applications")
        .select(`
          id, naam, email, telefoon, stage, extracted_data,
          created_at
        `)
        .not("stage", "eq", "afgewezen")
        .not("stage", "eq", "withdrawn")
        .order("created_at", { ascending: false })
        .limit((limit - results.length) * 3); // Get extra for filtering

      // Basic filters on application fields
      if (params.functie) {
        appQuery = appQuery.or(`functie.ilike.%${params.functie}%,naam.ilike.%${params.functie}%`);
      }

      const { data: applications, error: appError } = await appQuery;

      if (appError) {
        console.error("❌ Error fetching applications:", appError);
      } else if (applications && applications.length > 0) {
        console.log(`✅ Found ${applications.length} applications`);
        
        for (const app of applications) {
          if (results.length >= limit) break;
          
          const emailKey = app.email?.toLowerCase() || '';
          const nameKey = app.naam?.toLowerCase() || '';
          
          // Deduplication check
          if (emailKey && seenEmails.has(emailKey)) continue;
          if (nameKey && seenNames.has(nameKey)) continue;
          
          if (emailKey) seenEmails.add(emailKey);
          if (nameKey) seenNames.add(nameKey);

          // Extract data from extracted_data JSON
          const extracted = app.extracted_data || {};
          
          // Filter by regio if specified
          if (params.regio) {
            const appRegio = extracted.regio || extracted.woonplaats || '';
            if (!appRegio.toLowerCase().includes(params.regio.toLowerCase())) {
              continue;
            }
          }

          // Filter by werkvorm if specified
          if (params.werkvorm) {
            const appWerkvorm = extracted.werkvorm || extracted.voorkeur_werkvorm || '';
            if (appWerkvorm !== params.werkvorm) {
              continue;
            }
          }

          // Calculate match score (lower for applications)
          let matchScore = 0.4; // Lower base for applications
          if (params.functie && (app.naam?.toLowerCase().includes(params.functie.toLowerCase()) || 
              extracted.functie?.toLowerCase().includes(params.functie.toLowerCase()))) {
            matchScore += 0.15;
          }
          if (params.regio) {
            const appRegio = extracted.regio || extracted.woonplaats || '';
            if (appRegio.toLowerCase().includes(params.regio.toLowerCase())) {
              matchScore += 0.1;
            }
          }

          results.push({
            id: app.id,
            naam: app.naam,
            email: app.email,
            telefoon: app.telefoon,
            functie: extracted.functie || extracted.gewenste_functie || null,
            specialismen: extracted.specialismen || [],
            regio: extracted.regio || extracted.woonplaats || null,
            beschikbaarheid: extracted.beschikbaarheid || null,
            jaren_ervaring: extracted.jaren_ervaring || null,
            werkvorm: extracted.werkvorm || extracted.voorkeur_werkvorm || null,
            source: 'application',
            match_score: Math.round(matchScore * 100) / 100
          });
        }
      }
    }

    // ============================================================
    // PHASE 3: Sort and finalize results
    // ============================================================
    results.sort((a, b) => {
      // Sort by match_score descending, then by source (professionals first)
      if (b.match_score !== a.match_score) {
        return (b.match_score || 0) - (a.match_score || 0);
      }
      if (a.source === 'professional' && b.source === 'application') return -1;
      if (a.source === 'application' && b.source === 'professional') return 1;
      return 0;
    });

    const finalResults = results.slice(0, limit);

    console.log(`✅ Returning ${finalResults.length} results (${finalResults.filter(r => r.source === 'professional').length} professionals, ${finalResults.filter(r => r.source === 'application').length} applications)`);

    return jsonResponse({
      success: true,
      count: finalResults.length,
      results: finalResults,
      sources: {
        professionals: finalResults.filter(r => r.source === 'professional').length,
        applications: finalResults.filter(r => r.source === 'application').length
      },
      params_used: params
    });

  } catch (error: any) {
    console.error("❌ Talent search error:", error);
    return errorResponse(error.message, 500);
  }
});
