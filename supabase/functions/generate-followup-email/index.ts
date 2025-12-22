import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

/**
 * Generate Follow-up Email
 * 
 * Uses Lovable AI to generate personalized follow-up emails for incomplete applications.
 * The generated email is ready to be sent via n8n - no additional AI processing needed.
 * 
 * 🆕 SMART CONTEXT: Now accepts rejection_context to explain WHY questions are re-asked.
 */

// Field descriptions for generating natural questions
// Enhanced with ZZP-specific fields, VOG expiration info, and night/weekend availability
const FIELD_DESCRIPTIONS: Record<string, string> = {
  // Basic fields
  'functie_niveau': 'je opleidingsniveau/functie (bijv. VIG, HBO-V, Verpleegkundige MBO)',
  'werkvorm': 'je gewenste werkvorm (ZZP, Uitzendkracht, of ABCito constructie)',
  'regio': 'in welke regio je wilt werken',
  'beschikbaarheid': 'hoeveel uur per week je beschikbaar bent',
  'telefoonnummer': 'een geldig telefoonnummer waarop we je kunnen bereiken',
  'ervaring_sector': 'in welke sector(en) je ervaring hebt (VVT, GGZ, GHZ, etc.)',
  'doelgroep_ervaring': 'met welke doelgroepen je ervaring hebt',
  'eigen_vervoer': 'of je beschikt over eigen vervoer',
  'naam': 'je volledige naam',
  'email': 'je emailadres',
  
  // ZZP-specific fields (kritiek voor facturatie en compliance)
  'uurtarief': 'je gewenste uurtarief (exclusief BTW) - dit helpt ons bij het matchen met opdrachtgevers',
  'gewenst_uurloon': 'je gewenste uurtarief (exclusief BTW) - dit helpt ons bij het matchen met opdrachtgevers',
  'kvk_nummer': 'je KvK-nummer (verplicht voor ZZP-facturatie)',
  'btw_nummer': 'je BTW-identificatienummer (verplicht voor ZZP-facturatie)',
  
  // VOG fields with expiration awareness
  'vog': 'of je een recente VOG hebt (niet ouder dan 3 maanden) en de uitgiftedatum - dit is wettelijk verplicht in de zorg',
  'vog_date': 'de uitgiftedatum van je VOG - deze mag niet ouder dan 3 maanden zijn',
  'vog_verlopen': 'een nieuwe VOG aanvragen - je huidige VOG is helaas ouder dan 3 maanden en daarom niet meer geldig voor zorgwerk',
  'big_registratie': 'je BIG-registratienummer indien van toepassing',
  'big_nummer': 'je BIG-registratienummer (11 cijfers)',
  
  // Night/weekend availability (belangrijk voor matching)
  'nachtdienst_bereid': 'of je bereid bent om nachtdiensten te draaien (veel opdrachtgevers zoeken hier specifiek naar)',
  'weekenddienst_bereid': 'of je bereid bent om in het weekend te werken (dit vergroot je inzetmogelijkheden)',
  'beschikbare_uren': 'hoeveel uur per week je minimaal en maximaal beschikbaar bent',
  
  // Diploma
  'diploma_type': 'je zorg-gerelateerde diploma of opleiding',
};

// Type for rejection context from handle-application-reply
interface RejectionContext {
  [field: string]: {
    provided_value: string;
    rejected_reason: string;
    suggestion: string;
  };
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createAdminClient();

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const body = await req.json();
    const { 
      application_id, 
      candidate_name, 
      candidate_email, 
      fields_to_ask,
      current_completeness,
      follow_up_count = 0,
      email_type = 'followup_question',
      is_first_contact = false,
      org_name = 'CitoZorg',
      // 🆕 Smart context: rejection reasons for previously provided data
      rejection_context = {} as RejectionContext,
    } = body;

    console.log(`[Generate Followup Email] Application: ${application_id}`);
    console.log(`[Generate Followup Email] Fields to ask: ${fields_to_ask?.join(', ')}`);
    console.log(`[Generate Followup Email] Rejection context:`, JSON.stringify(rejection_context));

    if (!application_id || !candidate_email || !fields_to_ask?.length) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: application_id, candidate_email, fields_to_ask' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create natural field descriptions for the prompt
    const fieldDescriptions = fields_to_ask
      .map((field: string) => FIELD_DESCRIPTIONS[field] || field)
      .slice(0, 10); // Max 10 questions per email

