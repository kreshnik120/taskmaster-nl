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

/**
 * ECHTE DUO verificatie via browser automation (Browserless)
 * Dit opent de DUO website, uploadt de PDF, en parseert het echte resultaat
 */
async function verifyViaDuoBrowser(pdfBytes: Uint8Array, filename: string): Promise<VerificationResult> {
  console.log('🌐 Starting REAL DUO browser verification via Browserless...');
  
  const browserlessApiKey = Deno.env.get('BROWSERLESS_API_KEY');
  
  if (!browserlessApiKey) {
    console.error('BROWSERLESS_API_KEY not configured');
    return {
      status: 'manual_review',
      method: 'duo_browser',
      message: 'Browser automatisering niet geconfigureerd - handmatige verificatie nodig',
      details: { error: 'BROWSERLESS_API_KEY missing' },
    };
  }

  let browser = null;
  let tempDir: string | null = null;
  
  try {
    // Step 1: Save PDF to temp file for upload
    console.log('📁 Creating temp file for PDF upload...');
    tempDir = await Deno.makeTempDir({ prefix: 'diploma_verify_' });
    const tempPdfPath = `${tempDir}/${filename}`;
    await Deno.writeFile(tempPdfPath, pdfBytes);
    console.log(`PDF saved to: ${tempPdfPath} (${pdfBytes.length} bytes)`);

    // Step 2: Connect to Browserless
    console.log('🔌 Connecting to Browserless...');
    const browserWSEndpoint = `wss://chrome.browserless.io?token=${browserlessApiKey}`;
    
    browser = await puppeteer.connect({
      browserWSEndpoint,
      defaultViewport: { width: 1280, height: 800 },
    });
    
    console.log('✅ Connected to Browserless');

    // Step 3: Open DUO diplomacontrole page
    const page = await browser.newPage();
    
    // Set Dutch language headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
    });
    
    console.log(`📄 Navigating to ${DUO_CHECK_URL}...`);
    await page.goto(DUO_CHECK_URL, { 
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    
    // Check if we landed on the right page
    const pageUrl = page.url();
    console.log(`Current URL: ${pageUrl}`);
    
    if (pageUrl.includes('inloggen') || pageUrl.includes('login')) {
      console.log('⚠️ Redirected to login page - this shouldn\'t happen for diplomacontrole');
      return {
        status: 'manual_review',
        method: 'duo_browser',
        message: 'DUO portal vereist onverwacht inloggen - gebruik handmatige verificatie',
        details: { redirect_url: pageUrl },
      };
    }

    // Step 4: Find and click on file upload
    console.log('🔍 Looking for file upload input...');
    
    // Wait for page to be fully loaded
    await page.waitForSelector('input[type="file"], .upload-area, #file, [name="file"]', { timeout: 10000 });
    
    // Find file input (might be hidden)
    const fileInput = await page.$('input[type="file"]');
    
    if (!fileInput) {
      console.error('Could not find file input on page');
      // Take screenshot for debugging
      const screenshot = await page.screenshot({ encoding: 'base64' });
      return {
        status: 'manual_review',
        method: 'duo_browser',
        message: 'Kon upload veld niet vinden op DUO website - website structuur mogelijk gewijzigd',
        details: { 
          error: 'file_input_not_found',
          page_url: pageUrl,
          screenshot_base64: screenshot?.substring(0, 200) + '...',
        },
      };
    }

    // Step 5: Upload the PDF file
    console.log('📤 Uploading PDF to DUO...');
    await fileInput.uploadFile(tempPdfPath);
    
    // Wait a moment for upload to process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 6: Click the "Controleer" button
    console.log('🖱️ Looking for Controleer button...');
    
    // Try various button selectors
    const buttonSelectors = [
      'button[type="submit"]',
      'button:contains("Controleer")',
      '.btn-primary',
      'input[type="submit"]',
      '[data-action="verify"]',
      'button.verify-button',
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
        // Try next selector
      }
    }
    
    // Alternative: click button by text content
    if (!buttonClicked) {
      try {
        // Use page.evaluate with explicit return type
        const clicked = await page.evaluate(`
          (() => {
            const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
            const controleerBtn = buttons.find(btn => 
              btn.textContent?.toLowerCase().includes('controleer') ||
              btn.textContent?.toLowerCase().includes('check') ||
              btn.textContent?.toLowerCase().includes('verificeer')
            );
            if (controleerBtn) {
              controleerBtn.click();
              return true;
            }
            return false;
          })()
        `);
        if (clicked) {
          buttonClicked = true;
          console.log('✅ Clicked button via text content search');
        }
      } catch (e) {
        console.log('Could not find button by text:', e);
      }
    }

    if (!buttonClicked) {
      console.log('⚠️ Could not find Controleer button - form might auto-submit');
    }

    // Step 7: Wait for result
    console.log('⏳ Waiting for DUO verification result...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Wait for result elements using string-based evaluate
    try {
      await page.waitForFunction(`
        (() => {
          const body = document.body.innerText.toLowerCase();
          return body.includes('echtheidskenmerk') || 
                 body.includes('gecontroleerd') ||
                 body.includes('niet gevonden') ||
                 body.includes('ongeldig') ||
                 body.includes('fout') ||
                 body.includes('error');
        })()
      `, { timeout: 30000 });
    } catch (e) {
      console.log('Timeout waiting for result, checking page content anyway...');
    }

    // Step 8: Parse the DUO response
    console.log('📋 Parsing DUO response...');
    // Use string-based evaluate to get page content
    const pageContent = await page.evaluate(`document.body.innerText`) as string;
    const pageContentLower = pageContent.toLowerCase();
    
    console.log('Page content preview:', pageContent.substring(0, 500));

    // Check for positive verification - exact phrases from DUO
    const isVerified = 
      (pageContentLower.includes('echtheidskenmerk is aanwezig') || pageContentLower.includes('echtheidskenmerk aanwezig')) &&
      (pageContentLower.includes('document origineel') || pageContentLower.includes('origineel is'));
    
    const isChecked = pageContentLower.includes('gecontroleerd') || pageContentLower.includes('door duo gecontroleerd');
    
    // Negative indicators
    const isInvalid = 
      pageContentLower.includes('niet gevonden') ||
      pageContentLower.includes('ongeldig') ||
      pageContentLower.includes('niet authentiek') ||
      pageContentLower.includes('niet origineel');
    
    const isNotDigital = 
      pageContentLower.includes('niet digitaal') ||
      pageContentLower.includes('voor 1996') ||
      pageContentLower.includes('geen digitaal diploma');
    
    const hasError = 
      pageContentLower.includes('fout') ||
      pageContentLower.includes('error') ||
      pageContentLower.includes('probleem');

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
          screenshot_base64: screenshotBase64.substring(0, 100) + '...',
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
          duo_response: 'Document niet gevonden of ongeldig',
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
        details: {
          verification_source: 'duo_website_browser',
          duo_response: 'Niet digitaal geregistreerd',
        },
      };
    }
    
    if (hasError) {
      console.log('❌ DUO website returned error');
      return {
        status: 'duo_error',
        method: 'duo_browser',
        message: 'Fout bij DUO verificatie - probeer opnieuw',
        details: {
          verification_source: 'duo_website_browser',
          page_content_preview: pageContent.substring(0, 300),
        },
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
        screenshot_base64: screenshotBase64.substring(0, 100) + '...',
      },
    };

  } catch (error) {
    console.error('DUO browser verification error:', error);
    return {
      status: 'duo_error',
      method: 'duo_browser',
      message: `DUO browser verificatie fout: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
      details: { 
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    };
  } finally {
    // Cleanup
    if (browser) {
      try {
        await browser.close();
        console.log('Browser closed');
      } catch (e) {
        console.log('Error closing browser:', e);
      }
    }
    
    if (tempDir) {
      try {
        await Deno.remove(tempDir, { recursive: true });
        console.log('Temp dir cleaned up');
      } catch (e) {
        console.log('Error cleaning temp dir:', e);
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
async function verifyDiploma(pdfBytes: Uint8Array, filename: string): Promise<VerificationResult> {
  console.log('🎓 Starting diploma verification...');
  console.log(`PDF size: ${pdfBytes.length} bytes, filename: ${filename}`);
  
  // PRIMARY: Try DUO website verification via browser
  console.log('Attempting primary method: DUO website browser verification...');
  const browserResult = await verifyViaDuoBrowser(pdfBytes, filename);
  
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
    
    // Run verification
    const result = await verifyDiploma(pdfBytes, filename);
    
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
