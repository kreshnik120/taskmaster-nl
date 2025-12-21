import { createAdminClient, corsHeaders, jsonResponse, errorResponse, handleCors, logInfo, logSuccess, logError, logWarning } from '../_shared/core.ts';

interface ScheduleRequest {
  application_id: string;
  action: 'request_availability' | 'confirm_slot' | 'send_confirmation' | 'request_alternative_availability';
  selected_slot?: {
    date: string;
    time: string;
    duration_minutes?: number;
  };
  interview_type?: 'phone' | 'video' | 'in_person';
  location?: string;
  interviewer_name?: string;
  interviewer_email?: string;
  alternative_attempt?: number;
}

interface SlotConfig {
  day_offset: number;
  times: string[];
}

// ============================================
// CONFIGURATIE (via environment variables)
// ============================================
const MAX_SLOTS = parseInt(Deno.env.get('INTERVIEW_MAX_SLOTS') || '6');
const DAYS_AHEAD_MIN = parseInt(Deno.env.get('INTERVIEW_DAYS_MIN') || '2');
const DAYS_AHEAD_MAX = parseInt(Deno.env.get('INTERVIEW_DAYS_MAX') || '7');
const ALTERNATIVE_DAYS_MIN = parseInt(Deno.env.get('INTERVIEW_ALT_DAYS_MIN') || '5');
const ALTERNATIVE_DAYS_MAX = parseInt(Deno.env.get('INTERVIEW_ALT_DAYS_MAX') || '14');
const N8N_CALENDAR_WEBHOOK_URL = Deno.env.get('N8N_CALENDAR_WEBHOOK_URL');

// Default interview slot tijden (als fallback)
const DEFAULT_TIMES = ['09:00', '10:30', '14:00', '15:30'];

// ============================================
// SMART SLOT GENERATION
// ============================================

interface CalendarSlot {
  date: string;
  time: string;
}

/**
 * Probeer echte beschikbaarheid op te halen via n8n/kalender integratie.
 * Fallback naar statische slots als n8n niet geconfigureerd of faalt.
 */
async function getAvailableSlots(
  orgId: string | null, 
  daysMin: number, 
  daysMax: number,
  maxSlots: number = MAX_SLOTS
): Promise<CalendarSlot[]> {
  
  // ================================================================
  // STAP 1: Probeer n8n kalender webhook (als geconfigureerd)
  // ================================================================
  if (N8N_CALENDAR_WEBHOOK_URL) {
    logInfo('ScheduleInterview', 'Fetching calendar availability via n8n', { 
      url: N8N_CALENDAR_WEBHOOK_URL.substring(0, 50) + '...',
      daysMin, 
      daysMax 
    });
    
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + daysMin);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + daysMax);
      
      const response = await fetch(N8N_CALENDAR_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_available_slots',
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          org_id: orgId,
          max_slots: maxSlots
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.available_slots && Array.isArray(data.available_slots) && data.available_slots.length > 0) {
          logSuccess('ScheduleInterview', 'Got calendar slots from n8n', { 
            count: data.available_slots.length 
          });
          return data.available_slots.slice(0, maxSlots);
        }
      } else {
        logWarning('ScheduleInterview', 'n8n calendar webhook returned non-OK status', { 
          status: response.status 
        });
      }
    } catch (n8nError) {
      logWarning('ScheduleInterview', 'n8n calendar check failed, falling back to static slots', { 
        error: n8nError instanceof Error ? n8nError.message : String(n8nError)
      });
    }
  }
  
  // ================================================================
  // STAP 2: Fallback naar statische slot generatie
  // ================================================================
  logInfo('ScheduleInterview', 'Generating static slots', { daysMin, daysMax, maxSlots });
  return generateStaticSlots(daysMin, daysMax, maxSlots);
}

/**
 * Genereer statische slots (fallback als n8n niet beschikbaar)
 */
