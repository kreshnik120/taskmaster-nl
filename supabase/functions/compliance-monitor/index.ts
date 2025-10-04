import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const CUTOFF_DATE = new Date('2025-10-06T23:59:59Z');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Check cutoff date
  if (new Date() > CUTOFF_DATE) {
    return new Response(JSON.stringify({ 
      error: 'Service cutoff date reached',
      cutoff_date: CUTOFF_DATE.toISOString() 
    }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Detect mode: authenticated (manual) vs autonomous (scheduler)
    const authHeader = req.headers.get('Authorization');
    let orgId: string;
    let userId: string;
    let supabase: any;

    if (authHeader) {
      // AUTHENTICATED MODE (manual trigger)
      console.log('🔐 Running in authenticated mode');
      supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Authentication failed');
      }
      userId = user.id;

      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', userId)
        .single();

      if (!userOrg) throw new Error('User not in any organization');
      orgId = userOrg.org_id;

    } else {
      // AUTONOMOUS MODE (scheduler)
      console.log('🤖 Running in autonomous mode');
      supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const { data: orgs } = await supabase
        .from('organizations')
        .select('id')
        .limit(1);

      if (!orgs || orgs.length === 0) {
        throw new Error('No organizations found');
      }

      orgId = orgs[0].id;
      userId = orgId; // Use orgId as userId for system operations
    }

    const startTime = Date.now();
    console.log('🔎 Compliance Monitor checking for updates...');
    
    // Initialize token counters
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokensUsed = 0;

    // Official sources to monitor
    const monitoringSources = [
      {
        name: 'NZa Tarieven',
        url: 'https://www.nza.nl/regelgeving/tarieven',
        category: 'tarieven',
        tier: 'tier1_officieel'
      },
      {
        name: 'IGJ Toezicht',
        url: 'https://www.igj.nl',
        category: 'compliance',
        tier: 'tier1_officieel'
      },
      {
        name: 'CAO VVT',
        url: 'https://www.caovvt.nl',
        category: 'cao',
        tier: 'tier1_officieel'
      },
      {
        name: 'Rijksoverheid Zorg',
        url: 'https://www.rijksoverheid.nl/onderwerpen/zorg-en-ondersteuning',
        category: 'wetgeving',
        tier: 'tier1_officieel'
      }
    ];

    const changesDetected = [];

    for (const source of monitoringSources) {
      console.log(`🔍 Checking: ${source.name}`);

      // Get last check date for this source
      const { data: lastCheck } = await supabase
        .from('ai_knowledge_base')
        .select('updated_at')
        .eq('org_id', orgId)
        .eq('category', source.category)
        .eq('source', `compliance-monitor:${source.name}`)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      const lastCheckDate = lastCheck?.updated_at || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Use AI to check for updates since last check
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: `Je bent een compliance monitoring expert die officiële bronnen checkt op updates.
              
Controleer ${source.name} (${source.url}) op wijzigingen sinds ${lastCheckDate}.

Output JSON:
{
  "has_changes": true/false,
  "changes_detected": ["change 1", "change 2"],
  "urgency": "low/medium/high",
  "summary": "kort overzicht"
}`
            },
            {
              role: 'user',
          content: `Check ${source.name} voor updates sinds ${new Date(lastCheckDate).toLocaleDateString('nl-NL')}.

Focus op:
- Nieuwe tarieven of wijzigingen
- CAO aanpassingen
- Wetgeving updates
- Compliance requirements
- Specifiek relevant voor ABCzorg en CitoZorg`
          }
        ],
      }),
    });

      if (!aiResponse.ok) {
        // Handle specific error codes
        if (aiResponse.status === 429) {
          console.error(`⚠️ Rate limit exceeded for ${source.name}`);
          return new Response(JSON.stringify({ 
            error: 'Rate limit exceeded, please try again later.',
            status: 429 
          }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        if (aiResponse.status === 402) {
          console.error(`💳 Credits exhausted for ${source.name}`);
          return new Response(JSON.stringify({ 
            error: 'AI credits exhausted, please add funds.',
            status: 402 
          }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Generic error
        console.error(`❌ AI check failed for ${source.name}: ${aiResponse.status}`);
        continue;
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices[0].message.content;
      
      // Extract token usage
      const usage = aiData.usage || {};
      const inputTokens = usage.prompt_tokens || 0;
      const outputTokens = usage.completion_tokens || 0;
      const tokensUsed = usage.total_tokens || inputTokens + outputTokens;
      
      // Accumulate tokens
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalTokensUsed += tokensUsed;

      let checkResult;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        checkResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { has_changes: false };
      } catch {
        checkResult = { has_changes: false };
      }

      if (checkResult.has_changes) {
        console.log(`🚨 Changes detected in ${source.name}`);
        changesDetected.push({
          source: source.name,
          category: source.category,
          urgency: checkResult.urgency,
          summary: checkResult.summary,
          changes: checkResult.changes_detected
        });

        // Trigger auto-knowledge-harvester for this specific topic
        try {
          await supabase.functions.invoke('auto-knowledge-harvester', {
            body: {
              search_topics: [`${source.name} updates ${new Date().getFullYear()}`]
            }
          });
          console.log(`✅ Triggered harvester for ${source.name}`);
        } catch (error) {
          console.error(`Failed to trigger harvester for ${source.name}:`, error);
        }

        // Create business intelligence alert
        await supabase
          .from('business_intelligence')
          .insert({
            org_id: orgId,
            intelligence_type: 'compliance_alert',
            title: `${source.name}: Wijzigingen gedetecteerd`,
            description: checkResult.summary,
            priority: checkResult.urgency === 'high' ? 'high' : 'medium',
            status: 'active',
            data: {
              source: source.name,
              url: source.url,
              changes: checkResult.changes_detected,
              detected_at: new Date().toISOString()
            }
          });
      } else {
        console.log(`✓ No changes in ${source.name}`);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Calculate execution time and cost
    const endTime = Date.now();
    const executionTimeMs = endTime - startTime;
    const estimatedCostEur = 0; // Free during Oct 2025 promo

    // Log function call with complete metrics
    await supabase.from('function_call_logs').insert({
      org_id: orgId,
      user_id: userId,
      function_name: 'compliance-monitor',
      success: true,
      execution_time_ms: executionTimeMs,
      model_used: 'google/gemini-2.5-flash',
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      total_tokens: totalTokensUsed,
      estimated_cost_eur: estimatedCostEur
    });

    console.log(`✅ Compliance monitoring complete: ${changesDetected.length} changes detected`);

    return new Response(JSON.stringify({
      success: true,
      sources_checked: monitoringSources.length,
      changes_detected: changesDetected.length,
      changes: changesDetected,
      harvesters_triggered: changesDetected.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Compliance Monitor error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});