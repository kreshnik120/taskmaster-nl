import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExpiringDocument {
  id: string;
  application_id: string;
  document_type: string;
  expiry_date: string;
  filename: string;
  reminder_sent_at: string | null;
}

interface ApplicationData {
  id: string;
  email_from: string;
  extracted_data: { naam?: string } | null;
  org_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('[monitor-document-expiry] Starting document expiry check...');

  try {
    const now = new Date();
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Find documents expiring within 14 days that haven't been reminded
    const { data: expiringDocs, error: fetchError } = await supabase
      .from('application_documents')
      .select(`
        id,
        application_id,
        document_type,
        expiry_date,
        filename,
        reminder_sent_at
      `)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', fourteenDaysFromNow.toISOString().split('T')[0])
      .gte('expiry_date', now.toISOString().split('T')[0])
      .is('reminder_sent_at', null);

    if (fetchError) {
      throw new Error(`Error fetching expiring documents: ${fetchError.message}`);
    }

    console.log(`[monitor-document-expiry] Found ${expiringDocs?.length || 0} expiring documents without reminders`);

    const goalsCreated: string[] = [];
    const remindersMarked: string[] = [];

    for (const doc of (expiringDocs || []) as ExpiringDocument[]) {
      const expiryDate = new Date(doc.expiry_date);
      const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isUrgent = expiryDate <= sevenDaysFromNow;

      // Get application details
      const { data: appData, error: appError } = await supabase
        .from('professional_applications')
        .select('id, email_from, extracted_data, org_id')
        .eq('id', doc.application_id)
        .single();

      if (appError || !appData) {
        console.warn(`[monitor-document-expiry] Could not find application ${doc.application_id}`);
        continue;
      }

      const application = appData as ApplicationData;
      const candidateName = application.extracted_data?.naam || 'Kandidaat';

      // Document type labels
      const docTypeLabels: Record<string, string> = {
        vog: 'VOG (Verklaring Omtrent Gedrag)',
        beroepsaansprakelijkheid: 'Beroepsaansprakelijkheidsverzekering',
        bhv_certificaat: 'BHV Certificaat',
        tillift_certificaat: 'Tillift Certificaat',
      };

      const docLabel = docTypeLabels[doc.document_type] || doc.document_type;

      // Create agent goal for document renewal request
      const { data: goal, error: goalError } = await supabase
        .from('agent_goals')
        .insert({
          org_id: application.org_id,
          goal_type: 'request_document_renewal',
          goal_description: `Vraag ${candidateName} om vernieuwde ${docLabel} - verloopt over ${daysRemaining} dagen`,
          priority: isUrgent ? 8 : 5,
          status: 'pending',
          input_data: {
            application_id: doc.application_id,
            document_id: doc.id,
            document_type: doc.document_type,
            document_label: docLabel,
            expiry_date: doc.expiry_date,
            days_remaining: daysRemaining,
            candidate_name: candidateName,
            candidate_email: application.email_from,
            is_urgent: isUrgent
          },
          trigger_event: {
            type: 'document_expiry_detected',
            triggered_at: now.toISOString()
          }
        })
        .select('id')
        .single();

      if (goalError) {
        console.error(`[monitor-document-expiry] Error creating goal for doc ${doc.id}:`, goalError);
        continue;
      }

      goalsCreated.push(goal?.id || doc.id);

      // Mark reminder as sent
      const { error: updateError } = await supabase
        .from('application_documents')
        .update({ reminder_sent_at: now.toISOString() })
        .eq('id', doc.id);

      if (!updateError) {
        remindersMarked.push(doc.id);
      }

      console.log(`[monitor-document-expiry] Created goal for ${docLabel} expiring in ${daysRemaining} days for ${candidateName}`);
    }

    // Also check for already expired documents
    const { data: expiredDocs, error: expiredError } = await supabase
      .from('application_documents')
      .select(`
        id,
        application_id,
        document_type,
        expiry_date,
        filename
      `)
      .not('expiry_date', 'is', null)
      .lt('expiry_date', now.toISOString().split('T')[0]);

    if (!expiredError && expiredDocs && expiredDocs.length > 0) {
      console.log(`[monitor-document-expiry] Found ${expiredDocs.length} expired documents`);

      // Log to system_events for dashboard visibility
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id')
        .limit(1);

      if (orgs && orgs.length > 0) {
        await supabase.from('system_events').insert({
          org_id: orgs[0].id,
          event_type: 'expired_documents_detected',
          entity_type: 'application_documents',
          event_data: {
            count: expiredDocs.length,
            document_ids: expiredDocs.map((d: { id: string }) => d.id),
            checked_at: now.toISOString()
          },
          metadata: {
            source: 'monitor-document-expiry',
            severity: 'warning'
          }
        });
      }
    }

    const result = {
      success: true,
      checked_at: now.toISOString(),
      expiring_documents_found: expiringDocs?.length || 0,
      goals_created: goalsCreated.length,
      reminders_marked: remindersMarked.length,
      expired_documents_count: expiredDocs?.length || 0
    };

    console.log('[monitor-document-expiry] Completed:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[monitor-document-expiry] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
