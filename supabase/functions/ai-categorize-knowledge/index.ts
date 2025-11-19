import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { item } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('🤖 Analyzing knowledge item for categorization:', item.key);

    // Call Lovable AI for analysis
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: `Analyseer dit kennisitem en verbeter de categorisatie:
            
Huidige categorie: ${item.category}
Huidige key: ${item.key}
Value: ${JSON.stringify(item.value, null, 2)}

Taken:
1. Bepaal de beste categorie voor dit item
   - Gebruik bestaande categorieën: contract_specifiek, tarief_info, contact_info, process_info, policy_info, org_profile
   - Of stel een betere categorie voor indien nodig
2. Verbeter de key voor betere vindbaarheid
   - Gebruik format: {entiteit}_{veld} (bijv. "CitoZorg_adres", "ABCzorg_telefoonnummer")
3. Split complexe items op in meerdere simpelere items indien het item meerdere concepten bevat
   - Bijv. één item met adres+telefoon+email → drie aparte items
4. Geef confidence score per item (0-1) op basis van:
   - Hoe zeker je bent van de categorisatie
   - Kwaliteit van de data
   - Consistentie met bestaande kennis

Return een JSON array van verbeterde/nieuwe items.`
        }],
        tools: [{
          type: "function",
          function: {
            name: "categorize_knowledge",
            description: "Categorize and improve knowledge items",
            parameters: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      category: { 
                        type: "string",
                        description: "The category for this knowledge item"
                      },
                      key: { 
                        type: "string",
                        description: "Improved key in format entity_field"
                      },
                      value: { 
                        type: "object",
                        description: "The value object for this item"
                      },
                      confidence: { 
                        type: "number",
                        description: "Confidence score between 0 and 1"
                      },
                      reason: { 
                        type: "string",
                        description: "Explanation for this categorization"
                      }
                    },
                    required: ["category", "key", "value", "confidence", "reason"],
                    additionalProperties: false
                  }
                }
              },
              required: ["items"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "categorize_knowledge" } }
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const result = await aiResponse.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      console.error('No tool call in AI response');
      throw new Error('AI did not return structured categorization');
    }

    const items = JSON.parse(toolCall.function.arguments).items;

    console.log('✅ AI categorization complete:', items.length, 'items');

    return new Response(
      JSON.stringify({ suggestions: items }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in ai-categorize-knowledge:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        suggestions: []
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
