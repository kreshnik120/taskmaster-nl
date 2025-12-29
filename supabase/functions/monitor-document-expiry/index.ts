import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Escalation configuration
const ESCALATION_CONFIG = {
  FIRST_REMINDER_DAYS: 0,      // Direct bij detectie
  SECOND_REMINDER_DAYS: 7,     // 7 dagen na eerste herinnering
  RECRUITER_NOTIFY_DAYS: 14,   // 14 dagen na eerste herinnering
  RECRUITER_EMAIL: 'personeel@citozorg.nl'
} as const;

interface ExpiringDocument {
  id: string;
  application_id: string;
  document_type: string;
  expiry_date: string;
  filename: string;
  reminder_sent_at: string | null;
  escalation_level: number;
  escalated_at: string | null;
  recruiter_notified_at: string | null;
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

  console.log('[monitor-document-expiry] Starting document expiry check with escalation...');

  try {
    const now = new Date();
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Document type labels
    const docTypeLabels: Record<string, string> = {
      vog: 'VOG (Verklaring Omtrent Gedrag)',
      beroepsaansprakelijkheid: 'Beroepsaansprakelijkheidsverzekering',
      bhv_certificaat: 'BHV Certificaat',
      tillift_certificaat: 'Tillift Certificaat',
      big_registratie: 'BIG-registratie',
      diploma: 'Diploma/Certificaat',
    };

    const goalsCreated: string[] = [];
    const remindersMarked: string[] = [];
    const escalationsCreated: string[] = [];
    const recruiterNotifications: string[] = [];

    // =====================================================
    // FASE 1: Nieuwe expiring documenten (escalation_level = 0)
    // =====================================================
    const { data: newExpiringDocs, error: newFetchError } = await supabase
      .from('application_documents')
      .select(`
        id,
        application_id,
        document_type,
        expiry_date,
        filename,
        reminder_sent_at,
        escalation_level,
        escalated_at,
        recruiter_notified_at
      `)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', fourteenDaysFromNow.toISOString().split('T')[0])
      .gte('expiry_date', now.toISOString().split('T')[0])
      .or('escalation_level.is.null,escalation_level.eq.0')
      .is('reminder_sent_at', null);

    if (newFetchError) {
      console.error('[monitor-document-expiry] Error fetching new expiring docs:', newFetchError);
    } else {
      console.log(`[monitor-document-expiry] FASE 1: Found ${newExpiringDocs?.length || 0} new expiring documents`);

      for (const doc of (newExpiringDocs || []) as ExpiringDocument[]) {
        const expiryDate = new Date(doc.expiry_date);
        const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const isUrgent = expiryDate <= sevenDaysFromNow;

        const { data: appData } = await supabase
          .from('professional_applications')
          .select('id, email_from, extracted_data, org_id')
          .eq('id', doc.application_id)
          .single();

        if (!appData) continue;

        const application = appData as ApplicationData;
        const candidateName = application.extracted_data?.naam || 'Kandidaat';
        const docLabel = docTypeLabels[doc.document_type] || doc.document_type;

        // Create goal for first reminder
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
              is_urgent: isUrgent,
              escalation_phase: 1
            },
            trigger_event: {
              type: 'document_expiry_detected',
              triggered_at: now.toISOString()
            }
          })
          .select('id')
          .single();

