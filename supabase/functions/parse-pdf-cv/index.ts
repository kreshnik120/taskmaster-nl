import { serve } from "https://deno.land/std@0.218.0/http/server.ts";

// Lightweight PDF text extraction using native Deno APIs
// This avoids the 2.5MB pdfjs-dist dependency

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, filename } = await req.json();
    
    if (!pdfBase64) {
      throw new Error('No PDF data provided');
    }

    console.log(`📄 Parsing PDF: ${filename || 'unknown.pdf'}`);
    
    // Decode base64 → ArrayBuffer
    const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
    
    // Simple PDF text extraction
    // Convert binary to text and extract readable content
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let rawText = decoder.decode(pdfBytes);
    
    // Extract text between stream/endstream markers (basic PDF text extraction)
    let extractedText = "";
    const streamRegex = /stream\s+(.*?)\s+endstream/gs;
    let match;
    
    while ((match = streamRegex.exec(rawText)) !== null) {
      const streamContent = match[1];
      // Filter out non-printable characters and keep only text
      const cleanText = streamContent.replace(/[^\x20-\x7E\s]/g, ' ').trim();
      if (cleanText.length > 10) { // Only keep meaningful text chunks
        extractedText += cleanText + " ";
      }
    }
    
    const trimmedText = extractedText.trim() || "Could not extract text from PDF";
    console.log(`✅ Extracted ${trimmedText.length} chars from ${filename || 'PDF'}`);
    
    return new Response(
      JSON.stringify({ 
        text: trimmedText,
        length: trimmedText.length,
        filename: filename 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("❌ PDF parsing failed:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error),
        text: "" // Return empty string as fallback
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
