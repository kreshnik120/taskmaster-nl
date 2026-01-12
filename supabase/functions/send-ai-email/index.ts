import { Resend } from "https://esm.sh/resend@4.0.0";
import { handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import { getOrganizationById, getEmailConfig } from '../_shared/healthcare-mappings.ts';

// Email types supported by this function
type EmailType = 
  | 'followup_question'              // Vraag ontbrekende info aan kandidaat
  | 'document_request'               // Vraag VOG, diploma's, certificaten
  | 'document_renewal_request'       // Herinnering verlopen documenten met urgentie
  | 'document_renewal_escalation'    // Tweede urgente herinnering (na 7 dagen)
  | 'recruiter_document_alert'       // Notificatie naar recruiter (na 14 dagen)
  | 'diploma_upgrade_notification'   // Notificatie naar recruiter bij DUO verificatie success
  | 'interview_confirmation'         // Bevestig interview afspraak
  | 'appointment_confirmation'       // Algemene afspraak bevestiging
  | 'general'                        // Algemene communicatie
  | 'welcome'                        // Welkomstmail GEPLAATSTE professional (profiel actief)
  | 'welcome_intake'                 // Welkomstmail NIEUWE sollicitant + intake vragen
  | 'status_update'                  // Status update (goedgekeurd, afgewezen, etc.)
  | 'vog_rejection'                  // VOG verificatie mislukt, vraag nieuw VOG
  | 'rejection'                      // Afwijzing sollicitatie (geen diploma, etc.)
  | 'emrex_invitation'               // EMREX diploma verificatie uitnodiging
  | 'emrex_reminder'                 // EMREX herinnering na 48 uur
  | 'vog_verified_notification'      // Notificatie naar recruiter bij VOG GAAV verificatie success
  | 'interview_availability_request'; // Master Prompt: 3 interview opties voorstellen

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
    
    // For document_renewal_request
    document_type?: string;
    days_remaining?: number;
    expiry_date?: string;
    renewal_context?: string;
    
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

// Organization email configuration - now uses shared healthcare-mappings
// NOTE: This constant is kept for backward compatibility but getEmailConfig() is preferred

/**
 * Genereer standaard subject op basis van email type
 * Ondersteunt alle email types conform Master Prompt templates
 */
function generateDefaultSubject(
  emailType: EmailType, 
  recipientName: string, 
  organization: string
): string {
  const orgName = organization === 'abczorg' ? 'ABCzorg' : 'CitoZorg';
  
  switch (emailType) {
    case 'welcome':
      return `Welkom bij ${orgName}, ${recipientName}! 🎉`;
    case 'welcome_intake':
      return `Welkom bij ${orgName} – nog een paar vragen`;
    case 'followup_question':
      return `${orgName}: Aanvulling nodig voor je aanmelding`;
    case 'document_request':
      return `${orgName}: Documentenverzoek voor je sollicitatie`;
    case 'document_renewal_request':
      return `${orgName}: Actie vereist - Document verloopt binnenkort`;
    case 'document_renewal_escalation':
      return `⚠️ ${orgName}: Urgent - Document dreigt te verlopen`;
    case 'recruiter_document_alert':
      return `[Intern] Document alert: ${recipientName}`;
    case 'diploma_upgrade_notification':
      return `[Intern] Diploma gevalideerd: ${recipientName}`;
    case 'interview_confirmation':
      return `${orgName}: Bevestiging intakegesprek`;
    case 'appointment_confirmation':
      return `${orgName}: Bevestiging afspraak`;
    case 'status_update':
      return `${orgName}: Update over je sollicitatie`;
    case 'vog_rejection':
      return `${orgName}: Actie vereist - VOG verificatie`;
    case 'rejection':
      return `${orgName}: Update op je aanmelding`;
    case 'emrex_invitation':
      return `${orgName}: Diploma verificatie via EMREX`;
    case 'emrex_reminder':
      return `${orgName}: Herinnering - Diploma verificatie`;
    case 'vog_verified_notification':
      return `[Intern] VOG geverifieerd: ${recipientName}`;
    case 'interview_availability_request':
      return `${orgName}: Intakegesprek inplannen — kies een moment`;
    case 'general':
    default:
      return `${orgName}: Bericht van het recruitment team`;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

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

    // Validate required fields - subject is now optional (auto-generated)
    if (!recipient_email) {
      return errorResponse("Missing required field: recipient_email", 400);
    }

    // Initialize clients
    const supabase = createAdminClient();
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const resend = new Resend(resendApiKey);

    // Get organization info using shared healthcare-mappings
    const orgInfo = getOrganizationById(org_id);
    const emailConfig = getEmailConfig(org_id);
    
    // Auto-generate subject if not provided (Master Prompt feature)
    const finalSubject = subject || generateDefaultSubject(email_type, recipient_name, orgInfo.name);
    
    console.log(`[send-ai-email] Using org: ${orgInfo.displayName} (${orgInfo.name})`);
    console.log(`[send-ai-email] Subject: provided=${!!subject}, generated=${!subject}, final="${finalSubject}"`);
    
    // DATABASE FALLBACK: If fields_to_ask is empty and application_id is available, query database
    // This prevents empty yellow boxes in followup emails
    // ENHANCED: Priority chain - agent_goals.remaining_missing_info → applications.missing_info
    let enrichedTemplateData = { ...template_data };
    if (email_type === 'followup_question' && 
        (!enrichedTemplateData.fields_to_ask || enrichedTemplateData.fields_to_ask.length === 0) && 
        application_id) {
      console.log('📋 [send-ai-email] fields_to_ask empty, querying database for application:', application_id);
      
      // STEP 1: Check most recent agent_goal for remaining_missing_info (most accurate)
      const { data: goalData } = await supabase
        .from('agent_goals')
        .select('input_data')
        .or(`input_data->>application_id.eq.${application_id},input_data->context->>application_id.eq.${application_id}`)
        .in('status', ['completed', 'executing_react', 'executing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (goalData?.input_data?.remaining_missing_info && Array.isArray(goalData.input_data.remaining_missing_info) && goalData.input_data.remaining_missing_info.length > 0) {
        enrichedTemplateData.fields_to_ask = goalData.input_data.remaining_missing_info;
        enrichedTemplateData.rejection_context = goalData.input_data?.rejection_context || enrichedTemplateData.rejection_context || {};
        console.log('✅ [send-ai-email] Got remaining_missing_info from agent_goals:', enrichedTemplateData.fields_to_ask);
        console.log('✅ [send-ai-email] Got rejection_context from agent_goals:', JSON.stringify(enrichedTemplateData.rejection_context));
      } else {
        // STEP 2: Fallback to professional_applications.missing_info
        const { data: appData } = await supabase
          .from('professional_applications')
          .select('missing_info')
          .eq('id', application_id)
          .single();
        
        if (appData?.missing_info && appData.missing_info.length > 0) {
          enrichedTemplateData.fields_to_ask = appData.missing_info;
          console.log('✅ [send-ai-email] Got missing_info from applications (fallback):', enrichedTemplateData.fields_to_ask);
        }
      }
    }
    
    // Build HTML content if not provided
    let finalHtmlContent = html_content;
    if (!finalHtmlContent) {
      finalHtmlContent = generateEmailTemplate(email_type, recipient_name, finalSubject, enrichedTemplateData, orgInfo.name);
    }

    console.log(`[send-ai-email] Sending via Resend as ${emailConfig.name}`);

    // Send email via Resend
    const emailResult = await resend.emails.send({
      from: `${emailConfig.name} <${emailConfig.from}>`,
      to: [recipient_email],
      replyTo: reply_to || emailConfig.replyTo,
      subject: finalSubject,
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
        subject: finalSubject,
        sent_via: 'resend',
        organization: orgInfo.name,
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
        content: `Email verzonden: ${finalSubject}`,
        metadata: {
          email_type,
          resend_email_id: emailResult.data?.id,
          sent_via: 'resend',
          organization: orgInfo.name,
          template_data
        }
      });
    }

    if (emailResult.error) {
      console.error("[send-ai-email] Resend error:", emailResult.error);
      return jsonResponse({ 
        success: false, 
        error: emailResult.error.message,
        sent_via: 'resend'
      }, 500);
    }

    return jsonResponse({
      success: true,
      sent_via: 'resend',
      organization: orgInfo.name,
      email_id: emailResult.data?.id,
      message: `Email verzonden naar ${recipient_email}`
    });

  } catch (error: any) {
    console.error("[send-ai-email] Error:", error);
    return errorResponse(error.message, 500);
  }
});

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
      // NOTE: fields_to_ask fallback is now handled before generateEmailTemplate is called
      const fields = data.fields_to_ask || [];
      
      // FIX 3: Human-friendly field labels for better UX
      const FIELD_LABEL_MAP: Record<string, string> = {
        // Text fields
        'telefoonnummer': 'Geldig telefoonnummer',
        'telefoonnummer (echt nummer, geen placeholder zoals 06-12345678)': 'Geldig telefoonnummer (geen testwaarde zoals 06-12345678)',
        'functie_niveau': 'Functieniveau (bijv. Niveau 3, 4, of 5)',
        'werkvorm': 'Werkvorm (ZZP of Uitzendkracht)',
        'regio': 'Regio/woonplaats',
        'beschikbaarheid': 'Beschikbaarheid (uren per week)',
        'diploma': 'Diploma informatie',
        'naam': 'Volledige naam',
        'email': 'E-mailadres',
        
        // Document upload fields
        'cv_upload': 'CV document (PDF)',
        'diploma_upload': 'Diploma document (PDF)',
        'vog_upload': 'Verklaring Omtrent Gedrag (VOG)',
        
        // Verification fields (pending)
        'diploma_verificatie': 'Diploma verificatie (in behandeling)',
        'vog_verificatie': 'VOG verificatie (in behandeling)',
        'cv_verificatie': 'CV verificatie (in behandeling)',
        
        // Expired documents
        'diploma_verlopen': 'Diploma is verlopen - graag nieuwe uploaden',
        'vog_verlopen': 'VOG is verlopen - graag nieuwe aanvragen',
        
        // ZZP-specific
        'kvk_nummer': 'KvK-nummer',
        'iban': 'IBAN rekeningnummer',
        'bedrijfsnaam': 'Bedrijfsnaam',
        'beroepsaansprakelijkheidsverzekering': 'Beroepsaansprakelijkheidsverzekering',
        'identiteitsbewijs': 'Identiteitsbewijs (voor- en achterkant)',
        'wkkgz_registratie': 'WKKGZ-registratie',
      };
      
      const fieldsList = fields.map((f: string) => {
        const label = FIELD_LABEL_MAP[f.toLowerCase()] || FIELD_LABEL_MAP[f] || f;
        return `<li style="margin: 8px 0;">${label}</li>`;
      }).join('');
      
      // FIX 3: Build rejection context section if present
      const rejectionContext = data.rejection_context || {};
      const hasRejections = Object.keys(rejectionContext).length > 0;
      const rejectionItems = Object.entries(rejectionContext).map(([field, ctx]: [string, any]) => 
        `<li style="margin: 8px 0;">
          <strong>${field}</strong>: "${ctx.provided_value || 'onbekend'}" - ${ctx.rejected_reason || 'afgewezen'}.
          ${ctx.suggestion ? `<br><em style="color: #065f46;">💡 ${ctx.suggestion}</em>` : ''}
        </li>`
      ).join('');
      
      const rejectionSection = hasRejections ? `
        <div style="background-color: #fef2f2; padding: 15px 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 0 0 10px 0; font-weight: 600; color: #991b1b;">⚠️ Let op bij de volgende gegevens:</p>
          <ul style="margin: 0; padding-left: 20px; color: #7f1d1d;">
            ${rejectionItems}
          </ul>
        </div>
      ` : '';
      
      // FIX 4: Fallback to AI generated content if fields are empty
      const aiGeneratedContent = data.ai_generated_content;
      const hasAiContent = aiGeneratedContent && typeof aiGeneratedContent === 'string' && aiGeneratedContent.length > 50;
      
      if (hasAiContent && fields.length === 0 && !hasRejections) {
        // Use AI's free-text content as main email body
        content = `
          <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Beste ${recipientName || 'sollicitant'},</h2>
          <div style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px; white-space: pre-line;">
            ${aiGeneratedContent}
          </div>
          <p style="margin: 25px 0 0 0; color: #4a5568;">
            Met vriendelijke groet,<br>
            <strong>Het ${orgName} Recruitment Team</strong>
          </p>`;
      } else {
        // Standard template with rejection context and fields
        content = `
          <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Beste ${recipientName || 'sollicitant'},</h2>
          <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
            Bedankt voor je reactie! Om je sollicitatie compleet te maken, hebben we nog enkele gegevens nodig:
          </p>
          ${rejectionSection}
          <ul style="background-color: #fef3c7; padding: 20px 20px 20px 40px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #f59e0b; color: #1a1a1a;">
            ${fieldsList || '<li style="margin: 8px 0;">Controleer je eerdere reactie</li>'}
          </ul>
          <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">
            Je kunt eenvoudig op deze email antwoorden met de gevraagde informatie.
          </p>
          <p style="margin: 25px 0 0 0; color: #4a5568;">
            Met vriendelijke groet,<br>
            <strong>Het ${orgName} Recruitment Team</strong>
          </p>`;
      }
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

    case 'document_renewal_request':
      // Specifieke template voor verlopen documenten met urgentie
      const renewalDocType = data.document_type || data.documents?.[0] || 'document';
      const daysRemaining = data.days_remaining ?? 14;
      const expiryDateRenewal = data.expiry_date 
        ? new Date(data.expiry_date).toLocaleDateString('nl-NL', { 
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
          })
        : null;
      const isUrgent = daysRemaining <= 7;
      const renewalContext = data.context || data.renewal_context || '';
      
      // Urgentie-gebaseerde styling
      const urgencyBgColor = isUrgent ? '#fef2f2' : '#fef3c7';
      const urgencyBorderColor = isUrgent ? '#dc2626' : '#f59e0b';
      const urgencyTextColor = isUrgent ? '#991b1b' : '#92400e';
      const urgencyIcon = isUrgent ? '🚨' : '⏰';
      const urgencyLabel = isUrgent ? 'Dringend: Actie Vereist' : 'Herinnering: Document Verloopt Binnenkort';
      
      // Document-specifieke instructies
      const renewalInstructions: Record<string, { where: string; tip: string }> = {
        'VOG': { 
          where: 'Je kunt een nieuwe VOG aanvragen via <a href="https://www.justis.nl/producten/vog" style="color: ' + orgColor + ';">justis.nl</a>.', 
          tip: 'Let op: een VOG mag maximaal 3 maanden oud zijn.' 
        },
        'BIG-registratie': { 
          where: 'Controleer je BIG-registratie via <a href="https://www.bigregister.nl" style="color: ' + orgColor + ';">bigregister.nl</a>.', 
          tip: 'Na herregistratie ontvang je een nieuw certificaat.' 
        },
        'Diploma': { 
          where: 'Neem contact op met je onderwijsinstelling voor een gewaarmerkte kopie.', 
          tip: 'Zorg dat het een officieel document met stempel is.' 
        }
      };
      const docInstructions = renewalInstructions[renewalDocType] || { 
        where: 'Neem contact op met de juiste instantie om een vernieuwd document aan te vragen.', 
        tip: '' 
      };
      
      content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Beste ${recipientName},</h2>
        
        <div style="background-color: ${urgencyBgColor}; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid ${urgencyBorderColor};">
          <p style="margin: 0; color: ${urgencyTextColor}; font-weight: 700; font-size: 16px;">
            ${urgencyIcon} ${urgencyLabel}
          </p>
          <p style="margin: 12px 0 0 0; color: ${urgencyTextColor}; font-size: 15px; line-height: 1.5;">
            Je <strong>${renewalDocType}</strong> ${daysRemaining <= 0 ? 'is verlopen' : `verloopt over <strong>${daysRemaining} ${daysRemaining === 1 ? 'dag' : 'dagen'}</strong>`}${expiryDateRenewal ? ` (op ${expiryDateRenewal})` : ''}.
          </p>
        </div>
        
        ${renewalContext ? `<p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">${renewalContext}</p>` : ''}
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0;">
          <p style="margin: 0 0 15px 0; color: #1a1a1a; font-weight: 600; font-size: 15px;">📋 Wat moet je doen?</p>
          <ol style="color: #4a5568; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li>Vraag een vernieuwd ${renewalDocType} aan bij de juiste instantie</li>
            <li>Upload het nieuwe document door te antwoorden op deze email</li>
            <li>Zorg dat het document vóór de vervaldatum is ontvangen</li>
          </ol>
          ${docInstructions.where ? `<p style="margin: 15px 0 0 0; color: #4a5568; font-size: 14px;">${docInstructions.where}</p>` : ''}
          ${docInstructions.tip ? `<p style="margin: 8px 0 0 0; color: #6b7280; font-size: 13px; font-style: italic;">💡 ${docInstructions.tip}</p>` : ''}
        </div>
        
        ${isUrgent ? `
        <div style="background-color: #fef2f2; padding: 15px; border-radius: 6px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; color: #dc2626; font-weight: 600; font-size: 14px;">
            ⚠️ Zonder geldig ${renewalDocType} kunnen we je huidige plaatsing(en) mogelijk niet voortzetten.
          </p>
        </div>
        ` : ''}
        
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

    // =====================================================
    // NEW: Welcome + Intake - Voor NIEUWE sollicitanten met intake vragen
    // =====================================================
    case 'welcome_intake':
      const intakeFields = data.fields_to_ask || data.missing_info || [];
      const intakeFieldsList = intakeFields.map((f: string) => `<li style="margin: 8px 0;">${f}</li>`).join('');
      const hasExtractedData = data.extracted_data && Object.keys(data.extracted_data).length > 0;
      const extractedInfo = hasExtractedData 
        ? Object.entries(data.extracted_data)
            .filter(([_, v]) => v !== null && v !== '')
            .slice(0, 5)
            .map(([k, v]) => `<li style="margin: 4px 0;"><strong>${k}:</strong> ${Array.isArray(v) ? v.join(', ') : v}</li>`)
            .join('')
        : '';
      
      content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Beste ${recipientName || 'sollicitant'},</h2>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          Bedankt voor je sollicitatie bij ${orgName}! 🎉 We hebben je gegevens ontvangen en gaan graag met je aan de slag.
        </p>
        
        ${extractedInfo ? `
        <div style="background-color: #d1fae5; padding: 16px 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #10b981;">
          <p style="margin: 0 0 8px 0; color: #065f46; font-weight: 600;">✅ Wat we al weten:</p>
          <ul style="margin: 0; padding-left: 20px; color: #047857; font-size: 14px;">
            ${extractedInfo}
          </ul>
        </div>
        ` : ''}
        
        ${intakeFieldsList ? `
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 10px;">
          Om je sollicitatie verder te kunnen behandelen, hebben we nog enkele gegevens nodig:
        </p>
        <ul style="background-color: #fef3c7; padding: 20px 20px 20px 40px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #f59e0b; color: #1a1a1a;">
          ${intakeFieldsList}
        </ul>
        ` : `
        <div style="background-color: #e0f2fe; padding: 16px 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #0284c7;">
          <p style="margin: 0; color: #0369a1; font-size: 14px;">
            We hebben alle benodigde gegevens ontvangen. We nemen zo snel mogelijk contact met je op voor de volgende stappen.
          </p>
        </div>
        `}
        
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">
          Je kunt eenvoudig op deze email antwoorden met de gevraagde informatie en eventuele documenten (CV, diploma's) als bijlage meesturen.
        </p>
        
        <div style="background-color: #f8fafc; padding: 16px 20px; border-radius: 6px; margin: 25px 0; border: 1px solid #e2e8f0;">
          <p style="margin: 0; color: #64748b; font-size: 13px;">
            📋 <strong>Tip:</strong> Hoe completer je profiel, hoe sneller we je kunnen koppelen aan passende opdrachten!
          </p>
        </div>
        
        <p style="margin: 25px 0 0 0; color: #4a5568;">
          Met vriendelijke groet,<br>
          <strong>Het ${orgName} Recruitment Team</strong>
        </p>`;
      break;

    case 'vog_rejection':
      const rejectionReason = data.rejection_reason || 'unknown';
      const rejectionMessage = data.rejection_message || 'niet gevalideerd kunnen worden';
      const reasonExplanations: Record<string, string> = {
        'authentic_fail': 'Het document is niet als authentiek herkend door de GAAV verificatiedienst. Dit kan betekenen dat het document is aangepast of niet van de officiële instantie komt.',
        'expired': 'Een VOG mag maximaal 3 maanden oud zijn. Het door jou aangeleverde VOG is ouder dan deze termijn.',
        'format_error': 'Het bestand kon niet worden gelezen. Dit kan komen door een beschadigd bestand of een verkeerd bestandsformaat.',
        'unknown': 'Het document kon niet worden geverifieerd.'
      };
      const explanation = reasonExplanations[rejectionReason] || reasonExplanations['unknown'];
      
      content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Beste ${recipientName},</h2>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          Helaas kon je Verklaring Omtrent het Gedrag (VOG) niet worden gevalideerd. Het document is ${rejectionMessage}.
        </p>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 0; color: #991b1b; font-weight: 600;">⚠️ VOG Verificatie Mislukt</p>
          <p style="margin: 8px 0 0 0; color: #b91c1c; font-size: 14px;">
            ${explanation}
          </p>
        </div>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 15px;">
          <strong>Wat moet je doen?</strong>
        </p>
        <ol style="color: #4a5568; font-size: 15px; line-height: 1.8; padding-left: 20px;">
          <li>Vraag een nieuwe VOG aan via <a href="https://www.justis.nl/producten/vog" style="color: ${orgColor};">justis.nl/producten/vog</a></li>
          <li>Zorg dat de VOG niet ouder is dan 3 maanden</li>
          <li>Stuur het nieuwe VOG als bijlage naar deze email</li>
        </ol>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-top: 20px;">
          Zodra we je nieuwe VOG hebben ontvangen, wordt deze automatisch geverifieerd en kun je verder in het sollicitatieproces.
        </p>
        <p style="margin: 25px 0 0 0; color: #4a5568;">
          Met vriendelijke groet,<br>
          <strong>Het ${orgName} Recruitment Team</strong>
        </p>`;
      break;

    case 'emrex_invitation':
      const emrexLink = data.emrex_link || '#';
      const expiresAt = data.expires_at ? new Date(data.expires_at).toLocaleDateString('nl-NL') : '7 dagen';
      content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Beste ${recipientName},</h2>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          Om je sollicitatie bij ${orgName} compleet te maken, vragen we je om je diploma te verifiëren via EMREX (DUO).
        </p>
        <div style="background-color: #e0f2fe; padding: 25px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #0284c7; text-align: center;">
          <p style="margin: 0 0 15px 0; color: #0369a1; font-size: 14px;">
            🎓 <strong>Diploma Verificatie via EMREX</strong>
          </p>
          <a href="${emrexLink}" style="display: inline-block; background: linear-gradient(135deg, ${orgColor} 0%, #764ba2 100%); color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">
            ➡️ Start Verificatie
          </a>
          <p style="margin: 15px 0 0 0; color: #0369a1; font-size: 12px;">
            Link geldig tot ${expiresAt}
          </p>
        </div>
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0; color: #1a1a1a; font-weight: 600;">📋 Hoe werkt het?</p>
          <ol style="color: #4a5568; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li>Klik op de knop hierboven</li>
            <li>Log in met je DigiD bij DUO</li>
            <li>Geef toestemming om je diplomagegevens te delen</li>
            <li>Klaar! Wij ontvangen automatisch een bevestiging</li>
          </ol>
        </div>
        <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
          <strong>Waarom EMREX?</strong> EMREX is een veilige Europese dienst waarmee je jouw diplomagegevens rechtstreeks vanuit DUO kunt delen. Zo weten we zeker dat je diploma authentiek is.
        </p>
        <p style="margin: 25px 0 0 0; color: #4a5568;">
          Met vriendelijke groet,<br>
          <strong>Het ${orgName} Recruitment Team</strong>
        </p>`;
      break;

    case 'rejection':
      const rejReason = data.rejection_reason || 'general';
      const rejDetails = data.rejection_details || {};
      const rejectionReasons: Record<string, { title: string; message: string; encouragement: string }> = {
        'no_healthcare_diploma': {
          title: 'Geen erkend zorgdiploma',
          message: 'Voor onze opdrachtgevers in de zorg is een erkend zorgdiploma (VIG, HBO-V, MBO-V, Verpleegkundige, Verzorgende, etc.) vereist. Helaas voldoet je huidige opleiding niet aan deze eis.',
          encouragement: 'Mocht je in de toekomst een erkend zorgdiploma behalen, nodigen we je van harte uit om opnieuw te solliciteren.'
        },
        'incomplete_documents': {
          title: 'Onvolledige documentatie',
          message: 'Ondanks meerdere verzoeken hebben we niet alle benodigde documenten ontvangen om je sollicitatie te verwerken.',
          encouragement: 'Je bent altijd welkom om opnieuw te solliciteren met een volledige set documenten.'
        },
        'vog_issues': {
          title: 'VOG niet in orde',
          message: 'Je Verklaring Omtrent het Gedrag (VOG) kon niet worden geverifieerd of voldoet niet aan onze eisen.',
          encouragement: 'Wanneer je een geldige VOG kunt overleggen, ben je van harte welkom om opnieuw contact op te nemen.'
        },
        'general': {
          title: 'Sollicitatie niet doorgezet',
          message: 'Na zorgvuldige overweging hebben we besloten je sollicitatie niet door te zetten.',
          encouragement: 'We wensen je veel succes met je verdere carrière en hopen je in de toekomst wellicht alsnog te mogen verwelkomen.'
        }
      };
      const rejInfo = rejectionReasons[rejReason] || rejectionReasons['general'];
      
      content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Beste ${recipientName},</h2>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          Allereerst willen we je hartelijk danken voor je interesse in ${orgName} en de tijd die je hebt genomen om te solliciteren.
        </p>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 0; color: #991b1b; font-weight: 600;">📋 ${rejInfo.title}</p>
          <p style="margin: 10px 0 0 0; color: #b91c1c; font-size: 14px; line-height: 1.6;">
            ${rejInfo.message}
          </p>
        </div>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          ${rejInfo.encouragement}
        </p>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">
          Heb je vragen over deze beslissing? Neem dan gerust contact met ons op.
        </p>
        <p style="margin: 25px 0 0 0; color: #4a5568;">
          Met vriendelijke groet en veel succes gewenst,<br>
          <strong>Het ${orgName} Recruitment Team</strong>
        </p>`;
      break;

    // =====================================================
    // Master Prompt: Interview Availability Request (3 opties)
    // =====================================================
    case 'interview_availability_request':
      const slots = data.available_slots || [];
      const slotsList = slots.map((s: { date?: string; time?: string; formatted?: string }, i: number) => 
        `<li style="margin: 8px 0;"><strong>${i+1}.</strong> ${s.formatted || (s.date + ' om ' + s.time)}</li>`
      ).join('');
      content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Beste ${recipientName},</h2>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          We plannen graag het intake-/sollicitatiegesprek. Dit zijn 3 beschikbare momenten:
        </p>
        <ol style="background-color: #e7f5ff; padding: 20px 20px 20px 40px; border-radius: 6px; margin: 20px 0; border-left: 4px solid ${orgColor}; color: #1a1a1a;">
          ${slotsList}
        </ol>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">
          Welke optie past het beste? Reageer met "1", "2" of "3".<br>
          Als geen van deze momenten kan, stuur 2-3 alternatieven (ma-vr 09:00-17:00).
        </p>
        <p style="margin: 25px 0 0 0; color: #4a5568;">
          Met vriendelijke groet,<br>
          <strong>Het ${orgName} Recruitment Team</strong>
        </p>`;
      break;
      const reminderEmrexLink = data.emrex_link || '#';
      const daysSinceInvitation = data.days_since_invitation || 2;
      content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Beste ${recipientName},</h2>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          ${daysSinceInvitation} dagen geleden hebben we je gevraagd je diploma te verifiëren. We hebben nog geen bevestiging ontvangen.
        </p>
        <div style="background-color: #fef3c7; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e; font-weight: 600;">⏰ Actie vereist</p>
          <p style="margin: 8px 0 0 0; color: #b45309; font-size: 14px;">
            Zonder geverifieerd diploma kunnen we je sollicitatie niet verder behandelen.
          </p>
        </div>
        <div style="text-align: center; margin: 25px 0;">
          <a href="${reminderEmrexLink}" style="display: inline-block; background: linear-gradient(135deg, ${orgColor} 0%, #764ba2 100%); color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">
            ➡️ Verifieer Nu via DigiD
          </a>
        </div>
        <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
          Heb je vragen of lukt het inloggen niet? Beantwoord deze email dan en we helpen je graag verder.
        </p>
        <p style="margin: 25px 0 0 0; color: #4a5568;">
          Met vriendelijke groet,<br>
          <strong>Het ${orgName} Recruitment Team</strong>
        </p>`;
      break;

    // =====================================================
    // NEW: Document Renewal Escalation (7-dagen tweede herinnering)
    // =====================================================
    case 'document_renewal_escalation':
      const escDocType = data.document_type || 'document';
      const escDaysRemaining = data.days_remaining ?? 7;
      const escExpiryDate = data.expiry_date 
        ? new Date(data.expiry_date).toLocaleDateString('nl-NL', { 
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
          })
        : null;
      const daysSinceFirst = data.days_since_first_reminder || 7;
      
      content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Beste ${recipientName},</h2>
        
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid #dc2626;">
          <p style="margin: 0; color: #991b1b; font-weight: 700; font-size: 16px;">
            🚨 Tweede Herinnering - Urgente Actie Vereist
          </p>
          <p style="margin: 12px 0 0 0; color: #991b1b; font-size: 15px; line-height: 1.5;">
            ${daysSinceFirst} dagen geleden hebben we je gevraagd je <strong>${escDocType}</strong> te vernieuwen. 
            We hebben nog geen nieuw document ontvangen.
          </p>
        </div>
        
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            ⏰ <strong>Je document ${escDaysRemaining <= 0 ? 'is verlopen' : `verloopt over ${escDaysRemaining} ${escDaysRemaining === 1 ? 'dag' : 'dagen'}`}</strong>
            ${escExpiryDate ? ` (op ${escExpiryDate})` : ''}
          </p>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0;">
          <p style="margin: 0 0 15px 0; color: #1a1a1a; font-weight: 600; font-size: 15px;">⚠️ Waarom is dit belangrijk?</p>
          <ul style="color: #4a5568; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li>Zonder geldig ${escDocType} kunnen we je niet inzetten bij opdrachtgevers</li>
            <li>Dit kan gevolgen hebben voor je huidige en toekomstige plaatsingen</li>
            <li>Je profiel wordt automatisch op 'inactief' gezet na de vervaldatum</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 25px 0; padding: 20px; background-color: #e0f2fe; border-radius: 8px;">
          <p style="margin: 0 0 10px 0; color: #0369a1; font-weight: 600;">📧 Antwoord op deze email met je vernieuwde document</p>
          <p style="margin: 0; color: #0c4a6e; font-size: 13px;">Of stuur het als bijlage naar personeel@${organization}.nl</p>
        </div>
        
        <p style="color: #dc2626; font-weight: 600; font-size: 14px; margin: 20px 0; text-align: center;">
          Let op: Als we binnen 7 dagen geen nieuw document ontvangen, wordt je dossier doorgestuurd naar een recruiter voor handmatige opvolging.
        </p>
        
        <p style="margin: 25px 0 0 0; color: #4a5568;">
          Met vriendelijke groet,<br>
          <strong>Het ${orgName} Recruitment Team</strong>
        </p>`;
      break;

    // =====================================================
    // NEW: Recruiter Document Alert (14-dagen escalatie naar recruiter)
    // =====================================================
    case 'recruiter_document_alert':
      const alertDocType = data.document_type || 'document';
      const alertCandidateName = data.candidate_name || 'Onbekende kandidaat';
      const alertCandidateEmail = data.candidate_email || 'onbekend';
      const alertExpiryDate = data.expiry_date 
        ? new Date(data.expiry_date).toLocaleDateString('nl-NL')
        : 'onbekend';
      const totalDaysWaiting = data.total_days_waiting || 14;
      const applicationId = data.application_id || '';
      
      content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">🚨 Handmatige Opvolging Vereist</h2>
        
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid #dc2626;">
          <p style="margin: 0; color: #991b1b; font-weight: 700; font-size: 16px;">
            Geen reactie na ${totalDaysWaiting} dagen
          </p>
          <p style="margin: 12px 0 0 0; color: #b91c1c; font-size: 14px; line-height: 1.5;">
            De kandidaat heeft niet gereageerd op automatische herinneringen voor document vernieuwing.
          </p>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0;">
          <p style="margin: 0 0 15px 0; color: #1a1a1a; font-weight: 600; font-size: 15px;">📋 Kandidaat Gegevens</p>
          <table style="width: 100%; font-size: 14px; color: #4a5568;">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Naam:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${alertCandidateName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Email:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><a href="mailto:${alertCandidateEmail}" style="color: ${orgColor};">${alertCandidateEmail}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Document:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${alertDocType}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Vervaldatum:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${alertExpiryDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Wachtdagen:</strong></td>
              <td style="padding: 8px 0;">${totalDaysWaiting} dagen sinds eerste herinnering</td>
            </tr>
          </table>
        </div>
        
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0; color: #92400e; font-weight: 600; font-size: 14px;">💡 Aanbevolen Acties:</p>
          <ol style="color: #78350f; font-size: 13px; line-height: 1.8; padding-left: 20px; margin: 10px 0 0 0;">
            <li>Neem telefonisch contact op met de kandidaat</li>
            <li>Controleer of de kandidaat nog actief wil blijven</li>
            <li>Bied aan om te helpen bij het aanvragen van een nieuw document</li>
            <li>Overweeg het profiel tijdelijk te deactiveren als er geen reactie komt</li>
          </ol>
        </div>
        
        <p style="margin: 25px 0 0 0; color: #4a5568; font-size: 13px;">
          <em>Dit bericht is automatisch gegenereerd door de ${orgName} AI Agent.</em>
        </p>`;
      break;

    // =====================================================
    // NEW: Diploma Upgrade Notification (naar recruiter bij DUO success)
    // =====================================================
    case 'diploma_upgrade_notification':
      const upgradeCandidateName = data.candidate_name || 'Onbekende kandidaat';
      const upgradePreviousStatus = data.previous_status || 'signature_valid';
      const upgradeNewStatus = data.new_status || 'verified_duo';
      const upgradeApplicationId = data.application_id || '';
      
      content = `
        <div style="text-align: center; margin-bottom: 25px;">
          <span style="font-size: 48px;">🎓✅</span>
        </div>
        <h2 style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 20px; text-align: center;">
          Diploma Succesvol Geverifieerd door DUO
        </h2>
        
        <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <p style="margin: 0 0 10px 0; color: #047857; font-weight: 700; font-size: 16px;">
            ✅ Automatische upgrade voltooid
          </p>
          <p style="margin: 0; color: #065f46; font-size: 15px; line-height: 1.6;">
            Het diploma van <strong>${upgradeCandidateName}</strong> is succesvol geüpgraded naar 
            <strong>verified_duo</strong> (100% betrouwbaar via DUO verificatie).
          </p>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0;">
          <p style="margin: 0 0 15px 0; color: #1a1a1a; font-weight: 600; font-size: 15px;">📋 Details</p>
          <table style="width: 100%; font-size: 14px; color: #4a5568;">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Kandidaat:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${upgradeCandidateName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Vorige status:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${upgradePreviousStatus}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Nieuwe status:</strong></td>
              <td style="padding: 8px 0; color: #10b981; font-weight: 600;">${upgradeNewStatus}</td>
            </tr>
          </table>
        </div>
        
        <div style="text-align: center; margin: 25px 0;">
          <a href="https://taskmaster-nl.lovable.app/sollicitaties?application=${upgradeApplicationId}" 
             style="display: inline-block; background: linear-gradient(135deg, ${orgColor} 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600;">
            Bekijk Sollicitatie →
          </a>
        </div>
        
        <p style="margin: 25px 0 0 0; color: #6b7280; font-size: 13px; text-align: center;">
          <em>Dit bericht is automatisch gegenereerd door de ${orgName} AI Agent na succesvolle diploma reverificatie.</em>
        </p>`;
      break;

    // =====================================================
    // NEW: VOG Verified Notification (naar recruiter bij GAAV success)
    // =====================================================
    case 'vog_verified_notification':
      const vogCandidateName = data.candidate_name || 'Onbekende kandidaat';
      const vogValidationStatus = data.validation_status || 'authentic_ok';
      const vogVerificationSource = data.verification_source || 'GAAV_API';
      const vogDaysRemaining = data.days_remaining ?? null;
      const vogApplicationId = data.application_id || '';
      const vogScreeningValid = data.screening_profile_valid !== false;
      
      content = `
        <div style="text-align: center; margin-bottom: 25px;">
          <span style="font-size: 48px;">📜✅</span>
        </div>
        <h2 style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 20px; text-align: center;">
          VOG Succesvol Geverifieerd via GAAV
        </h2>
        
        <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <p style="margin: 0 0 10px 0; color: #047857; font-weight: 700; font-size: 16px;">
            ✅ VOG authentiek en geldig bevonden
          </p>
          <p style="margin: 0; color: #065f46; font-size: 15px; line-height: 1.6;">
            De Verklaring Omtrent Gedrag van <strong>${vogCandidateName}</strong> is succesvol geverifieerd 
            via de ${vogVerificationSource === 'BROWSERLESS_VALIDATIE_NL' ? 'validatie.nl website' : 'GAAV API'}.
          </p>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0;">
          <p style="margin: 0 0 15px 0; color: #1a1a1a; font-weight: 600; font-size: 15px;">📋 Details</p>
          <table style="width: 100%; font-size: 14px; color: #4a5568;">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Kandidaat:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${vogCandidateName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Validatie status:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: 600;">${vogValidationStatus}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Verificatie bron:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${vogVerificationSource}</td>
            </tr>
            ${vogDaysRemaining !== null ? `
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Geldig nog:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${vogDaysRemaining} dagen</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0;"><strong>Screening profiel:</strong></td>
              <td style="padding: 8px 0; color: ${vogScreeningValid ? '#10b981' : '#f59e0b'}; font-weight: 600;">
                ${vogScreeningValid ? '✓ Correct' : '⚠️ Controleren'}
              </td>
            </tr>
          </table>
        </div>
        
        <div style="text-align: center; margin: 25px 0;">
          <a href="https://taskmaster-nl.lovable.app/sollicitaties?application=${vogApplicationId}" 
             style="display: inline-block; background: linear-gradient(135deg, ${orgColor} 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600;">
            Bekijk Sollicitatie →
          </a>
        </div>
        
        <p style="margin: 25px 0 0 0; color: #6b7280; font-size: 13px; text-align: center;">
          <em>Dit bericht is automatisch gegenereerd door de ${orgName} AI Agent na succesvolle VOG verificatie.</em>
        </p>`;
      break;

    // =====================================================
    // NEW: Interview Availability Request (3 opties voorstellen)
    // =====================================================
    case 'interview_availability_request':
      const interviewSlots = data.available_slots || [];
      const interviewSlotsList = interviewSlots.map((s: any, i: number) => 
        `<li style="margin: 8px 0;"><strong>${i+1}.</strong> ${s.formatted || s.date + ' om ' + s.time}</li>`
      ).join('');
      content = `
        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px;">Beste ${recipientName},</h2>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          We plannen graag het intake-/sollicitatiegesprek. Dit zijn 3 beschikbare momenten:
        </p>
        <ol style="background-color: #e7f5ff; padding: 20px 20px 20px 40px; border-radius: 6px; margin: 20px 0; border-left: 4px solid ${orgColor}; color: #1a1a1a;">
          ${interviewSlotsList}
        </ol>
        <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">
          Welke optie past het beste? Reageer met "1", "2" of "3".<br>
          Als geen van deze momenten kan, stuur 2-3 alternatieven (ma-vr 09:00-17:00).
        </p>
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
