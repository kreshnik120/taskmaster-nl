import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import puppeteer from 'https://deno.land/x/puppeteer@16.2.0/mod.ts';

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

// ============= DUO WEBSITE BROWSER VERIFICATION (PRIMARY) =============

const DUO_CHECK_URL = 'https://zakelijk.duo.nl/portaal/diplomacontrole/';
const DUO_HOME_URL = 'https://zakelijk.duo.nl/';
const DEPLOYMENT_VERSION = 'v2.2.0-antibot-2025-12-30';
const MAX_DUO_RETRIES = 3;

/**
 * ECHTE DUO verificatie via browser automation (Browserless)
 * v2.1: Added retry logic, improved 500 error detection, deployment versioning
 */
async function verifyViaDuoBrowser(pdfBytes: Uint8Array, filename: string, storagePath?: string): Promise<VerificationResult> {
  console.log(`🌐 Starting REAL DUO browser verification [${DEPLOYMENT_VERSION}]...`);
  
  const browserlessApiKey = Deno.env.get('BROWSERLESS_API_KEY');
  
  if (!browserlessApiKey) {
    console.error('BROWSERLESS_API_KEY not configured');
    return {
      status: 'manual_review',
      method: 'duo_browser',
      message: 'Browser automatisering niet geconfigureerd - handmatige verificatie nodig',
      details: { error: 'BROWSERLESS_API_KEY missing', version: DEPLOYMENT_VERSION },
    };
  }

  let browser = null;
  const supabase = createAdminClient();
  
  try {
    // Step 1: Generate signed URL for PDF (for remote browser to fetch)
    let signedUrl: string | null = null;
    
    if (storagePath) {
      console.log('📎 Generating signed URL for PDF...');
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('application-documents')
        .createSignedUrl(storagePath, 120); // 2 minutes valid
      
      if (signedUrlError) {
        console.error('Failed to create signed URL:', signedUrlError);
      } else {
        signedUrl = signedUrlData?.signedUrl || null;
        console.log('✅ Signed URL generated');
      }
    }
    
    // If no signed URL, create base64 fallback
    let pdfBase64: string | null = null;
    if (!signedUrl) {
      console.log('📦 No signed URL available, using base64 encoding...');
      // Convert Uint8Array to base64 manually
      let binary = '';
      for (let i = 0; i < pdfBytes.length; i++) {
        binary += String.fromCharCode(pdfBytes[i]);
      }
      pdfBase64 = btoa(binary);
      console.log(`PDF encoded to base64: ${pdfBase64.length} chars`);
    }

    // Step 2: Connect to Browserless
    console.log('🔌 Connecting to Browserless...');
    const browserWSEndpoint = `wss://chrome.browserless.io?token=${browserlessApiKey}`;
    
    browser = await puppeteer.connect({
      browserWSEndpoint,
      defaultViewport: { width: 1280, height: 900 },
    });
    
    console.log('✅ Connected to Browserless');

    // Step 3: Open DUO diplomacontrole page with ANTI-BOT DETECTION
    const page = await browser.newPage();
    
    // ============= ANTI-BOT DETECTION: Puppeteer Stealth =============
    // Apply stealth BEFORE any navigation using raw JS string
    await page.evaluateOnNewDocument(`
      // 1. Mask webdriver property (most important!)
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // 2. Add Chrome runtime object (missing in headless)
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {},
      };
      
      // 3. Override permissions query
      const originalQuery = window.navigator.permissions?.query;
      if (originalQuery) {
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification?.permission || 'denied' })
            : originalQuery.call(navigator.permissions, parameters)
        );
      }
      
      // 4. Set proper plugins array (headless has empty)
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' },
        ],
      });
      
      // 5. Set proper languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['nl-NL', 'nl', 'en-US', 'en'],
      });
      
      // 6. Override platform (Linux in some Docker = suspicious)
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32',
      });
      
      // 7. Mask headless Chrome in user agent data
      if (navigator.userAgentData) {
        Object.defineProperty(navigator.userAgentData, 'brands', {
          get: () => [
            { brand: 'Google Chrome', version: '120' },
            { brand: 'Chromium', version: '120' },
            { brand: 'Not?A_Brand', version: '24' },
          ],
        });
      }
      
      // 8. Override WebGL vendor/renderer (headless shows "Google SwiftShader")
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.call(this, parameter);
      };
    `);
    
    console.log('🛡️ Anti-bot stealth scripts injected');
    
    // Set realistic browser headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    });
    
    // Step 3b: Pre-load cookies by visiting homepage first
    console.log('🍪 Pre-loading cookies from DUO homepage...');
    try {
      await page.goto(DUO_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 1500)); // Let cookies set
      console.log('✅ Homepage cookies loaded');
    } catch (e) {
      console.log('⚠️ Homepage pre-load failed, continuing directly to diplomacontrole...');
    }
    
    console.log(`📄 Navigating to ${DUO_CHECK_URL}...`);
    
    // Retry logic for DUO website (sometimes returns 500 errors)
    let response = null;
    let pageUrl = '';
    let httpStatus = 0;
    let duoAccessSuccess = false;
    
    for (let attempt = 1; attempt <= MAX_DUO_RETRIES; attempt++) {
      console.log(`🔄 DUO navigation attempt ${attempt}/${MAX_DUO_RETRIES}...`);
      
      try {
        response = await page.goto(DUO_CHECK_URL, { 
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        
        httpStatus = response?.status() || 0;
        pageUrl = page.url();
        
        console.log(`Attempt ${attempt}: HTTP ${httpStatus}, URL: ${pageUrl}`);
        
        // Check page content for 500 error (even if URL doesn't show it)
        const bodyContent = await page.evaluate(`document.body.innerText.substring(0, 500)`) as string;
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
          console.log(`⏳ Waiting 3 seconds before retry...`);
          await new Promise(r => setTimeout(r, 3000));
          await page.reload({ waitUntil: 'domcontentloaded' });
        }
      } catch (navError) {
        console.error(`Navigation error on attempt ${attempt}:`, navError);
        if (attempt < MAX_DUO_RETRIES) {
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }
    
    // If all retries failed, return manual_review
    if (!duoAccessSuccess) {
      console.error(`❌ DUO website failed after ${MAX_DUO_RETRIES} attempts`);
      const errorHtml = await page.evaluate(`document.body.innerText.substring(0, 500)`) as string;
      return {
        status: 'manual_review',
        method: 'duo_browser',
        message: 'DUO website is tijdelijk niet beschikbaar - probeer later opnieuw of gebruik handmatige verificatie',
        details: { 
          error: 'duo_website_error',
          page_url: pageUrl,
          http_status: httpStatus,
          attempts: MAX_DUO_RETRIES,
          error_content: errorHtml,
          version: DEPLOYMENT_VERSION,
        },
      };
    }
    
    // Check for login page redirect (bot detection or wrong page)
    const pageTextLower = (await page.evaluate(`document.body.innerText.substring(0, 2000)`) as string).toLowerCase();
    const isLoginPage = 
      pageUrl.includes('inloggen') || 
      pageUrl.includes('login') ||
      pageUrl.includes('mijn-duo') ||
      pageTextLower.includes('inloggen') ||
      pageTextLower.includes('eherkenning') ||
      pageTextLower.includes('digid');
    
    if (isLoginPage && !pageTextLower.includes('diplomacontrole')) {
      console.log('⚠️ Bot detection triggered - redirected to login page');
      console.log('Page URL:', pageUrl);
      console.log('Page content preview:', pageTextLower.substring(0, 300));
      
      // Take screenshot for debugging
      let debugScreenshot = '';
      try {
        debugScreenshot = await page.screenshot({ encoding: 'base64' }) || '';
      } catch (e) {}
      
      return {
        status: 'manual_review',
        method: 'duo_browser',
        message: 'DUO website detecteerde automatisering - gebruik handmatige verificatie via zakelijk.duo.nl',
        details: { 
          redirect_url: pageUrl,
          bot_detected: true,
          page_preview: pageTextLower.substring(0, 500),
          screenshot_preview: debugScreenshot.substring(0, 100) + '...',
          version: DEPLOYMENT_VERSION,
        },
      };
    }

    // Step 4: Wait for Angular app to fully load
    console.log('⏳ Waiting for Angular app to fully initialize...');
    
    // Wait for network to settle
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      // Wait for the Angular diploma-controle component specifically
      await page.waitForSelector('app-diploma-controle, uno-ng-input-file, .diploma-controle', { timeout: 20000 });
      console.log('✅ Angular app fully loaded');
    } catch (e) {
      // Check page content to see what's actually there
      const bodyText = await page.evaluate(`document.body.innerText.substring(0, 1000)`) as string;
      console.log('Page content after wait:', bodyText);
      
      // If page has "diplomacontrole" text, Angular might just be slow
      if (bodyText.toLowerCase().includes('diploma')) {
        console.log('Page contains diploma content, continuing...');
      } else {
        console.log('Warning: Angular app not detected, page may not have loaded correctly');
      }
    }
    
    // Handle cookie consent if present
    try {
      const cookieButton = await page.$('button[id*="cookie"], button[class*="cookie"], .cookie-accept, #accept-cookies');
      if (cookieButton) {
        await cookieButton.click();
        console.log('✅ Accepted cookie consent');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (e) {
      // Cookie consent not present or already accepted
    }

    // Step 5: Find file input with correct DUO Angular selectors
    console.log('🔍 Looking for file upload input (DUO Angular selectors)...');
    
    // DUO uses uno-ng-input-file Angular component
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
          console.log(`✅ Found file input with selector: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`Selector not found: ${selector}`);
      }
    }
    
    if (!fileInput) {
      console.error('Could not find file input on page');
      const screenshot = await page.screenshot({ encoding: 'base64' });
      const pageHtml = await page.evaluate(`document.body.innerHTML.substring(0, 2000)`) as string;
      return {
        status: 'manual_review',
        method: 'duo_browser',
        message: 'Kon upload veld niet vinden op DUO website - website structuur mogelijk gewijzigd',
        details: { 
          error: 'file_input_not_found',
          page_url: pageUrl,
          html_preview: pageHtml?.substring(0, 500),
          screenshot_base64: screenshot?.substring(0, 200) + '...',
        },
      };
    }

    // Step 6: Upload PDF using in-browser fetch (works with remote browser!)
    console.log('📤 Uploading PDF to DUO via in-browser injection...');
    
    const uploadScript = signedUrl 
      ? `
        (async () => {
          try {
            // Fetch PDF from signed URL
            const response = await fetch('${signedUrl}');
            if (!response.ok) throw new Error('Failed to fetch PDF: ' + response.status);
            const blob = await response.blob();
            const file = new File([blob], '${filename}', { type: 'application/pdf' });
            
            // Find file input and inject file
            const fileInput = document.querySelector('uno-ng-input-file input[type="file"]') 
              || document.querySelector('input.input__control--file')
              || document.querySelector('input[type="file"]');
            
            if (!fileInput) throw new Error('File input not found');
            
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            
            // Dispatch change event for Angular
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
            // Decode base64 PDF
            const base64 = '${pdfBase64}';
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const file = new File([blob], '${filename}', { type: 'application/pdf' });
            
            // Find file input and inject file
            const fileInput = document.querySelector('uno-ng-input-file input[type="file"]') 
              || document.querySelector('input.input__control--file')
              || document.querySelector('input[type="file"]');
            
            if (!fileInput) throw new Error('File input not found');
            
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            
            // Dispatch change event for Angular
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
        message: `Kon PDF niet uploaden naar DUO: ${uploadResult?.error || 'onbekende fout'}`,
        details: { upload_error: uploadResult?.error },
      };
    }
    
    // Wait for upload to process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 7: Click the "Controleer" button (correct DUO selector)
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
          await button.click();
          buttonClicked = true;
          console.log(`✅ Clicked button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`Button selector failed: ${selector}`);
      }
    }
    
    // Fallback: click by text content
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
        console.log('✅ Clicked button via text content search');
      }
    }

    if (!buttonClicked) {
      console.log('⚠️ Could not find Controleer button');
    }

    // Step 8: Wait for DUO verification result
    console.log('⏳ Waiting for DUO verification result...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
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
    } catch (e) {
      console.log('Timeout waiting for result, checking page content anyway...');
    }

    // Step 9: Parse DUO response
    console.log('📋 Parsing DUO response...');
    const pageContent = await page.evaluate(`document.body.innerText`) as string;
    const pageContentLower = pageContent.toLowerCase();
    
    console.log('Page content preview:', pageContent.substring(0, 500));

    // Check for positive verification
    const isVerified = 
      (pageContentLower.includes('echtheidskenmerk is aanwezig') || pageContentLower.includes('echtheidskenmerk aanwezig')) &&
      (pageContentLower.includes('document origineel') || pageContentLower.includes('origineel is'));
    
    const isChecked = pageContentLower.includes('gecontroleerd') || pageContentLower.includes('door duo gecontroleerd');
    
    // Negative indicators
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

    // Take screenshot for audit
    let screenshotBase64 = '';
    try {
      screenshotBase64 = await page.screenshot({ encoding: 'base64' }) || '';
    } catch (e) {
      console.log('Could not take screenshot');
    }

    // Determine result
    if (isVerified && isChecked && !isInvalid) {
      console.log('✅ DIPLOMA VERIFIED BY DUO WEBSITE!');
      return {
        status: 'verified_duo',
        method: 'duo_browser',
        message: 'Diploma geverifieerd door DUO Online Diplomacontrole - echtheidskenmerk aanwezig, document is origineel',
        details: {
          verification_source: 'duo_website_browser',
          verified_by_government: true,
          duo_response: 'Het echtheidskenmerk is aanwezig - document origineel',
          page_url: page.url(),
        },
        verified_at: new Date().toISOString(),
      };
    }
    
    if (isInvalid) {
      console.log('❌ Diploma NOT VALID according to DUO');
      return {
        status: 'duo_invalid',
        method: 'duo_browser',
        message: 'Diploma niet gevonden of ongeldig volgens DUO Online Diplomacontrole',
        details: {
          verification_source: 'duo_website_browser',
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
        details: { verification_source: 'duo_website_browser' },
      };
    }
    
    if (hasError) {
      console.log('❌ DUO website returned error');
      return {
        status: 'duo_error',
        method: 'duo_browser',
        message: 'Fout bij DUO verificatie - probeer opnieuw',
        details: { page_content_preview: pageContent.substring(0, 300) },
      };
    }

    // Could not determine result
    console.log('⚠️ Could not determine DUO result - manual review needed');
    return {
      status: 'manual_review',
      method: 'duo_browser',
      message: 'DUO resultaat onduidelijk - handmatige verificatie aanbevolen',
      details: {
        verification_source: 'duo_website_browser',
        page_content_preview: pageContent.substring(0, 500),
      },
    };

  } catch (error) {
    console.error('DUO browser verification error:', error);
    return {
      status: 'duo_error',
      method: 'duo_browser',
      message: `DUO browser verificatie fout: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
      details: { error: String(error) },
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log('Browser closed');
      } catch (e) {
        console.log('Error closing browser:', e);
      }
    }
  }
}

// ============= PDF SIGNATURE VALIDATION (FALLBACK) =============

/**
 * Analyze PDF binary for digital signatures
 * This is a FALLBACK method when browser verification is not available
 */
function analyzePdfSignature(pdfBytes: Uint8Array): SignatureInfo {
  const pdfString = new TextDecoder('latin1').decode(pdfBytes);
  
  const result: SignatureInfo = {
    hasPkcs7: false,
    hasSignature: false,
    hasByteRange: false,
    isDuoCertificate: false,
    isEducationCertificate: false,
  };
  
  // Check for signature-related PDF markers
  result.hasSignature = pdfString.includes('/Sig') || pdfString.includes('/Type /Sig');
  result.hasPkcs7 = pdfString.includes('/PKCS7') || pdfString.includes('/SubFilter /adbe.pkcs7');
  result.hasByteRange = pdfString.includes('/ByteRange');
  
  // Check for known Dutch education certificate authorities
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
  
  // Try to extract signer info from signature dictionary
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
 * Validate PDF signature as fallback method
 * NOTE: This is NOT as reliable as DUO website verification
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
      message: 'Diploma bevat een digitale handtekening - DUO website verificatie aanbevolen voor 100% zekerheid',
      details: {
        signature_type: 'PKCS7/CMS',
        has_byte_range: true,
        is_duo_certificate: true,
        is_education_document: signatureInfo.isEducationCertificate,
        signer_info: signatureInfo.signerInfo,
        warning: 'Dit is lokale analyse, niet echte DUO verificatie',
      },
    };
  }
  
  // Has signature but not DUO specific
  if (signatureInfo.hasSignature && signatureInfo.hasByteRange) {
    return {
      status: 'manual_review',
      method: 'signature',
      message: 'Diploma bevat een digitale handtekening, maar niet van DUO. Handmatige verificatie aanbevolen.',
      details: {
        has_signature: true,
        signature_type: signatureInfo.hasPkcs7 ? 'PKCS7/CMS' : 'Other',
        is_duo_certificate: false,
        is_education_document: signatureInfo.isEducationCertificate,
        signer_info: signatureInfo.signerInfo,
      },
    };
  }
  
  // No signature found
  return {
    status: 'duo_not_digital',
    method: 'signature',
    message: 'Geen digitale handtekening gevonden. Dit kan een gescand document zijn of een diploma van voor 1996.',
    details: {
      has_signature: false,
      is_education_document: signatureInfo.isEducationCertificate,
    },
  };
}

// ============= MAIN VERIFICATION ORCHESTRATOR =============

/**
 * Main verification function
 * Primary: DUO website via browser automation
 * Fallback: PDF signature analysis
 */
async function verifyDiploma(pdfBytes: Uint8Array, filename: string, storagePath?: string): Promise<VerificationResult> {
  console.log('🎓 Starting diploma verification...');
  console.log(`PDF size: ${pdfBytes.length} bytes, filename: ${filename}, storagePath: ${storagePath}`);
  
  // PRIMARY: Try DUO website verification via browser
  console.log('Attempting primary method: DUO website browser verification...');
  const browserResult = await verifyViaDuoBrowser(pdfBytes, filename, storagePath);
  
  // If browser verification was successful or gave definitive result
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
      },
    };
  }
  
  // Return browser result (duo_not_digital, etc.)
  return browserResult;
}

