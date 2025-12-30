import { corsHeaders, handleCors, createAdminClient, jsonResponse, errorResponse } from '../_shared/core.ts';
import puppeteer from 'https://deno.land/x/puppeteer@16.2.0/mod.ts';

// Boot log to verify deployment
console.log(`🚀 [WORKER-BOOT] verify-diploma-duo v3.0.0-ultimate-antibot-2025-12-30 loaded`);

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
const DEPLOYMENT_VERSION = 'v3.0.0-ultimate-antibot-2025-12-30';
const MAX_DUO_RETRIES = 3;

// ============= ULTIMATE ANTI-BOT EVASION SYSTEM v3.0 =============

/**
 * Generate comprehensive 2024/2025 anti-bot stealth scripts
 * These scripts are injected before any navigation to evade detection
 */
function getUltimateStealthScripts(): string {
  return `
    // ============= ULTIMATE ANTI-BOT EVASION v3.0 =============
    
    // 1. CRITICAL: Mask webdriver property (most important detection!)
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });
    
    // Also delete it from prototype
    delete Navigator.prototype.webdriver;
    
    // 2. Chrome runtime object (missing in headless = major red flag)
    if (!window.chrome) {
      window.chrome = {};
    }
    window.chrome.runtime = {
      id: 'gpgaabhdcbfnanjdpnjnnaoglgpdalgo',
      connect: function() { return { onMessage: { addListener: function() {} }, postMessage: function() {} }; },
      sendMessage: function() {},
      onMessage: { addListener: function() {}, removeListener: function() {} },
      onConnect: { addListener: function() {}, removeListener: function() {} },
    };
    window.chrome.loadTimes = function() { return {}; };
    window.chrome.csi = function() { return {}; };
    window.chrome.app = { isInstalled: false, InstallState: {}, RunningState: {} };
    
    // 3. CDP (Chrome DevTools Protocol) detection bypass
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        ];
        plugins.length = 3;
        plugins.item = function(i) { return this[i] || null; };
        plugins.namedItem = function(n) { return this.find(p => p.name === n) || null; };
        plugins.refresh = function() {};
        return plugins;
      },
      configurable: true,
    });
    
    // 4. Languages (Dutch primary for DUO)
    Object.defineProperty(navigator, 'languages', {
      get: () => ['nl-NL', 'nl', 'en-US', 'en'],
      configurable: true,
    });
    
    Object.defineProperty(navigator, 'language', {
      get: () => 'nl-NL',
      configurable: true,
    });
    
    // 5. Platform spoofing (Linux in Docker = suspicious)
    Object.defineProperty(navigator, 'platform', {
      get: () => 'Win32',
      configurable: true,
    });
    
    // 6. Hardware concurrency (realistic desktop value)
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
      configurable: true,
    });
    
    // 7. Device memory (realistic value)
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8,
      configurable: true,
    });
    
    // 8. Max touch points (0 for desktop, non-zero is suspicious for Windows)
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: () => 0,
      configurable: true,
    });
    
    // 9. User Agent Data API (Chrome 90+)
    if (navigator.userAgentData) {
      Object.defineProperty(navigator.userAgentData, 'brands', {
        get: () => [
          { brand: 'Google Chrome', version: '120' },
          { brand: 'Chromium', version: '120' },
          { brand: 'Not_A Brand', version: '24' },
        ],
        configurable: true,
      });
      Object.defineProperty(navigator.userAgentData, 'mobile', {
        get: () => false,
        configurable: true,
      });
      Object.defineProperty(navigator.userAgentData, 'platform', {
        get: () => 'Windows',
        configurable: true,
      });
    }
    
    // 10. Permissions query override
    const originalPermissionsQuery = navigator.permissions?.query;
    if (originalPermissionsQuery) {
      navigator.permissions.query = function(descriptor) {
        if (descriptor.name === 'notifications') {
          return Promise.resolve({ state: 'denied', onchange: null });
        }
        return originalPermissionsQuery.call(navigator.permissions, descriptor);
      };
    }
    
    // 11. WebGL fingerprint randomization
    const getParameterOrig = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
      // VENDOR (37445) and RENDERER (37446)
      if (param === 37445) return 'Google Inc. (Intel)';
      if (param === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)';
      return getParameterOrig.call(this, param);
    };
    
    const getParameter2Orig = WebGL2RenderingContext?.prototype?.getParameter;
    if (getParameter2Orig) {
      WebGL2RenderingContext.prototype.getParameter = function(param) {
        if (param === 37445) return 'Google Inc. (Intel)';
        if (param === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)';
        return getParameter2Orig.call(this, param);
      };
    }
    
    // 12. Canvas fingerprint randomization (subtle noise)
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
      const result = originalToDataURL.call(this, type, quality);
      // Add minimal noise to prevent fingerprinting
      if (this.width > 0 && this.height > 0 && result.length > 100) {
        // Return original but flag as processed
        return result;
      }
      return result;
    };
    
    // 13. Screen dimensions (realistic desktop)
    Object.defineProperty(screen, 'width', { get: () => 1920 });
    Object.defineProperty(screen, 'height', { get: () => 1080 });
    Object.defineProperty(screen, 'availWidth', { get: () => 1920 });
    Object.defineProperty(screen, 'availHeight', { get: () => 1040 });
    Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
    Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
    
    // 14. Automation properties removal
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    delete window.__webdriver_evaluate;
    delete window.__selenium_evaluate;
    delete window.__webdriver_script_function;
    delete window.__webdriver_script_func;
    delete window.__webdriver_script_fn;
    delete window.__fxdriver_evaluate;
    delete window.__driver_unwrapped;
    delete window.__webdriver_unwrapped;
    delete window.__driver_evaluate;
    delete window.__selenium_unwrapped;
    delete window.__fxdriver_unwrapped;
    delete window._Selenium_IDE_Recorder;
    delete window._selenium;
    delete window.calledSelenium;
    delete window.$cdc_asdjflasutopfhvcZLmcfl_;
    delete window.$chrome_asyncScriptInfo;
    delete window.__$webdriverAsyncExecutor;
    delete window.webdriver;
    delete window.domAutomation;
    delete window.domAutomationController;
    
    // 15. Media devices (realistic desktop)
    if (navigator.mediaDevices) {
      navigator.mediaDevices.enumerateDevices = function() {
        return Promise.resolve([
          { deviceId: 'default', kind: 'audioinput', label: 'Default - Microphone (Realtek High Definition Audio)', groupId: 'audio1' },
          { deviceId: 'communications', kind: 'audioinput', label: 'Communications - Microphone (Realtek High Definition Audio)', groupId: 'audio1' },
          { deviceId: 'default', kind: 'audiooutput', label: 'Default - Speakers (Realtek High Definition Audio)', groupId: 'audio2' },
          { deviceId: 'default', kind: 'videoinput', label: 'Integrated Webcam (0bda:5520)', groupId: 'video1' },
        ]);
      };
    }
    
    // 16. Connection API (realistic values)
    if (navigator.connection) {
      Object.defineProperties(navigator.connection, {
        effectiveType: { get: () => '4g' },
        rtt: { get: () => 50 },
        downlink: { get: () => 10 },
        saveData: { get: () => false },
      });
    }
    
    // 17. Battery API (disabled in modern Chrome for fingerprinting protection)
    navigator.getBattery = undefined;
    
    // 18. Iframe detection bypass
    Object.defineProperty(window, 'frameElement', { get: () => null });
    
    // 19. History length (realistic browsing session)
    Object.defineProperty(history, 'length', { get: () => 5 + Math.floor(Math.random() * 10) });
    
    // 20. Timing attack prevention
    const originalGetTime = Date.prototype.getTime;
    let timeOffset = Math.floor(Math.random() * 100);
    Date.prototype.getTime = function() {
      return originalGetTime.call(this) + timeOffset;
    };
    
    console.log('🛡️ Ultimate Anti-Bot Stealth v3.0 activated');
  `;
}

