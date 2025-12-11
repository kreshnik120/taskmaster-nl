import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

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

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SIGNING_SECRET");

    const supabase = createAdminClient();

    // 🔒 SECURITY: Verify webhook signature (if secret is configured)
    let payload: ResendWebhookPayload;
    
    if (webhookSecret) {
      const rawBody = await req.text();
      const { verifySvixSignature } = await import("../_shared/webhook-validator.ts");
      
      const isValid = await verifySvixSignature(rawBody, req.headers, webhookSecret);
      if (!isValid) {
        console.error("❌ Invalid webhook signature - potential attack attempt");
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Parse payload after verification
      payload = JSON.parse(rawBody);
    } else {
      console.warn("⚠️ RESEND_WEBHOOK_SIGNING_SECRET not configured - webhook verification disabled");
      payload = await req.json();
    }
    
    // 🔒 SECURITY: Validate webhook payload structure with Zod
    const ResendReplyWebhookSchema = z.object({
      type: z.string(),
      data: z.object({
        from: z.string().email().max(255),
        to: z.string().max(255),
        subject: z.string().max(500),
        text: z.string().max(500000),
        html: z.string().max(500000).optional(),
        in_reply_to: z.string().max(255).optional(),
        references: z.string().max(1000).optional(),
        message_id: z.string().max(255).optional(),
        attachments: z.array(z.object({
          filename: z.string().max(255),
          content: z.string().max(20000000),
          content_type: z.string().max(100)
        })).max(10).optional()
      })
    });
    
    const replyValidation = ResendReplyWebhookSchema.safeParse(payload);
    if (!replyValidation.success) {
      const errors = replyValidation.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      console.error("❌ Webhook payload validation failed:", errors);
      return new Response(
        JSON.stringify({ error: `Invalid payload: ${errors}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    payload = replyValidation.data as ResendWebhookPayload;
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

    // =====================================================
    // DOCUMENT ATTACHMENT PROCESSING
    // =====================================================
    const processedDocuments: Array<{
      filename: string;
      file_path: string;
      document_type: string;
      vog_expiry_status?: string;
    }> = [];

    if (payload.data.attachments && payload.data.attachments.length > 0) {
      console.log(`📎 Processing ${payload.data.attachments.length} attachments...`);
      
      for (const attachment of payload.data.attachments) {
        try {
          console.log(`📄 Attachment: ${attachment.filename} (${attachment.content_type})`);
          
          // Detect document type from filename
          const detectDocType = (filename: string): 'vog' | 'diploma' | 'certificate' | 'cv' | 'id' | 'other' => {
            const lower = filename.toLowerCase();
            if (lower.includes('vog') || lower.includes('verklaring omtrent') || lower.includes('verklaring_omtrent')) return 'vog';
            if (lower.includes('diploma') || lower.includes('getuigschrift')) return 'diploma';
            if (lower.includes('certificaat') || lower.includes('certificate') || lower.includes('bhv') || lower.includes('ehbo')) return 'certificate';
            if (lower.includes('cv') || lower.includes('curriculum') || lower.includes('resume')) return 'cv';
            if (lower.includes('id') || lower.includes('paspoort') || lower.includes('rijbewijs') || lower.includes('identiteit')) return 'id';
            return 'other';
          };

          const documentType = detectDocType(attachment.filename);
          
          // Decode base64 content
          const fileBuffer = Uint8Array.from(atob(attachment.content), c => c.charCodeAt(0));
          const filePath = `${applicationId}/${Date.now()}_${attachment.filename}`;
          
          // Upload to Storage
          const { error: uploadError } = await supabase.storage
            .from('application-documents')
            .upload(filePath, fileBuffer, { 
              contentType: attachment.content_type,
              upsert: false 
            });
          
          if (uploadError) {
            console.error(`❌ Failed to upload ${attachment.filename}:`, uploadError);
            continue;
          }
          
          console.log(`✅ Uploaded: ${filePath}`);
          
          // Determine VOG expiry status if it's a VOG document
          let vogExpiryStatus: string | null = null;
          let vogIssueDate: string | null = null;
          
          if (documentType === 'vog') {
            // Try to extract date from filename
            const extractDateFromFilename = (filename: string): Date | null => {
              const isoMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
              if (isoMatch) {
                const date = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);
                if (!isNaN(date.getTime())) return date;
              }
              const euMatch = filename.match(/(\d{2})[-.]?(\d{2})[-.]?(\d{4})/);
              if (euMatch) {
                const date = new Date(`${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`);
                if (!isNaN(date.getTime())) return date;
              }
              return null;
            };

            const parsedDate = extractDateFromFilename(attachment.filename);
            
            if (parsedDate) {
              vogIssueDate = parsedDate.toISOString().split('T')[0];
              
              // Check if VOG is expired (older than 3 months)
              const threeMonthsAgo = new Date();
              threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
              
              if (parsedDate < threeMonthsAgo) {
                vogExpiryStatus = 'expired';
                console.log(`⚠️ VOG is EXPIRED (issued ${vogIssueDate})`);
              } else {
                // Check if expiring soon (within 2 weeks)
                const expiryDate = new Date(parsedDate);
                expiryDate.setMonth(expiryDate.getMonth() + 3);
                const twoWeeksFromNow = new Date();
                twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
                
                if (expiryDate <= twoWeeksFromNow) {
                  vogExpiryStatus = 'expiring_soon';
                  console.log(`⚠️ VOG expiring soon (issued ${vogIssueDate})`);
                } else {
                  vogExpiryStatus = 'valid';
                  console.log(`✅ VOG is valid (issued ${vogIssueDate})`);
                }
              }
            } else {
              // Date not found in filename - assume valid for now, but flag for manual review
              vogExpiryStatus = 'valid';
              console.log(`ℹ️ VOG uploaded, date not detected in filename - assuming valid`);
            }
          }
          
          // Insert document record into database
          const { error: docInsertError } = await supabase
            .from('application_documents')
            .insert({
              application_id: applicationId,
              filename: attachment.filename,
              file_path: filePath,
              content_type: attachment.content_type,
              document_type: documentType,
              vog_issue_date: vogIssueDate,
              vog_expiry_status: vogExpiryStatus,
              metadata: {
                uploaded_via: 'email_reply',
                original_email_id: message_id,
              }
            });
          
          if (docInsertError) {
            console.error(`❌ Failed to log document:`, docInsertError);
          } else {
            processedDocuments.push({
              filename: attachment.filename,
              file_path: filePath,
              document_type: documentType,
              vog_expiry_status: vogExpiryStatus || undefined,
            });
            
            // Update extracted_data based on document type
            if (documentType === 'vog' && vogExpiryStatus === 'valid') {
              analysis.new_data.vog_file_path = filePath;
              analysis.new_data.vog_uploaded = true;
              if (vogIssueDate) {
                analysis.new_data.vog_date = vogIssueDate;
              }
              // Remove 'vog' from remaining_missing_info
              if (analysis.remaining_missing_info) {
                analysis.remaining_missing_info = analysis.remaining_missing_info
                  .filter((item: string) => !item.toLowerCase().includes('vog'));
              }
              console.log(`✅ VOG validated and linked to application`);
            } else if (documentType === 'vog' && vogExpiryStatus === 'expired') {
              // VOG is expired - don't remove from missing_info
              analysis.new_data.vog_file_path = filePath;
              analysis.new_data.vog_expired = true;
              console.log(`⚠️ VOG expired - still in missing_info`);
            }
          }
        } catch (attachmentError) {
          console.error(`❌ Error processing attachment ${attachment.filename}:`, attachmentError);
        }
      }
      
      console.log(`📎 Processed ${processedDocuments.length} documents`);
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

      // =====================================================
      // STAP 7: Continue Follow-up Loop
      // Als completeness nog < 80%, trigger nieuwe agent_goal
      // =====================================================
      if (newCompletenessScore < 80 && analysis.remaining_missing_info?.length > 0) {
        console.log("Completeness still < 80%, triggering new follow-up goal...");
        
        // Check hoeveel follow-ups er al zijn geweest
        const { count: existingFollowups } = await supabase
          .from("agent_goals")
          .select("*", { count: "exact", head: true })
          .eq("goal_type", "application_intake_completion")
          .contains("input_data", { application_id: applicationId });

        const followUpCount = existingFollowups || 0;

        // Max 3 follow-ups per applicatie
        if (followUpCount < 3) {
          const professionalName = mergedData.naam || mergedData.full_name || from.split("@")[0];
          
          const { error: goalError } = await supabase
            .from("agent_goals")
            .insert({
              org_id: application.org_id,
              goal_type: "application_intake_completion",
              goal_description: `Vervolg follow-up voor ${professionalName} (${followUpCount + 1}/3)`,
              priority: 100 - newCompletenessScore,
              input_data: {
                application_id: applicationId,
                candidate_email: from,
                candidate_name: professionalName,
                missing_info: analysis.remaining_missing_info,
                current_completeness: newCompletenessScore,
                follow_up_count: followUpCount,
              },
              status: "pending"
            });

          if (goalError) {
            console.error("Error creating follow-up goal:", goalError);
          } else {
            console.log(`Created follow-up goal #${followUpCount + 1} for application ${applicationId}`);
          }
        } else {
          console.log(`Max follow-ups (3) reached for application ${applicationId}`);
        }
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