    // 🆕 Build rejection context explanation for the AI prompt
    const hasRejectionContext = rejection_context && Object.keys(rejection_context).length > 0;
    let rejectionExplanation = '';
    
    if (hasRejectionContext) {
      const rejectionDetails = Object.entries(rejection_context as RejectionContext)
        .map(([field, context]) => {
          return `- **${field}**: De kandidaat stuurde "${context.provided_value}" maar dit werd afgewezen. 
            Reden: ${context.rejected_reason}
            Suggestie voor kandidaat: ${context.suggestion}`;
        })
        .join('\n');
      
      rejectionExplanation = `
**🔄 CONTEXT VAN EERDERE ANTWOORDEN (KRITIEK!):**
De kandidaat heeft al informatie gestuurd die niet geaccepteerd kon worden. 
Je MOET dit vriendelijk uitleggen in de email zodat de kandidaat begrijpt WAAROM we opnieuw vragen:

${rejectionDetails}

**Instructies voor het verwerken van rejection context:**
1. Erken WAT de kandidaat heeft gestuurd ("Ik zag dat je ... hebt doorgegeven")
2. Leg vriendelijk uit WAAROM het niet geaccepteerd kon worden
3. Geef een concreet voorbeeld van wat WEL werkt
4. Wees NIET beschuldigend of negatief - houd het professioneel en behulpzaam
`;
    }

    // Build the AI prompt based on email type
    let prompt: string;
    
    if (email_type === 'welcome_and_intake' || is_first_contact) {
      // WELKOMST + INTAKE EMAIL (usually no rejection context here)
      prompt = `Je bent een hartelijke recruitment assistent voor ${org_name}, een professioneel zorgbemiddelingsbureau.
Schrijf een warme welkomstemail voor een nieuwe sollicitant die ook vraagt naar ontbrekende informatie.

**Kandidaat info:**
- Naam: ${candidate_name || 'Beste sollicitant'}
- Email: ${candidate_email}
- Huidige completeness: ${current_completeness || 0}%

**BELANGRIJKE STRUCTUUR:**
1. Start met een hartelijke welkomst - maak de kandidaat enthousiast!
2. Leg kort uit wat ze kunnen verwachten (proces in 3 simpele stappen)
3. Vraag vriendelijk naar de ontbrekende informatie

**Ontbrekende informatie (indien aanwezig):**
${fieldDescriptions.length > 0 ? fieldDescriptions.map((desc: string, i: number) => `${i + 1}. ${desc}`).join('\n') : 'Alle basisinformatie is ontvangen!'}

**Instructies:**
- Schrijf in het Nederlands
- Warme, enthousiaste maar professionele toon
- Maak het NIET te lang (max 250 woorden)
- Noem de 3 stappen: 1) We bekijken je profiel 2) Kennismakingsgesprek 3) Matching met opdrachtgevers
- Als er ontbrekende info is, vraag dit vriendelijk in een overzichtelijke lijst
- Maak duidelijk dat ze gewoon kunnen antwoorden op de email
- Sluit af met ${org_name} Recruitment Team
- Wees persoonlijk en motiverend!

**Format:**
Return een JSON object met:
{
  "subject": "Welkom bij ${org_name} - Je sollicitatie is ontvangen!",
  "greeting": "Beste [naam]",
  "intro": "Hartelijke welkomstboodschap (2-3 zinnen)",
  "process_steps": "Korte uitleg van het proces in 3 stappen",
  "info_request": "Vriendelijk verzoek om ontbrekende info (of bevestiging dat alles compleet is)",
  "closing": "Warme afsluitende groet"
}`;
    } else {
      // STANDAARD FOLLOW-UP EMAIL (kan rejection context bevatten)
      prompt = `Je bent een vriendelijke recruitment assistent voor ${org_name}, een thuiszorg bemiddelingsbureau.
Schrijf een overzichtelijke email om ontbrekende informatie te vragen aan een sollicitant.

**Kandidaat info:**
- Naam: ${candidate_name || 'Beste sollicitant'}
- Email: ${candidate_email}
- Huidige completeness: ${current_completeness || 0}%
- Dit is follow-up nummer: ${follow_up_count + 1}

${rejectionExplanation}

**Vragen die we moeten stellen (max 10):**
${fieldDescriptions.map((desc: string, i: number) => `${i + 1}. ${desc}`).join('\n')}

**Instructies:**
- Schrijf in het Nederlands
- Houd het overzichtelijk maar compleet (max 300 woorden)
- Gebruik een warme, professionele toon
${hasRejectionContext ? `- **KRITIEK**: Begin met het uitleggen waarom eerder gestuurde informatie niet geaccepteerd kon worden (zie rejection context hierboven)
- Wees NIET beschuldigend - leg het vriendelijk uit als een misverstand of technisch vereiste
- Geef concrete voorbeelden van wat WEL werkt` : ''}
- Groepeer gerelateerde vragen logisch (bijv. contactgegevens, beschikbaarheid, ervaring)
- Gebruik nummering voor duidelijkheid
- Maak duidelijk dat ze gewoon kunnen antwoorden op de email
- Noem specifiek welke informatie je nodig hebt
- Voeg een motiverende opmerking toe over hoe dichtbij ze zijn
- Sluit af met ${org_name} Recruitment Team

**Format:**
Return een JSON object met:
{
  "subject": "Kort onderwerp (max 60 chars)",
  "greeting": "Persoonlijke begroeting",
  "body": "Hoofdtekst van de email met genummerde vragen${hasRejectionContext ? ' - BEGIN met uitleg over afgewezen antwoorden' : ''}",
  "closing": "Afsluitende groet"
}`;
    }

