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
  | 'manual_review'
  | 'queued';

interface VerificationResult {
  status: DuoVerificationStatus;
  message: string;
  details?: Record<string, unknown>;
  verified_at?: string;
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 30000]; // 5s, 15s, 30s exponential backoff

// Realistic User Agents for rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
];

/**
 * Get a random user agent from the list
 */
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Puppeteer script that runs on Browserless.io to verify diploma via DUO portal
 * Enhanced with anti-bot detection measures and human-like behavior
 */
function generatePuppeteerScript(pdfBase64: string, userAgent: string): string {
  return `
export default async ({ page }) => {
  const DUO_PORTAL_URL = 'https://zakelijk.duo.nl/portaal/diplomacontrole/';
  
  // Helper function for waiting
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  // Human-like random wait (adds natural variation)
  const humanWait = async (minMs, maxMs) => {
    const delay = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
    await wait(delay);
  };
  
  // Simulate mouse movement (human-like behavior)
  const randomMouseMove = async () => {
    const x = Math.floor(Math.random() * 800) + 100;
    const y = Math.floor(Math.random() * 400) + 100;
    await page.mouse.move(x, y, { steps: 10 });
  };
  
  try {
    console.log('🎓 Starting DUO verification with anti-detection...');
    
    // Set user agent before navigation
    await page.setUserAgent('${userAgent}');
    
    // Set viewport to common desktop size
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set extra headers to appear more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    });
    
    // Override navigator properties to evade detection
    await page.evaluateOnNewDocument(() => {
      // Hide webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      
      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' }
        ]
      });
      
      // Override languages
      Object.defineProperty(navigator, 'languages', { get: () => ['nl-NL', 'nl', 'en-US', 'en'] });
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      // Add Chrome runtime
      window.chrome = { runtime: {} };
    });
    
    // Random initial mouse movement (human-like)
    await randomMouseMove();
    
    console.log('🌐 Navigating to DUO portal...');
    await page.goto(DUO_PORTAL_URL, { 
      waitUntil: 'networkidle2',
      timeout: 45000 
    });
    
    // Human-like wait after page load
    await humanWait(2000, 4000);
    
    // Random scroll to simulate reading
    await page.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 200)));
    await humanWait(500, 1500);
    
    // Check if we're on the right page
    const pageTitle = await page.title();
    console.log('Page title:', pageTitle);
    
    // Check for captcha or bot detection
    const pageContent = await page.content();
    if (pageContent.includes('captcha') || pageContent.includes('robot') || 
        pageContent.includes('geblokkeerd') || pageContent.includes('blocked')) {
      console.log('⚠️ Bot detection or captcha detected');
      return {
        success: false,
        status: 'manual_review',
        message: 'DUO portal heeft bot-detectie geactiveerd - handmatige verificatie vereist',
        bot_detected: true,
        page_title: pageTitle
      };
    }
    
    // Take screenshot for debugging
    const screenshotBefore = await page.screenshot({ encoding: 'base64' });
    console.log('Screenshot before upload (base64 length):', screenshotBefore.length);
    
    // Move mouse before interacting
    await randomMouseMove();
    await humanWait(300, 800);
    
    // Find the file upload input
    const fileInput = await page.$('input[type="file"]');
    
    if (!fileInput) {
      console.log('❌ File input not found, checking for alternative upload methods...');
      
      // Try to find any upload button or drop zone
      let uploadButton = await page.$('[data-testid="upload"], .upload-button');
      
      // If not found, search buttons by text content
      if (!uploadButton) {
        const buttons = await page.$$('button');
        for (const btn of buttons) {
          const text = await btn.evaluate(el => el.textContent?.toLowerCase() || '');
          if (text.includes('upload') || text.includes('bestand') || text.includes('kiezen')) {
            uploadButton = btn;
            break;
          }
        }
      }
      
      if (uploadButton) {
        await humanWait(200, 500);
        await uploadButton.click();
        await humanWait(1000, 2000);
      }
      
      // Re-check for file input
      const fileInputRetry = await page.$('input[type="file"]');
      if (!fileInputRetry) {
        return {
          success: false,
          status: 'manual_review',
          message: 'DUO portal structuur gewijzigd of niet toegankelijk - handmatige verificatie vereist',
          page_title: pageTitle,
          screenshot: screenshotBefore
        };
      }
    }
    
    // Upload PDF using base64 buffer
    console.log('📄 Uploading PDF...');
    
    const actualFileInput = await page.$('input[type="file"]');
    if (actualFileInput) {
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
    
    // Human-like wait after upload
    await humanWait(3000, 5000);
    
    // Move mouse around (human behavior)
    await randomMouseMove();
    
    // Look for and click the "Controleer" (Verify) button
    console.log('🔍 Looking for verify button...');
    let verifyButton = await page.$('button[type="submit"], .btn-primary');
    
    if (!verifyButton) {
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.textContent?.toLowerCase() || '');
        if (text.includes('controleer') || text.includes('verifieer') || text.includes('verify')) {
          verifyButton = btn;
          break;
        }
      }
    }
    
    if (verifyButton) {
      console.log('✅ Found verify button, clicking...');
      await humanWait(300, 700);
      await verifyButton.click();
      
      // Wait for result page with human-like timing
      await humanWait(5000, 8000);
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
    const bodyTextLower = bodyText.toLowerCase();
    if (bodyTextLower.includes('geldig') || 
        bodyTextLower.includes('geregistreerd') || 
        bodyTextLower.includes('bekend') ||
        bodyTextLower.includes('echtheidskenmerk is aanwezig') ||
        bodyTextLower.includes('document origineel is en uitgegeven door duo') ||
        bodyTextLower.includes('document is door duo gecontroleerd') ||
        bodyTextLower.includes('controle geslaagd') ||
        bodyTextLower.includes('authentiek')) {
      status = 'verified';
      message = 'Diploma is geverifieerd en geldig volgens DUO register';
    }
    // Check for invalid indicators
    else if (bodyTextLower.includes('ongeldig') ||
             bodyTextLower.includes('niet gevonden') || bodyTextLower.includes('onbekend') ||
             bodyTextLower.includes('niet authentiek') || bodyTextLower.includes('vervalst')) {
      status = 'invalid';
      message = 'Diploma is niet gevonden in DUO register of is ongeldig';
    }
    // Check for "not digital" indicators (older diplomas not in system)
    else if (bodyTextLower.includes('niet digitaal') || bodyTextLower.includes('geen digitale') ||
             bodyTextLower.includes('1996')) {
      status = 'not_digital';
      message = 'Diploma is van voor 1996 of niet digitaal geregistreerd - handmatige verificatie vereist';
    }
    // Check for error indicators
    else if (bodyTextLower.includes('fout') || bodyTextLower.includes('error') || 
             bodyTextLower.includes('mislukt') || bodyTextLower.includes('probeer opnieuw')) {
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
    return {
      success: false,
      status: 'manual_review',
      message: 'DUO verificatie niet automatisch mogelijk - handmatige verificatie vereist: ' + error.message,
      error: error.toString(),
      retryable: true
    };
  }
};
`;
}

