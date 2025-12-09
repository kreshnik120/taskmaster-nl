import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Email types supported by this function
type EmailType = 
  | 'followup_question'     // Vraag ontbrekende info aan kandidaat
  | 'document_request'      // Vraag VOG, diploma's, certificaten
  | 'interview_confirmation' // Bevestig interview afspraak
  | 'appointment_confirmation' // Algemene afspraak bevestiging
  | 'general'               // Algemene communicatie
  | 'welcome'               // Welkomstmail nieuwe kandidaat
  | 'status_update';        // Status update (goedgekeurd, afgewezen, etc.)

interface SendEmailRequest {
  email_type: EmailType;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  
  // Pre-generated HTML (if available from AI)
  html_content?: string;
  plain_text?: string;
  
  // Structured data for template generation
  template_data?: {
    // For followup_question
    fields_to_ask?: string[];
    current_completeness?: number;
    follow_up_count?: number;
    
    // For document_request
    documents?: string[];
    deadline?: string;
    urgent?: boolean;
    
    // For interview/appointment
    scheduled_at?: string;
    duration?: number;
    location_type?: string;
    location_details?: string;
    meeting_link?: string;
    
    // For status_update
    new_status?: string;
    status_message?: string;
    
    // General
    [key: string]: any;
  };
  
  // Metadata for logging
  application_id?: string;
  professional_id?: string;
  org_id?: string;
  
  // Reply-to settings
  reply_to?: string;
}

