import { Resend } from "https://esm.sh/resend@4.0.0";
import { handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

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
  organization?: string; // 'citozorg' or 'abczorg'
}

// Organization email configuration
// Reply-To uses Resend default inbound domain (purring-bat.resend.app) which is verified and working
const ORG_EMAIL_CONFIG: Record<string, { from: string; name: string; replyTo: string }> = {
  'citozorg': {
    from: 'personeel@citozorg.nl',
    name: 'CitoZorg Recruitment',
    replyTo: 'recruitment@purring-bat.resend.app' // Werkende Resend default inbound
  },
  'abczorg': {
    from: 'personeel@citozorg.nl', // Using citozorg.nl (verified) until abczorg.nl is added to Resend
    name: 'ABCzorg Recruitment',
    replyTo: 'recruitment@purring-bat.resend.app' // Werkende Resend default inbound
  }
};

Deno.serve(async (req: Request): Promise<Response> => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const body: InterviewEmailRequest = await req.json();
    
    console.log("[send-interview-email] Received request:", {
      applicationId: body.applicationId,
      candidateEmail: body.candidateEmail,
      candidateName: body.candidateName,
      scheduledAt: body.scheduledAt,
      organization: body.organization
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
      organization = 'citozorg'
    } = body;

    // Validate required fields
    if (!candidateEmail || !candidateName || !scheduledAt) {
      return errorResponse("Missing required fields", 400);
    }

    // Get email configuration for organization
    const emailConfig = ORG_EMAIL_CONFIG[organization] || ORG_EMAIL_CONFIG['citozorg'];
    const orgName = organization === 'abczorg' ? 'ABCzorg' : 'CitoZorg';

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
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">${orgName}</p>
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
      <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">${orgName}</p>
    </div>
    
  </div>
  
  <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
    <p style="margin: 0;">Dit is een automatisch gegenereerde email.</p>
    <p style="margin: 5px 0 0 0;">© ${new Date().getFullYear()} ${orgName}</p>
  </div>
  
</body>
</html>
    `;

    // Initialize clients
    const supabase = createAdminClient();
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const resend = new Resend(resendApiKey);

    // ==========================================================
    // SEND VIA RESEND (Direct, no n8n dependency for email)
    // ==========================================================
    console.log(`[send-interview-email] Sending via Resend as ${emailConfig.name}...`);
    
    let emailResult: any = { sent_via: 'none', success: false };
    
    try {
      const resendResponse = await resend.emails.send({
        from: `${emailConfig.name} <${emailConfig.from}>`,
        to: [candidateEmail],
        replyTo: emailConfig.replyTo,
        subject: "Bevestiging interview afspraak",
        html: htmlEmail,
      });

      console.log("[send-interview-email] Resend response:", resendResponse);

      if (resendResponse.error) {
        console.error("[send-interview-email] Resend error:", resendResponse.error);
        emailResult = { 
          sent_via: 'resend_failed', 
          success: false, 
          error: resendResponse.error.message 
        };
      } else {
        emailResult = { 
          sent_via: 'resend', 
          success: true, 
          email_id: resendResponse.data?.id,
          message: `Email verzonden via Resend naar ${candidateEmail}`
        };
      }
    } catch (resendError: any) {
      console.error("[send-interview-email] Resend exception:", resendError);
      emailResult = { 
        sent_via: 'resend_exception', 
        success: false, 
        error: resendError.message 
      };
    }

    // ==========================================================
    // CALENDAR EVENT: Still send to n8n if requested
    // ==========================================================
    if (createCalendarEvent) {
      const n8nWebhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
      
      if (n8nWebhookUrl) {
        console.log("[send-interview-email] Creating calendar event via n8n...");
        
        try {
          const webhookUrl = `${n8nWebhookUrl}/calendar-event`;
          
          const calendarResponse = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action_type: "create_calendar_event",
              title: `Interview ${candidateName}${functieNiveau ? ` - ${functieNiveau}` : ''}`,
              start: scheduledAt,
              end: new Date(new Date(scheduledAt).getTime() + duration * 60 * 1000).toISOString(),
              attendees: [candidateEmail],
              location: locationType === 'video' ? 'Microsoft Teams' : locationDetails,
              description: `Interview met ${candidateName}${notes ? `\n\nOpmerkingen: ${notes}` : ''}`,
              create_teams_link: locationType === 'video',
              organization: organization,
              application_id: applicationId
            })
          });
          
          if (calendarResponse.ok) {
            const calendarData = await calendarResponse.json().catch(() => ({}));
            emailResult.calendar_created = true;
            emailResult.calendar_response = calendarData;
            console.log("[send-interview-email] Calendar event created:", calendarData);
          } else {
            console.error("[send-interview-email] Calendar creation failed:", await calendarResponse.text());
            emailResult.calendar_created = false;
          }
        } catch (calError: any) {
          console.error("[send-interview-email] Calendar exception:", calError);
          emailResult.calendar_created = false;
          emailResult.calendar_error = calError.message;
        }
      }
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
        organization
      },
      metadata: {
        task_id: taskId,
        functie_niveau: functieNiveau,
        create_calendar_event: createCalendarEvent,
        calendar_created: emailResult.calendar_created
      },
    });

    // Log to application_conversations for history
    await supabase.from("application_conversations").insert({
      application_id: applicationId,
      role: "system",
      content: `Interview bevestigingsmail ${emailResult.success ? 'verzonden' : 'geprobeerd'} naar ${candidateEmail} voor ${formattedDate} om ${formattedTime}`,
      metadata: {
        email_type: "interview_confirmation",
        scheduled_at: scheduledAt,
        sent_via: emailResult.sent_via,
        success: emailResult.success,
        organization
      },
    });

    return jsonResponse({
      success: emailResult.success,
      sent_via: emailResult.sent_via,
      message: emailResult.success 
        ? `Interview email verstuurd via Resend` 
        : `Email kon niet worden verstuurd: ${emailResult.error}`,
      ...emailResult
    }, emailResult.success ? 200 : 500);
  } catch (error: any) {
    console.error("[send-interview-email] Error:", error);
    return errorResponse(error.message, 500);
  }
});
