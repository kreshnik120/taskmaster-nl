import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Complete category hierarchy with all 25 categories grouped
const CATEGORY_HIERARCHY = {
  ZZP_GROEP: {
    label: 'ZZP & Freelance',
    categories: ['zzp', 'zzp_vereisten', 'zzp_leveranciers', 'zzp_administratie', 'zzp_verzekeringen']
  },
  JURIDISCH_GROEP: {
    label: 'Juridisch & Compliance',
    categories: ['wetgeving', 'compliance', 'cao', 'contracten', 'arbeidsrecht']
  },
  HR_GROEP: {
    label: 'HR & Personeel',
    categories: ['hr_arbeidsvoorwaarden', 'recruitment', 'onboarding', 'verlof', 'ziekteverzuim']
  },
  FINANCIEEL_GROEP: {
    label: 'Financieel & Tarieven',
    categories: ['tarieven', 'facturatie', 'btw', 'kostprijsberekening']
  },
  OPERATIONEEL_GROEP: {
    label: 'Operationeel & Processen',
    categories: ['processen', 'kwaliteit', 'planning', 'communicatie']
  },
  MARKT_GROEP: {
    label: 'Markt & Klanten',
    categories: ['klanten', 'bedrijfsgegevens', 'marktanalyse', 'concurrentie']
  }
};

// Flatten all valid categories
const ALL_VALID_CATEGORIES = Object.values(CATEGORY_HIERARCHY)
  .flatMap(group => group.categories);

// Create category-to-group mapping
const CATEGORY_TO_GROUP: Record<string, string> = {};
Object.entries(CATEGORY_HIERARCHY).forEach(([groupId, group]) => {
  group.categories.forEach(cat => {
    CATEGORY_TO_GROUP[cat] = groupId;
  });
});

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
    console.log('📊 Current category:', item.category, '→ Group:', CATEGORY_TO_GROUP[item.category] || 'UNKNOWN');

    // Build category list with group context for AI
    const categoryListForAI = Object.entries(CATEGORY_HIERARCHY)
      .map(([groupId, group]) => 
        `${group.label} (${groupId}):\n  - ${group.categories.join('\n  - ')}`
      ).join('\n\n');

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
          content: `Analyseer dit kennisitem en verbeter de categorisatie.

BESCHIKBARE CATEGORIEËN (gebruik ALLEEN deze - geen nieuwe verzinnen):

${categoryListForAI}

Huidige categorie: ${item.category} (groep: ${CATEGORY_TO_GROUP[item.category] || 'ONBEKEND'})
Huidige key: ${item.key}
Value: ${JSON.stringify(item.value, null, 2)}

Taken:
1. Bepaal de BESTE categorie uit de lijst hierboven
   - ALLEEN categorieën uit de lijst zijn toegestaan
   - Kies de meest specifieke categorie die past
2. Verbeter de key voor betere vindbaarheid
   - Gebruik format: {entiteit}_{veld} (bijv. "CitoZorg_adres", "ABCzorg_telefoonnummer")
3. Split complexe items op in meerdere simpelere items indien nodig
4. Geef confidence score per item (0-1)

BELANGRIJK: Gebruik ALLEEN categorieën uit de bovenstaande lijst!`
        }],
        tools: [{
          type: "function",
          function: {
            name: "categorize_knowledge",
            description: "Categorize and improve knowledge items using ONLY valid categories",
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
                        enum: ALL_VALID_CATEGORIES,
                        description: "Must be one of the valid categories from the list"
                      },
                      parent_group: {
                        type: "string",
                        enum: Object.keys(CATEGORY_HIERARCHY),
                        description: "The parent group for this category"
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

    const parsedItems = JSON.parse(toolCall.function.arguments).items;
    
    // Validate all categories are in the allowed list
    const validatedItems = parsedItems.map((item: any) => {
      if (!ALL_VALID_CATEGORIES.includes(item.category)) {
        console.warn(`⚠️ Invalid category "${item.category}" - falling back to original`);
        return { ...item, category: item.category, validation_warning: `Invalid category, kept original` };
      }
      // Add parent group if missing
      if (!item.parent_group) {
        item.parent_group = CATEGORY_TO_GROUP[item.category] || 'UNKNOWN';
      }
      return item;
    });

    console.log('✅ AI categorization complete:', validatedItems.length, 'items');
    console.log('📁 Categories used:', [...new Set(validatedItems.map((i: any) => i.category))].join(', '));

    return new Response(
      JSON.stringify({ 
        suggestions: validatedItems,
        valid_categories: ALL_VALID_CATEGORIES,
        category_groups: Object.keys(CATEGORY_HIERARCHY)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in ai-categorize-knowledge:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        suggestions: [],
        valid_categories: ALL_VALID_CATEGORIES
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