// Organization email configuration
// NOTE: ABCzorg uses citozorg.nl domain because abczorg.nl is not yet verified in Resend
const ORG_EMAIL_CONFIG: Record<string, { from: string; name: string; replyTo: string }> = {
  'citozorg': {
    from: 'personeel@citozorg.nl',
    name: 'CitoZorg Recruitment',
    replyTo: 'personeel@citozorg.nl'
  },
  'abczorg': {
    from: 'personeel@citozorg.nl', // Using citozorg.nl (verified) until abczorg.nl is added to Resend
    name: 'ABCzorg Recruitment',
    replyTo: 'personeel@citozorg.nl'
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: SendEmailRequest = await req.json();
    
    console.log("[send-ai-email] Received request:", {
      email_type: body.email_type,
      recipient_email: body.recipient_email,
      recipient_name: body.recipient_name,
      subject: body.subject,
      org_id: body.org_id
    });

    const {
      email_type,
      recipient_email,
      recipient_name,
      subject,
      html_content,
      plain_text,
      template_data = {},
      application_id,
      professional_id,
      org_id,
      reply_to
    } = body;

    // Validate required fields
    if (!recipient_email || !subject) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: recipient_email, subject" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(resendApiKey);

    // Determine organization from org_id
    let organization = 'citozorg'; // default
    if (org_id === '550e8400-e29b-41d4-a716-446655440000') {
      organization = 'abczorg';
    }

    // Get email configuration for organization
    const emailConfig = ORG_EMAIL_CONFIG[organization] || ORG_EMAIL_CONFIG['citozorg'];
    
    // Build HTML content if not provided
    let finalHtmlContent = html_content;
    if (!finalHtmlContent) {
      finalHtmlContent = generateEmailTemplate(email_type, recipient_name, subject, template_data, organization);
    }

    console.log(`[send-ai-email] Sending via Resend as ${emailConfig.name}`);

    // Send email via Resend
    const emailResult = await resend.emails.send({
      from: `${emailConfig.name} <${emailConfig.from}>`,
      to: [recipient_email],
      replyTo: reply_to || emailConfig.replyTo,
      subject: subject,
      html: finalHtmlContent,
      text: plain_text,
    });

    console.log("[send-ai-email] Resend response:", emailResult);

    // Log to system_events for AI learning
    await supabase.from("system_events").insert({
      org_id: org_id || null,
      user_id: null,
      event_type: `email_sent_${email_type}`,
      entity_type: application_id ? "application" : professional_id ? "professional" : "email",
      entity_id: application_id || professional_id || emailResult.data?.id,
      event_data: {
        email_type,
        recipient_email,
        recipient_name,
        subject,
        sent_via: 'resend',
        organization,
        success: !emailResult.error
      },
      metadata: {
        resend_email_id: emailResult.data?.id,
        template_data
      }
    });

    // Log to application_conversations if application_id is provided
    if (application_id) {
      await supabase.from("application_conversations").insert({
        application_id,
        role: "assistant",
        content: `Email verzonden: ${subject}`,
        metadata: {
          email_type,
          resend_email_id: emailResult.data?.id,
          sent_via: 'resend',
          organization,
          template_data
        }
      });
    }

    if (emailResult.error) {
      console.error("[send-ai-email] Resend error:", emailResult.error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: emailResult.error.message,
          sent_via: 'resend'
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent_via: 'resend',
        organization,
        email_id: emailResult.data?.id,
        message: `Email verzonden naar ${recipient_email}`
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[send-ai-email] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

// Generate email template based on type
function generateEmailTemplate(
  emailType: EmailType, 
  recipientName: string, 
  subject: string, 
  data: Record<string, any>,
  organization: string
): string {
  const orgName = organization === 'abczorg' ? 'ABCzorg' : 'CitoZorg';
  const orgColor = organization === 'abczorg' ? '#0070f3' : '#667eea';
  
  const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, ${orgColor} 0%, #764ba2 100%); padding: 25px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">${orgName}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 35px 30px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 13px;">
                ${orgName} - Kwaliteit in Zorg
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 12px;">
                <a href="mailto:personeel@${organization}.nl" style="color: ${orgColor}; text-decoration: none;">personeel@${organization}.nl</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  let content = '';
  
  switch (emailType) {
    case 'followup_question':
      const fields = data.fields_to_ask || [];
      const fieldsList = fields.map((f: string) => `<li style="margin: 8px 0;">${f}</li>`).join('');
      content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Beste ${recipientName},</h2>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          Bedankt voor je interesse in ${orgName}! Om je sollicitatie compleet te maken, hebben we nog enkele gegevens nodig:
        </p>
        <ul style="background-color: #fef3c7; padding: 20px 20px 20px 40px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #f59e0b; color: #1a1a1a;">
          ${fieldsList}
        </ul>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">
          Je kunt eenvoudig op deze email antwoorden met de gevraagde informatie.
        </p>
        <p style="margin: 25px 0 0 0; color: #4a5568;">
          Met vriendelijke groet,<br>
          <strong>Het ${orgName} Recruitment Team</strong>
        </p>`;
      break;

    case 'document_request':
      const docs = data.documents || [];
      const docsList = docs.map((d: string) => `<li style="margin: 8px 0;">${d}</li>`).join('');
      const deadlineText = data.deadline ? ` vóór <strong>${new Date(data.deadline).toLocaleDateString('nl-NL')}</strong>` : '';
      content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Beste ${recipientName},</h2>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          Om je onboarding bij ${orgName} af te ronden, hebben we de volgende documenten nodig${deadlineText}:
        </p>
        <ul style="background-color: #e7f5ff; padding: 20px 20px 20px 40px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #0070f3; color: #1a1a1a;">
          ${docsList}
        </ul>
        ${data.urgent ? '<p style="color: #dc2626; font-weight: 600;">⚠️ Dit is een urgent verzoek.</p>' : ''}
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">
          Je kunt de documenten als bijlage naar deze email sturen.
        </p>
        <p style="margin: 25px 0 0 0; color: #4a5568;">
          Met vriendelijke groet,<br>
          <strong>Het ${orgName} Recruitment Team</strong>
        </p>`;
      break;

    case 'status_update':
      content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Beste ${recipientName},</h2>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          ${data.status_message || `De status van je sollicitatie is bijgewerkt naar: ${data.new_status}`}
        </p>
        <p style="margin: 25px 0 0 0; color: #4a5568;">
          Met vriendelijke groet,<br>
          <strong>Het ${orgName} Recruitment Team</strong>
        </p>`;
      break;

    case 'welcome':
      content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Welkom bij ${orgName}, ${recipientName}! 🎉</h2>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          We zijn blij je te verwelkomen in ons team. Je profiel is nu actief en we gaan actief op zoek naar passende opdrachten voor jou.
        </p>
        <div style="background-color: #d1fae5; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #10b981;">
          <p style="margin: 0; color: #065f46; font-weight: 600;">✅ Je profiel is goedgekeurd!</p>
          <p style="margin: 8px 0 0 0; color: #047857; font-size: 14px;">
            Zodra we een passende opdracht hebben, nemen we contact met je op.
          </p>
        </div>
        <p style="margin: 25px 0 0 0; color: #4a5568;">
          Met vriendelijke groet,<br>
          <strong>Het ${orgName} Recruitment Team</strong>
        </p>`;
      break;

    default:
      content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Beste ${recipientName},</h2>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">
          ${data.message || subject}
        </p>
        <p style="margin: 25px 0 0 0; color: #4a5568;">
          Met vriendelijke groet,<br>
          <strong>Het ${orgName} Recruitment Team</strong>
        </p>`;
  }

  return baseTemplate(content);
}

serve(handler);