    // Call Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Je bent een recruitment assistent. Return alleen valid JSON zonder extra tekst of markdown.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[Generate Followup Email] AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    console.log('[Generate Followup Email] AI response:', aiContent);

    // Parse AI response
    let emailContent;
    try {
      // Remove markdown code blocks if present
      const jsonStr = aiContent
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      emailContent = JSON.parse(jsonStr);
    } catch (e) {
      console.error('[Generate Followup Email] Failed to parse AI response:', e);
      // Fallback based on email type
      if (email_type === 'welcome_and_intake' || is_first_contact) {
        emailContent = {
          subject: `Welkom bij ${org_name} - Je sollicitatie is ontvangen!`,
          greeting: `Beste ${candidate_name || 'sollicitant'}`,
          intro: `Hartelijk dank voor je interesse in ${org_name}! We zijn blij dat je hebt gesolliciteerd en kijken uit naar een kennismaking.`,
          process_steps: `📋 Wat kun je verwachten?\n1. We bekijken je profiel binnen 2 werkdagen\n2. Bij een goede match plannen we een kennismakingsgesprek\n3. Na het gesprek matchen we je met passende opdrachtgevers`,
          info_request: fieldDescriptions.length > 0 
            ? `Om je aanmelding compleet te maken, hebben we nog wat informatie nodig:\n\n${fieldDescriptions.map((desc: string) => `• ${desc}`).join('\n')}`
            : `Je aanmelding is compleet ontvangen! We nemen zo snel mogelijk contact met je op.`,
          closing: `Met vriendelijke groet,\n${org_name} Recruitment Team`
        };
      } else {
        // 🆕 Smart fallback with rejection context
        let bodyText = '';
        
        if (hasRejectionContext) {
          bodyText = `Bedankt voor je reactie!\n\n`;
          
          // Add rejection explanations
          for (const [field, context] of Object.entries(rejection_context as RejectionContext)) {
            const fieldLabel = FIELD_DESCRIPTIONS[field] || field;
            bodyText += `Ik zag dat je "${context.provided_value}" hebt doorgegeven voor ${fieldLabel}. Helaas kunnen we dit niet accepteren: ${context.rejected_reason}\n\n${context.suggestion}\n\n`;
          }
          
          bodyText += `Daarnaast hebben we nog de volgende informatie nodig:\n\n`;
        } else {
          bodyText = `Bedankt voor je sollicitatie! Om je aanmelding compleet te maken, hebben we nog wat informatie nodig:\n\n`;
        }
        
        bodyText += `${fieldDescriptions.map((desc: string) => `• ${desc}`).join('\n')}\n\nJe kunt gewoon op deze email antwoorden.`;
        
        emailContent = {
          subject: `Aanvullende informatie nodig - ${org_name}`,
          greeting: `Beste ${candidate_name || 'sollicitant'}`,
          body: bodyText,
          closing: `Met vriendelijke groet,\n${org_name} Recruitment Team`
        };
      }
    }

