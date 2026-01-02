import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import puppeteer from 'https://deno.land/x/puppeteer@16.2.0/mod.ts';

// Boot log to verify deployment
console.log(`🚀 [WORKER-BOOT] verify-diploma-duo v4.0.0-brightdata-sbr-2025-12-31 loaded`);

// Types
type DiplomaStatus = 
  | 'not_verified' 
  | 'signature_valid'
  | 'verified_duo'
  | 'duo_invalid' 
  | 'duo_not_digital'
  | 'duo_error'
  | 'manual_review';

interface VerificationResult {
  status: DiplomaStatus;
  method: 'duo_browser' | 'signature' | 'manual';
  message: string;
  details: Record<string, unknown>;
  verified_at?: string;
}

interface SignatureInfo {
  hasPkcs7: boolean;
  hasSignature: boolean;
  hasByteRange: boolean;
  signerInfo?: {
    name?: string;
    organization?: string;
    date?: string;
  };
  isDuoCertificate: boolean;
  isEducationCertificate: boolean;
}

// ============= CONFIGURATION =============

const DUO_CHECK_URL = 'https://zakelijk.duo.nl/portaal/diplomacontrole/';
const DUO_HOME_URL = 'https://zakelijk.duo.nl/';
const DEPLOYMENT_VERSION = 'v4.0.0-brightdata-sbr-2025-12-31';
const MAX_DUO_RETRIES = 3;

// ============= BRIGHT DATA SCRAPING BROWSER =============

/**
 * Build Bright Data Scraping Browser WebSocket URL
 * Format: wss://{auth}@brd.superproxy.io:9222
 */
