import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('🔍 Fetching unprocessed system events...');
    
    // Haal onverwerkte events op (max 50 per run)
    const { data: events, error: eventsError } = await supabase
      .from('system_events')
      .select('*')
      .is('processed_at', null)
      .order('created_at', { ascending: true })
      .limit(50);
    
    if (eventsError) {
      console.error('❌ Error fetching events:', eventsError);
      return new Response(JSON.stringify({ error: eventsError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (!events || events.length === 0) {
      console.log('✅ No unprocessed events found');
      return new Response(JSON.stringify({ 
        processed: 0,
        message: 'No events to process' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`📊 Processing ${events.length} events...`);
    
    let processedCount = 0;
    let knowledgeCreatedCount = 0;
    let errors: string[] = [];
    
    for (const event of events) {
      try {
        console.log(`🔄 Processing event ${event.id} (${event.event_type})...`);
        
        // Analyseer event met AI
        const analysis = await analyzeEventWithAI(event, LOVABLE_API_KEY);
        
        // Creëer knowledge items als nodig
        if (analysis.shouldCreateKnowledge) {
          console.log(`✨ Creating knowledge from event ${event.id}...`);
          
          // Redact PII eerst
          const { data: redactedValue } = await supabase
            .rpc('redact_pii', { input_text: JSON.stringify(analysis.value) });
          
          const finalValue = redactedValue ? JSON.parse(redactedValue) : analysis.value;
          
          // Insert knowledge
          const { error: kbError } = await supabase
            .from('ai_knowledge_base')
            .insert({
              org_id: event.org_id,
              user_id: event.user_id || '00000000-0000-0000-0000-000000000000',
              category: analysis.category,
              key: analysis.key,
              value: finalValue,
              confidence_score: analysis.confidence,
              source: `system_event:${event.event_type}`,
              source_reference: event.id,
              role_tags: analysis.role_tags || [],
              stability_score: analysis.stability_score || 0.8
            });
          
          if (!kbError) {
            knowledgeCreatedCount++;
            console.log(`✅ Knowledge created from event ${event.id}`);
          } else {
            console.error(`❌ Failed to create knowledge for event ${event.id}:`, kbError);
            errors.push(`Event ${event.id}: ${kbError.message}`);
          }
        }
        
        // Markeer als verwerkt
        const { error: updateError } = await supabase
          .from('system_events')
          .update({
            processed_at: new Date().toISOString(),
            learning_outcome: analysis
          })
          .eq('id', event.id);
        
        if (updateError) {
          console.error(`❌ Failed to mark event ${event.id} as processed:`, updateError);
          errors.push(`Event ${event.id}: ${updateError.message}`);
        } else {
          processedCount++;
        }
      } catch (eventError) {
        console.error(`❌ Error processing event ${event.id}:`, eventError);
        errors.push(`Event ${event.id}: ${eventError instanceof Error ? eventError.message : 'Unknown error'}`);
      }
    }
    
    console.log(`✅ Processing complete: ${processedCount}/${events.length} events, ${knowledgeCreatedCount} knowledge items created`);
    
    return new Response(JSON.stringify({
      processed: processedCount,
      total: events.length,
      knowledgeCreated: knowledgeCreatedCount,
      errors: errors.length > 0 ? errors : undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('❌ Process system events error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper: Analyze event with AI
async function analyzeEventWithAI(event: any, lovableApiKey: string): Promise<any> {
  const prompt = `Analyseer dit systeem event en bepaal of er kennis moet worden geleerd:

EVENT TYPE: ${event.event_type}
ENTITY TYPE: ${event.entity_type}
DATA: ${JSON.stringify(event.event_data, null, 2)}
METADATA: ${JSON.stringify(event.metadata, null, 2)}

ANALYSE:
1. Is dit een significante gebeurtenis waarvan geleerd moet worden?
2. Wat is het patroon of de inzicht?
3. Welke kennis moet worden opgeslagen?

Voorbeelden van wat WEL moet worden geleerd:
- Taak tijdig afgerond door een specifieke professional (team performance)
- Specifieke werkwijze of proces gevolgd (workflow patterns)
- Tijd besteed aan bepaald type taak (productivity insights)
- Consistent gedrag van een gebruiker (user patterns)
- Sollicitant succesvol door pipeline naar plaatsing (recruitment_pipeline)
- Kandidaat kwaliteit per bron (candidate_quality)
- Plaatsing succesvol afgerond voor organisatie (placement_success)
- Recruitment acties effectief uitgevoerd (recruitment_effectiveness)

Voorbeelden van wat NIET moet worden geleerd:
- Incidentele, eenmalige acties zonder patroon
- Simpele CRUD operaties zonder context
- Test data of oefeningen

Return ALLEEN een JSON object (geen andere tekst):
{
  "shouldCreateKnowledge": true/false,
  "category": "workflow_patterns" / "team_performance" / "task_history" / "productivity_insights" / "recruitment_pipeline" / "candidate_quality" / "placement_success" / "recruitment_effectiveness",
  "key": "beschrijvende_key_zoals_professional_X_completion_time",
  "value": { "detailed": "structured data object" },
  "confidence": 0.0-1.0,
  "reasoning": "Waarom dit belangrijk is om te leren",
  "role_tags": ["admin", "manager"] / null,
  "stability_score": 0.0-1.0
}`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error(`❌ AI analysis failed: ${response.status}`);
      return {
        shouldCreateKnowledge: false,
        reasoning: 'AI analysis failed'
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON uit response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`🤖 AI analysis result: shouldCreate=${parsed.shouldCreateKnowledge}, confidence=${parsed.confidence}`);
      return parsed;
    }
    
    console.warn('⚠️ Failed to parse AI response, skipping knowledge creation');
    return {
      shouldCreateKnowledge: false,
      reasoning: 'Failed to parse AI response'
    };
  } catch (error) {
    console.error('❌ AI analysis error:', error);
    return {
      shouldCreateKnowledge: false,
      reasoning: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
