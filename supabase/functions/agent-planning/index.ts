/**
 * Agent Planning v1.0.1
 * =====================
 * Specialist agent for candidates with complete documents in 'intake_verstuurd'.
 * 
 * NOTE: Deze agent helpt bij het plannen van gesprekken voor kandidaten
 * die voldoende documenten hebben verzameld (CV + geverifieerd diploma).
 * Transitie naar 'gesprek_gepland' gebeurt wanneer recruiter gesprek_datum invult.
 * 
 * Responsibilities:
 * - Check recruiter availability
 * - Propose 3 interview time slots to candidate
 * - Wait for human confirmation (does NOT auto-schedule)
 * - Create notification for recruiter
 * 
 * This agent does NOTHING else:
 * - No document processing (Document Agent)
 * - No VOG requests (Screening Agent)
 * - No automatic scheduling - proposals only!
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Focused system prompt
const PLANNING_AGENT_PROMPT = `Je bent de Planning Agent voor CitoZorg/ABCzorg recruitmentbureau.

## JOUW ENIGE TAAK
Stel 3 beschikbare tijdslots voor aan de kandidaat voor een kennismakingsgesprek.

## BELANGRIJK
- JIJ plant GEEN gesprekken automatisch
- Je STELT VOOR, de medewerker of kandidaat bevestigt
- Gesprekken zijn alleen Ma-Vr tussen 09:00-17:00

## STAGE TRANSITIE
- Alleen wanneer gesprek_datum is ingevuld door een medewerker
- Dit gebeurt via de UI, niet automatisch door deze agent

## BESCHIKBARE EMAIL TYPES
- interview_slot_proposal: Stuur 3 voorgestelde tijdslots

## WAT JE NIET DOET
- Geen documenten verwerken
- Geen VOG aanvragen
- Geen gesprekken automatisch inplannen`;

interface TimeSlot {
  date: string;
  time: string;
  datetime: string;
  formatted: string;
}

// Generate available time slots for the next 7 days
function generateAvailableSlots(busySlots: { start_time: string; end_time: string }[]): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const now = new Date();
  
  // Start from tomorrow
  for (let dayOffset = 1; dayOffset <= 7 && slots.length < 3; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    
    // Skip weekends
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    
    // Available times: 09:00, 10:00, 11:00, 14:00, 15:00, 16:00
    const times = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];
    
    for (const time of times) {
      if (slots.length >= 3) break;
      
      const [hours, minutes] = time.split(':').map(Number);
      const slotDate = new Date(date);
      slotDate.setHours(hours, minutes, 0, 0);
      
      // Check if slot conflicts with busy slots
      const slotStart = slotDate.toISOString();
      const slotEnd = new Date(slotDate.getTime() + 60 * 60 * 1000).toISOString(); // 1 hour
      
      const isConflict = busySlots.some(busy => {
        return slotStart < busy.end_time && slotEnd > busy.start_time;
      });
      
      if (!isConflict) {
        const dayNames = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
        const monthNames = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 
                           'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
        
        slots.push({
          date: slotDate.toISOString().split('T')[0],
          time: time,
          datetime: slotDate.toISOString(),
          formatted: `${dayNames[slotDate.getDay()]} ${slotDate.getDate()} ${monthNames[slotDate.getMonth()]} om ${time}`
        });
      }
    }
  }
  
  return slots;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { 
      application_id, 
      application,
      trigger,
      allowed_email_types = ['interview_slot_proposal']
    } = body;

    console.log(`[agent-planning] Processing application: ${application_id}, trigger: ${trigger}`);

    // Get full application data
    const { data: app, error: appError } = await supabase
      .from('professional_applications')
      .select('*')
      .eq('id', application_id)
      .single();

    if (appError || !app) {
      return new Response(
        JSON.stringify({ success: false, error: 'Application not found' }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate we're in the correct stage (6-stage pipeline: intake_verstuurd is where planning happens)
    if (app.pipeline_stage !== 'intake_verstuurd') {
      console.log(`[agent-planning] Wrong stage: ${app.pipeline_stage}, expected: intake_verstuurd`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Agent Planning handles 'intake_verstuurd' stage only, current: ${app.pipeline_stage}`,
          stage_completed: false
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if gesprek_datum is already set (stage can advance)
    if (app.gesprek_datum) {
      console.log(`[agent-planning] Interview already scheduled for: ${app.gesprek_datum}`);
      return new Response(
        JSON.stringify({
          success: true,
          stage_completed: true,
          message: 'Interview already scheduled',
          gesprek_datum: app.gesprek_datum
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Get recruiter busy slots from tasks table
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const { data: busyTasks } = await supabase
      .from('tasks')
      .select('start_time, end_time')
      .gte('start_time', now.toISOString())
      .lte('start_time', weekFromNow.toISOString())
      .not('start_time', 'is', null);

    const busySlots = (busyTasks || []).map(t => ({
      start_time: t.start_time,
      end_time: t.end_time || new Date(new Date(t.start_time).getTime() + 60 * 60 * 1000).toISOString()
    }));

    console.log(`[agent-planning] Found ${busySlots.length} busy slots`);

    // Step 2: Generate available slots
    const availableSlots = generateAvailableSlots(busySlots);
    
    if (availableSlots.length === 0) {
      console.log('[agent-planning] No available slots found');
      
      // Create notification for recruiter
      await supabase.from('recruiter_notifications').insert({
        org_id: app.org_id,
        type: 'no_slots_available',
        title: 'Geen beschikbare tijdslots',
        message: `Er zijn geen beschikbare tijdslots voor ${app.candidate_name}. Controleer de agenda.`,
        application_id: app.id,
        is_read: false
      });

      return new Response(
        JSON.stringify({
          success: true,
          stage_completed: false,
          message: 'No available slots found, notification sent to recruiter',
          available_slots: []
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Send interview slot proposal email
    const firstName = app.candidate_name?.split(' ')[0] || 'daar';
    
    const { error: emailError } = await supabase.functions.invoke('send-ai-email', {
      body: {
        application_id: app.id,
        email_type: 'interview_slot_proposal',
        recipient_email: app.email_from,
        recipient_name: app.candidate_name,
        context: {
          candidate_name: app.candidate_name,
          first_name: firstName,
          available_slots: availableSlots,
          slot_1: availableSlots[0]?.formatted,
          slot_2: availableSlots[1]?.formatted,
          slot_3: availableSlots[2]?.formatted,
          agent: 'planning'
        }
      }
    });

    const emailSent = !emailError;
    if (emailError) {
      console.error('[agent-planning] Failed to send slot proposal email:', emailError);
    }

    // Step 4: Create notification for recruiter
    await supabase.from('recruiter_notifications').insert({
      org_id: app.org_id,
      type: 'interview_slots_proposed',
      title: 'Gesprek tijdslots voorgesteld',
      message: `Er zijn 3 tijdslots voorgesteld aan ${app.candidate_name}. Wachtend op bevestiging.`,
      application_id: app.id,
      is_read: false,
      metadata: {
        proposed_slots: availableSlots
      }
    });

    // Step 5: Log to application_conversations
    await supabase.from('application_conversations').insert({
      application_id: app.id,
      role: 'agent',
      content: `[Agent Planning] 3 tijdslots voorgesteld: ${availableSlots.map(s => s.formatted).join(', ')}. Wachtend op bevestiging.`,
      metadata: {
        agent: 'planning',
        proposed_slots: availableSlots,
        email_sent: emailSent,
        execution_time_ms: Date.now() - startTime
      }
    });

    console.log(`[agent-planning] ✅ Completed in ${Date.now() - startTime}ms, proposed ${availableSlots.length} slots`);

    // Note: stage_completed is FALSE because we need human confirmation
    return new Response(
      JSON.stringify({
        success: true,
        stage_completed: false, // Human must confirm interview date
        email_sent: emailSent,
        proposed_slots: availableSlots,
        message: 'Interview slots proposed, waiting for confirmation',
        execution_time_ms: Date.now() - startTime
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('[agent-planning] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        stage_completed: false
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