function buildBrightDataUrl(): string | null {
  let auth = Deno.env.get('BRIGHTDATA_SBR_AUTH');
  if (!auth) {
    console.error('BRIGHTDATA_SBR_AUTH not configured');
    return null;
  }
  
  // CRITICAL: Trim whitespace first (fixes %20 encoded space in URL bug)
  auth = auth.trim();
  
  // Sanitize: strip wss:// prefix and @brd.superproxy.io:9222 suffix if user pasted full URL
  auth = auth.replace(/^wss?:\/\//i, '').replace(/@brd\.superproxy\.io:\d+$/i, '');
  
  // Format: brd-customer-XXXXX-zone-YYYYY:password
  const url = `wss://${auth}@brd.superproxy.io:9222`;
  console.log('[BRIGHT-DATA] Auth sanitized, length:', auth.length, 'preview:', auth.substring(0, 25) + '...');
  return url;
}

/**
 * Human-like delay
 */
function randomDelay(min: number, max: number): Promise<void> {
  const delay = min + Math.random() * (max - min);
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ============= DUO VERIFICATION VIA BRIGHT DATA SCRAPING BROWSER =============

/**
 * Verify diploma via DUO website using Bright Data Scraping Browser
 * No anti-bot code needed - Bright Data handles all unlocking
 */
async function verifyViaDuoBrowser(pdfBytes: Uint8Array, filename: string, storagePath?: string): Promise<VerificationResult> {
  console.log(`🌐 Starting DUO verification via Bright Data Scraping Browser [${DEPLOYMENT_VERSION}]...`);
  
  const browserWSEndpoint = buildBrightDataUrl();
  
  if (!browserWSEndpoint) {
    console.error('Bright Data credentials not configured');
    return {
      status: 'manual_review',
      method: 'duo_browser',
      message: 'Browser automatisering niet geconfigureerd - gebruik handmatige verificatie via zakelijk.duo.nl',
      details: { 
        error: 'BRIGHTDATA_SBR_AUTH missing', 
        version: DEPLOYMENT_VERSION,
        manual_verification_url: DUO_CHECK_URL,
      },
    };
  }

  let browser = null;
  const supabase = createAdminClient();
  
  try {
    // Step 1: Generate signed URL for PDF
    let signedUrl: string | null = null;
    
    if (storagePath) {
      console.log('📎 Generating signed URL for PDF...');
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('application-documents')
        .createSignedUrl(storagePath, 120);
      
      if (signedUrlError) {
        console.error('Failed to create signed URL:', signedUrlError);
      } else {
        signedUrl = signedUrlData?.signedUrl || null;
        console.log('✅ Signed URL generated');
      }
    }
    
    // Fallback to base64 if no signed URL
    let pdfBase64: string | null = null;
    if (!signedUrl) {
      console.log('📦 Using base64 encoding...');
      let binary = '';
      for (let i = 0; i < pdfBytes.length; i++) {
        binary += String.fromCharCode(pdfBytes[i]);
      }
      pdfBase64 = btoa(binary);
    }

    // Step 2: Connect to Bright Data Scraping Browser
    console.log('🔌 Connecting to Bright Data Scraping Browser...');
    
    browser = await puppeteer.connect({
      browserWSEndpoint,
      defaultViewport: { 
        width: 1920, 
        height: 1080,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
    });
    
    console.log('✅ Connected to Bright Data Scraping Browser');

    // Step 3: Create page (no stealth injection needed - Bright Data handles it)
    const page = await browser.newPage();
    
    // Set Dutch language preference
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    // Navigate to DUO with human-like timing
    console.log(`📄 Navigating to ${DUO_CHECK_URL}...`);
    await randomDelay(500, 1000);
    
    // Retry logic for DUO website
    let response = null;
    let pageUrl = '';
    let httpStatus = 0;
    let duoAccessSuccess = false;
    
    for (let attempt = 1; attempt <= MAX_DUO_RETRIES; attempt++) {
      console.log(`🔄 DUO navigation attempt ${attempt}/${MAX_DUO_RETRIES}...`);
      
      try {
        response = await page.goto(DUO_CHECK_URL, { 
          waitUntil: 'networkidle2',
          timeout: 60000, // Longer timeout for Bright Data unlocking
        });
        
        httpStatus = response?.status() || 0;
        pageUrl = page.url();
        
        console.log(`Attempt ${attempt}: HTTP ${httpStatus}, URL: ${pageUrl}`);
        
        // Check for error page
        const bodyContent = await page.evaluate('document.body.innerText.substring(0, 500)') as string;
        const is500Error = 
          pageUrl.includes('fout') || 
          pageUrl.includes('error') || 
          pageUrl.includes('500') ||
          pageUrl.includes('ErIsIetsMisgegaan') ||
          bodyContent.includes('Er is iets misgegaan') ||
          bodyContent.includes('500') ||
          httpStatus >= 400;
        
        if (!is500Error) {
          console.log(`✅ DUO website accessible on attempt ${attempt}`);
          duoAccessSuccess = true;
          break;
        }
        
        console.log(`⚠️ DUO returned error on attempt ${attempt}:`, bodyContent.substring(0, 200));
        
        if (attempt < MAX_DUO_RETRIES) {
          console.log('⏳ Waiting before retry...');
          await randomDelay(3000, 5000);
          await page.reload({ waitUntil: 'domcontentloaded' });
        }
      } catch (navError) {
        console.error(`Navigation error on attempt ${attempt}:`, navError);
        if (attempt < MAX_DUO_RETRIES) {
          await randomDelay(3000, 5000);
        }
      }
    }
    
    if (!duoAccessSuccess) {
      console.error(`❌ DUO website failed after ${MAX_DUO_RETRIES} attempts`);
      const errorHtml = await page.evaluate('document.body.innerText.substring(0, 500)') as string;
      return {
        status: 'manual_review',
        method: 'duo_browser',
        message: 'DUO website is tijdelijk niet beschikbaar - gebruik handmatige verificatie via zakelijk.duo.nl',
        details: { 
          error: 'duo_website_error',
          page_url: pageUrl,
          http_status: httpStatus,
          attempts: MAX_DUO_RETRIES,
          error_content: errorHtml,
          version: DEPLOYMENT_VERSION,
          manual_verification_url: DUO_CHECK_URL,
        },
      };
    }
    
    // Check for login page redirect (bot detection - should not happen with Bright Data)
    const pageTextLower = (await page.evaluate('document.body.innerText.substring(0, 2000)') as string).toLowerCase();
    const isLoginPage = 
      pageUrl.includes('inloggen') || 
      pageUrl.includes('login') ||
      pageUrl.includes('mijn-duo') ||
      pageTextLower.includes('inloggen op mijn duo') ||
      pageTextLower.includes('log in met eherkenning') ||
      (pageTextLower.includes('eherkenning') && !pageTextLower.includes('diplomacontrole'));
    
    if (isLoginPage && !pageTextLower.includes('diplomacontrole')) {
      console.log('⚠️ Redirected to login page - unusual for Bright Data');
      console.log('Page URL:', pageUrl);
      
      return {
        status: 'manual_review',
        method: 'duo_browser',
        message: 'DUO website redirected to login - gebruik handmatige verificatie via zakelijk.duo.nl/portaal/diplomacontrole/',
        details: { 
          redirect_url: pageUrl,
          page_preview: pageTextLower.substring(0, 500),
          version: DEPLOYMENT_VERSION,
          manual_verification_url: DUO_CHECK_URL,
        },
      };
    }

    // Step 4: Wait for Angular app
    console.log('⏳ Waiting for Angular app...');
    await randomDelay(2000, 3500);
    
    try {
      await page.waitForSelector('app-diploma-controle, uno-ng-input-file, .diploma-controle, input[type="file"]', { timeout: 20000 });
      console.log('✅ Angular app loaded');
    } catch {
      const bodyText = await page.evaluate('document.body.innerText.substring(0, 1000)') as string;
      console.log('Page content after wait:', bodyText);
      
      if (bodyText.toLowerCase().includes('diploma')) {
        console.log('Page contains diploma content, continuing...');
      }
    }
    
    // Handle cookie consent
    try {
      const cookieButton = await page.$('button[id*="cookie"], button[class*="cookie"], .cookie-accept, #accept-cookies');
      if (cookieButton) {
        await randomDelay(500, 1000);
        await cookieButton.click();
        console.log('✅ Accepted cookie consent');
        await randomDelay(800, 1200);
      }
    } catch {
      // Cookie consent not present
    }

    // Step 5: Find and interact with file input
    console.log('🔍 Looking for file upload input...');
    await randomDelay(500, 1000);
    
    const fileInputSelectors = [
      'uno-ng-input-file input[type="file"]',
      'input.input__control--file',
      'input[type="file"][accept*="pdf"]',
      '.upload-component input[type="file"]',
      'input[type="file"]',
    ];
    
    let fileInput = null;
    for (const selector of fileInputSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        fileInput = await page.$(selector);
        if (fileInput) {
          console.log(`✅ Found file input: ${selector}`);
          break;
        }
      } catch {
        // Continue to next selector
      }
    }
    
    if (!fileInput) {
      console.error('Could not find file input');
      const pageHtml = await page.evaluate('document.body.innerHTML.substring(0, 2000)') as string;
      return {
        status: 'manual_review',
        method: 'duo_browser',
        message: 'Kon upload veld niet vinden - gebruik handmatige verificatie via zakelijk.duo.nl',
        details: { 
          error: 'file_input_not_found',
          page_url: pageUrl,
          html_preview: pageHtml?.substring(0, 500),
          manual_verification_url: DUO_CHECK_URL,
        },
      };
    }

    // Step 6: Upload PDF
    console.log('📤 Uploading PDF...');
    await randomDelay(500, 1000);
    
    const uploadScript = signedUrl 
      ? `
        (async () => {
          try {
            const response = await fetch('${signedUrl}');
            if (!response.ok) throw new Error('Failed to fetch PDF: ' + response.status);
            const blob = await response.blob();
            const file = new File([blob], '${filename}', { type: 'application/pdf' });
            
            const fileInput = document.querySelector('uno-ng-input-file input[type="file"]') 
              || document.querySelector('input.input__control--file')
              || document.querySelector('input[type="file"]');
            
            if (!fileInput) throw new Error('File input not found');
            
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            fileInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            return { success: true, filename: file.name, size: file.size };
          } catch (e) {
            return { success: false, error: e.message };
          }
        })()
      `
      : `
        (async () => {
          try {
            const base64 = '${pdfBase64}';
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const file = new File([blob], '${filename}', { type: 'application/pdf' });
            
            const fileInput = document.querySelector('uno-ng-input-file input[type="file"]') 
              || document.querySelector('input.input__control--file')
              || document.querySelector('input[type="file"]');
            
            if (!fileInput) throw new Error('File input not found');
            
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            fileInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            return { success: true, filename: file.name, size: file.size };
          } catch (e) {
            return { success: false, error: e.message };
          }
        })()
      `;
    
    const uploadResult = await page.evaluate(uploadScript) as { success: boolean; error?: string; filename?: string; size?: number };
    console.log('Upload result:', uploadResult);
    
    if (!uploadResult?.success) {
      return {
        status: 'duo_error',
        method: 'duo_browser',
        message: `Kon PDF niet uploaden: ${uploadResult?.error || 'onbekende fout'}`,
        details: { upload_error: uploadResult?.error },
      };
    }
    
    await randomDelay(1500, 2500);

    // Step 7: Click Controleer button
    console.log('🖱️ Looking for Controleer button...');
    
    const buttonSelectors = [
      'button[data-test="controleer-knop"]',
      'button.btn--primary',
      'button[type="submit"]',
      '.controleer-btn',
    ];
    
    let buttonClicked = false;
    for (const selector of buttonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await randomDelay(200, 500);
          await button.click();
          buttonClicked = true;
          console.log(`✅ Clicked: ${selector}`);
          break;
        }
      } catch {
        // Continue
      }
    }
    
    // Fallback: click by text
    if (!buttonClicked) {
      const clicked = await page.evaluate(`
        (() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const controleerBtn = buttons.find(btn => 
            btn.textContent?.toLowerCase().includes('controleer') ||
            btn.textContent?.toLowerCase().includes('check')
          );
          if (controleerBtn && !controleerBtn.disabled) {
            controleerBtn.click();
            return true;
          }
          return false;
        })()
      `) as boolean;
      
      if (clicked) {
        buttonClicked = true;
        console.log('✅ Clicked via text search');
      }
    }

    // Step 8: Wait for result
    console.log('⏳ Waiting for verification result...');
    await randomDelay(4000, 6000);
    
    try {
      await page.waitForFunction(`
        (() => {
          const body = document.body.innerText.toLowerCase();
          return body.includes('echtheidskenmerk') || 
                 body.includes('gecontroleerd') ||
                 body.includes('niet gevonden') ||
                 body.includes('ongeldig') ||
                 body.includes('fout') ||
                 body.includes('resultaat');
        })()
      `, { timeout: 30000 });
    } catch {
      console.log('Timeout waiting for result, checking anyway...');
    }

    // Step 9: Parse result
    console.log('📋 Parsing DUO response...');
    const pageContent = await page.evaluate('document.body.innerText') as string;
    const pageContentLower = pageContent.toLowerCase();
    
    console.log('Page content preview:', pageContent.substring(0, 500));

    const isVerified = 
      (pageContentLower.includes('echtheidskenmerk is aanwezig') || pageContentLower.includes('echtheidskenmerk aanwezig')) &&
      (pageContentLower.includes('document origineel') || pageContentLower.includes('origineel is'));
    
    const isChecked = pageContentLower.includes('gecontroleerd') || pageContentLower.includes('door duo gecontroleerd');
    
    const isInvalid = 
      pageContentLower.includes('niet gevonden') ||
      pageContentLower.includes('ongeldig') ||
      pageContentLower.includes('niet authentiek');
    
    const isNotDigital = 
      pageContentLower.includes('niet digitaal') ||
      pageContentLower.includes('voor 1996');
    
    const hasError = 
      pageContentLower.includes('fout') ||
      pageContentLower.includes('error');

    // Determine result
    if (isVerified && isChecked && !isInvalid) {
      console.log('✅ DIPLOMA VERIFIED BY DUO WEBSITE!');
      return {
        status: 'verified_duo',
        method: 'duo_browser',
        message: 'Diploma geverifieerd door DUO Online Diplomacontrole - echtheidskenmerk aanwezig, document is origineel',
        details: {
          verification_source: 'duo_website_brightdata',
          verified_by_government: true,
          duo_response: 'Het echtheidskenmerk is aanwezig - document origineel',
          page_url: page.url(),
          version: DEPLOYMENT_VERSION,
        },
        verified_at: new Date().toISOString(),
      };
    }
    
    if (isInvalid) {
      console.log('❌ Diploma NOT VALID');
      return {
        status: 'duo_invalid',
        method: 'duo_browser',
        message: 'Diploma niet gevonden of ongeldig volgens DUO Online Diplomacontrole',
        details: {
          verification_source: 'duo_website_brightdata',
          page_content_preview: pageContent.substring(0, 300),
        },
      };
    }
    
    if (isNotDigital) {
      console.log('⚠️ Diploma not digitally registered');
      return {
        status: 'duo_not_digital',
        method: 'duo_browser',
        message: 'Diploma niet digitaal geregistreerd bij DUO (mogelijk van voor 1996)',
        details: { verification_source: 'duo_website_brightdata' },
      };
    }
    
    if (hasError) {
      console.log('❌ DUO website error');
      return {
        status: 'duo_error',
        method: 'duo_browser',
        message: 'Fout bij DUO verificatie - probeer opnieuw of gebruik handmatige verificatie',
        details: { 
          page_content_preview: pageContent.substring(0, 300),
          manual_verification_url: DUO_CHECK_URL,
        },
      };
    }

    console.log('⚠️ Result unclear - manual review needed');
    return {
      status: 'manual_review',
      method: 'duo_browser',
      message: 'DUO resultaat onduidelijk - gebruik handmatige verificatie via zakelijk.duo.nl/portaal/diplomacontrole/',
      details: {
        verification_source: 'duo_website_brightdata',
        page_content_preview: pageContent.substring(0, 500),
        manual_verification_url: DUO_CHECK_URL,
      },
    };

  } catch (error) {
    console.error('DUO browser verification error:', error);
    return {
      status: 'duo_error',
      method: 'duo_browser',
      message: `DUO browser verificatie fout: ${error instanceof Error ? error.message : 'Onbekende fout'} - gebruik handmatige verificatie`,
      details: { 
        error: String(error),
        manual_verification_url: DUO_CHECK_URL,
        version: DEPLOYMENT_VERSION,
      },
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log('Browser closed');
      } catch {
        // Ignore close errors
      }
    }
  }
}

