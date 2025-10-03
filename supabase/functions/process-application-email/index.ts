import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    created_at: string;
    email_id: string;
    from: string;
    subject: string;
    to: string[];
    html?: string;
    text?: string;
    attachments?: Array<{
      content: string; // base64
      content_type: string;
      filename: string;
      size: number;
    }>;
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== Processing Application Email ===");
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    // Parse Resend webhook payload
    const payload: ResendWebhookPayload = await req.json();
    console.log("Webhook type:", payload.type);

    if (payload.type !== "email.received") {
      return new Response(JSON.stringify({ message: "Ignored - not email.received" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailData = payload.data;
    const applicantEmail = emailData.from;
    const emailSubject = emailData.subject || "Sollicitatie";
    const emailBody = emailData.text || emailData.html || "";

    console.log("From:", applicantEmail);
    console.log("Subject:", emailSubject);
    console.log("Attachments:", emailData.attachments?.length || 0);

    // Get org_id (assume first org for now - in production you'd map email domains to orgs)
    const { data: orgs } = await supabase.from("organizations").select("id").limit(1);
    if (!orgs || orgs.length === 0) {
      throw new Error("No organization found");
    }
    const orgId = orgs[0].id;

    // Get first user in org to assign as creator
    const { data: userOrgs } = await supabase
      .from("user_organizations")
      .select("user_id")
      .eq("org_id", orgId)
      .limit(1);
    
    if (!userOrgs || userOrgs.length === 0) {
      throw new Error("No users found in organization");
    }
    const userId = userOrgs[0].user_id;

    // Process CV attachment
    let cvFilePath: string | null = null;
    let cvFileName: string | null = null;
    let cvContent = "";

    if (emailData.attachments && emailData.attachments.length > 0) {
      const cvAttachment = emailData.attachments.find(att => 
        att.filename.toLowerCase().endsWith(".pdf") ||
        att.filename.toLowerCase().endsWith(".doc") ||
        att.filename.toLowerCase().endsWith(".docx")
      );

      if (cvAttachment) {
        console.log("Processing CV:", cvAttachment.filename);
        
        // Decode base64 content
        const cvBuffer = Uint8Array.from(atob(cvAttachment.content), c => c.charCodeAt(0));
        
        // Upload to Storage
        const timestamp = Date.now();
        const safeName = cvAttachment.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        cvFileName = cvAttachment.filename;
        cvFilePath = `${orgId}/${applicantEmail.replace(/[^a-zA-Z0-9@.-]/g, "_")}_${timestamp}_${safeName}`;
        
        const { error: uploadError } = await supabase.storage
          .from("application-cvs")
          .upload(cvFilePath, cvBuffer, {
            contentType: cvAttachment.content_type,
            upsert: false,
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          throw uploadError;
        }

        console.log("CV uploaded to:", cvFilePath);

        // Extract text from CV for AI analysis (simple text extraction)
        if (cvAttachment.content_type === "application/pdf") {
          cvContent = emailBody; // Fallback to email body
        } else {
          cvContent = emailBody;
        }
      }
    }

    // AI Analysis with Lovable AI (Gemini 2.5 Flash)
    console.log("Starting AI analysis...");
    const aiPrompt = `Analyseer deze sollicitatie en CV en extract de volgende informatie in JSON formaat:

Email: ${applicantEmail}
Onderwerp: ${emailSubject}
Bericht: ${emailBody}
CV inhoud: ${cvContent.substring(0, 2000)}

Geef terug in dit EXACTE JSON formaat (geen extra tekst):
{
  "full_name": "Voor- en achternaam",
  "telefoonnummer": "06-12345678 of null",
  "email": "${applicantEmail}",
  "adres": "Straat + huisnummer of null",
  "postcode": "1234AB of null",
  "woonplaats": "Amsterdam of null",
  "functie_niveau": "VIG, VP3, VP4, HBO-V, of Helpende 2",
  "werkvorm": "ZZP of Uitzendkracht",
  "skills": ["skill1", "skill2"],
  "regio": "Utrecht, Amsterdam, etc",
  "gewenst_uurloon": 45,
  "vog_date": "2025-01-15 of null",
  "big_nummer": "123456789 of null",
  "heeft_auto": true,
  "heeft_rijbewijs": true,
  "kvk_nummer": "12345678 of null",
  "btw_nummer": "NL123456789B01 of null",
  "missing_info": ["VOG", "BIG-nummer", "Adres", "Telefoonnummer"],
  "confidence": 0.8
}

**KRITIEK - functie_niveau moet EXACT een van deze waarden zijn:**
- "VIG" (voor Verzorgende IG)
- "VP3" (voor Verzorgende Niveau 3)
- "VP4" (voor Verzorgende Niveau 4)
- "HBO-V" (voor HBO Verpleegkundige)
- "Helpende 2"

Belangrijk:
- functie_niveau: gebruik exact VIG, VP3, VP4, HBO-V, of Helpende 2
- werkvorm: gebruik exact ZZP of Uitzendkracht
- Als info ontbreekt, gebruik null
- missing_info moet een array zijn van ALLE ontbrekende zaken
- gewenst_uurloon is een getal (euro per uur)
- vog_date is een datum (YYYY-MM-DD format)
- heeft_auto en heeft_rijbewijs zijn boolean (true/false)`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Je bent een HR assistent die CV's analyseert voor zorgverleners. Geef altijd pure JSON terug zonder markdown code blocks." },
          { role: "user", content: aiPrompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    let extractedData;
    
    try {
      const aiContent = aiResult.choices[0].message.content;
      console.log("AI raw response:", aiContent);
      
      // Remove markdown code blocks if present
      const cleanContent = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      extractedData = JSON.parse(cleanContent);
      console.log("Extracted data:", extractedData);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Fallback with minimal data
      extractedData = {
        full_name: applicantEmail.split("@")[0],
        telefoonnummer: null,
        email: applicantEmail,
        adres: null,
        postcode: null,
        woonplaats: null,
        functie_niveau: "VP4",
        werkvorm: "Uitzendkracht",
        skills: [],
        regio: null,
        gewenst_uurloon: null,
        vog_date: null,
        big_nummer: null,
        heeft_auto: false,
        heeft_rijbewijs: false,
        kvk_nummer: null,
        btw_nummer: null,
        missing_info: ["VOG", "BIG-nummer", "Tarief", "Regio", "Adres", "Telefoonnummer", "Auto", "Rijbewijs"],
        confidence: 0.3,
      };
    }

    // 🔧 POST-PROCESSING: Map functie_niveau variations to exact DB values
    if (extractedData.functie_niveau) {
      const functieNiveauMapping: Record<string, string> = {
        "verzorgende ig": "VIG",
        "verzorgende IG": "VIG",
        "vig": "VIG",
        "verzorgende niveau 3": "VP3",
        "verzorgende 3": "VP3",
        "vp3": "VP3",
        "verzorgende niveau 4": "VP4",
        "verzorgende 4": "VP4",
        "vp4": "VP4",
        "hbo verpleegkundige": "HBO-V",
        "hbo-v": "HBO-V",
        "hbov": "HBO-V",
        "helpende": "Helpende 2",
        "helpende 2": "Helpende 2",
        "helpende niveau 2": "Helpende 2",
      };

      const normalized = extractedData.functie_niveau.toLowerCase().trim();
      if (functieNiveauMapping[normalized]) {
        console.log(`Mapped functie_niveau: "${extractedData.functie_niveau}" → "${functieNiveauMapping[normalized]}"`);
        extractedData.functie_niveau = functieNiveauMapping[normalized];
      }
    }

    // Calculate completeness score (0-100%)
    const totalFields = 13; // full_name, telefoonnummer, email, adres, postcode, woonplaats, functie_niveau, werkvorm, skills, regio, uurloon, VOG, BIG, auto, rijbewijs
    const filledFields = [
      extractedData.full_name,
      extractedData.telefoonnummer,
      extractedData.email,
      extractedData.adres,
      extractedData.postcode,
      extractedData.woonplaats,
      extractedData.functie_niveau,
      extractedData.werkvorm,
      extractedData.skills?.length > 0,
      extractedData.regio,
      extractedData.gewenst_uurloon,
      extractedData.vog_date,
      extractedData.big_nummer,
    ].filter(Boolean).length;
    const completenessScore = Math.round((filledFields / totalFields) * 100);
    
    console.log(`Completeness: ${completenessScore}% (${filledFields}/${totalFields} fields filled)`);

    // Insert application record (WITHOUT professional_id - will be created at 100% completeness)
    console.log("Creating application record...");
    const { data: application, error: appError } = await supabase
      .from("professional_applications")
      .insert({
        org_id: orgId,
        professional_id: null, // ⚠️ NULL - professional wordt pas aangemaakt bij 100% completeness
        email_from: applicantEmail,
        email_subject: emailSubject,
        email_body: emailBody,
        cv_file_path: cvFilePath,
        cv_file_name: cvFileName,
        status: "nieuw",
        completeness_score: completenessScore,
        missing_info: extractedData.missing_info || [],
        extracted_data: extractedData, // 🆕 Sla alle extracted data tijdelijk op
      })
      .select()
      .single();

    if (appError) {
      console.error("Application insert error:", appError);
      throw appError;
    }

    console.log("Application created:", application.id);

    // Generate follow-up questions based on missing info
    const missingInfo = extractedData.missing_info || [];
    let followUpQuestions = "";

    if (missingInfo.length > 0) {
      followUpQuestions = "\n\nOm je sollicitatie compleet te maken hebben we nog de volgende informatie nodig:\n\n";
      
      if (missingInfo.includes("VOG")) {
        followUpQuestions += "📋 **VOG (Verklaring Omtrent Gedrag)**: Heb je een geldige VOG? Zo ja, wat is de uitgiftedatum?\n\n";
      }
      if (missingInfo.includes("BIG-nummer")) {
        followUpQuestions += "🏥 **BIG-registratie**: Wat is je BIG-registratienummer?\n\n";
      }
      if (missingInfo.includes("Tarief") || missingInfo.includes("Uurloon")) {
        followUpQuestions += "💰 **Gewenst uurloon**: Wat is je gewenste uurloon (exclusief BTW)?\n\n";
      }
      if (missingInfo.includes("Regio")) {
        followUpQuestions += "📍 **Regio voorkeur**: In welke regio(s) wil je werken?\n\n";
      }
      if (missingInfo.includes("Adres")) {
        followUpQuestions += "🏠 **Adres**: Wat is je volledige adres (straat, nummer, postcode, woonplaats)?\n\n";
      }
      if (missingInfo.includes("Telefoonnummer")) {
        followUpQuestions += "📞 **Telefoonnummer**: Wat is je telefoonnummer?\n\n";
      }
      if (missingInfo.includes("Auto")) {
        followUpQuestions += "🚗 **Auto**: Heb je een eigen auto?\n\n";
      }
      if (missingInfo.includes("Rijbewijs")) {
        followUpQuestions += "🪪 **Rijbewijs**: Heb je een geldig rijbewijs?\n\n";
      }
      if (extractedData.werkvorm === "ZZP" && missingInfo.includes("KvK")) {
        followUpQuestions += "🏢 **KvK-nummer**: Wat is je KvK-nummer?\n\n";
      }
      if (extractedData.werkvorm === "ZZP" && missingInfo.includes("BTW")) {
        followUpQuestions += "📊 **BTW-nummer**: Wat is je BTW-nummer?\n\n";
      }
    }

    // Send follow-up email
    console.log("Sending follow-up email...");
    const emailHtml = `
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
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">🎉 Sollicitatie Ontvangen!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 22px; font-weight: 600;">
                Beste ${extractedData.full_name},
              </h2>
              <p style="margin: 0 0 20px 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Bedankt voor je sollicitatie bij <strong>CitoZorg</strong>! We hebben je CV en informatie ontvangen en bekijken je profiel momenteel.
              </p>
              ${followUpQuestions ? `
                <div style="background-color: #fef3c7; padding: 20px; border-radius: 6px; margin: 25px 0; border-left: 4px solid #f59e0b;">
                  <p style="margin: 0 0 15px 0; color: #92400e; font-size: 16px; font-weight: 600;">
                    ⚠️ Aanvullende informatie nodig
                  </p>
                  <div style="color: #1a1a1a; font-size: 15px; line-height: 1.8;">
                    ${followUpQuestions.replace(/\n/g, "<br>")}
                  </div>
                </div>
              ` : `
                <div style="background-color: #d1fae5; padding: 20px; border-radius: 6px; margin: 25px 0; border-left: 4px solid #10b981;">
                  <p style="margin: 0; color: #065f46; font-size: 16px; font-weight: 600;">
                    ✅ Je sollicitatie is compleet!
                  </p>
                  <p style="margin: 10px 0 0 0; color: #047857; font-size: 14px;">
                    We nemen binnen 2 werkdagen contact met je op voor een kennismakingsgesprek.
                  </p>
                </div>
              `}
              <p style="margin: 25px 0 0 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Je kunt op deze email antwoorden met de gevraagde informatie. We kijken ernaar uit om met je kennis te maken!
              </p>
              <p style="margin: 30px 0 0 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Met vriendelijke groet,<br>
                <strong>Het CitoZorg Recruitment Team</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px 30px; text-align: center; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                CitoZorg - Kwaliteit in Zorg
              </p>
              <p style="margin: 10px 0 0 0; color: #9ca3af; font-size: 12px;">
                <a href="mailto:personeel@citozorg.nl" style="color: #667eea; text-decoration: none;">personeel@citozorg.nl</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const emailResult = await resend.emails.send({
      from: "CitoZorg Recruitment <personeel@citozorg.nl>",
      to: [applicantEmail],
      subject: `Re: ${emailSubject}`,
      html: emailHtml,
    });

    console.log("Email sent:", emailResult);

    // Log conversation
    await supabase.from("application_conversations").insert({
      application_id: application.id,
      role: "assistant",
      content: followUpQuestions || "Je sollicitatie is compleet ontvangen.",
      metadata: {
        email_id: emailResult.data?.id,
        missing_info: missingInfo,
        completeness_score: completenessScore,
      },
    });

    // Note: Auto-learning will happen when professional is created (at 100% completeness)

    console.log("=== Application Processing Complete ===");

    return new Response(
      JSON.stringify({
        success: true,
        professional_id: null, // Will be created when completeness reaches 100%
        application_id: application.id,
        completeness_score: completenessScore,
        missing_info: missingInfo,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("Error processing application:", error);
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
