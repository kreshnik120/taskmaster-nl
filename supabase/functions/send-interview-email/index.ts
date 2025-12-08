import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InterviewEmailRequest {
  applicationId: string;
  taskId?: string;
  candidateEmail: string;
  candidateName: string;
  candidatePhone?: string;
  functieNiveau?: string;
  scheduledAt: string;
  duration: number;
  locationType: string;
  locationDetails?: string;
  notes?: string;
  recruiterName?: string;
  createCalendarEvent?: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: InterviewEmailRequest = await req.json();
    
    console.log("[send-interview-email] Received request:", {
      applicationId: body.applicationId,
      candidateEmail: body.candidateEmail,
      candidateName: body.candidateName,
      scheduledAt: body.scheduledAt,
    });

    const {
      applicationId,
      taskId,
      candidateEmail,
      candidateName,
      candidatePhone,
      functieNiveau,
      scheduledAt,
      duration,
      locationType,
      locationDetails,
      notes,
      recruiterName = "Het recruitmentteam",
      createCalendarEvent = false,
    } = body;

    // Validate required fields
    if (!candidateEmail || !candidateName || !scheduledAt) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format date and time
    const date = new Date(scheduledAt);
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Europe/Amsterdam",
    };
    const formattedDate = date.toLocaleDateString("nl-NL", options);
    const formattedTime = date.toLocaleTimeString("nl-NL", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Amsterdam",
    });

    // Build location text
    let locationText = "";
    let locationIcon = "📍";
    switch (locationType) {
      case "kantoor":
        locationIcon = "🏢";
        locationText = locationDetails || "Op kantoor";
        break;
      case "video":
        locationIcon = "💻";
        locationText = "Via Microsoft Teams (link volgt)";
        break;
      case "telefoon":
        locationIcon = "📞";
        locationText = candidatePhone ? `Telefonisch op ${candidatePhone}` : "Telefonisch";
        break;
      default:
        locationText = locationDetails || "Nader te bepalen";
    }

    // Build HTML email
    const htmlEmail = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bevestiging Interview</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="background: linear-gradient(135deg, #0070f3 0%, #00a8ff 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Bevestiging Interview</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">ABCzorg / CitoZorg</p>
  </div>
  
  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e9ecef; border-top: none;">
    
    <p style="font-size: 16px; margin-bottom: 20px;">Beste ${candidateName},</p>
    
    <p style="margin-bottom: 25px;">Graag bevestigen we de interview afspraak:</p>
    
    <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #0070f3;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; width: 40px; vertical-align: top;">📅</td>
          <td style="padding: 8px 0; font-weight: 600;">Datum</td>
          <td style="padding: 8px 0; text-align: right;">${formattedDate}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; vertical-align: top;">🕐</td>
          <td style="padding: 8px 0; font-weight: 600;">Tijd</td>
          <td style="padding: 8px 0; text-align: right;">${formattedTime} uur</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; vertical-align: top;">⏱️</td>
          <td style="padding: 8px 0; font-weight: 600;">Duur</td>
          <td style="padding: 8px 0; text-align: right;">${duration} minuten</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; vertical-align: top;">${locationIcon}</td>
          <td style="padding: 8px 0; font-weight: 600;">Locatie</td>
          <td style="padding: 8px 0; text-align: right;">${locationText}</td>
        </tr>
        ${functieNiveau ? `
        <tr>
          <td style="padding: 8px 0; vertical-align: top;">💼</td>
          <td style="padding: 8px 0; font-weight: 600;">Functie</td>
          <td style="padding: 8px 0; text-align: right;">${functieNiveau}</td>
        </tr>
        ` : ""}
      </table>
    </div>
    
    ${locationType === "video" ? `
    <div style="background: #e7f5ff; border-radius: 8px; padding: 15px; margin-bottom: 25px;">
      <p style="margin: 0; color: #1971c2; font-size: 14px;">
        💡 <strong>Let op:</strong> Je ontvangt voor aanvang een Teams-uitnodiging met de link om in te bellen.
      </p>
    </div>
    ` : ""}
    
    ${notes ? `
    <div style="background: #fff3cd; border-radius: 8px; padding: 15px; margin-bottom: 25px;">
      <p style="margin: 0; font-size: 14px;">
        <strong>Opmerking:</strong> ${notes}
      </p>
    </div>
    ` : ""}
    
    <p style="margin-bottom: 25px;">We kijken ernaar uit om je te spreken!</p>
    
    <div style="border-top: 1px solid #e9ecef; padding-top: 20px; margin-top: 25px;">
      <p style="margin: 0; color: #666;">Met vriendelijke groet,</p>
      <p style="margin: 5px 0 0 0; font-weight: 600;">${recruiterName}</p>
      <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">ABCzorg / CitoZorg</p>
    </div>
    
  </div>
  
  <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
    <p style="margin: 0;">Dit is een automatisch gegenereerde email.</p>
    <p style="margin: 5px 0 0 0;">© ${new Date().getFullYear()} ABCzorg / CitoZorg</p>
  </div>
  