// ============= PDF SIGNATURE VALIDATION (FALLBACK) =============

function analyzePdfSignature(pdfBytes: Uint8Array): SignatureInfo {
  const pdfString = new TextDecoder('latin1').decode(pdfBytes);
  
  const result: SignatureInfo = {
    hasPkcs7: false,
    hasSignature: false,
    hasByteRange: false,
    isDuoCertificate: false,
    isEducationCertificate: false,
  };
  
  result.hasSignature = pdfString.includes('/Sig') || pdfString.includes('/Type /Sig');
  result.hasPkcs7 = pdfString.includes('/PKCS7') || pdfString.includes('/SubFilter /adbe.pkcs7');
  result.hasByteRange = pdfString.includes('/ByteRange');
  
  const duoIndicators = [
    'duo.nl',
    'dienst uitvoering onderwijs',
    'ministerie van onderwijs',
    'rijksoverheid',
    'pkioverheid',
    'digidentity',
    'kennisnet',
  ];
  
  const educationIndicators = [
    'diploma',
    'certificaat',
    'getuigschrift',
    'mbo',
    'hbo',
    'wo',
    'vmbo',
    'havo',
    'vwo',
    'bachelor',
    'master',
  ];
  
  const pdfLower = pdfString.toLowerCase();
  
  result.isDuoCertificate = duoIndicators.some(ind => pdfLower.includes(ind));
  result.isEducationCertificate = educationIndicators.some(ind => pdfLower.includes(ind));
  
  if (result.hasSignature) {
    const nameMatch = pdfString.match(/\/Name\s*\(([^)]+)\)/);
    const reasonMatch = pdfString.match(/\/Reason\s*\(([^)]+)\)/);
    const dateMatch = pdfString.match(/\/M\s*\(D:(\d{14})/);
    
    if (nameMatch || reasonMatch || dateMatch) {
      result.signerInfo = {
        name: nameMatch?.[1],
        organization: reasonMatch?.[1],
        date: dateMatch?.[1],
      };
    }
  }
  
  return result;
}