        if (!goalError && goal) {
          goalsCreated.push(goal.id);

          // Update document: set escalation_level = 1, reminder_sent_at
          await supabase
            .from('application_documents')
            .update({ 
              reminder_sent_at: now.toISOString(),
              escalation_level: 1
            })
            .eq('id', doc.id);

          remindersMarked.push(doc.id);
          console.log(`[monitor-document-expiry] FASE 1: Created goal for ${docLabel} (${daysRemaining} days) for ${candidateName}`);
        }
      }
    }

    // =====================================================
    // FASE 2: 7-dagen escalatie (escalation_level = 1, reminder_sent_at > 7 dagen)
    // =====================================================
    const sevenDaysAgo = new Date(now.getTime() - ESCALATION_CONFIG.SECOND_REMINDER_DAYS * 24 * 60 * 60 * 1000);
    
    const { data: escalationDocs, error: escalationError } = await supabase
      .from('application_documents')
      .select(`
        id,
        application_id,
        document_type,
        expiry_date,
        filename,
        reminder_sent_at,
        escalation_level,
        escalated_at,
        recruiter_notified_at
      `)
      .not('expiry_date', 'is', null)
      .eq('escalation_level', 1)
      .lte('reminder_sent_at', sevenDaysAgo.toISOString())
      .is('escalated_at', null);

    if (escalationError) {
      console.error('[monitor-document-expiry] Error fetching escalation docs:', escalationError);
    } else {
      console.log(`[monitor-document-expiry] FASE 2: Found ${escalationDocs?.length || 0} documents for escalation`);

      for (const doc of (escalationDocs || []) as ExpiringDocument[]) {
        const expiryDate = new Date(doc.expiry_date);
        const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const daysSinceFirstReminder = Math.ceil((now.getTime() - new Date(doc.reminder_sent_at!).getTime()) / (1000 * 60 * 60 * 24));

        const { data: appData } = await supabase
          .from('professional_applications')
          .select('id, email_from, extracted_data, org_id')
          .eq('id', doc.application_id)
          .single();

        if (!appData) continue;

        const application = appData as ApplicationData;
        const candidateName = application.extracted_data?.naam || 'Kandidaat';
        const docLabel = docTypeLabels[doc.document_type] || doc.document_type;

        // Create escalation goal
        const { data: goal, error: goalError } = await supabase
          .from('agent_goals')
          .insert({
            org_id: application.org_id,
            goal_type: 'document_renewal_escalation',
            goal_description: `Tweede herinnering aan ${candidateName} voor ${docLabel} - ${daysSinceFirstReminder} dagen sinds eerste verzoek`,
            priority: 9,
            status: 'pending',
            input_data: {
              application_id: doc.application_id,
              document_id: doc.id,
              document_type: doc.document_type,
              document_label: docLabel,
              expiry_date: doc.expiry_date,
              days_remaining: daysRemaining,
              days_since_first_reminder: daysSinceFirstReminder,
              candidate_name: candidateName,
              candidate_email: application.email_from,
              escalation_phase: 2
            },
            trigger_event: {
              type: 'document_escalation_7_days',
              triggered_at: now.toISOString()
            }
          })
          .select('id')
          .single();

        if (!goalError && goal) {
          escalationsCreated.push(goal.id);

          // Update document: set escalation_level = 2, escalated_at
          await supabase
            .from('application_documents')
            .update({ 
              escalated_at: now.toISOString(),
              escalation_level: 2
            })
            .eq('id', doc.id);

          console.log(`[monitor-document-expiry] FASE 2: Created escalation goal for ${docLabel} (${daysSinceFirstReminder} days since first) for ${candidateName}`);
        }
      }
    }

    // =====================================================
    // FASE 3: 14-dagen recruiter notificatie (escalation_level = 2, escalated_at > 7 dagen)
    // =====================================================
    const sevenDaysAfterEscalation = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const { data: recruiterAlertDocs, error: recruiterError } = await supabase
      .from('application_documents')
      .select(`
        id,
        application_id,
        document_type,
        expiry_date,
        filename,
        reminder_sent_at,
        escalation_level,
        escalated_at,
        recruiter_notified_at
      `)
      .not('expiry_date', 'is', null)
      .eq('escalation_level', 2)
      .lte('escalated_at', sevenDaysAfterEscalation.toISOString())
      .is('recruiter_notified_at', null);

    if (recruiterError) {
      console.error('[monitor-document-expiry] Error fetching recruiter alert docs:', recruiterError);
    } else {
      console.log(`[monitor-document-expiry] FASE 3: Found ${recruiterAlertDocs?.length || 0} documents for recruiter notification`);

      for (const doc of (recruiterAlertDocs || []) as ExpiringDocument[]) {
        const totalDaysWaiting = Math.ceil((now.getTime() - new Date(doc.reminder_sent_at!).getTime()) / (1000 * 60 * 60 * 24));

        const { data: appData } = await supabase
          .from('professional_applications')
          .select('id, email_from, extracted_data, org_id')
          .eq('id', doc.application_id)
          .single();

        if (!appData) continue;

        const application = appData as ApplicationData;
        const candidateName = application.extracted_data?.naam || 'Kandidaat';
        const docLabel = docTypeLabels[doc.document_type] || doc.document_type;

        // Create recruiter notification goal
        const { data: goal, error: goalError } = await supabase
          .from('agent_goals')
          .insert({
            org_id: application.org_id,
            goal_type: 'notify_recruiter_document_issue',
            goal_description: `Notificeer recruiter: ${candidateName} heeft niet gereageerd op document vernieuwing (${totalDaysWaiting} dagen)`,
            priority: 10,
            status: 'pending',
            input_data: {
              application_id: doc.application_id,
              document_id: doc.id,
              document_type: doc.document_type,
              document_label: docLabel,
              expiry_date: doc.expiry_date,
              total_days_waiting: totalDaysWaiting,
              candidate_name: candidateName,
              candidate_email: application.email_from,
              recruiter_email: ESCALATION_CONFIG.RECRUITER_EMAIL,
              escalation_phase: 3
            },
            trigger_event: {
              type: 'document_escalation_14_days_recruiter',
              triggered_at: now.toISOString()
            }
          })
          .select('id')
          .single();

        if (!goalError && goal) {
          recruiterNotifications.push(goal.id);

          // Update document: set escalation_level = 3, recruiter_notified_at
          await supabase
            .from('application_documents')
            .update({ 
              recruiter_notified_at: now.toISOString(),
              escalation_level: 3
            })
            .eq('id', doc.id);

          console.log(`[monitor-document-expiry] FASE 3: Created recruiter notification for ${docLabel} (${totalDaysWaiting} days total) for ${candidateName}`);
        }
      }
    }

    // =====================================================
    // Check for already expired documents (for dashboard logging)
    // =====================================================
    const { data: expiredDocs, error: expiredError } = await supabase
      .from('application_documents')
      .select('id, application_id, document_type, expiry_date, filename')
      .not('expiry_date', 'is', null)
      .lt('expiry_date', now.toISOString().split('T')[0]);

    if (!expiredError && expiredDocs && expiredDocs.length > 0) {
      console.log(`[monitor-document-expiry] Found ${expiredDocs.length} already expired documents`);

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
      fase_1_new_documents: newExpiringDocs?.length || 0,
      fase_1_goals_created: goalsCreated.length,
      fase_2_escalations: escalationsCreated.length,
      fase_3_recruiter_notifications: recruiterNotifications.length,
      expired_documents_count: expiredDocs?.length || 0,
      escalation_config: ESCALATION_CONFIG
    };

    console.log('[monitor-document-expiry] Completed with escalation:', result);

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