function generateStaticSlots(daysMin: number, daysMax: number, maxSlots: number): CalendarSlot[] {
  const slots: CalendarSlot[] = [];
  const today = new Date();
  
  for (let dayOffset = daysMin; dayOffset <= daysMax && slots.length < maxSlots; dayOffset++) {
    const slotDate = new Date(today);
    slotDate.setDate(today.getDate() + dayOffset);
    
    // Skip weekends
    if (slotDate.getDay() === 0 || slotDate.getDay() === 6) {
      continue;
    }
    
    const dateStr = slotDate.toISOString().split('T')[0];
    
    // Voeg tijden toe tot max bereikt
    for (const time of DEFAULT_TIMES) {
      if (slots.length >= maxSlots) break;
      slots.push({ date: dateStr, time });
    }
  }
  
  return slots;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  };
  return date.toLocaleDateString('nl-NL', options);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createAdminClient();
    const body: ScheduleRequest = await req.json();
    const { application_id, action, selected_slot, interview_type = 'video', location, interviewer_name, interviewer_email } = body;

    if (!application_id) {
      return errorResponse('application_id is required', 400);
    }

    logInfo('ScheduleInterview', `Processing ${action}`, { application_id });

    // Fetch application details
    const { data: application, error: appError } = await supabase
      .from('professional_applications')
      .select('*')
      .eq('id', application_id)
      .single();

    if (appError || !application) {
      return errorResponse(`Application not found: ${appError?.message}`, 404);
    }

    const extractedData = application.extracted_data as Record<string, unknown> || {};
    const candidateName = extractedData.naam as string || extractedData.full_name as string || 'Kandidaat';
    const candidateEmail = application.email_from || extractedData.email as string;

    if (!candidateEmail) {
      return errorResponse('Candidate email not available', 400);
    }

    // Determine organization for email sender
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', application.org_id)
      .single();
    
    const orgName = org?.name || 'CitoZorg';
    const isAbczorg = orgName.toLowerCase().includes('abc');

    // Get alternative_attempt from request
    const alternativeAttempt = body.alternative_attempt || 0;

    switch (action) {
      case 'request_availability':
      case 'request_alternative_availability': {
        // ================================================================
        // SMART SLOT GENERATION: n8n calendar check met fallback
        // ================================================================
        const isAlternative = action === 'request_alternative_availability';
        const daysMin = isAlternative ? ALTERNATIVE_DAYS_MIN : DAYS_AHEAD_MIN;
        const daysMax = isAlternative ? ALTERNATIVE_DAYS_MAX : DAYS_AHEAD_MAX;
        
        logInfo('ScheduleInterview', `Generating ${isAlternative ? 'alternative' : 'initial'} slots`, {
          daysMin, daysMax, maxSlots: MAX_SLOTS, alternativeAttempt
        });
        
        const availableSlots = await getAvailableSlots(
          application.org_id,
          daysMin,
          daysMax,
          MAX_SLOTS
        );
        
        // Create formatted slot options for email
        const slotOptions = availableSlots.map((slot, index) => 
          `${index + 1}. ${formatDate(slot.date)} om ${slot.time}`
        ).join('\n');

        // Generate email asking for availability
        const emailSubject = isAlternative 
          ? `Alternatieve interview momenten - ${orgName}`
          : `Interview plannen - ${orgName}`;
        
        const introText = isAlternative
          ? `Geen probleem dat de vorige momenten niet uitkwamen! Hier zijn enkele andere opties:`
          : `Goed nieuws! We willen graag een kennismakingsgesprek met je plannen.`;
        
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Beste ${candidateName},</h2>
            
            <p>${introText}</p>
            
            <p>Hieronder vind je ${availableSlots.length} mogelijke momenten. Laat ons weten welk moment jou het beste uitkomt door simpelweg het nummer te beantwoorden:</p>
            
            <div style="background: ${isAlternative ? '#fff3e0' : '#f5f5f5'}; padding: 20px; border-radius: 8px; margin: 20px 0; ${isAlternative ? 'border-left: 4px solid #ff9800;' : ''}">
              <pre style="margin: 0; font-family: Arial, sans-serif; white-space: pre-wrap;">${slotOptions}</pre>
            </div>
            
            <p>Het gesprek duurt ongeveer 30 minuten en vindt ${interview_type === 'video' ? 'online via Microsoft Teams' : interview_type === 'phone' ? 'telefonisch' : `plaats op ${location || 'ons kantoor'}`} plaats.</p>
            
            <p>Mocht geen van deze momenten schikken, laat het ons dan weten en we zoeken samen naar een alternatief.</p>
            
            <p>Met vriendelijke groet,<br>
            <strong>${orgName} Recruitment</strong></p>
          </div>
        `;

        // Send email via send-ai-email function
        const { error: emailError } = await supabase.functions.invoke('send-ai-email', {
          body: {
            email_type: 'interview_availability_request',
            recipient_email: candidateEmail,
            recipient_name: candidateName,
            subject: emailSubject,
            html_content: emailHtml,
            application_id,
            org_id: application.org_id,
          }
        });

        if (emailError) {
          logError('ScheduleInterview', 'Failed to send availability email', emailError);
          return errorResponse(`Failed to send email: ${emailError.message}`, 500);
        }

        // Store available slots in application for later reference
        // 🔧 CONSOLIDATIE: Schrijf naar COLUMN (primair) EN extracted_data (backwards compatibility)
        const newStatus = isAlternative ? 'alternative_slots_offered' : 'awaiting_response';
        await supabase
          .from('professional_applications')
          .update({
            interview_status: newStatus, // Column (primair)
            extracted_data: {
              ...extractedData,
              interview_slots_offered: availableSlots,
              interview_status: newStatus, // JSONB (backup)
              interview_request_sent_at: new Date().toISOString(),
              interview_is_alternative: isAlternative,
              interview_alternative_attempt: alternativeAttempt,
            }
          })
          .eq('id', application_id);

        // Log to system_events
        await supabase.from('system_events').insert({
          event_type: isAlternative ? 'interview_alternative_requested' : 'interview_availability_requested',
          entity_type: 'professional_application',
          entity_id: application_id,
          event_data: {
            candidate_name: candidateName,
            candidate_email: candidateEmail,
            slots_offered: availableSlots.length,
            max_slots: MAX_SLOTS,
            interview_type,
            is_alternative: isAlternative,
            alternative_attempt: alternativeAttempt,
            n8n_calendar_used: !!N8N_CALENDAR_WEBHOOK_URL,
          },
          org_id: application.assigned_organization,
        });

        logSuccess('ScheduleInterview', 'Availability request sent', { 
          application_id, 
          slots_count: availableSlots.length 
        });

        return jsonResponse({
          success: true,
          action: 'request_availability',
          slots_offered: availableSlots.length,
          available_slots: availableSlots, // ✅ KRITIEK: Return slots for caller to store
          email_sent: true,
        });
      }

      case 'confirm_slot': {
        if (!selected_slot) {
          return errorResponse('selected_slot is required for confirm_slot action', 400);
        }

        // Parse interview datetime
        const interviewDateTime = new Date(`${selected_slot.date}T${selected_slot.time}:00`);

        // Update application with confirmed slot
        // 🔧 CONSOLIDATIE: Schrijf naar COLUMNS (primair) EN extracted_data (backwards compatibility)
        await supabase
          .from('professional_applications')
          .update({
            pipeline_stage: 'interview', // Move to interview stage
            interview_status: 'scheduled', // Column (primair)
            interview_confirmed_slot: selected_slot, // Column
            interview_scheduled_at: interviewDateTime.toISOString(), // Column
            extracted_data: {
              ...extractedData,
              interview_confirmed_slot: selected_slot, // JSONB (backup)
              interview_status: 'scheduled', // JSONB (backup)
              interview_confirmed_at: new Date().toISOString(),
            }
          })
          .eq('id', application_id);

        // FASE 2: Automatisch interview taak aanmaken
        let taskId = null;
        try {
          const { data: taskResult } = await supabase.rpc('create_interview_task', {
            p_application_id: application_id,
            p_candidate_name: candidateName,
            p_interview_date: interviewDateTime.toISOString(),
            p_org_id: application.org_id || application.assigned_organization,
            p_notes: `Interview met ${candidateName} op ${formatDate(selected_slot.date)} om ${selected_slot.time}. Type: ${interview_type === 'video' ? 'Microsoft Teams' : interview_type === 'phone' ? 'Telefonisch' : 'Op locatie'}.`
          });
          taskId = taskResult;
          logSuccess('ScheduleInterview', 'Interview task created', { taskId });
        } catch (taskError) {
          logError('ScheduleInterview', 'Failed to create interview task', taskError);
          // Continue anyway - task creation is optional enhancement
        }

        // Create calendar event via n8n (if configured)
        const n8nWebhookUrl = Deno.env.get('N8N_CALENDAR_WEBHOOK_URL');
        
        if (n8nWebhookUrl) {
          try {
            await fetch(n8nWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'create_calendar_event',
                event: {
                  title: `Interview: ${candidateName}`,
                  start_date: selected_slot.date,
                  start_time: selected_slot.time,
                  duration_minutes: selected_slot.duration_minutes || 30,
                  attendees: [
                    { email: candidateEmail, name: candidateName },
                    ...(interviewer_email ? [{ email: interviewer_email, name: interviewer_name || 'Recruiter' }] : []),
                  ],
                  description: `Kennismakingsgesprek met ${candidateName} voor ${orgName}`,
                  location: interview_type === 'video' ? 'Microsoft Teams' : location || 'Kantoor',
                  create_teams_meeting: interview_type === 'video',
                }
              })
            });
          } catch (calError) {
            logError('ScheduleInterview', 'Failed to create calendar event', calError);
            // Continue anyway - calendar is optional
          }
        }

        // Log to system_events
        await supabase.from('system_events').insert({
          event_type: 'interview_scheduled',
          entity_type: 'professional_application',
          entity_id: application_id,
          event_data: {
            candidate_name: candidateName,
            selected_slot,
            interview_type,
            task_id: taskId,
          },
          org_id: application.assigned_organization,
        });

        logSuccess('ScheduleInterview', 'Interview slot confirmed', { 
          application_id, 
          slot: selected_slot,
          task_created: !!taskId
        });

        return jsonResponse({
          success: true,
          action: 'confirm_slot',
          confirmed_slot: selected_slot,
          task_id: taskId,
          pipeline_stage_updated: 'interview',
        });
      }

      case 'send_confirmation': {
        const confirmedSlot = selected_slot || (extractedData.interview_confirmed_slot as { date: string; time: string });
        
        if (!confirmedSlot) {
          return errorResponse('No confirmed slot available', 400);
        }

        // Send confirmation email
        const confirmSubject = `Bevestiging interview - ${formatDate(confirmedSlot.date)} om ${confirmedSlot.time}`;
        const confirmHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Beste ${candidateName},</h2>
            
            <p>Hierbij bevestigen we je interview:</p>
            
            <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4caf50;">
              <p style="margin: 0;"><strong>Datum:</strong> ${formatDate(confirmedSlot.date)}</p>
              <p style="margin: 8px 0 0 0;"><strong>Tijd:</strong> ${confirmedSlot.time}</p>
              <p style="margin: 8px 0 0 0;"><strong>Type:</strong> ${interview_type === 'video' ? 'Online via Microsoft Teams' : interview_type === 'phone' ? 'Telefonisch' : `Op locatie: ${location || 'Wordt nog bevestigd'}`}</p>
            </div>
            
            ${interview_type === 'video' ? `
            <p>Je ontvangt binnenkort een Teams-uitnodiging met de link voor het videogesprek.</p>
            ` : ''}
            
            <p>Mocht je onverhoopt verhinderd zijn, laat het ons dan zo snel mogelijk weten.</p>
            
            <p>We kijken ernaar uit je te spreken!</p>
            
            <p>Met vriendelijke groet,<br>
            <strong>${orgName} Recruitment</strong></p>
          </div>
        `;

        const { error: confirmError } = await supabase.functions.invoke('send-ai-email', {
          body: {
            to: candidateEmail,
            subject: confirmSubject,
            html: confirmHtml,
            application_id,
            email_type: 'interview_confirmation',
            organization: orgName,
          }
        });

        if (confirmError) {
          return errorResponse(`Failed to send confirmation: ${confirmError.message}`, 500);
        }

        // Update status
        // 🔧 CONSOLIDATIE: Schrijf naar COLUMN (primair) EN extracted_data (backwards compatibility)
        await supabase
          .from('professional_applications')
          .update({
            interview_status: 'confirmed', // Column (primair)
            extracted_data: {
              ...extractedData,
              interview_status: 'confirmed', // JSONB (backup)
              interview_confirmation_sent_at: new Date().toISOString(),
            }
          })
          .eq('id', application_id);

        logSuccess('ScheduleInterview', 'Confirmation sent', { application_id });

        return jsonResponse({
          success: true,
          action: 'send_confirmation',
          confirmation_sent: true,
        });
      }

      default:
        return errorResponse(`Unknown action: ${action}`, 400);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError('ScheduleInterview', 'Unexpected error', error);
    return errorResponse(`Unexpected error: ${errorMessage}`, 500);
  }
});