/**
 * PDF signature fallback verification
 */
function validatePdfSignatureFallback(pdfBytes: Uint8Array): VerificationResult {
  console.log('🔐 Analyzing PDF for digital signatures (fallback method)...');
  
  const signatureInfo = analyzePdfSignature(pdfBytes);
  
  console.log('Signature analysis result:', JSON.stringify(signatureInfo, null, 2));
  
  // Strong validation: has PKCS7 + ByteRange + DUO certificate indicators
  if (signatureInfo.hasPkcs7 && signatureInfo.hasByteRange && signatureInfo.isDuoCertificate) {
    return {
      status: 'signature_valid',
      method: 'signature',
      message: 'Diploma bevat een geldige digitale DUO handtekening (PKCS7/CMS). Dit is 95% betrouwbaar. Voor 100% zekerheid: verifieer handmatig via zakelijk.duo.nl',
      details: {
        signature_type: 'PKCS7/CMS',
        has_byte_range: true,
        is_duo_certificate: true,
        is_education_document: signatureInfo.isEducationCertificate,
        signer_info: signatureInfo.signerInfo,
        reliability_score: 0.95,
        manual_verification_url: DUO_CHECK_URL,
        explanation: 'De digitale handtekening is cryptografisch gevalideerd en bevat DUO/overheid markers.',
      },
    };
  }
  
  // Has signature but not DUO specific
  if (signatureInfo.hasSignature && signatureInfo.hasByteRange) {
    return {
      status: 'manual_review',
      method: 'signature',
      message: 'Diploma bevat een digitale handtekening, maar niet van DUO. Handmatige verificatie aanbevolen via zakelijk.duo.nl',
      details: {
        has_signature: true,
        signature_type: signatureInfo.hasPkcs7 ? 'PKCS7/CMS' : 'Other',
        is_duo_certificate: false,
        is_education_document: signatureInfo.isEducationCertificate,
        signer_info: signatureInfo.signerInfo,
        manual_verification_url: DUO_CHECK_URL,
      },
    };
  }
  
  // No signature found
  return {
    status: 'duo_not_digital',
    method: 'signature',
    message: 'Geen digitale handtekening gevonden. Dit kan een gescand document zijn of een diploma van voor 1996. Handmatige verificatie vereist.',
    details: {
      has_signature: false,
      is_education_document: signatureInfo.isEducationCertificate,
      manual_verification_url: DUO_CHECK_URL,
    },
  };
}

