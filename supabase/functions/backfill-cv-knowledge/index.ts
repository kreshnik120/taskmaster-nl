import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batchSize = 50, dryRun = false } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`🔄 Starting CV knowledge backfill (batchSize: ${batchSize}, dryRun: ${dryRun})`);

    // Get applications with extracted_data but no corresponding knowledge items
    const { data: applications, error: fetchError } = await supabase
      .from('professional_applications')
      .select('id, org_id, extracted_data, cv_file_name')
      .not('extracted_data', 'is', null)
      .is('deleted_at', null)
      .limit(batchSize);

    if (fetchError) throw fetchError;

    console.log(`📋 Found ${applications?.length || 0} applications to process`);

    // Helper to get value from {value, confidence} or plain value
    const getValue = (field: any) => {
      if (field === null || field === undefined) return null;
      if (typeof field === 'object' && 'value' in field) return field.value;
      return field;
    };

    // Extract skills from CV data
    const extractSkillsFromCV = (data: any): string[] => {
      const skills: string[] = [];
      
      const certs = getValue(data?.certificaten) || [];
      if (Array.isArray(certs)) skills.push(...certs);
      
      const sectoren = getValue(data?.ervaring_sector) || [];
      if (Array.isArray(sectoren)) sectoren.forEach((s: string) => skills.push(`ervaring_${s}`));
      
      const doelgroepen = getValue(data?.doelgroep_ervaring) || [];
      if (Array.isArray(doelgroepen)) doelgroepen.forEach((d: string) => skills.push(`doelgroep_${d}`));
      
      const specifiek = getValue(data?.specifieke_doelgroepen) || [];
      if (Array.isArray(specifiek)) specifiek.forEach((s: string) => skills.push(`specialisatie_${s}`));
      
      return [...new Set(skills)];
    };

    let created = 0;
    let skipped = 0;
    let errors: string[] = [];

    for (const app of applications || []) {
      if (!app.org_id || !app.extracted_data) {
        skipped++;
        continue;
      }

      const data = app.extracted_data as Record<string, any>;
      const kandidaatNaam = getValue(data.naam) || 'Onbekend';
      const knowledgeKey = `cv_${app.id}`;

      // Check if knowledge items already exist
      const { data: existing } = await supabase
        .from('ai_knowledge_base')
        .select('id')
        .eq('org_id', app.org_id)
        .eq('key', `skills_${knowledgeKey}`)
        .single();

      if (existing) {
        console.log(`⏭️ Skipping ${kandidaatNaam} - knowledge already exists`);
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`[DRY RUN] Would create knowledge for ${kandidaatNaam}`);
        created++;
        continue;
      }

      // Skills Knowledge Item
      const skillsKnowledge = {
        org_id: app.org_id,
        category: "candidate_skills",
        key: `skills_${knowledgeKey}`,
        value: {
          application_id: app.id,
          naam: kandidaatNaam,
          skills: extractSkillsFromCV(data),
          ervaring_sector: getValue(data.ervaring_sector) || [],
          doelgroep_ervaring: getValue(data.doelgroep_ervaring) || [],
          specifieke_doelgroepen: getValue(data.specifieke_doelgroepen) || [],
          jaren_ervaring: getValue(data.jaren_ervaring),
          certificaten: getValue(data.certificaten) || [],
          talen: getValue(data.talen) || [],
          leidinggevende_ervaring: getValue(data.leidinggevende_ervaring) || false,
          source: "cv_backfill",
          cv_filename: app.cv_file_name || null
        },
        confidence_score: getValue(data.cv_confidence) || 0.75,
        source_type: "cv_upload",
        stability_score: 0.85,
        validation_status: "verified"
      };

      const { error: skillsError } = await supabase
        .from('ai_knowledge_base')
        .upsert(skillsKnowledge, { onConflict: 'org_id,category,key' });

      if (skillsError) {
        errors.push(`Skills error for ${app.id}: ${skillsError.message}`);
        continue;
      }

      // Experience Knowledge Item
      const experienceKnowledge = {
        org_id: app.org_id,
        category: "candidate_experience",
        key: `experience_${knowledgeKey}`,
        value: {
          application_id: app.id,
          naam: kandidaatNaam,
          functie_niveau: getValue(data.functie_niveau),
          werkvorm: getValue(data.werkvorm),
          hoogste_opleiding: getValue(data.hoogste_opleiding),
          opleidingen: getValue(data.opleidingen) || [],
          BIG_nummer: getValue(data.BIG_nummer) ? "aanwezig" : null,
          beschikbaarheid: getValue(data.beschikbaarheid),
          regio: getValue(data.regio),
          regio_voorkeur: getValue(data.regio_voorkeur) || [],
          eigen_vervoer: getValue(data.eigen_vervoer),
          rijbewijs: getValue(data.rijbewijs),
          max_reisafstand_km: getValue(data.max_reisafstand_km),
          nachtdienst_bereid: getValue(data.nachtdienst_bereid),
          weekenddienst_bereid: getValue(data.weekenddienst_bereid),
          voorkeur_uren_per_week: getValue(data.voorkeur_uren_per_week),
          source: "cv_backfill"
        },
        confidence_score: getValue(data.cv_confidence) || 0.75,
        source_type: "cv_upload",
        stability_score: 0.85,
        validation_status: "verified"
      };

      const { error: expError } = await supabase
        .from('ai_knowledge_base')
        .upsert(experienceKnowledge, { onConflict: 'org_id,category,key' });

      if (expError) {
        errors.push(`Experience error for ${app.id}: ${expError.message}`);
        continue;
      }

      console.log(`✅ Created knowledge items for ${kandidaatNaam}`);
      created++;
    }

    const summary = {
      success: true,
      processed: applications?.length || 0,
      created: created * 2, // 2 items per application
      skipped,
      errors: errors.length,
      errorDetails: errors.slice(0, 10),
      dryRun
    };

    console.log(`✅ Backfill complete:`, summary);

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Error in backfill-cv-knowledge:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