</body>
</html>
    `;

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ==========================================================
    // UNIFIED EMAIL ROUTING: Send via n8n/Outlook (not Resend)
    // ==========================================================
    const n8nWebhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
    
    let emailResult: any = { sent_via: 'none', success: false };
    
    if (n8nWebhookUrl) {
      console.log("[send-interview-email] Sending via n8n webhook...");
      
      try {
        const webhookUrl = `${n8nWebhookUrl}/interview-email`;
        const callbackUrl = `${supabaseUrl}/functions/v1/n8n-webhook-bridge`;
        
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action_type: "send_interview_email",
            candidateEmail,
            candidateName,
            candidatePhone,
            functieNiveau,
            emailSubject: "Bevestiging interview afspraak",
            emailHtml: htmlEmail,
            scheduledAt,
            duration,
            locationType,
            locationDetails,
            notes,
            recruiterName,
            applicationId,
            taskId,
            createCalendarEvent,
            callback_url: callbackUrl
          })
        });
        
        if (response.ok) {
          const n8nData = await response.json().catch(() => ({}));
          emailResult = { 
            sent_via: 'n8n_outlook', 
            success: true, 
            n8n_response: n8nData,
            message: "Email verzonden via n8n/Outlook"
          };
          console.log("[send-interview-email] n8n response:", n8nData);
        } else {
          const errorText = await response.text();
          console.error("[send-interview-email] n8n error:", response.status, errorText);
          emailResult = { 
            sent_via: 'n8n_failed', 
            success: false, 
            error: `n8n returned ${response.status}: ${errorText}` 
          };
        }
      } catch (n8nError) {
        console.error("[send-interview-email] n8n exception:", n8nError);
        emailResult = { 
          sent_via: 'n8n_exception', 
          success: false, 
          error: n8nError instanceof Error ? n8nError.message : String(n8nError) 
        };
      }
    } else {
      console.log("[send-interview-email] N8N_WEBHOOK_URL not configured - email not sent");
      emailResult = { 
        sent_via: 'simulated', 
        success: true, 
        message: "Email gesimuleerd (n8n niet geconfigureerd)",
        emailHtml: htmlEmail
      };
    }

    // Log system event for AI learning
    await supabase.from("system_events").insert({
      org_id: null,
      user_id: null,
      event_type: "interview_email_sent",
      entity_type: "application",
      entity_id: applicationId,
      event_data: {
        candidate_name: candidateName,
        candidate_email: candidateEmail,
        scheduled_at: scheduledAt,
        duration,
        location_type: locationType,
        email_result: emailResult.sent_via,
      },
      metadata: {
        task_id: taskId,
        functie_niveau: functieNiveau,
        create_calendar_event: createCalendarEvent
      },
    });

    // Log to application_conversations for history
    await supabase.from("application_conversations").insert({
      application_id: applicationId,
      role: "system",
      content: `Interview bevestigingsmail ${emailResult.success ? 'verzonden' : 'geprobeerd'} naar ${candidateEmail} voor ${formattedDate} om ${formattedTime}${emailResult.sent_via === 'simulated' ? ' (gesimuleerd)' : ''}`,
      metadata: {
        email_type: "interview_confirmation",
        scheduled_at: scheduledAt,
        sent_via: emailResult.sent_via,
        success: emailResult.success
      },
    });

    return new Response(
      JSON.stringify({
        success: emailResult.success,
        sent_via: emailResult.sent_via,
        message: emailResult.success 
          ? "Interview email verstuurd via n8n/Outlook" 
          : `Email kon niet worden verstuurd: ${emailResult.error}`,
        ...emailResult
      }),
      {
        status: emailResult.success ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[send-interview-email] Error:", error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
