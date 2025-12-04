import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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

    // Send email via Resend API
    console.log("[send-interview-email] Sending email to:", candidateEmail);
    
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ABCzorg <onboarding@resend.dev>",
        to: [candidateEmail],
        subject: "Bevestiging interview afspraak",
        html: htmlEmail,
      }),
    });

    const emailData = await emailResponse.json();
    
    if (!emailResponse.ok) {
      console.error("[send-interview-email] Resend error:", emailData);
      throw new Error(emailData.message || "Failed to send email");
    }

    console.log("[send-interview-email] Email sent successfully:", emailData);

    // Log to Supabase for audit trail
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
        email_id: emailData.id,
      },
      metadata: {
        task_id: taskId,
        functie_niveau: functieNiveau,
      },
    });

    // Also log to application_conversations for history
    await supabase.from("application_conversations").insert({
      application_id: applicationId,
      role: "system",
      content: `Interview bevestigingsmail verzonden naar ${candidateEmail} voor ${formattedDate} om ${formattedTime}`,
      metadata: {
        email_type: "interview_confirmation",
        email_id: emailData.id,
        scheduled_at: scheduledAt,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        emailId: emailData.id,
        message: "Interview email sent successfully",
      }),
      {
        status: 200,
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
