import { createAdminClient, corsHeaders, jsonResponse, errorResponse, handleCors, logInfo, logSuccess, logError, logWarning } from '../_shared/core.ts';

// Use 'any' type for Supabase client to avoid version mismatches
type SupabaseClientType = any;

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
  include_completion_message?: boolean; // 🆕 Voor gecombineerde bevestiging + slots email
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

// Buffer in minuten rondom bestaande afspraken
const SLOT_BUFFER_MINUTES = 60;

// ============================================
// SMART SLOT GENERATION MET AGENDA CHECK
// ============================================

interface CalendarSlot {
  date: string;
  time: string;
}

interface BlockedSlot {
  date: string;
  time: string;
  duration_minutes: number;
}

/**
 * Haal bezette tijdslots op uit de interne agenda (tasks tabel)
 */
async function getBlockedTimeSlots(
  supabase: SupabaseClientType,
  orgId: string | null,
  startDate: Date,
  endDate: Date
): Promise<Map<string, BlockedSlot[]>> {
  logInfo('ScheduleInterview', 'Fetching blocked slots from internal calendar', {
    orgId,
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  });

  // Haal alle taken op in de gegeven periode die niet verwijderd/voltooid zijn
  let query = supabase
    .from('tasks')
    .select('start_at, due_at, estimate_min, category, title')
    .gte('start_at', startDate.toISOString())
    .lte('start_at', endDate.toISOString())
    .is('deleted_at', null)
    .is('completed_at', null);

  // Filter op organisatie indien beschikbaar
  if (orgId) {
    query = query.eq('org_id', orgId);
  }

  const { data: tasks, error } = await query;

  if (error) {
    logWarning('ScheduleInterview', 'Failed to fetch tasks from calendar', { error: error.message });
    return new Map();
  }

  // Maak een map van datum → bezette tijden met duur
  const blockedSlots = new Map<string, BlockedSlot[]>();

  for (const task of tasks || []) {
    if (task.start_at) {
      const date = task.start_at.split('T')[0];
      const time = task.start_at.split('T')[1]?.substring(0, 5);
      const duration = task.estimate_min || 30; // Default 30 minuten

      if (!blockedSlots.has(date)) {
        blockedSlots.set(date, []);
      }
      blockedSlots.get(date)!.push({ date, time, duration_minutes: duration });
      
      logInfo('ScheduleInterview', `📅 Bezet slot gevonden: ${date} ${time} (${duration} min) - ${task.title || task.category}`);
    }
  }

  logSuccess('ScheduleInterview', 'Blocked slots retrieved', {
    blockedDates: Array.from(blockedSlots.keys()),
    totalBlockedSlots: Array.from(blockedSlots.values()).reduce((sum, arr) => sum + arr.length, 0)
  });

  return blockedSlots;
}

/**
 * Check of een tijdslot conflicteert met bestaande afspraken
 */
function isSlotBlocked(
  date: string,
  time: string,
  blockedSlots: Map<string, BlockedSlot[]>,
  bufferMinutes: number = SLOT_BUFFER_MINUTES
): boolean {
  const blockedForDate = blockedSlots.get(date);
  if (!blockedForDate || blockedForDate.length === 0) {
    return false;
  }

  const [th, tm] = time.split(':').map(Number);
  const slotMinutes = th * 60 + tm;

  for (const blocked of blockedForDate) {
    const [bh, bm] = blocked.time.split(':').map(Number);
    const blockedStart = bh * 60 + bm;
    const blockedEnd = blockedStart + blocked.duration_minutes;

    // Check of het slot binnen de buffer valt
    // Slot is geblokkeerd als: slotStart < blockedEnd + buffer EN slotStart + buffer > blockedStart
    const slotEnd = slotMinutes + 30; // Interview duurt 30 min
    
    if (slotMinutes < blockedEnd + bufferMinutes && slotEnd > blockedStart - bufferMinutes) {
      return true;
    }
  }

  return false;
}

/**
 * Genereer beschikbare slots op basis van de interne agenda
 */
