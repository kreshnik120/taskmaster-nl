import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { filePath, fileName } = await req.json();

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("training-documents")
      .download(filePath);

    if (downloadError) throw downloadError;

    const text = await fileData.text();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY niet geconfigureerd");
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Analyseer dit bedrijfsdocument en extraheer belangrijke kennis zoals:
- Bedrijfsprocessen
- Standaard procedures
- Klantinformatie
- Regels en richtlijnen
- Workflow stappen

Geef je antwoord als gestructureerde kennis items.`,
          },
          { role: "user", content: `Document: ${fileName}\n\n${text.slice(0, 50000)}` },
        ],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error("AI verwerking mislukt");
    }

    const aiData = await aiResponse.json();
    const extractedInfo = aiData.choices?.[0]?.message?.content || "";

    const { data: docData } = await supabase
      .from("training_documents")
      .select("user_id, org_id")
      .eq("file_path", filePath)
      .single();

    if (docData && extractedInfo) {
      const knowledgeItems = [
        {
          user_id: docData.user_id,
          org_id: docData.org_id,
          category: "documenten",
          key: `document_${fileName}`,
          value: { content: extractedInfo, source_file: fileName },
          source: `document:${fileName}`,
          confidence_score: 0.9,
        },
      ];

      await supabase.from("ai_knowledge_base").insert(knowledgeItems);

      await supabase
        .from("training_documents")
        .update({
          status: "completed",
          processed_at: new Date().toISOString(),
          extracted_knowledge_count: knowledgeItems.length,
        })
        .eq("file_path", filePath);
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Document processing error:", error);

    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