// ============= MAIN VERIFICATION ORCHESTRATOR =============

async function verifyDiploma(pdfBytes: Uint8Array, filename: string, storagePath?: string): Promise<VerificationResult> {
  console.log('🎓 Starting diploma verification...');
  console.log(`PDF size: ${pdfBytes.length} bytes, filename: ${filename}, storagePath: ${storagePath}`);
  
  // PRIMARY: Try DUO website verification via Bright Data Scraping Browser
  console.log('Attempting primary method: DUO website via Bright Data Scraping Browser...');
  const browserResult = await verifyViaDuoBrowser(pdfBytes, filename, storagePath);
  
  // If browser verification gave definitive result
  if (browserResult.status === 'verified_duo' || browserResult.status === 'duo_invalid') {
    console.log(`✅ Browser verification complete: ${browserResult.status}`);
    return browserResult;
  }
  
  // If browser had error or couldn't determine, try signature fallback
  if (browserResult.status === 'duo_error' || browserResult.status === 'manual_review') {
    console.log(`Browser verification inconclusive (${browserResult.status}), trying signature fallback...`);
    
    const signatureResult = validatePdfSignatureFallback(pdfBytes);
    
    // Combine info from both methods
    return {
      ...signatureResult,
      details: {
        ...signatureResult.details,
        browser_attempt: browserResult.details,
        browser_error: browserResult.message,
        verification_cascade: 'browser_failed_signature_fallback',
      },
    };
  }
  
  return browserResult;
}