/**
 * Check rate limiting - prevent too many requests to DUO
 */
async function checkRateLimit(supabase: ReturnType<typeof createAdminClient>): Promise<{ allowed: boolean; queuePosition?: number }> {
  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  
  const { data: recentAttempts, error } = await supabase
    .from('professional_applications')
    .select('id')
    .gte('duo_verified_at', oneMinuteAgo)
    .limit(10);
  
  if (error) {
    console.warn('Rate limit check failed:', error);
    return { allowed: true }; // Allow on error
  }
  
  // Allow max 3 verifications per minute
  if (recentAttempts && recentAttempts.length >= 3) {
    return { allowed: false, queuePosition: recentAttempts.length - 2 };
  }
  
  return { allowed: true };
}

/**
 * Call Browserless.io with stealth mode and retry logic
 */
async function callBrowserlessWithRetry(
  browserlessApiKey: string,
  puppeteerCode: string,
  applicationId: string
): Promise<{ success: boolean; result: unknown; attempt: number }> {
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    console.log(`🔄 Browserless attempt ${attempt + 1}/${MAX_RETRIES}...`);
    
    try {
      // Build URL with stealth options
      const queryParams = new URLSearchParams({
        token: browserlessApiKey,
        stealth: 'true',              // Enable stealth mode
        blockAds: 'true',             // Block ads and trackers
        timeout: '60000'              // 60 second timeout
      });
      
      // Note: Residential proxy requires Browserless paid plan
      // If you have it, add: proxy: 'residential', proxyCountry: 'nl'
      
      const browserlessUrl = `https://production-sfo.browserless.io/function?${queryParams.toString()}`;
      
      const response = await fetch(browserlessUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/javascript'
        },
        body: puppeteerCode
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Browserless API error (${response.status}):`, errorText.substring(0, 300));
        
        // Check if retryable
        if (response.status >= 500 || response.status === 429) {
          if (attempt < MAX_RETRIES - 1) {
            console.log(`⏳ Waiting ${RETRY_DELAYS[attempt]}ms before retry...`);
            await sleep(RETRY_DELAYS[attempt]);
            continue;
          }
        }
        
        return {
          success: false,
          result: {
            status: 'manual_review',
            message: 'DUO verificatie service tijdelijk niet beschikbaar - handmatige verificatie vereist',
            status_code: response.status,
            details: errorText.substring(0, 500)
          },
          attempt: attempt + 1
        };
      }
      
      const result = await response.json();
      console.log(`✅ Browserless response (attempt ${attempt + 1}):`, JSON.stringify(result).substring(0, 300));
      
      // Check if result indicates retryable error
      if (result.retryable && result.status === 'manual_review' && attempt < MAX_RETRIES - 1) {
        console.log(`⏳ Retryable error, waiting ${RETRY_DELAYS[attempt]}ms...`);
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      
      // Check for bot detection - might succeed on retry with different timing
      if (result.bot_detected && attempt < MAX_RETRIES - 1) {
        console.log(`⏳ Bot detected, waiting ${RETRY_DELAYS[attempt]}ms before retry...`);
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      
      return {
        success: result.success || result.status === 'verified',
        result,
        attempt: attempt + 1
      };
      
    } catch (fetchError) {
      console.error(`❌ Browserless fetch error (attempt ${attempt + 1}):`, fetchError);
      
      if (attempt < MAX_RETRIES - 1) {
        console.log(`⏳ Network error, waiting ${RETRY_DELAYS[attempt]}ms before retry...`);
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      
      return {
        success: false,
        result: {
          status: 'manual_review',
          message: 'DUO verificatie service niet bereikbaar na meerdere pogingen - handmatige verificatie vereist',
          error: fetchError instanceof Error ? fetchError.message : 'Network error'
        },
        attempt: attempt + 1
      };
    }
  }
  
  // Should not reach here, but return fallback
  return {
    success: false,
    result: {
      status: 'manual_review',
      message: 'Maximaal aantal pogingen bereikt - handmatige verificatie vereist'
    },
    attempt: MAX_RETRIES
  };
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

      // Check rate limiting
      const rateLimitCheck = await checkRateLimit(supabase);
      if (!rateLimitCheck.allowed) {
        console.log(`⏳ Rate limited - queue position: ${rateLimitCheck.queuePosition}`);
        
        await supabase
          .from('professional_applications')
          .update({ 
            duo_verification_status: 'queued',
            duo_verification_result: { 
              message: 'Verificatie in wachtrij om overbelasting te voorkomen',
              queue_position: rateLimitCheck.queuePosition,
              queued_at: new Date().toISOString()
            }
          })
          .eq('id', application_id);
        
        return jsonResponse({
          success: false,
          application_id,
          verification_status: 'queued',
          message: 'Verificatie in wachtrij - probeer over 1 minuut opnieuw',
          queue_position: rateLimitCheck.queuePosition
        });
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

      // Generate Puppeteer script with random user agent
      const userAgent = getRandomUserAgent();
      const puppeteerCode = generatePuppeteerScript(pdfBase64, userAgent);
      
      console.log("🌐 Calling Browserless.io with stealth mode and retry logic...");
      console.log(`📱 Using User-Agent: ${userAgent.substring(0, 50)}...`);
      
      // Call Browserless with retry logic
      const { success, result, attempt } = await callBrowserlessWithRetry(
        browserlessApiKey,
        puppeteerCode,
        application_id
      );
      
      console.log(`📊 Browserless completed after ${attempt} attempt(s), success: ${success}`);

      // Extract result data
      const resultData = result as Record<string, unknown>;
      
      // Map result to our status
      const verificationStatus: DuoVerificationStatus = (resultData.status as DuoVerificationStatus) || 'manual_review';
      const verificationResult: VerificationResult = {
        status: verificationStatus,
        message: (resultData.message as string) || 'Verificatie voltooid',
        details: {
          page_title: resultData.page_title,
          body_preview: resultData.body_text_preview,
          browserless_success: success,
          attempts: attempt,
          user_agent_used: userAgent.substring(0, 50),
          bot_detected: resultData.bot_detected || false
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
          org_id: '00000000-0000-0000-0000-000000000001',
          event_type: 'duo_diploma_verification',
          context: {
            application_id,
            verification_status: verificationStatus,
            success,
            attempts: attempt,
            bot_detected: resultData.bot_detected || false
          },
          outcome: verificationStatus === 'verified' ? 'success' : 'needs_review'
        });
      } catch (logError) {
        console.warn("Could not log learning event:", logError);
      }

      console.log(`✅ DUO Verification complete: ${verificationStatus} (${attempt} attempts)`);

      return jsonResponse({
        success: verificationStatus === 'verified',
        application_id,
        verification_status: verificationStatus,
        message: verificationResult.message,
        verified_at: verificationResult.verified_at,
        attempts: attempt
      });
    }

    return errorResponse("Invalid action", 400);

  } catch (error) {
    console.error("❌ Error in verify-diploma-duo:", error);
    
    return jsonResponse({
      success: false,
      verification_status: 'manual_review',
      message: 'DUO verificatie service error - handmatige verificatie vereist',
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});
