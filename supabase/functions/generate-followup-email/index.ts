import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Generate Follow-up Email
 * 
 * Uses Lovable AI to generate personalized follow-up emails for incomplete applications.
 * The generated email is ready to be sent via n8n - no additional AI processing needed.
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
  
  // Night/weekend availability (belangrijk voor matching)
  'nachtdienst_bereid': 'of je bereid bent om nachtdiensten te draaien (veel opdrachtgevers zoeken hier specifiek naar)',
  'weekenddienst_bereid': 'of je bereid bent om in het weekend te werken (dit vergroot je inzetmogelijkheden)',
  'beschikbare_uren': 'hoeveel uur per week je minimaal en maximaal beschikbaar bent',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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
      follow_up_count = 0 
    } = body;

    console.log(`[Generate Followup Email] Application: ${application_id}`);
    console.log(`[Generate Followup Email] Fields to ask: ${fields_to_ask?.join(', ')}`);

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

    // Build the AI prompt
    const prompt = `Je bent een vriendelijke recruitment assistent voor CitoZorg, een thuiszorg bemiddelingsbureau.
Schrijf een overzichtelijke email om ontbrekende informatie te vragen aan een sollicitant.

**Kandidaat info:**
- Naam: ${candidate_name || 'Beste sollicitant'}
- Email: ${candidate_email}
- Huidige completeness: ${current_completeness || 0}%
- Dit is follow-up nummer: ${follow_up_count + 1}

**Vragen die we moeten stellen (max 10):**
${fieldDescriptions.map((desc: string, i: number) => `${i + 1}. ${desc}`).join('\n')}

**Instructies:**
- Schrijf in het Nederlands
- Houd het overzichtelijk maar compleet (max 300 woorden)
- Gebruik een warme, professionele toon
- Groepeer gerelateerde vragen logisch (bijv. contactgegevens, beschikbaarheid, ervaring)
- Gebruik nummering voor duidelijkheid
- Maak duidelijk dat ze gewoon kunnen antwoorden op de email
- Noem specifiek welke informatie je nodig hebt
- Voeg een motiverende opmerking toe over hoe dichtbij ze zijn
- Sluit af met CitoZorg Recruitment Team

**Format:**
Return een JSON object met:
{
  "subject": "Kort onderwerp (max 60 chars)",
  "greeting": "Persoonlijke begroeting",
  "body": "Hoofdtekst van de email met genummerde vragen",
  "closing": "Afsluitende groet"
}`;

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
      // Fallback to generic email
      emailContent = {
        subject: `Aanvullende informatie nodig - CitoZorg`,
        greeting: `Beste ${candidate_name || 'sollicitant'}`,
        body: `Bedankt voor je sollicitatie! Om je aanmelding compleet te maken, hebben we nog wat informatie nodig:\n\n${fieldDescriptions.map((desc: string) => `• ${desc}`).join('\n')}\n\nJe kunt gewoon op deze email antwoorden.`,
        closing: 'Met vriendelijke groet,\nCitoZorg Recruitment Team'
      };
    }

    // Build HTML email
    const emailHtml = `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0066cc 0%, #004999 100%); padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">CitoZorg</h1>
    <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0 0; font-size: 14px;">Recruitment Team</p>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
    <h2 style="color: #0066cc; margin-top: 0;">${emailContent.greeting},</h2>
    
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0066cc;">
      ${emailContent.body.split('\n').map((line: string) => `<p style="margin: 10px 0;">${line}</p>`).join('')}
    </div>
    
    <div style="background: #e8f4ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0; color: #0066cc;"><strong>💡 Tip:</strong> Je kunt gewoon op deze email antwoorden!</p>
    </div>
    
    <p style="color: #666; margin-top: 30px;">
      ${emailContent.closing.replace(/\n/g, '<br>')}
    </p>
    
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999; margin: 0;">
      CitoZorg Recruitment | <a href="mailto:personeel@citozorg.nl" style="color: #0066cc;">personeel@citozorg.nl</a>
    </p>
  </div>
</body>
</html>`;

    // Build plain text version
    const emailPlainText = `${emailContent.greeting},

${emailContent.body}

💡 Tip: Je kunt gewoon op deze email antwoorden!

${emailContent.closing}

---
CitoZorg Recruitment | personeel@citozorg.nl`;

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
        generated_by: 'ai-agent'
      }
    });

    console.log('[Generate Followup Email] Email generated successfully');

    return new Response(
      JSON.stringify({
        success: true,
        emailSubject: emailContent.subject,
        emailHtml,
        emailPlainText,
        fields_asked: fields_to_ask
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
