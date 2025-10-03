import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResendWebhookPayload {
  type: string;
  data: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    in_reply_to?: string;
    references?: string;
    message_id?: string;
    attachments?: Array<{
      filename: string;
      content: string;
      content_type: string;
    }>;
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: ResendWebhookPayload = await req.json();
    console.log("=== Processing Application Reply ===");
    console.log("Webhook type:", payload.type);

    // Only process email.received events
    if (payload.type !== "email.received") {
      console.log("Ignoring non-email event");
      return new Response(JSON.stringify({ message: "Event ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const { from, to, subject, text, in_reply_to, message_id } = payload.data;
    console.log("From:", from);
    console.log("Subject:", subject);
    console.log("In-Reply-To:", in_reply_to);

    // Find the original conversation by matching in_reply_to with the email_id in metadata
    let applicationId: string | null = null;

    if (in_reply_to) {
      console.log("Looking up conversation by in_reply_to:", in_reply_to);
      const { data: conversations, error: convError } = await supabase
        .from("application_conversations")
        .select("application_id, metadata")
        .not("metadata", "is", null);

      if (convError) {
        console.error("Error fetching conversations:", convError);
      } else {
        console.log(`Found ${conversations?.length || 0} conversations to check`);
        
        // Find conversation where metadata.email_id matches in_reply_to
        const matchingConv = conversations?.find((conv) => {
          const metadata = conv.metadata as { email_id?: string };
          return metadata?.email_id === in_reply_to;
        });

        if (matchingConv) {
          applicationId = matchingConv.application_id;
          console.log("Found application_id via in_reply_to:", applicationId);
        }
      }
    }

    // Fallback: match by email address and subject
    if (!applicationId) {
      console.log("Trying fallback: matching by email and subject");
      const cleanSubject = subject.replace(/^Re:\s*/i, "").trim();
      
      const { data: application, error: appError } = await supabase
        .from("professional_applications")
        .select("id, email_from, email_subject")
        .eq("email_from", from)
        .ilike("email_subject", `%${cleanSubject}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (appError) {
        console.error("Error finding application:", appError);
      }

      if (application) {
        applicationId = application.id;
        console.log("Found application_id via fallback:", applicationId);
      }
    }

    if (!applicationId) {
      console.error("Could not find application for this reply");
      return new Response(
        JSON.stringify({ error: "Application not found for this reply" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    // Get full application details
    console.log("Fetching application details...");
    const { data: application, error: appDetailsError } = await supabase
      .from("professional_applications")
      .select(`
        *,
        professionals (*)
      `)
      .eq("id", applicationId)
      .single();

    if (appDetailsError || !application) {
      console.error("Error fetching application details:", appDetailsError);
      return new Response(
        JSON.stringify({ error: "Application not found" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    console.log("Application found:", application.id);
    console.log("Current completeness:", application.completeness_score);
    console.log("Current missing_info:", application.missing_info);

    // Save the applicant's reply to conversations
    console.log("Saving applicant reply to conversations...");
    const { error: replyInsertError } = await supabase
      .from("application_conversations")
      .insert({
        application_id: applicationId,
        role: "user",
        content: text,
        metadata: {
          email_id: message_id,
          subject: subject,
        },
      });

    if (replyInsertError) {
      console.error("Error saving reply:", replyInsertError);
    }

    // Use AI to analyze the reply and extract new information
    console.log("Analyzing reply with AI...");
    const analysisPrompt = `
Je bent een recruitment assistant voor een thuiszorg organisatie. Analyseer deze email van een sollicitant en extract de volgende informatie:

**Huidige missing_info:** ${JSON.stringify(application.missing_info || [])}
**Huidige extracted_data:** ${JSON.stringify(application.extracted_data || {})}

**Email van sollicitant:**
${text}

**Instructies:**
1. Identificeer welke missing_info items nu zijn ingevuld
2. Extract specifieke data als beschikbaar
3. Detecteer of de sollicitant vraagt om een gesprek/interview
4. Bepaal of er nieuwe vragen zijn die beantwoord moeten worden

**KRITIEK - functie_niveau moet EXACT een van deze waarden zijn:**
- "VIG" (Verzorgende IG)
- "VP3" (Verzorgende Niveau 3)
- "VP4" (Verzorgende Niveau 4)
- "HBO-V" (HBO Verpleegkundige)
- "Helpende 2"

Als de sollicitant schrijft "Verzorgende IG" → gebruik "VIG"
Als de sollicitant schrijft "Verzorgende niveau 3" → gebruik "VP3"
Als de sollicitant schrijft "HBO Verpleegkundige" → gebruik "HBO-V"

**KRITIEK - werkvorm moet EXACT een van deze waarden zijn:**
- "ZZP"
- "Uitzendkracht"

Return JSON in dit formaat:
\`\`\`json
{
  "filled_info": ["VOG", "Auto", "Adres"],
  "new_data": {
    "telefoonnummer": "06-12345678",
    "adres": "Hoofdstraat 123",
    "postcode": "1234AB",
    "woonplaats": "Amsterdam",
    "functie_niveau": "VIG",
    "werkvorm": "ZZP",
    "regio": "Amsterdam",
    "skills": ["Medicatie toedienen", "Wondverzorging"],
    "vog_date": "2025-01-15",
    "big_nummer": "123456789",
    "heeft_auto": true,
    "heeft_rijbewijs": true,
    "kvk_nummer": "12345678",
    "btw_nummer": "NL123456789B01",
    "gewenst_uurloon": 45
  },
  "requests_interview": true,
  "has_questions": false,
  "remaining_missing_info": [],
  "confidence": 0.95
}
\`\`\`
`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Je bent een recruitment assistant. Return alleen valid JSON zonder extra tekst.",
          },
          {
            role: "user",
            content: analysisPrompt,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI API error: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";
    console.log("AI analysis:", aiContent);

    // Parse AI response
    let analysis;
    try {
      const jsonMatch = aiContent.match(/```json\n([\s\S]*?)\n```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : aiContent;
      analysis = JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      analysis = {
        filled_info: [],
        new_data: {},
        requests_interview: text.toLowerCase().includes("gesprek") || 
                           text.toLowerCase().includes("interview") ||
                           text.toLowerCase().includes("afspraak"),
        has_questions: false,
        remaining_missing_info: application.missing_info || [],
        confidence: 0.5,
      };
    }

    // 🔧 POST-PROCESSING: Map functie_niveau variations to exact DB values
    if (analysis.new_data?.functie_niveau) {
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

      const normalized = analysis.new_data.functie_niveau.toLowerCase().trim();
      if (functieNiveauMapping[normalized]) {
        console.log(`Mapped functie_niveau: "${analysis.new_data.functie_niveau}" → "${functieNiveauMapping[normalized]}"`);
        analysis.new_data.functie_niveau = functieNiveauMapping[normalized];
      }
    }

    // Calculate new completeness score
    const totalFields = 13; // Match with process-application-email
    const filledFields = totalFields - (analysis.remaining_missing_info?.length || 0);
    const newCompletenessScore = Math.round((filledFields / totalFields) * 100);

    console.log("Analysis result:", analysis);
    console.log("New completeness score:", newCompletenessScore);

    // Merge new data with existing extracted_data
    const mergedData = {
      ...(application.extracted_data || {}),
      ...(analysis.new_data || {}),
    };

    // 🎉 CHECK: Is completeness 100% AND no professional created yet?
    let professionalId = application.professional_id;
    
    if (newCompletenessScore === 100 && !application.professional_id) {
      console.log("🎉 Application is 100% compleet! Creating professional record...");
      
      // Create professional with all collected data
      const { data: newProfessional, error: profError } = await supabase
        .from("professionals")
        .insert({
          org_id: application.org_id,
          full_name: mergedData.full_name,
          telefoonnummer: mergedData.telefoonnummer,
          email: mergedData.email || application.email_from,
          adres: mergedData.adres,
          postcode: mergedData.postcode,
          woonplaats: mergedData.woonplaats,
          functie_niveau: mergedData.functie_niveau,
          werkvorm: mergedData.werkvorm,
          skills: mergedData.skills || [],
          regio: mergedData.regio,
          gewenst_uurloon: mergedData.gewenst_uurloon,
          vog_date: mergedData.vog_date,
          big_nummer: mergedData.big_nummer,
          heeft_auto: mergedData.heeft_auto || false,
          heeft_rijbewijs: mergedData.heeft_rijbewijs || false,
          kvk_nummer: mergedData.kvk_nummer,
          btw_nummer: mergedData.btw_nummer,
          status: "actief",
          tags: ["sollicitant", "compleet"],
        })
        .select()
        .single();

      if (profError) {
        console.error("Error creating professional:", profError);
      } else {
        console.log("✅ Professional created:", newProfessional.id);
        professionalId = newProfessional.id;
        
        // ✅ ATOMIC UPDATE: Update application with ALL fields at once
        console.log("Updating application record with professional_id...");
        const { error: appUpdateError } = await supabase
          .from("professional_applications")
          .update({ 
            professional_id: newProfessional.id,
            status: "geaccepteerd",
            missing_info: [],
            completeness_score: 100,
            extracted_data: mergedData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", applicationId);

        if (appUpdateError) {
          console.error("Error updating application:", appUpdateError);
        }
      }
    } else {
      // Update application without professional_id (not 100% complete yet)
      console.log("Updating application record...");
      const { error: appUpdateError } = await supabase
        .from("professional_applications")
        .update({
          missing_info: analysis.remaining_missing_info || [],
          completeness_score: newCompletenessScore,
          extracted_data: mergedData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", applicationId);

      if (appUpdateError) {
        console.error("Error updating application:", appUpdateError);
      }
    }

    // Generate intelligent response
    console.log("Generating response email...");
    let responseSubject = `Re: ${subject}`;
    let responseBody = "";

    const professionalName = mergedData.full_name || application.email_from.split("@")[0];

    if (newCompletenessScore === 100) {
      // Application is 100% complete!
      responseSubject = `Re: ${subject} - Sollicitatie Compleet! 🎉`;
      responseBody = `
        <h2>Beste ${professionalName},</h2>
        
        <p><strong>Geweldig nieuws!</strong> Je sollicitatie is nu compleet. 🎉</p>
        
        <p>We zouden graag kennismaken om te kijken of er een match is. Wanneer zou het jou uitkomen voor een (video)gesprek?</p>
        
        <p><strong>Volgende stappen:</strong></p>
        <ul>
          <li>Reageer met je beschikbaarheid voor deze week</li>
          <li>Of bel ons op: 020-1234567</li>
          <li>Of plan direct in via: <a href="https://calendly.com/citozorg">onze agenda</a></li>
        </ul>
        
        <p>We kijken ernaar uit!</p>
        
        <p>Met vriendelijke groet,<br>
        Het CitoZorg Recruitment Team<br>
        <a href="mailto:personeel@citozorg.nl">personeel@citozorg.nl</a></p>
      `;
    } else if (analysis.remaining_missing_info && analysis.remaining_missing_info.length > 0) {
      // Still missing some information
      responseSubject = `Re: ${subject} - Aanvullende informatie nodig`;
      responseBody = `
        <h2>Beste ${professionalName},</h2>
        
        <p>Bedankt voor je snelle reactie!</p>
        
        <p>We hebben nog de volgende informatie nodig om je sollicitatie compleet te maken:</p>
        <ul>
          ${analysis.remaining_missing_info.map((item: string) => `<li>${item}</li>`).join("")}
        </ul>
        
        <p>Zou je deze informatie kunnen aanvullen? Dan kunnen we snel verder met je sollicitatie.</p>
        
        <p>Met vriendelijke groet,<br>
        Het CitoZorg Recruitment Team<br>
        <a href="mailto:personeel@citozorg.nl">personeel@citozorg.nl</a></p>
      `;
    } else {
      // Standard acknowledgment
      responseSubject = `Re: ${subject}`;
      responseBody = `
        <h2>Beste ${professionalName},</h2>
        
        <p>Super, bedankt voor de aanvullende informatie! Je sollicitatie is nu compleet.</p>
        
        <p>We gaan je gegevens nu beoordelen en nemen binnen 2 werkdagen contact met je op voor de volgende stappen.</p>
        
        <p>Heb je nog vragen? Laat het gerust weten!</p>
        
        <p>Met vriendelijke groet,<br>
        Het CitoZorg Recruitment Team<br>
        <a href="mailto:personeel@citozorg.nl">personeel@citozorg.nl</a></p>
      `;
    }

    // Send response email via Resend API
    console.log("Sending response email...");
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "CitoZorg Recruitment <personeel@citozorg.nl>",
        to: from,
        subject: responseSubject,
        html: responseBody,
        reply_to: "personeel@citozorg.nl",
      }),
    });

    let emailData: any = null;
    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Error sending email:", emailResponse.status, errorText);
    } else {
      emailData = await emailResponse.json();
      console.log("Email sent:", emailData);
    }

    // Save assistant response to conversations
    console.log("Saving assistant response...");
    const { error: responseInsertError } = await supabase
      .from("application_conversations")
      .insert({
        application_id: applicationId,
        role: "assistant",
        content: responseBody.replace(/<[^>]*>/g, ""), // Strip HTML for text version
        metadata: {
          email_id: emailData?.id,
          subject: responseSubject,
          completeness_score: newCompletenessScore,
          requests_interview: analysis.requests_interview,
        },
      });

    if (responseInsertError) {
      console.error("Error saving response:", responseInsertError);
    }

    console.log("=== Reply Processing Complete ===");

    return new Response(
      JSON.stringify({
        success: true,
        application_id: applicationId,
        completeness_score: newCompletenessScore,
        remaining_missing_info: analysis.remaining_missing_info,
        email_sent: !!emailData,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error processing reply:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