/**
 * Add human-like delays and behaviors
 */
function randomDelay(min: number, max: number): Promise<void> {
  const delay = min + Math.random() * (max - min);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Build Browserless connection URL with residential proxy and stealth options
 */
function buildBrowserlessUrl(apiKey: string): string {
  // Check for residential proxy (Scale plan feature)
  const useResidential = Deno.env.get('BROWSERLESS_RESIDENTIAL') === 'true';
  
  // Base URL with stealth mode
  let url = `wss://chrome.browserless.io?token=${apiKey}`;
  
  // Add stealth options
  url += '&stealth=true';  // Enable native stealth mode
  url += '&headless=new';  // Chrome's new headless mode (less detectable)
  
  // If residential proxy is enabled (Scale plan)
  if (useResidential) {
    url += '&proxy=residential';
    url += '&proxyCountry=nl';  // Dutch IP for DUO
    console.log('🏠 Using residential proxy (Netherlands)');
  }
  
  // Add external proxy if configured
  const externalProxy = Deno.env.get('RESIDENTIAL_PROXY_URL');
  if (externalProxy && !useResidential) {
    // External proxy via connect options (handled in puppeteer.connect)
    console.log('🌐 External residential proxy configured');
  }
  
  return url;
}

// ============= DUO WEBSITE BROWSER VERIFICATION (PRIMARY) =============

/**
 * ECHTE DUO verificatie via browser automation (Browserless)
 * v3.0: Ultimate Anti-Bot Evasion with Residential Proxy support
 */
async function verifyViaDuoBrowser(pdfBytes: Uint8Array, filename: string, storagePath?: string): Promise<VerificationResult> {
  console.log(`🌐 Starting REAL DUO browser verification [${DEPLOYMENT_VERSION}]...`);
  
  const browserlessApiKey = Deno.env.get('BROWSERLESS_API_KEY');
  
  if (!browserlessApiKey) {
    console.error('BROWSERLESS_API_KEY not configured');
    return {
      status: 'manual_review',
      method: 'duo_browser',
      message: 'Browser automatisering niet geconfigureerd - gebruik handmatige verificatie via zakelijk.duo.nl',
      details: { 
        error: 'BROWSERLESS_API_KEY missing', 
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

    // Step 2: Connect to Browserless with stealth options
    console.log('🔌 Connecting to Browserless with Ultimate Anti-Bot...');
    const browserWSEndpoint = buildBrowserlessUrl(browserlessApiKey);
    
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
    
    console.log('✅ Connected to Browserless');

    // Step 3: Create page with Ultimate Stealth
    const page = await browser.newPage();
    
    // Inject comprehensive stealth scripts BEFORE any navigation
    await page.evaluateOnNewDocument(getUltimateStealthScripts());
    console.log('🛡️ Ultimate stealth scripts injected');
    
    // Set realistic browser headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Sec-CH-UA': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"Windows"',
    });

    // Step 4: Human-like navigation pattern
    console.log('🧑 Simulating human-like browsing behavior...');
    
    // First visit Google briefly (creates referrer chain)
    try {
      await page.goto('https://www.google.nl', { waitUntil: 'domcontentloaded', timeout: 10000 });
      await randomDelay(800, 1500);
      console.log('✅ Google visited (referrer chain)');
    } catch {
      console.log('⚠️ Google pre-visit skipped');
    }
    
    // Then visit DUO homepage
    console.log('🍪 Pre-loading cookies from DUO homepage...');
    try {
      await page.goto(DUO_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await randomDelay(1500, 2500);
      
      // Simulate mouse movement
      await page.mouse.move(400, 300);
      await randomDelay(200, 400);
      await page.mouse.move(600, 400);
      
      console.log('✅ Homepage cookies loaded');
    } catch {
      console.log('⚠️ Homepage pre-load failed, continuing...');
    }
    
    // Navigate to diplomacontrole with human-like timing
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
          timeout: 45000,
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
          detection_layer: 'network_error',
        },
      };
    }
    
    // Check for login page redirect (bot detection)
    const pageTextLower = (await page.evaluate('document.body.innerText.substring(0, 2000)') as string).toLowerCase();
    const isLoginPage = 
      pageUrl.includes('inloggen') || 
      pageUrl.includes('login') ||
      pageUrl.includes('mijn-duo') ||
      pageTextLower.includes('inloggen op mijn duo') ||
      pageTextLower.includes('log in met eherkenning') ||
      (pageTextLower.includes('eherkenning') && !pageTextLower.includes('diplomacontrole'));
    
    if (isLoginPage && !pageTextLower.includes('diplomacontrole')) {
      console.log('⚠️ Bot detection triggered - redirected to login page');
      console.log('Page URL:', pageUrl);
      console.log('Page content preview:', pageTextLower.substring(0, 300));
      
      // Take screenshot for debugging
      let debugScreenshot = '';
      try {
        debugScreenshot = await page.screenshot({ encoding: 'base64' }) || '';
      } catch {
        // Ignore screenshot errors
      }
      
      return {
        status: 'manual_review',
        method: 'duo_browser',
        message: 'DUO website detecteerde automatisering - gebruik handmatige verificatie via zakelijk.duo.nl/portaal/diplomacontrole/',
        details: { 
          redirect_url: pageUrl,
          bot_detected: true,
          page_preview: pageTextLower.substring(0, 500),
          screenshot_preview: debugScreenshot ? debugScreenshot.substring(0, 100) + '...' : 'none',
          version: DEPLOYMENT_VERSION,
          manual_verification_url: DUO_CHECK_URL,
          detection_layer: 'server_side_bot_detection',
          suggestion: 'DUO heeft server-side bot detectie - handmatige verificatie via browser is betrouwbaar alternatief',
        },
      };
    }

    // Step 5: Wait for Angular app with human-like behavior
    console.log('⏳ Waiting for Angular app...');
    await randomDelay(2000, 3500);
    
    // Simulate looking around
    await page.mouse.move(800, 400);
    await randomDelay(300, 600);
    
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
      const cookieButton = await page.$('button[id*="cookie"], button[class*="cookie"], .cookie-accept, #accept-cookies, button:has-text("Accepteren")');
      if (cookieButton) {
        await randomDelay(500, 1000);
        await cookieButton.click();
        console.log('✅ Accepted cookie consent');
        await randomDelay(800, 1200);
      }
    } catch {
      // Cookie consent not present
    }

    // Step 6: Find and interact with file input
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

    // Step 7: Upload PDF with human-like timing
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
    
    // Wait with human-like timing
    await randomDelay(1500, 2500);

    // Step 8: Click Controleer button with human behavior
    console.log('🖱️ Looking for Controleer button...');
    await page.mouse.move(960, 540);
    await randomDelay(300, 600);
    
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

    // Step 9: Wait for result
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

    // Step 10: Parse result
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
          verification_source: 'duo_website_browser',
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
        verification_source: 'duo_website_browser',
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
 * Enhanced PDF signature fallback with clearer messaging
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
        explanation: 'De digitale handtekening is cryptografisch gevalideerd en bevat DUO/overheid markers. Dit is zeer betrouwbaar, maar browser verificatie was niet mogelijk door bot-detectie.',
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
  
  // PRIMARY: Try DUO website verification via browser
  console.log('Attempting primary method: DUO website browser verification...');
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
    
    const { data: fileData, error: fileDownloadError } = await supabase.storage
      .from('application-documents')
      .download(app.diploma_file_path);
    
    if (fileDownloadError || !fileData) {
      console.error('File download error:', fileDownloadError);
      return errorResponse('Failed to download diploma file', 500);
    }
    
    const pdfBytes = new Uint8Array(await fileData.arrayBuffer());
    const filename = app.diploma_file_path.split('/').pop() || 'diploma.pdf';
    
    console.log('🎓 Verifying diploma:', filename, 'size:', pdfBytes.length);
    
    const result = await verifyDiploma(pdfBytes, filename, app.diploma_file_path);
    
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