    // Build HTML email based on type
    let emailHtml: string;
    
    if (email_type === 'welcome_and_intake' || is_first_contact) {
      // WELKOMST EMAIL HTML
      emailHtml = `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0066cc 0%, #004999 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Welkom bij ${org_name}!</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Je sollicitatie is ontvangen</p>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 12px 12px;">
    <h2 style="color: #0066cc; margin-top: 0; font-size: 20px;">${emailContent.greeting.replace(/,+$/, '')},</h2>
    
    <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
      ${emailContent.intro || 'Hartelijk dank voor je interesse! We zijn blij dat je hebt gesolliciteerd.'}
    </p>
    
    <div style="background: white; padding: 25px; border-radius: 10px; margin: 25px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
      <h3 style="color: #0066cc; margin-top: 0; font-size: 18px;">📋 Wat kun je verwachten?</h3>
      <div style="padding-left: 10px;">
        ${(emailContent.process_steps || '').split('\n').map((line: string) => {
          if (line.match(/^[1-3]\./)) {
            return `<p style="margin: 12px 0; padding-left: 25px; position: relative;"><span style="position: absolute; left: 0; color: #0066cc; font-weight: bold;">${line.charAt(0)}.</span>${line.substring(2)}</p>`;
          }
          return line ? `<p style="margin: 8px 0;">${line}</p>` : '';
        }).join('')}
      </div>
    </div>
    
    ${fieldDescriptions.length > 0 ? `
    <div style="background: #fff3cd; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #ffc107;">
      <h3 style="color: #856404; margin-top: 0; font-size: 16px;">✍️ We missen nog wat informatie</h3>
      <p style="color: #856404; margin-bottom: 15px;">Om je snel te kunnen helpen, hebben we nog het volgende nodig:</p>
      <ul style="margin: 0; padding-left: 20px; color: #856404;">
        ${fieldDescriptions.map((desc: string) => `<li style="margin: 8px 0;">${desc}</li>`).join('')}
      </ul>
    </div>
    ` : `
    <div style="background: #d4edda; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #28a745;">
      <p style="color: #155724; margin: 0;"><strong>✅ Je aanmelding is compleet!</strong> We nemen zo snel mogelijk contact met je op.</p>
    </div>
    `}
    
    <div style="background: #e8f4ff; padding: 20px; border-radius: 10px; margin: 25px 0; text-align: center;">
      <p style="margin: 0; color: #0066cc; font-size: 15px;"><strong>💡 Tip:</strong> Je kunt gewoon op deze email antwoorden!</p>
    </div>
    
    <p style="color: #666; margin-top: 30px; font-size: 15px;">
      ${(emailContent.closing || `Met vriendelijke groet,\n${org_name} Recruitment Team`).replace(/\n/g, '<br>')}
    </p>
    
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999; margin: 0; text-align: center;">
      ${org_name} Recruitment | <a href="mailto:${org_name.toLowerCase().includes('abc') ? 'personeel@abczorg.nl' : 'personeel@citozorg.nl'}" style="color: #0066cc;">${org_name.toLowerCase().includes('abc') ? 'personeel@abczorg.nl' : 'personeel@citozorg.nl'}</a>
    </p>
  </div>
</body>
</html>`;
    } else {
      // STANDAARD FOLLOW-UP EMAIL HTML (met rejection context support)
      
      // 🆕 Build rejection context HTML if present
      let rejectionHtml = '';
      if (hasRejectionContext) {
        rejectionHtml = `
    <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
      <h3 style="color: #856404; margin-top: 0; font-size: 16px;">📝 Over je eerdere antwoord</h3>
      ${Object.entries(rejection_context as RejectionContext).map(([field, context]) => `
        <div style="margin-bottom: 15px;">
          <p style="margin: 5px 0; color: #856404;">
            <strong>Je stuurde:</strong> "${context.provided_value}"
          </p>
          <p style="margin: 5px 0; color: #856404;">
            ${context.rejected_reason}
          </p>
          <p style="margin: 5px 0; color: #155724; background: #d4edda; padding: 10px; border-radius: 5px;">
            💡 <strong>Tip:</strong> ${context.suggestion}
          </p>
        </div>
      `).join('')}
    </div>`;
      }
      
      emailHtml = `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0066cc 0%, #004999 100%); padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${org_name}</h1>
    <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0 0; font-size: 14px;">Recruitment Team</p>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
    <h2 style="color: #0066cc; margin-top: 0;">${emailContent.greeting},</h2>
    
    ${rejectionHtml}
    
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0066cc;">
      ${(emailContent.body || '').split('\n').map((line: string) => `<p style="margin: 10px 0;">${line}</p>`).join('')}
    </div>
    
    <div style="background: #e8f4ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0; color: #0066cc;"><strong>💡 Tip:</strong> Je kunt gewoon op deze email antwoorden!</p>
    </div>
    
    <p style="color: #666; margin-top: 30px;">
      ${(emailContent.closing || '').replace(/\n/g, '<br>')}
    </p>
    
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999; margin: 0;">
      ${org_name} Recruitment | <a href="mailto:${org_name.toLowerCase().includes('abc') ? 'personeel@abczorg.nl' : 'personeel@citozorg.nl'}" style="color: #0066cc;">${org_name.toLowerCase().includes('abc') ? 'personeel@abczorg.nl' : 'personeel@citozorg.nl'}</a>
    </p>
  </div>
</body>
</html>`;
    }

