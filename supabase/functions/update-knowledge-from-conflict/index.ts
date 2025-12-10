import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { redactValuePII } from '../_shared/knowledge-crud.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { conflict_id, edited_value, resolution_action } = await req.json();

    if (!conflict_id || !edited_value) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: conflict_id and edited_value' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[update-knowledge-from-conflict] Processing conflict:', conflict_id);

    // Haal het conflict op
    const { data: conflict, error: conflictError } = await supabaseClient
      .from('data_conflicts')
      .select('*')
      .eq('id', conflict_id)
      .single();

    if (conflictError || !conflict) {
      console.error('[update-knowledge-from-conflict] Conflict not found:', conflictError);
      return new Response(
        JSON.stringify({ error: 'Conflict not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (conflict.resolution_status !== 'pending') {
      return new Response(
        JSON.stringify({ error: 'Conflict already resolved' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Haal het bestaande knowledge item op
    const { data: knowledge, error: knowledgeError } = await supabaseClient
      .from('ai_knowledge_base')
      .select('*')
      .eq('id', conflict.existing_knowledge_id)
      .single();

    if (knowledgeError || !knowledge) {
      console.error('[update-knowledge-from-conflict] Knowledge item not found:', knowledgeError);
      return new Response(
        JSON.stringify({ error: 'Knowledge item not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Server-side validatie van edited_value
    let validatedValue = edited_value;
    
    console.log('[update-knowledge] Raw edited_value:', edited_value);
    
    // STAP 1: Verwijder metadata velden die niet in value column horen
    const prohibitedFields = ['category', 'key', 'confidence', 'role_tags', 'source_type', 'org_id', 'client_id'];
    const foundProhibited = prohibitedFields.filter(field => validatedValue[field] !== undefined);
    
    if (foundProhibited.length > 0) {
      console.warn('[update-knowledge] Removing prohibited metadata fields:', foundProhibited);
      validatedValue = { ...validatedValue };
      foundProhibited.forEach(field => delete validatedValue[field]);
    }
    
    // STAP 2: Detecteer en flatten nested value.value structure
    if (validatedValue.value && typeof validatedValue.value === 'object') {
      console.warn('[update-knowledge] Nested value.value structure detected, flattening...');
      validatedValue = validatedValue.value;
    }
    
    // STAP 3: Detecteer en verwijder duplicate fields (top-level vs nested)
    if (typeof validatedValue === 'object' && validatedValue !== null) {
      const duplicateFields: string[] = [];
      
      if (validatedValue.value && typeof validatedValue.value === 'object') {
        const topLevelKeys = Object.keys(validatedValue);
        const nestedKeys = Object.keys(validatedValue.value);
        
        for (const key of topLevelKeys) {
          if (key !== 'value' && nestedKeys.includes(key)) {
            duplicateFields.push(key);
          }
        }
        
        if (duplicateFields.length > 0) {
          console.warn('[update-knowledge] Duplicate fields detected, removing top-level:', duplicateFields);
          validatedValue = { ...validatedValue };
          for (const field of duplicateFields) {
            delete validatedValue[field];
          }
        }
      }
    }
    
    // Apply PII redaction before storing
    validatedValue = redactValuePII(validatedValue);
    console.log('[update-knowledge] Validated and PII-redacted edited_value:', validatedValue);


    // Update het knowledge item met de gevalideerde waarde
    const { error: updateError } = await supabaseClient
      .from('ai_knowledge_base')
      .update({
        value: validatedValue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', knowledge.id);

    if (updateError) {
      console.error('[update-knowledge-from-conflict] Error updating knowledge:', updateError);
      throw updateError;
    }

    console.log('[update-knowledge-from-conflict] Knowledge item updated successfully');

    // Markeer het conflict als opgelost
    const { error: resolveError } = await supabaseClient
      .from('data_conflicts')
      .update({
        resolution_status: 'resolved',
        resolution_action: resolution_action || 'edited',
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
      })
      .eq('id', conflict_id);

    if (resolveError) {
      console.error('[update-knowledge-from-conflict] Error resolving conflict:', resolveError);
      throw resolveError;
    }

    console.log('[update-knowledge-from-conflict] Conflict marked as resolved');

    // Log de actie
    await supabaseClient.from('ai_learning_events').insert({
      org_id: conflict.org_id,
      user_id: user.id,
      event_type: 'conflict_resolution',
      context: {
        conflict_id,
        resolution_action: 'edited',
        original_value: knowledge.value,
        edited_value,
        conflict_type: conflict.conflict_type,
      },
      outcome: 'success',
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Conflict resolved with edited value',
        knowledge_id: knowledge.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[update-knowledge-from-conflict] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