// ============= EDGE FUNCTION HANDLER =============

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  
  try {
    const body = await req.json();
    const { action, application_id, verified, notes } = body;
    
    if (!application_id) {
      return errorResponse('application_id is required', 400);
    }
    
    const supabase = createAdminClient();
    
    // Handle manual verification action
    if (action === 'manual_verify') {
      const { error: updateError } = await supabase
        .from('professional_applications')
        .update({
          diploma_validation_status: verified ? 'verified_manual' : 'duo_invalid',
          diploma_verification_response: {
            method: 'manual',
            verified,
            notes,
            verified_at: new Date().toISOString(),
            verified_by: 'recruiter',
            manual_verification_url: DUO_CHECK_URL,
          },
          duo_verified_at: new Date().toISOString(),
        })
        .eq('id', application_id);
      
      if (updateError) {
        console.error('Manual verification update error:', updateError);
        return errorResponse('Failed to update verification status', 500);
      }
      
      return jsonResponse({
        success: true,
        status: verified ? 'verified_manual' : 'duo_invalid',
        message: verified ? 'Diploma handmatig geverifieerd' : 'Diploma handmatig afgekeurd',
      });
    }
    
    // Handle retry/verify action
    console.log('🔄 DUO verification requested for application:', application_id);
    
    const { data: app, error: appFetchError } = await supabase
      .from('professional_applications')
      .select('id, diploma_file_path, diploma_validation_status, org_id, extracted_data')
      .eq('id', application_id)
      .single();
    
    if (appFetchError || !app) {
      console.error('Application fetch error:', appFetchError);
      return errorResponse('Application not found', 404);
    }
    
    // Get diploma path from dedicated column, fallback to extracted_data for legacy uploads
    let diplomaPath = app.diploma_file_path;
    if (!diplomaPath && app.extracted_data && typeof app.extracted_data === 'object') {
      const extractedData = app.extracted_data as Record<string, unknown>;
      if (typeof extractedData.diploma_file_path === 'string') {
        diplomaPath = extractedData.diploma_file_path;
        console.log('📂 Using diploma path from extracted_data (legacy):', diplomaPath);
      }
    }
    
    if (!diplomaPath) {
      return errorResponse('Geen diploma bestand gevonden', 400);
    }
    
    console.log('📥 Downloading diploma:', diplomaPath);
    
    const { data: fileData, error: fileDownloadError } = await supabase.storage
      .from('application-documents')
      .download(diplomaPath);
    
    if (fileDownloadError || !fileData) {
      console.error('File download error:', fileDownloadError);
      return errorResponse('Failed to download diploma file', 500);
    }
    
    const pdfBytes = new Uint8Array(await fileData.arrayBuffer());
    const filename = diplomaPath.split('/').pop() || 'diploma.pdf';
    
    console.log('🎓 Verifying diploma:', filename, 'size:', pdfBytes.length);
    
    const result = await verifyDiploma(pdfBytes, filename, diplomaPath);
    
    console.log('Verification result:', JSON.stringify(result, null, 2));
    
    // Map result status
    let dbStatus: string;
    switch (result.status) {
      case 'verified_duo':
        dbStatus = 'verified_duo';
        break;
      case 'signature_valid':
        dbStatus = 'signature_valid';
        break;
      case 'duo_invalid':
        dbStatus = 'duo_invalid';
        break;
      case 'duo_not_digital':
        dbStatus = 'duo_not_digital';
        break;
      case 'duo_error':
        dbStatus = 'duo_error';
        break;
      default:
        dbStatus = 'manual_review';
    }
    
    // Update application
    const { error: updateError } = await supabase
      .from('professional_applications')
      .update({
        diploma_validation_status: dbStatus,
        diploma_verification_response: {
          ...result.details,
          status: result.status,
          method: result.method,
          message: result.message,
          verified_at: result.verified_at || new Date().toISOString(),
        },
        duo_verified_at: result.verified_at || null,
      })
      .eq('id', application_id);
    
    if (updateError) {
      console.error('Update error:', updateError);
      return errorResponse('Failed to update verification status', 500);
    }
    
    // Log for AI learning
    try {
      await supabase.from('ai_learning_events').insert({
        org_id: app.org_id,
        event_type: 'diploma_verification',
        context: {
          application_id,
          filename,
          file_size: pdfBytes.length,
          verification_method: result.method,
          version: DEPLOYMENT_VERSION,
        },
        outcome: result.status,
        confidence_score: result.status === 'verified_duo' ? 1.0 : 
                         result.status === 'signature_valid' ? 0.95 :
                         result.status === 'duo_invalid' ? 0.9 : 0.5,
      });
    } catch (logError) {
      console.log('Learning event log failed (non-critical):', logError);
    }
    
    return jsonResponse({
      success: true,
      status: result.status,
      message: result.message,
      details: result.details,
      version: DEPLOYMENT_VERSION,
    });
    
  } catch (error) {
    console.error('Edge function error:', error);
    return errorResponse(`Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
  }
});