function generateAvailableSlotsFromCalendar(
  daysMin: number,
  daysMax: number,
  maxSlots: number,
  blockedSlots: Map<string, BlockedSlot[]>
): CalendarSlot[] {
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

    // Filter tijden die niet bezet zijn
    for (const time of DEFAULT_TIMES) {
      if (slots.length >= maxSlots) break;

      const isBlocked = isSlotBlocked(dateStr, time, blockedSlots);

      if (!isBlocked) {
        slots.push({ date: dateStr, time });
        logInfo('ScheduleInterview', `✅ Slot beschikbaar: ${dateStr} ${time}`);
      } else {
        logInfo('ScheduleInterview', `❌ Slot bezet: ${dateStr} ${time}`);
      }
    }
  }

  return slots;
}

/**
 * Probeer echte beschikbaarheid op te halen via interne agenda + n8n/kalender integratie.
 */
async function getAvailableSlots(
  supabase: SupabaseClientType,
  orgId: string | null, 
  daysMin: number, 
  daysMax: number,
  maxSlots: number = MAX_SLOTS
): Promise<CalendarSlot[]> {
  
  // ================================================================
  // STAP 1: Haal bezette tijden op uit interne agenda (tasks tabel)
  // ================================================================
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + daysMin);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + daysMax);

  const blockedSlots = await getBlockedTimeSlots(supabase, orgId, startDate, endDate);

  // ================================================================
  // STAP 2: Probeer n8n kalender webhook (als geconfigureerd) voor extra blocked slots
  // ================================================================
  if (N8N_CALENDAR_WEBHOOK_URL) {
    logInfo('ScheduleInterview', 'Fetching additional calendar availability via n8n', { 
      url: N8N_CALENDAR_WEBHOOK_URL.substring(0, 50) + '...',
      daysMin, 
      daysMax 
    });
    
    try {
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
        
        // Als n8n expliciete beschikbare slots teruggeeft, gebruik die direct
        if (data.available_slots && Array.isArray(data.available_slots) && data.available_slots.length > 0) {
          logSuccess('ScheduleInterview', 'Got calendar slots from n8n', { 
            count: data.available_slots.length 
          });
          // Filter n8n slots ook door onze interne blocked slots
          const filteredSlots = data.available_slots.filter((slot: CalendarSlot) => 
            !isSlotBlocked(slot.date, slot.time, blockedSlots)
          );
          return filteredSlots.slice(0, maxSlots);
        }
        
        // Als n8n blocked slots teruggeeft, voeg die toe aan onze map
        if (data.blocked_slots && Array.isArray(data.blocked_slots)) {
          for (const blocked of data.blocked_slots) {
            const date = blocked.date;
            if (!blockedSlots.has(date)) {
              blockedSlots.set(date, []);
            }
            blockedSlots.get(date)!.push({
              date,
              time: blocked.time,
              duration_minutes: blocked.duration_minutes || 30
            });
          }
          logInfo('ScheduleInterview', 'Added n8n blocked slots', { 
            count: data.blocked_slots.length 
          });
        }
      } else {
        logWarning('ScheduleInterview', 'n8n calendar webhook returned non-OK status', { 
          status: response.status 
        });
      }
    } catch (n8nError) {
      logWarning('ScheduleInterview', 'n8n calendar check failed', { 
        error: n8nError instanceof Error ? n8nError.message : String(n8nError)
      });
    }
  }
  
  // ================================================================
  // STAP 3: Genereer beschikbare slots op basis van blocked slots
  // ================================================================
  logInfo('ScheduleInterview', 'Generating available slots based on calendar', { 
    daysMin, daysMax, maxSlots,
    blockedDatesCount: blockedSlots.size
  });
  
  return generateAvailableSlotsFromCalendar(daysMin, daysMax, maxSlots, blockedSlots);
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
    const { 
      application_id, 
      action, 
      selected_slot, 
      interview_type = 'video', 
      location, 
      interviewer_name, 
      interviewer_email,
      include_completion_message = false // 🆕 Gecombineerde email flag
    } = body;

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
        // 🔒 IDEMPOTENCY GUARD: Voorkom duplicaat interview emails
        // Check of er al een interview email verstuurd is in de laatste 5 minuten
        // ================================================================
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        
        const { data: recentInterviewEmail } = await supabase
          .from("application_conversations")
          .select("id, created_at")
          .eq("application_id", application_id)
          .eq("metadata->>email_type", "interview_availability_request")
          .gte("created_at", fiveMinutesAgo)
          .limit(1)
          .maybeSingle();
        
        if (recentInterviewEmail) {
          logWarning('ScheduleInterview', `Interview email already sent at ${recentInterviewEmail.created_at}, skipping duplicate`, {
            recent_email_id: recentInterviewEmail.id,
            application_id
          });
          return jsonResponse({
            success: false,
            skipped: true,
            reason: 'duplicate_prevention',
            message: `Interview email al verstuurd om ${recentInterviewEmail.created_at}`,
            recent_email_id: recentInterviewEmail.id
          });
        }
        
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
          supabase,
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
          : include_completion_message 
            ? `Geweldig nieuws! Tijd voor een gesprek - ${orgName}`
            : `Interview plannen - ${orgName}`;
        
        // 🆕 Profiel samenvatting uit extracted_data halen
        const profielItems: string[] = [];
        if (extractedData.functie_niveau || extractedData.diploma_type) {
          profielItems.push(`<li><strong>Functie:</strong> ${extractedData.functie_niveau || extractedData.diploma_type}</li>`);
        }
        if (extractedData.werkvorm) {
          profielItems.push(`<li><strong>Werkvorm:</strong> ${extractedData.werkvorm}</li>`);
        }
        if (extractedData.beschikbaarheid) {
          profielItems.push(`<li><strong>Beschikbaarheid:</strong> ${extractedData.beschikbaarheid}</li>`);
        }
        if (extractedData.regio) {
          profielItems.push(`<li><strong>Regio:</strong> ${extractedData.regio}</li>`);
        }
        
        const profielSection = profielItems.length > 0 ? `
          <div style="background: #f0f9ff; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0ea5e9;">
            <h3 style="margin: 0 0 12px 0; color: #0369a1;">📋 Je Profiel</h3>
            <ul style="margin: 0; padding-left: 20px;">
              ${profielItems.join('\n')}
            </ul>
          </div>
        ` : '';
        
        // 🆕 Intro tekst gebaseerd op type email
        let introSection = '';
        if (include_completion_message) {
          introSection = `
            <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); padding: 20px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
              <h2 style="color: #047857; margin: 0 0 8px 0;">🎉 Geweldig nieuws!</h2>
              <p style="color: #065f46; margin: 0; font-size: 16px;">Je sollicitatie is compleet en we zijn onder de indruk van je profiel!</p>
            </div>
            
            ${profielSection}
            
            <p style="font-size: 16px;">We willen je graag beter leren kennen. Hieronder vind je <strong>${availableSlots.length} mogelijke momenten</strong> voor een kennismakingsgesprek:</p>
          `;
        } else if (isAlternative) {
          introSection = `
            <p>Geen probleem dat de vorige momenten niet uitkwamen! Hier zijn enkele andere opties:</p>
            <p>Hieronder vind je ${availableSlots.length} nieuwe mogelijke momenten:</p>
          `;
        } else {
          introSection = `
            <p>Goed nieuws! We willen graag een kennismakingsgesprek met je plannen.</p>
            <p>Hieronder vind je ${availableSlots.length} mogelijke momenten. Laat ons weten welk moment jou het beste uitkomt:</p>
          `;
        }
        
        const emailHtml = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
            <h2 style="color: #1a1a1a; margin-bottom: 16px;">Beste ${candidateName},</h2>
            
            ${introSection}
            
            <div style="background: ${isAlternative ? '#fff7ed' : '#f8fafc'}; padding: 24px; border-radius: 12px; margin: 24px 0; ${isAlternative ? 'border-left: 4px solid #f97316;' : 'border: 1px solid #e2e8f0;'}">
              <h3 style="margin: 0 0 16px 0; color: ${isAlternative ? '#c2410c' : '#334155'};">📅 Beschikbare momenten</h3>
              <div style="font-size: 15px; line-height: 2;">
                ${availableSlots.map((slot, index) => 
                  `<div style="padding: 8px 12px; background: white; border-radius: 6px; margin-bottom: 8px; border: 1px solid #e2e8f0;">
                    <strong style="color: #0369a1;">${index + 1}.</strong> ${formatDate(slot.date)} om <strong>${slot.time}</strong>
                  </div>`
                ).join('')}
              </div>
            </div>
            
            <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px;">
                💬 <strong>Antwoord simpel met het nummer van je voorkeur</strong><br>
                <span style="color: #92400e;">Bijvoorbeeld: "Ik kies voor optie 2"</span>
              </p>
            </div>
            
            <div style="display: flex; gap: 12px; margin: 20px 0;">
              <div style="flex: 1; background: #f1f5f9; padding: 12px; border-radius: 8px; text-align: center;">
                <span style="font-size: 20px;">💻</span>
                <p style="margin: 8px 0 0 0; font-size: 13px; color: #475569;">
                  ${interview_type === 'video' ? 'Via Microsoft Teams' : interview_type === 'phone' ? 'Telefonisch' : `Op ${location || 'locatie'}`}
                </p>
              </div>
              <div style="flex: 1; background: #f1f5f9; padding: 12px; border-radius: 8px; text-align: center;">
                <span style="font-size: 20px;">⏱️</span>
                <p style="margin: 8px 0 0 0; font-size: 13px; color: #475569;">~30 minuten</p>
              </div>
            </div>
            
            <p style="color: #64748b; font-size: 14px;">Mocht geen van deze momenten schikken, laat het ons dan weten en we zoeken samen naar een alternatief.</p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
            
            <p style="margin-bottom: 4px;">Met vriendelijke groet,</p>
            <p style="margin: 0;"><strong>${orgName} Recruitment</strong></p>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">
              📧 personeel@${isAbczorg ? 'abczorg' : 'citozorg'}.nl
            </p>
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

        // FASE 2: Automatisch interview taak aanmaken met verrijkte details
        let taskId = null;
        try {
          logInfo('ScheduleInterview', 'Creating interview task via RPC', {
            application_id,
            candidateName,
            interviewDateTime: interviewDateTime.toISOString(),
            org_id: application.org_id || application.assigned_organization
          });

          const { data: taskResult, error: rpcError } = await supabase.rpc('create_interview_task', {
            p_application_id: application_id,
            p_candidate_name: candidateName,
            p_interview_date: interviewDateTime.toISOString(),
            p_org_id: application.org_id || application.assigned_organization,
            p_notes: `Interview met ${candidateName} op ${formatDate(selected_slot.date)} om ${selected_slot.time}. Type: ${interview_type === 'video' ? 'Microsoft Teams' : interview_type === 'phone' ? 'Telefonisch' : 'Op locatie'}.`,
            p_candidate_email: candidateEmail,
            p_interview_type: interview_type || 'video',
            p_teams_link: interview_type === 'video' ? 'https://teams.microsoft.com/l/meetup-join/...' : null,
            p_location: location || null,
            p_duration_minutes: selected_slot.duration_minutes || 30,
            p_interviewer_name: interviewer_name || 'Recruiter',
            p_interviewer_email: interviewer_email || null,
            p_organization_name: orgName
          });

          if (rpcError) {
            logError('ScheduleInterview', 'RPC create_interview_task failed', {
              error: rpcError.message,
              details: rpcError.details,
              hint: rpcError.hint,
              code: rpcError.code
            });
          } else {
            taskId = taskResult;
            logSuccess('ScheduleInterview', 'Interview task created successfully', { 
              taskId,
              application_id,
              interview_date: interviewDateTime.toISOString()
            });
          }
        } catch (taskError) {
          logError('ScheduleInterview', 'Exception creating interview task', {
            error: taskError instanceof Error ? taskError.message : String(taskError),
            stack: taskError instanceof Error ? taskError.stack : undefined
          });
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
        // 🔧 FIX: Parse confirmed slot - kan ISO string of object zijn
        let confirmedSlot: { date: string; time: string };
        
        const rawSlot = selected_slot || 
          application.interview_confirmed_slot || 
          extractedData.interview_confirmed_slot;
        
        if (!rawSlot) {
          return errorResponse('No confirmed slot available', 400);
        }
        
        console.log('📅 Raw confirmedSlot:', JSON.stringify(rawSlot));
        
        if (typeof rawSlot === 'string') {
          // ISO string format: "2024-12-24T10:30:00+01:00" of "2024-12-24T10:30:00"
          const dateObj = new Date(rawSlot);
          if (isNaN(dateObj.getTime())) {
            return errorResponse(`Invalid slot date format: ${rawSlot}`, 400);
          }
          confirmedSlot = {
            date: dateObj.toISOString().split('T')[0], // "2024-12-24"
            time: dateObj.toLocaleTimeString('nl-NL', { 
              hour: '2-digit', 
              minute: '2-digit', 
              hour12: false,
              timeZone: 'Europe/Amsterdam'
            }) // "10:30"
          };
          console.log('📅 Parsed from ISO string:', confirmedSlot);
        } else if (typeof rawSlot === 'object' && rawSlot !== null) {
          // Object format: { date: "2024-12-24", time: "10:30" }
          if (rawSlot.date && rawSlot.time) {
            confirmedSlot = { date: rawSlot.date, time: rawSlot.time };
            console.log('📅 Using object format:', confirmedSlot);
          } else {
            // Probeer andere velden
            return errorResponse(`Unrecognized slot object format: ${JSON.stringify(rawSlot)}`, 400);
          }
        } else {
          return errorResponse(`Unrecognized slot format: ${typeof rawSlot}`, 400);
        }

        // 🆕 Genereer rijke ICS agenda-uitnodiging
        const interviewStart = new Date(`${confirmedSlot.date}T${confirmedSlot.time}:00`);
        const interviewEnd = new Date(interviewStart.getTime() + 30 * 60 * 1000); // +30 min
        
        const formatICSDate = (date: Date): string => {
          return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        };
        
        const uid = `interview-${application_id}@${orgName.toLowerCase().replace(/\s/g, '')}.nl`;
        const functie = extractedData.functie_niveau || extractedData.diploma_type || 'Zorgprofessional';
        
        // 🆕 Rijke ICS met METHOD:REQUEST, VALARM herinneringen
        const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//${orgName} Recruitment//NL
METHOD:REQUEST
X-WR-CALNAME:${orgName} Interview
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(interviewStart)}
DTEND:${formatICSDate(interviewEnd)}
ORGANIZER;CN=${orgName} Recruitment:mailto:personeel@${isAbczorg ? 'abczorg' : 'citozorg'}.nl
ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${candidateName}:mailto:${candidateEmail}
SUMMARY:🎯 Interview: ${candidateName} - ${functie}
DESCRIPTION:══════════════════════════════════════════\\n🏥 INTERVIEW DETAILS\\n══════════════════════════════════════════\\n\\n👤 Kandidaat: ${candidateName}\\n📋 Functie: ${functie}\\n🏢 Organisatie: ${orgName}\\n\\n──────────────────────────────────────────\\n📍 LOCATIE\\n──────────────────────────────────────────\\n${interview_type === 'video' ? 'Via Microsoft Teams\\n(link wordt apart verzonden)' : interview_type === 'phone' ? 'Telefonisch' : `Op locatie: ${location || 'Kantoor'}`}\\n\\n──────────────────────────────────────────\\n📝 VOORBEREIDING\\n──────────────────────────────────────────\\n• Zorg voor stabiele internetverbinding\\n• Test camera en microfoon vooraf\\n• Houd je CV bij de hand\\n\\nVragen? Mail naar personeel@${isAbczorg ? 'abczorg' : 'citozorg'}.nl
LOCATION:${interview_type === 'video' ? 'Microsoft Teams Meeting' : interview_type === 'phone' ? 'Telefonisch' : location || 'Kantoor'}
CATEGORIES:Interview,Recruitment
PRIORITY:5
STATUS:CONFIRMED
TRANSP:OPAQUE
X-MICROSOFT-CDO-BUSYSTATUS:BUSY
X-MICROSOFT-CDO-IMPORTANCE:1
BEGIN:VALARM
TRIGGER:-PT1H
ACTION:DISPLAY
DESCRIPTION:Interview over 1 uur met ${orgName}!
END:VALARM
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
DESCRIPTION:Interview begint over 15 minuten
END:VALARM
END:VEVENT
END:VCALENDAR`;

        // Google Calendar link
        const googleCalStart = interviewStart.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        const googleCalEnd = interviewEnd.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        const googleCalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Interview: ${candidateName} - ${orgName}`)}&dates=${googleCalStart}/${googleCalEnd}&details=${encodeURIComponent(`Kennismakingsgesprek voor ${orgName}`)}&location=${encodeURIComponent(interview_type === 'video' ? 'Microsoft Teams' : location || 'Kantoor')}`;

        // 🆕 Mooie bevestigingsmail met ICS bijlage
        const confirmSubject = `✅ Interview Bevestigd - ${formatDate(confirmedSlot.date)} om ${confirmedSlot.time}`;
        const confirmHtml = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
            <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); padding: 24px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
              <h2 style="color: #047857; margin: 0;">✅ Interview Bevestigd!</h2>
            </div>
            
            <p>Beste ${candidateName},</p>
            
            <p>Super! Je interview is bevestigd. Hieronder vind je alle details:</p>
            
            <div style="background: #f8fafc; padding: 24px; border-radius: 12px; margin: 24px 0; border: 1px solid #e2e8f0;">
              <div style="display: grid; gap: 16px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 24px;">📅</span>
                  <div>
                    <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Datum</div>
                    <div style="font-weight: 600; font-size: 16px;">${formatDate(confirmedSlot.date)}</div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 24px;">🕐</span>
                  <div>
                    <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Tijd</div>
                    <div style="font-weight: 600; font-size: 16px;">${confirmedSlot.time} uur</div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 24px;">💻</span>
                  <div>
                    <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Locatie</div>
                    <div style="font-weight: 600; font-size: 16px;">${interview_type === 'video' ? 'Microsoft Teams (video)' : interview_type === 'phone' ? 'Telefonisch' : location || 'Op locatie'}</div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 24px;">⏱️</span>
                  <div>
                    <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Duur</div>
                    <div style="font-weight: 600; font-size: 16px;">~30 minuten</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div style="background: #eff6ff; padding: 20px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #3b82f6;">
              <h3 style="margin: 0 0 12px 0; color: #1e40af;">📲 Toevoegen aan je agenda</h3>
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #1e40af;">Klik op een van de onderstaande links:</p>
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <a href="${googleCalLink}" style="background: #3b82f6; color: white; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-size: 14px; display: inline-block;">📅 Google Agenda</a>
              </div>
              <p style="margin: 12px 0 0 0; font-size: 13px; color: #64748b;">💡 Tip: In de bijlage vind je ook een .ics bestand voor Outlook/Apple Calendar</p>
            </div>
            
            <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 24px 0;">
              <h3 style="margin: 0 0 12px 0; color: #92400e;">📝 Voorbereiding Tips</h3>
              <ul style="margin: 0; padding-left: 20px; color: #92400e; font-size: 14px;">
                <li>Zorg voor een rustige omgeving</li>
                <li>Test je camera en microfoon vooraf</li>
                ${interview_type === 'video' ? '<li>Je ontvangt de Teams-link kort voor het gesprek</li>' : ''}
                <li>Houd je CV bij de hand</li>
              </ul>
            </div>
            
            <p style="color: #64748b; font-size: 14px;">💡 Verhinderd? Laat het ons zo snel mogelijk weten door te reageren op deze email.</p>
            
            <p style="margin-top: 24px;">We kijken ernaar uit je te spreken!</p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
            
            <p style="margin-bottom: 4px;">Met vriendelijke groet,</p>
            <p style="margin: 0;"><strong>${orgName} Recruitment</strong></p>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">
              📧 personeel@${isAbczorg ? 'abczorg' : 'citozorg'}.nl
            </p>
          </div>
        `;

        // Encode ICS as base64 for email attachment
        const icsBase64 = btoa(unescape(encodeURIComponent(icsContent)));

        const { error: confirmError } = await supabase.functions.invoke('send-ai-email', {
          body: {
            recipient_email: candidateEmail,
            recipient_name: candidateName,
            subject: confirmSubject,
            html_content: confirmHtml,
            application_id,
            email_type: 'interview_confirmation',
            org_id: application.org_id,
            attachments: [
              {
                filename: `interview-${confirmedSlot.date}.ics`,
                content: icsBase64,
                content_type: 'text/calendar; method=REQUEST',
              }
            ]
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

        logSuccess('ScheduleInterview', 'Confirmation sent with ICS', { application_id });

        return jsonResponse({
          success: true,
          action: 'send_confirmation',
          confirmation_sent: true,
          ics_attached: true,
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
