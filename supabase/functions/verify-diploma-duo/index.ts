import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';

// Request schema
const VerifyDiplomaSchema = z.object({
  action: z.enum(['verify', 'check_status']),
  application_id: z.string().uuid(),
  diploma_file_path: z.string().optional(), // Required for 'verify' action
});

// DUO verification statuses
type DuoVerificationStatus = 
  | 'not_verified' 
  | 'pending' 
  | 'verified' 
  | 'invalid' 
  | 'not_digital' 
  | 'error' 
  | 'manual_review';

interface VerificationResult {
  status: DuoVerificationStatus;
  message: string;
  details?: Record<string, unknown>;
  verified_at?: string;
}

/**
 * Puppeteer script that runs on Browserless.io to verify diploma via DUO portal
 * Updated to ESM format (export default async) for Browserless v2
 * 
 * This script:
 * 1. Navigates to DUO Online Diplomacontrole portal
 * 2. Uploads the PDF diploma
 * 3. Clicks verify button
 * 4. Parses the result
 */
function generatePuppeteerScript(pdfBase64: string): string {
  // ESM format for Browserless v2 - uses export default async instead of module.exports
  // NOTE: page.waitForTimeout() is NOT available in Browserless v2 - use setTimeout Promise instead
  return `
export default async ({ page }) => {
  const DUO_PORTAL_URL = 'https://zakelijk.duo.nl/portaal/diplomacontrole/';
  
  // Helper function to replace page.waitForTimeout (not available in Browserless v2)
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  try {
    console.log('🎓 Navigating to DUO portal...');
    await page.goto(DUO_PORTAL_URL, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for the page to fully load
    await wait(2000);
    
    // Check if we're on the right page
    const pageTitle = await page.title();
    console.log('Page title:', pageTitle);
    
    // Take screenshot for debugging
    const screenshotBefore = await page.screenshot({ encoding: 'base64' });
    console.log('Screenshot before upload (base64 length):', screenshotBefore.length);
    
    // Find the file upload input
    const fileInput = await page.$('input[type="file"]');
    
    if (!fileInput) {
      console.log('❌ File input not found, checking for alternative upload methods...');
      
      // Try to find any upload button or drop zone
      const uploadButton = await page.$('[data-testid="upload"], .upload-button, button:has-text("Upload"), button:has-text("Bestand kiezen")');
      if (uploadButton) {
        await uploadButton.click();
        await wait(1000);
      }
      
      // Re-check for file input
      const fileInputRetry = await page.$('input[type="file"]');
      if (!fileInputRetry) {
        // Graceful fallback - portal structure changed or not accessible
        return {
          success: false,
          status: 'manual_review',
          message: 'DUO portal structuur gewijzigd of niet toegankelijk - handmatige verificatie vereist',
          page_title: pageTitle,
          screenshot: screenshotBefore
        };
      }
    }
    
    // Upload PDF using base64 buffer - ESM compatible method
    console.log('📄 Uploading PDF...');
    const pdfBuffer = Uint8Array.from(atob('${pdfBase64}'), c => c.charCodeAt(0));
    
    // Use page.evaluate to create a File object and trigger upload
    const actualFileInput = await page.$('input[type="file"]');
    if (actualFileInput) {
      // Create a data transfer with the file
      await page.evaluate(async (base64Data) => {
        const input = document.querySelector('input[type="file"]');
        if (!input) return false;
        
        // Convert base64 to blob
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const file = new File([blob], 'diploma.pdf', { type: 'application/pdf' });
        
        // Create DataTransfer and set file
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        
        // Trigger change event
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, '${pdfBase64}');
      
      console.log('✅ File uploaded via DataTransfer');
    }
    
    // Wait for upload to process
    await wait(3000);
    
    // Look for and click the "Controleer" (Verify) button
    console.log('🔍 Looking for verify button...');
    const verifyButton = await page.$('button:has-text("Controleer"), button:has-text("Verifieer"), button[type="submit"], .btn-primary');
    
    if (verifyButton) {
      console.log('✅ Found verify button, clicking...');
      await verifyButton.click();
      
      // Wait for result page
      await wait(5000);
    } else {
      console.log('⚠️ Verify button not found, checking if auto-verification...');
    }
    
    // Take screenshot after verification attempt
    const screenshotAfter = await page.screenshot({ encoding: 'base64' });
    
    // Parse the result page
    console.log('📊 Parsing verification result...');
    const bodyText = await page.evaluate(() => document.body.innerText);
    
    // Determine verification status based on page content
    let status = 'manual_review';
    let message = 'Kon verificatie resultaat niet automatisch bepalen - handmatige verificatie vereist';
    
    // Check for success indicators (Dutch text)
    if (bodyText.includes('geldig') || bodyText.includes('Geldig') || 
        bodyText.includes('geregistreerd') || bodyText.includes('bekend')) {
      status = 'verified';
      message = 'Diploma is geverifieerd en geldig volgens DUO register';
    }
    // Check for invalid indicators
    else if (bodyText.includes('ongeldig') || bodyText.includes('Ongeldig') ||
             bodyText.includes('niet gevonden') || bodyText.includes('onbekend')) {
      status = 'invalid';
      message = 'Diploma is niet gevonden in DUO register of is ongeldig';
    }
    // Check for "not digital" indicators (older diplomas not in system)
    else if (bodyText.includes('niet digitaal') || bodyText.includes('geen digitale') ||
             bodyText.includes('handmatig') || bodyText.includes('1996')) {
      status = 'not_digital';
      message = 'Diploma is van voor 1996 of niet digitaal geregistreerd - handmatige verificatie vereist';
    }
    // Check for error indicators
    else if (bodyText.includes('fout') || bodyText.includes('error') || 
             bodyText.includes('mislukt') || bodyText.includes('probeer opnieuw')) {
      status = 'manual_review';
      message = 'DUO portal gaf een foutmelding - handmatige verificatie vereist';
    }
    
    console.log('✅ Verification complete:', status);
    
    return {
      success: status === 'verified',
      status: status,
      message: message,
      page_title: pageTitle,
      body_text_preview: bodyText.substring(0, 500),
      screenshot_after: screenshotAfter
    };
    
  } catch (error) {
    console.error('❌ Puppeteer error:', error.message);
    // Graceful fallback to manual_review instead of error
    return {
      success: false,
      status: 'manual_review',
      message: 'DUO verificatie niet automatisch mogelijk - handmatige verificatie vereist: ' + error.message,
      error: error.toString()
    };
  }
};
`;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const browserlessApiKey = Deno.env.get("BROWSERLESS_API_KEY");
    if (!browserlessApiKey) {
      console.error("❌ BROWSERLESS_API_KEY not configured");
      return errorResponse("BROWSERLESS_API_KEY not configured", 500);
    }

    const supabase = createAdminClient();
    const body = await req.json();
    
    // Validate request
    const validation = VerifyDiplomaSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(`Invalid request: ${validation.error.message}`, 400);
    }
    
    const { action, application_id, diploma_file_path } = validation.data;
    console.log(`🎓 DUO Diploma Verification - Action: ${action}, Application: ${application_id}`);

    // Handle check_status action
    if (action === 'check_status') {
      const { data: app, error } = await supabase
        .from('professional_applications')
        .select('duo_verification_status, duo_verification_result, duo_verified_at')
        .eq('id', application_id)
        .single();
      
      if (error) {
        return errorResponse(`Application not found: ${error.message}`, 404);
      }
      
      return jsonResponse({
        success: true,
        application_id,
        status: app.duo_verification_status,
        result: app.duo_verification_result,
        verified_at: app.duo_verified_at
      });
    }

    // Handle verify action
    if (action === 'verify') {
      if (!diploma_file_path) {
        return errorResponse("diploma_file_path is required for verify action", 400);
      }

      // Update status to pending
      await supabase
        .from('professional_applications')
        .update({ 
          duo_verification_status: 'pending',
          duo_verification_result: { started_at: new Date().toISOString() }
        })
        .eq('id', application_id);

      console.log(`📄 Downloading diploma from storage: ${diploma_file_path}`);
      
      // Download PDF from Supabase Storage
      const { data: pdfData, error: downloadError } = await supabase.storage
        .from('application-documents')
        .download(diploma_file_path);
      
      if (downloadError || !pdfData) {
        console.error("❌ Failed to download diploma PDF:", downloadError);
        
        // Graceful fallback to manual_review instead of error
        await supabase
          .from('professional_applications')
          .update({ 
            duo_verification_status: 'manual_review',
            duo_verification_result: { 
              message: 'Diploma bestand kon niet worden geladen - handmatige verificatie vereist',
              details: downloadError?.message
            }
          })
          .eq('id', application_id);
        
        return jsonResponse({
          success: false,
          application_id,
          verification_status: 'manual_review',
          message: 'Diploma bestand kon niet worden geladen - handmatige verificatie vereist'
        });
      }

      // Convert PDF to base64
      const arrayBuffer = await pdfData.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binaryString = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i]);
      }
      const pdfBase64 = btoa(binaryString);
      console.log(`✅ PDF converted to base64 (${pdfBase64.length} chars)`);

      // Generate Puppeteer script (ESM format)
      const puppeteerCode = generatePuppeteerScript(pdfBase64);
      
      console.log("🌐 Calling Browserless.io Function API (ESM format)...");
      
      // Call Browserless.io Function API with ESM format
      // Updated endpoint and content-type for Browserless v2
      let browserlessResponse;
      try {
        browserlessResponse = await fetch(
          `https://production-sfo.browserless.io/function?token=${browserlessApiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/javascript'  // ESM format requires this
            },
            body: puppeteerCode  // Direct script, no JSON wrapper for ESM
          }
        );
      } catch (fetchError) {
        console.error("❌ Browserless fetch error:", fetchError);
        
        // Graceful fallback to manual_review
        await supabase
          .from('professional_applications')
          .update({ 
            duo_verification_status: 'manual_review',
            duo_verification_result: { 
              message: 'DUO verificatie service niet bereikbaar - handmatige verificatie vereist',
              error: fetchError instanceof Error ? fetchError.message : 'Network error'
            }
          })
          .eq('id', application_id);
        
        return jsonResponse({
          success: false,
          application_id,
          verification_status: 'manual_review',
          message: 'DUO verificatie service niet bereikbaar - handmatige verificatie vereist'
        });
      }

      if (!browserlessResponse.ok) {
        const errorText = await browserlessResponse.text();
        console.error(`❌ Browserless API error (${browserlessResponse.status}):`, errorText);
        
        // Graceful fallback to manual_review instead of error
        await supabase
          .from('professional_applications')
          .update({ 
            duo_verification_status: 'manual_review',
            duo_verification_result: { 
              message: 'DUO verificatie niet automatisch mogelijk - handmatige verificatie vereist',
              status_code: browserlessResponse.status,
              details: errorText.substring(0, 500)
            }
          })
          .eq('id', application_id);
        
        return jsonResponse({
          success: false,
          application_id,
          verification_status: 'manual_review',
          message: 'DUO verificatie niet automatisch mogelijk - handmatige verificatie vereist'
        });
      }

      const result = await browserlessResponse.json();
      console.log("✅ Browserless response received:", JSON.stringify(result).substring(0, 500));

      // Map Browserless result to our status - default to manual_review instead of error
      const verificationStatus: DuoVerificationStatus = result.status || 'manual_review';
      const verificationResult: VerificationResult = {
        status: verificationStatus,
        message: result.message || 'Verificatie voltooid',
        details: {
          page_title: result.page_title,
          body_preview: result.body_text_preview,
          browserless_success: result.success
        },
        verified_at: new Date().toISOString()
      };

      // Update application with result
      const { error: updateError } = await supabase
        .from('professional_applications')
        .update({ 
          duo_verification_status: verificationStatus,
          duo_verification_result: verificationResult,
          duo_verified_at: new Date().toISOString()
        })
        .eq('id', application_id);

      if (updateError) {
        console.error("❌ Failed to update application:", updateError);
      }

      // Log to AI learning for pattern detection
      try {
        await supabase.from('ai_learning_events').insert({
          org_id: '00000000-0000-0000-0000-000000000001', // Default org
          event_type: 'duo_diploma_verification',
          context: {
            application_id,
            verification_status: verificationStatus,
            success: result.success
          },
          outcome: verificationStatus === 'verified' ? 'success' : 'needs_review'
        });
      } catch (logError) {
        console.warn("Could not log learning event:", logError);
      }

      console.log(`✅ DUO Verification complete: ${verificationStatus}`);

      return jsonResponse({
        success: verificationStatus === 'verified',
        application_id,
        verification_status: verificationStatus,
        message: verificationResult.message,
        verified_at: verificationResult.verified_at
      });
    }

    return errorResponse("Invalid action", 400);

  } catch (error) {
    console.error("❌ Error in verify-diploma-duo:", error);
    
    // Even for unexpected errors, try to gracefully fallback
    return jsonResponse({
      success: false,
      verification_status: 'manual_review',
      message: 'DUO verificatie service error - handmatige verificatie vereist',
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});
