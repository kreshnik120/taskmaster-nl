import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FUNCTIONS_TO_ACTIVATE = [
  'compliance-monitor',
  'smart-deduplicator',
  'category-classifier',
  'data-quality-auditor',
  'source-validator',
  'client-communication-coach',
  'mega-forecast-generator',
  'professional-enricher'
];

interface ActivationResult {
  name: string;
  success: boolean;
  error?: string;
  response?: any;
  duration_ms: number;
}

async function activateFunction(
  supabase: any,
  functionName: string
): Promise<ActivationResult> {
  const startTime = Date.now();
  console.log(`🚀 Activating ${functionName}...`);
  
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: { trigger: 'initial_activation', source: 'function-activator' }
    });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      console.error(`❌ ${functionName} failed:`, error.message);
      return {
        name: functionName,
        success: false,
        error: error.message,
        duration_ms: duration
      };
    }
    
    console.log(`✅ ${functionName} activated successfully (${duration}ms)`);
    return {
      name: functionName,
      success: true,
      response: data,
      duration_ms: duration
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`❌ ${functionName} exception:`, err);
    return {
      name: functionName,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      duration_ms: duration
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('🎯 Function Activator started');

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`📋 Activating ${FUNCTIONS_TO_ACTIVATE.length} functions in parallel...`);

    // Trigger all functions in parallel
    const results = await Promise.all(
      FUNCTIONS_TO_ACTIVATE.map(name => activateFunction(supabase, name))
    );

    // Calculate statistics
    const totalDuration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const avgDuration = Math.round(
      results.reduce((sum, r) => sum + r.duration_ms, 0) / results.length
    );

    // Group results
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`\n📊 Activation Summary:`);
    console.log(`   ✅ Success: ${successCount}/${FUNCTIONS_TO_ACTIVATE.length}`);
    console.log(`   ❌ Failed: ${failureCount}/${FUNCTIONS_TO_ACTIVATE.length}`);
    console.log(`   ⏱️  Total duration: ${totalDuration}ms`);
    console.log(`   📈 Avg per function: ${avgDuration}ms`);

    if (successful.length > 0) {
      console.log(`\n✅ Successfully activated:`);
      successful.forEach(r => console.log(`   - ${r.name} (${r.duration_ms}ms)`));
    }

    if (failed.length > 0) {
      console.log(`\n❌ Failed to activate:`);
      failed.forEach(r => console.log(`   - ${r.name}: ${r.error}`));
    }

    return new Response(
      JSON.stringify({
        success: failureCount === 0,
        message: `Activated ${successCount}/${FUNCTIONS_TO_ACTIVATE.length} functions`,
        statistics: {
          total_functions: FUNCTIONS_TO_ACTIVATE.length,
          successful: successCount,
          failed: failureCount,
          total_duration_ms: totalDuration,
          avg_duration_ms: avgDuration
        },
        results: results,
        successful_functions: successful.map(r => r.name),
        failed_functions: failed.map(r => ({ name: r.name, error: r.error }))
      }, null, 2),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ Function Activator error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Function activation failed'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