    // Build plain text version based on type
    let emailPlainText: string;
    
    if (email_type === 'welcome_and_intake' || is_first_contact) {
      emailPlainText = `${emailContent.greeting},

${emailContent.intro || 'Hartelijk dank voor je interesse! We zijn blij dat je hebt gesolliciteerd.'}

📋 WAT KUN JE VERWACHTEN?
${emailContent.process_steps || '1. We bekijken je profiel\n2. Kennismakingsgesprek\n3. Matching met opdrachtgevers'}

${fieldDescriptions.length > 0 ? `✍️ OM JE SNEL TE KUNNEN HELPEN, HEBBEN WE NOG NODIG:
${fieldDescriptions.map((desc: string) => `• ${desc}`).join('\n')}` : '✅ Je aanmelding is compleet! We nemen zo snel mogelijk contact met je op.'}

💡 Tip: Je kunt gewoon op deze email antwoorden!

${emailContent.closing || `Met vriendelijke groet,\n${org_name} Recruitment Team`}

---
${org_name} Recruitment | ${org_name.toLowerCase().includes('abc') ? 'personeel@abczorg.nl' : 'personeel@citozorg.nl'}`;
    } else {
      // 🆕 Include rejection context in plain text
      let rejectionText = '';
      if (hasRejectionContext) {
        rejectionText = '📝 OVER JE EERDERE ANTWOORD:\n\n';
        for (const [field, context] of Object.entries(rejection_context as RejectionContext)) {
          rejectionText += `Je stuurde: "${context.provided_value}"\n`;
          rejectionText += `${context.rejected_reason}\n`;
          rejectionText += `💡 Tip: ${context.suggestion}\n\n`;
        }
      }
      
      emailPlainText = `${emailContent.greeting},

${rejectionText}${emailContent.body || ''}

💡 Tip: Je kunt gewoon op deze email antwoorden!

${emailContent.closing || ''}

---
${org_name} Recruitment | ${org_name.toLowerCase().includes('abc') ? 'personeel@abczorg.nl' : 'personeel@citozorg.nl'}`;
    }

    // Log the generated email for audit
    await supabase.from('application_conversations').insert({
      application_id,
      role: 'assistant',
      content: emailPlainText,
      metadata: {
        email_type: 'followup_question',
        fields_asked: fields_to_ask,
        email_subject: emailContent.subject,
        follow_up_count: follow_up_count + 1,
        generated_at: new Date().toISOString(),
        generated_by: 'ai-agent',
        has_rejection_context: hasRejectionContext,
        rejection_context_fields: hasRejectionContext ? Object.keys(rejection_context) : [],
      }
    });

    console.log('[Generate Followup Email] Email generated successfully');
    console.log('[Generate Followup Email] Has rejection context:', hasRejectionContext);

    return new Response(
      JSON.stringify({
        success: true,
        emailSubject: emailContent.subject,
        emailHtml,
        emailPlainText,
        fields_asked: fields_to_ask,
        has_rejection_context: hasRejectionContext,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[Generate Followup Email] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