// ============= EDGE FUNCTION HANDLER =============

Deno.serve(async (req: Request) => {
  // Handle CORS
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
      const { data: updateData, error: updateError } = await supabase
        .from('professional_applications')
        .update({
          diploma_validation_status: verified ? 'verified_manual' : 'duo_invalid',
          diploma_verification_response: {
            method: 'manual',
            verified,
            notes,
            verified_at: new Date().toISOString(),
            verified_by: 'recruiter',
          },
          duo_verified_at: new Date().toISOString(),
        })
        .eq('id', application_id)
        .select()
        .single();
      
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
    
    // Get application with diploma file
    const { data: app, error: appFetchError } = await supabase
      .from('professional_applications')
      .select('id, diploma_file_path, diploma_validation_status, org_id')
      .eq('id', application_id)
      .single();
    
    if (appFetchError || !app) {
      console.error('Application fetch error:', appFetchError);
      return errorResponse('Application not found', 404);
    }
    
    if (!app.diploma_file_path) {
      return errorResponse('Geen diploma bestand gevonden', 400);
    }
    
    console.log('📥 Downloading diploma:', app.diploma_file_path);
    
    // Download diploma from storage
    const { data: fileData, error: fileDownloadError } = await supabase.storage
      .from('application-documents')
      .download(app.diploma_file_path);
    
    if (fileDownloadError || !fileData) {
      console.error('File download error:', fileDownloadError);
      return errorResponse('Failed to download diploma file', 500);
    }
    
    // Convert to bytes
    const pdfBytes = new Uint8Array(await fileData.arrayBuffer());
    const filename = app.diploma_file_path.split('/').pop() || 'diploma.pdf';
    
    console.log('🎓 Verifying diploma:', filename, 'size:', pdfBytes.length);
    
    // Run verification with storage path for signed URL generation
    const result = await verifyDiploma(pdfBytes, filename, app.diploma_file_path);
    
    console.log('Verification result:', JSON.stringify(result, null, 2));
    
    // Map result status to diploma_validation_status
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
        },
        outcome: result.status,
        confidence_score: result.status === 'verified_duo' ? 1.0 : 
                         result.status === 'signature_valid' ? 0.7 :
                         result.status === 'manual_review' ? 0.3 : 0.5,
        ai_response: result.details,
      });
    } catch (logError) {
      console.error('AI learning log error (non-fatal):', logError);
    }
    
    return jsonResponse({
      success: true,
      status: result.status,
      method: result.method,
      message: result.message,
      details: result.details,
      verified_at: result.verified_at,
    });
    
  } catch (error) {
    console.error('Edge function error:', error);
    return errorResponse(`Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
  }
});
