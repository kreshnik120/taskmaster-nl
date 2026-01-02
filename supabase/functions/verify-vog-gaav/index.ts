import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';

// Boot log to verify deployment
console.log(`🚀 [WORKER-BOOT] verify-vog-gaav v1.1.0-browserless-base64-eu-2025-01-02 loaded`);

const DEPLOYMENT_VERSION = 'v1.1.0-browserless-base64-eu-2025-01-02';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GAAV_API_URL = 'https://validatie.nl/api/valideer/';

// GAAV Response codes mapping
const GAAV_RESPONSE_MAP: Record<number, { status: string; description: string; requiresManualReview: boolean }> = {
  0: { status: 'authentic_ok', description: 'Document is authentiek en integer', requiresManualReview: false },
  1: { status: 'authentic_fail', description: 'Document is bekend, maar niet integer', requiresManualReview: false },
  2: { status: 'manual_review', description: 'Document niet bekend bij GAAV', requiresManualReview: true },
  3: { status: 'manual_review', description: 'Validatie tijdelijk niet mogelijk', requiresManualReview: true },
  4: { status: 'manual_review', description: 'Provenance error', requiresManualReview: true },
  5: { status: 'manual_review', description: 'Signature error', requiresManualReview: true },
  6: { status: 'authentic_fail', description: 'Handtekening ongeldig', requiresManualReview: false },
  7: { status: 'manual_review', description: 'Custom validation error', requiresManualReview: true },
};

// VOG validity period in months
const VOG_VALIDITY_MONTHS = 3;

// Screening profile descriptions
const SCREENING_PROFILES: Record<string, string> = {
  '45': 'Gezondheidszorg en welzijn van personen',
  '84': 'Zorg voor minderjarigen',
  '85': 'Zorg voor hulpbehoevende personen',
};

function createAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Check if VOG issue date is within validity period
function isVogWithinValidity(issueDate: Date): { valid: boolean; daysRemaining: number; expiryDate: Date } {
  const expiryDate = new Date(issueDate);
  expiryDate.setMonth(expiryDate.getMonth() + VOG_VALIDITY_MONTHS);
  
  const now = new Date();
  const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  return {
    valid: daysRemaining > 0,
    daysRemaining,
    expiryDate
  };
}

// Extract issue date from VOG PDF filename or metadata
function extractVogIssueDate(filename: string): Date | null {
  const patterns = [
    /(\d{4})-(\d{2})-(\d{2})/,           // YYYY-MM-DD
    /(\d{2})-(\d{2})-(\d{4})/,           // DD-MM-YYYY
    /(\d{2})(\d{2})(\d{4})/,             // DDMMYYYY
    /(\d{4})(\d{2})(\d{2})/,             // YYYYMMDD
  ];
  
  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      let year: number, month: number, day: number;
      
      if (pattern.source.startsWith('(\\d{4})')) {
        year = parseInt(match[1]);
        month = parseInt(match[2]) - 1;
        day = parseInt(match[3]);
      } else {
        day = parseInt(match[1]);
        month = parseInt(match[2]) - 1;
        year = parseInt(match[3]);
      }
      
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime()) && year > 2000 && year < 2100) {
        return date;
      }
    }
  }
  
  return null;
}

// Extract screening profile from VOG PDF text content
interface VogScreeningInfo {
  profileCode: string | null;
  functieaspecten: string[];
  functieOmschrijving: string | null;
  rawText: string | null;
  extractionMethod: string;
}

// Extract readable text from PDF binary using multiple methods
async function extractTextFromPdf(pdfBytes: ArrayBuffer): Promise<string> {
  const uint8Array = new Uint8Array(pdfBytes);
  let extractedText = '';
  
  // Method 1: Try pdf-lib for metadata and form fields
  try {
    const pdfDoc = await PDFDocument.load(uint8Array, { ignoreEncryption: true });
    
    // Get metadata which may contain profile info
    const title = pdfDoc.getTitle() || '';
    const subject = pdfDoc.getSubject() || '';
    const keywords = pdfDoc.getKeywords() || '';
    const author = pdfDoc.getAuthor() || '';
    
    extractedText += `METADATA: ${title} ${subject} ${keywords} ${author}\n`;
    console.log(`[PDF-EXTRACT] Metadata: title="${title}", subject="${subject}", keywords="${keywords}"`);
    
    // Get form field values if present (digital VOGs often use forms)
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    for (const field of fields) {
      const name = field.getName();
      try {
        // @ts-ignore - accessing raw value
        const value = field.acroField?.V?.toString() || '';
        if (value) {
          extractedText += `FIELD[${name}]: ${value}\n`;
          console.log(`[PDF-EXTRACT] Form field "${name}": ${value}`);
        }
      } catch {
        // Field value extraction failed, skip
      }
    }
  } catch (pdfLibError) {
    console.log(`[PDF-EXTRACT] pdf-lib extraction failed: ${pdfLibError}`);
  }
  
  // Method 2: Extract text streams from raw PDF content
  // PDFs store text in streams between "BT" (begin text) and "ET" (end text) markers
  try {
    // Convert to string, handling binary carefully
    let rawContent = '';
    for (let i = 0; i < uint8Array.length; i++) {
      const byte = uint8Array[i];
      // Only include printable ASCII and common extended chars
      if ((byte >= 32 && byte < 127) || byte === 10 || byte === 13) {
        rawContent += String.fromCharCode(byte);
      } else if (byte >= 128) {
        // Try to preserve extended characters
        rawContent += String.fromCharCode(byte);
      }
    }
    
    // Extract text between parentheses in text streams (PDF text objects)
    const textMatches = rawContent.match(/\(([^)]{2,200})\)/g) || [];
    for (const match of textMatches) {
      const text = match.slice(1, -1); // Remove parentheses
      // Filter out binary/control sequences
      if (text.length > 2 && /[a-zA-Z]{2,}/.test(text)) {
        extractedText += text + ' ';
      }
    }
    
    // Also look for hex-encoded text strings
    const hexMatches = rawContent.match(/<([0-9A-Fa-f]{4,})>/g) || [];
    for (const hexMatch of hexMatches) {
      const hex = hexMatch.slice(1, -1);
      let decoded = '';
      for (let i = 0; i < hex.length; i += 2) {
        const charCode = parseInt(hex.substr(i, 2), 16);
        if (charCode >= 32 && charCode < 127) {
          decoded += String.fromCharCode(charCode);
        }
      }
      if (decoded.length > 2 && /[a-zA-Z]{2,}/.test(decoded)) {
        extractedText += decoded + ' ';
      }
    }
    
    // Look for specific VOG patterns in raw content
    const profilePattern = /(?:screeningsprofiel|profiel)[:\s]*(\d{2})/gi;
    const profileMatches = rawContent.match(profilePattern);
    if (profileMatches) {
      extractedText += '\nPROFILE_MATCH: ' + profileMatches.join(' ');
    }
    
    const aspectPattern = /(?:functieaspect|aspect)[:\s]*([0-9,\s]+)/gi;
    const aspectMatches = rawContent.match(aspectPattern);
    if (aspectMatches) {
      extractedText += '\nASPECT_MATCH: ' + aspectMatches.join(' ');
    }
    
  } catch (rawError) {
    console.log(`[PDF-EXTRACT] Raw extraction failed: ${rawError}`);
  }
  
  return extractedText;
}

async function extractScreeningProfile(pdfBytes: ArrayBuffer): Promise<VogScreeningInfo> {
  const result: VogScreeningInfo = {
    profileCode: null,
    functieaspecten: [],
    functieOmschrijving: null,
    rawText: null,
    extractionMethod: 'none'
  };

  try {
    // Extract text using multiple methods
    const textContent = await extractTextFromPdf(pdfBytes);
    result.rawText = textContent.slice(0, 5000); // Store first 5000 chars for debugging
    
    console.log(`[VERIFY-VOG-GAAV] Extracted ${textContent.length} chars from PDF`);
    console.log(`[VERIFY-VOG-GAAV] Sample text: ${textContent.slice(0, 500)}`);

    // Extract screening profile code (format: "Screeningsprofiel: 45" or "Profiel 45")
    const profilePatterns = [
      /Screeningsprofiel[:\s]+(\d{2})/i,
      /Profiel[:\s]+(\d{2})/i,
      /screening\s*profiel[:\s]+(\d{2})/i,
      /PROFILE_MATCH[:\s]*[^\d]*(\d{2})/i,
    ];

    for (const pattern of profilePatterns) {
      const match = textContent.match(pattern);
      if (match) {
        result.profileCode = match[1];
        result.extractionMethod = 'pattern_match';
        console.log(`[VERIFY-VOG-GAAV] Extracted profile code: ${result.profileCode}`);
        break;
      }
    }

    // Extract functieaspecten (format: "Functieaspect: 84, 85" or "aspecten 84 en 85")
    const aspectPatterns = [
      /Functieaspect[en]*[:\s]+([0-9,\sen]+)/i,
      /aspect[en]*[:\s]+([0-9,\sen]+)/i,
      /functie-aspect[en]*[:\s]+([0-9,\sen]+)/i,
      /ASPECT_MATCH[:\s]*([0-9,\s]+)/i,
    ];

    for (const pattern of aspectPatterns) {
      const match = textContent.match(pattern);
      if (match) {
        const aspectStr = match[1];
        const aspects = aspectStr.match(/\d{2}/g) || [];
        result.functieaspecten = [...new Set(aspects)]; // Deduplicate
        result.extractionMethod = result.extractionMethod === 'none' ? 'pattern_match' : result.extractionMethod;
        console.log(`[VERIFY-VOG-GAAV] Extracted functieaspecten: ${aspects.join(', ')}`);
        break;
      }
    }

    // Extract functie omschrijving (format: "Functie: Begeleider gehandicaptenzorg")
    const functiePatterns = [
      /Functie[:\s]+([A-Za-z\s]{5,100})/i,
      /Beroep[:\s]+([A-Za-z\s]{5,100})/i,
      /Werkzaamheden[:\s]+([A-Za-z\s]{5,100})/i,
    ];

    for (const pattern of functiePatterns) {
      const match = textContent.match(pattern);
      if (match) {
        result.functieOmschrijving = match[1].trim().slice(0, 200);
        console.log(`[VERIFY-VOG-GAAV] Extracted functie omschrijving: ${result.functieOmschrijving}`);
        break;
      }
    }

    // If no profile found in text, try to detect from known keywords
    if (!result.profileCode) {
      // Look for healthcare/zorg keywords indicating profile 45
      const zorgtermen = ['gezondheidszorg', 'verpleging', 'verzorging', 'zorg', 'welzijn', 'hulpverlening'];
      const hasZorgTerms = zorgtermen.some(term => textContent.toLowerCase().includes(term));
      
      if (hasZorgTerms) {
        result.profileCode = '45'; // Assume profile 45 for healthcare
        result.extractionMethod = 'keyword_inference';
        console.log(`[VERIFY-VOG-GAAV] Inferred profile 45 from healthcare keywords`);
      }

      // Check for minderjarigen (aspect 84)
      const jeugdtermen = ['minderjarig', 'jeugd', 'kind', 'jongere'];
      const hasJeugdTerms = jeugdtermen.some(term => textContent.toLowerCase().includes(term));
      if (hasJeugdTerms && !result.functieaspecten.includes('84')) {
        result.functieaspecten.push('84');
        console.log(`[VERIFY-VOG-GAAV] Inferred functieaspect 84 from youth keywords`);
      }

      // Check for hulpbehoevende (aspect 85)
      const hulptermen = ['hulpbehoevend', 'kwetsbaar', 'zorgbehoevend', 'afhankelijk'];
      const hasHulpTerms = hulptermen.some(term => textContent.toLowerCase().includes(term));
      if (hasHulpTerms && !result.functieaspecten.includes('85')) {
        result.functieaspecten.push('85');
        console.log(`[VERIFY-VOG-GAAV] Inferred functieaspect 85 from vulnerability keywords`);
      }
    }
  } catch (error) {
    console.error('[VERIFY-VOG-GAAV] Error extracting screening profile:', error);
    result.extractionMethod = 'error';
  }

  return result;
}

// Validate screening profile against requirements
interface ProfileValidationResult {
  valid: boolean;
  reason: string;
  requiredProfile: string | null;
  requiredAspecten: string[];
  missingAspecten: string[];
}

async function validateScreeningProfile(
  supabase: ReturnType<typeof createAdminClient>,
  extractedProfile: VogScreeningInfo,
  functieNiveau: string | null,
  doelgroepen: string[] | null
): Promise<ProfileValidationResult> {
  const result: ProfileValidationResult = {
    valid: true,
    reason: '',
    requiredProfile: null,
    requiredAspecten: [],
    missingAspecten: []
  };

  if (!functieNiveau) {
    result.valid = true;
    result.reason = 'Geen functie_niveau bekend - kan profiel niet valideren';
    return result;
  }

  // Lookup requirements for this functie_niveau
  let query = supabase
    .from('vog_screening_requirements')
    .select('*')
    .eq('functie_niveau', functieNiveau);

  // If doelgroepen includes youth, filter for that specific requirement
  const hasYouth = doelgroepen?.some(d => 
    d.toLowerCase().includes('jeugd') || 
    d.toLowerCase().includes('kind') ||
    d.toLowerCase().includes('minderjarig')
  );

  if (hasYouth) {
    query = query.contains('doelgroep', ['Kinderen/Jeugd']);
  } else {
    query = query.eq('doelgroep', '{}');
  }

  const { data: requirements, error } = await query.limit(1);

  if (error || !requirements || requirements.length === 0) {
    console.log(`[VERIFY-VOG-GAAV] No specific requirements found for ${functieNiveau}`);
    // Fall back to default healthcare requirement
    result.requiredProfile = '45';
    result.requiredAspecten = ['85'];
  } else {
    const req = requirements[0];
    result.requiredProfile = req.required_profile_code;
    result.requiredAspecten = req.required_functieaspecten || [];
    console.log(`[VERIFY-VOG-GAAV] Found requirement: profile ${req.required_profile_code}, aspecten ${req.required_functieaspecten?.join(', ')}`);
  }

  // Validate profile code
  if (extractedProfile.profileCode && result.requiredProfile) {
    if (extractedProfile.profileCode !== result.requiredProfile) {
      result.valid = false;
      result.reason = `Verkeerd screeningsprofiel: ${extractedProfile.profileCode} (vereist: ${result.requiredProfile} - ${SCREENING_PROFILES[result.requiredProfile] || 'Onbekend'})`;
      return result;
    }
  }

  // Validate functieaspecten
  if (result.requiredAspecten.length > 0) {
    const extractedAspecten = new Set(extractedProfile.functieaspecten);
    
    for (const required of result.requiredAspecten) {
      if (!extractedAspecten.has(required)) {
        result.missingAspecten.push(required);
      }
    }

    if (result.missingAspecten.length > 0) {
      const missingDescriptions = result.missingAspecten
        .map(a => `${a} (${SCREENING_PROFILES[a] || 'Onbekend'})`)
        .join(', ');
      
      result.valid = false;
      result.reason = `Ontbrekende functieaspecten: ${missingDescriptions}`;
      return result;
    }
  }

  // If we couldn't extract any profile info, flag for manual review
  if (!extractedProfile.profileCode && !extractedProfile.functieaspecten.length) {
    result.valid = false;
    result.reason = 'Kon screeningsprofiel niet extraheren uit document - handmatige controle vereist';
  } else {
    result.reason = 'Screeningsprofiel voldoet aan vereisten';
  }

  return result;
}

// =====================================================
// BROWSERLESS WEBSITE VERIFICATION (Primary Method)
// Same proven approach as DUO diploma verification v5.6.0
// =====================================================

interface BrowserlessResult {
  status: string;
  message: string;
  gaavCode: number;
  pageContent?: string;
  details?: Record<string, unknown>;
  method: string;
}

async function verifyViaBrowserlessHttp(
  pdfBytes: Uint8Array,
  filename: string
): Promise<BrowserlessResult> {
  const apiKey = Deno.env.get('BROWSERLESS_API_KEY');
  if (!apiKey) {
    console.log(`[VERIFY-VOG-GAAV] Browserless API key niet geconfigureerd`);
    return { 
      status: 'fallback_needed', 
      message: 'Browserless API key niet geconfigureerd', 
      gaavCode: -1,
      method: 'browserless_missing_key'
    };
  }
  
  console.log(`[VERIFY-VOG-GAAV] ${DEPLOYMENT_VERSION} - Starting Browserless verification`);
  console.log(`   Method: Browserless website automation (validatie.nl)`);
  console.log(`   Region: EU (London)`);
  console.log(`   PDF size: ${pdfBytes.length} bytes`);
  
  // Convert PDF to base64 (proven successful approach from DUO v5.6.0)
  console.log('📦 Converting PDF to base64 for Browserless...');
  let binary = '';
  for (let i = 0; i < pdfBytes.length; i++) {
    binary += String.fromCharCode(pdfBytes[i]);
  }
  const pdfBase64 = btoa(binary);
  console.log(`✅ PDF converted to base64: ${pdfBase64.length} chars`);
  
  // Puppeteer code for validatie.nl - ES Module format (required by Browserless JSON API)
  const puppeteerCode = `
export default async function ({ page, context }) {
  const pdfBase64 = context?.pdfBase64 || null;
  const filename = context?.filename || 'vog.pdf';
  
  console.log('[VALIDATIE.NL] Starting VOG verification...');
  console.log('[VALIDATIE.NL] PDF base64 length:', pdfBase64?.length || 0);
  
  if (!pdfBase64) {
    return { 
      data: { status: 'error', message: 'No PDF base64 provided', gaavCode: -1 }, 
      type: 'application/json' 
    };
  }
  
  try {
    // Navigate to validatie.nl
    console.log('[VALIDATIE.NL] Navigating to validatie.nl...');
    await page.goto('https://validatie.nl/', { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });
    await new Promise(r => setTimeout(r, 3000));
    
    console.log('[VALIDATIE.NL] Page loaded, looking for file input...');
    
    // Find file input element
    const fileInputSelector = 'input[type="file"]';
    try {
      await page.waitForSelector(fileInputSelector, { timeout: 15000 });
    } catch (e) {
      // Try alternative selectors
      console.log('[VALIDATIE.NL] Primary selector not found, trying alternatives...');
      const altSelectors = ['input[accept*="pdf"]', '.dropzone input', '#file-upload'];
      for (const sel of altSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 3000 });
          console.log('[VALIDATIE.NL] Found alternative selector:', sel);
          break;
        } catch {}
      }
    }
    
    // Decode base64 and upload via DataTransfer API (proven approach)
    console.log('[VALIDATIE.NL] Decoding base64 and uploading file...');
    const uploadResult = await page.evaluate(async ({ pdfBase64, filename }) => {
      try {
        // Decode base64 to binary
        const binary = atob(pdfBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        
        // Create File object
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const file = new File([blob], filename, { type: 'application/pdf' });
        
        // Find file input
        const fileInput = document.querySelector('input[type="file"]') 
          || document.querySelector('input[accept*="pdf"]')
          || document.querySelector('.dropzone input');
          
        if (!fileInput) {
          return { success: false, error: 'File input not found on page' };
        }
        
        // Use DataTransfer API to set file
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
        
        // Trigger change event
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        console.log('[VALIDATIE.NL] File uploaded via DataTransfer');
        return { success: true, fileSize: bytes.length };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }, { pdfBase64, filename });
    
    if (!uploadResult.success) {
      console.log('[VALIDATIE.NL] Upload failed:', uploadResult.error);
      return { 
        data: { status: 'error', message: 'Upload failed: ' + uploadResult.error, gaavCode: -1 }, 
        type: 'application/json' 
      };
    }
    
    console.log('[VALIDATIE.NL] Upload successful, file size:', uploadResult.fileSize);
    
    // Wait for processing and click verify button if needed
    await new Promise(r => setTimeout(r, 2000));
    
    // Try to click Controleer/Valideer button
    const clicked = await page.evaluate(() => {
      const buttonTexts = ['controleer', 'valideer', 'verify', 'check', 'upload'];
      const buttons = document.querySelectorAll('button, input[type="submit"], a.btn, .btn');
      
      for (const btn of buttons) {
        const text = (btn.textContent || btn.value || '').toLowerCase();
        if (buttonTexts.some(t => text.includes(t))) {
          btn.click();
          console.log('[VALIDATIE.NL] Clicked button:', text);
          return { clicked: true, buttonText: text };
        }
      }
      
      // Also try form submit
      const form = document.querySelector('form');
      if (form) {
        form.submit();
        return { clicked: true, buttonText: 'form submit' };
      }
      
      return { clicked: false };
    });
    
    console.log('[VALIDATIE.NL] Button click result:', JSON.stringify(clicked));
    
    // Wait for result
    await new Promise(r => setTimeout(r, 8000));
    
    // Parse result from page content
    const pageContent = await page.evaluate(() => document.body.innerText);
    const contentLower = pageContent.toLowerCase();
    
    console.log('[VALIDATIE.NL] Page content length:', pageContent.length);
    console.log('[VALIDATIE.NL] Content sample:', pageContent.slice(0, 500));
    
    // Map results to GAAV codes based on validatie.nl response text
    // Code 0: Document is authentiek en integer
    if ((contentLower.includes('authentiek') && contentLower.includes('integer')) ||
        contentLower.includes('document is geldig') ||
        contentLower.includes('echtheidskenmerk') ||
        contentLower.includes('origineel') ||
        contentLower.includes('valid')) {
      console.log('[VALIDATIE.NL] ✅ Document verified as authentic');
      return { 
        data: { 
          status: 'authentic_ok', 
          gaavCode: 0, 
          message: 'Document is authentiek en integer',
          pageContent: pageContent.slice(0, 2000)
        }, 
        type: 'application/json' 
      };
    }
    
    // Code 1: Document bekend maar niet integer (tampered)
    if ((contentLower.includes('bekend') && contentLower.includes('niet integer')) ||
        contentLower.includes('gewijzigd') ||
        contentLower.includes('manipulated') ||
        contentLower.includes('tampered')) {
      console.log('[VALIDATIE.NL] ❌ Document tampered');
      return { 
        data: { 
          status: 'authentic_fail', 
          gaavCode: 1, 
          message: 'Document is bekend, maar niet integer',
          pageContent: pageContent.slice(0, 2000)
        }, 
        type: 'application/json' 
      };
    }
    
    // Code 2: Document niet bekend
    if (contentLower.includes('niet bekend') || 
        contentLower.includes('not found') ||
        contentLower.includes('onbekend')) {
      console.log('[VALIDATIE.NL] ⚠️ Document not found in database');
      return { 
        data: { 
          status: 'manual_review', 
          gaavCode: 2, 
          message: 'Document niet bekend bij GAAV',
          pageContent: pageContent.slice(0, 2000)
        }, 
        type: 'application/json' 
      };
    }
    
    // Code 6: Handtekening ongeldig
    if ((contentLower.includes('handtekening') && contentLower.includes('ongeldig')) ||
        contentLower.includes('signature invalid') ||
        contentLower.includes('invalid signature')) {
      console.log('[VALIDATIE.NL] ❌ Invalid signature');
      return { 
        data: { 
          status: 'authentic_fail', 
          gaavCode: 6, 
          message: 'Handtekening ongeldig',
          pageContent: pageContent.slice(0, 2000)
        }, 
        type: 'application/json' 
      };
    }
    
    // Check for error messages
    if (contentLower.includes('error') || 
        contentLower.includes('fout') ||
        contentLower.includes('probleem')) {
      console.log('[VALIDATIE.NL] ⚠️ Error detected on page');
      return { 
        data: { 
          status: 'manual_review', 
          gaavCode: 3, 
          message: 'Validatie fout gedetecteerd',
          pageContent: pageContent.slice(0, 2000)
        }, 
        type: 'application/json' 
      };
    }
    
    // Default: unclear result, needs manual review
    console.log('[VALIDATIE.NL] ⚠️ Unclear result, manual review needed');
    return { 
      data: { 
        status: 'manual_review', 
        gaavCode: -1, 
        message: 'Resultaat onduidelijk - handmatige controle vereist',
        pageContent: pageContent.slice(0, 2000)
      }, 
      type: 'application/json' 
    };
    
  } catch (error) {
    console.log('[VALIDATIE.NL] Error:', error.message);
    return { 
      data: { 
        status: 'error', 
        message: error.message, 
        gaavCode: -1 
      }, 
      type: 'application/json' 
    };
  }
}
`;
  
  // Prepare context for Browserless
  const contextData = { 
    pdfBase64,        // Base64 encoded PDF
    filename 
  };
  
  console.log('📡 Calling Browserless HTTP API with ES Module format [v1.1.0]...');
  console.log(`   Using base64 for PDF delivery (${pdfBase64.length} chars)`);
  console.log(`   Code length: ${puppeteerCode.length} chars`);
  console.log(`   Region: EU (London)`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);
  
  try {
    // Use EU region (London) for better connectivity to Dutch services
    const response = await fetch(
      `https://production-lon.browserless.io/function?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: puppeteerCode,
          context: contextData
        }),
        signal: controller.signal
      }
    );
    
    clearTimeout(timeoutId);
    
    console.log(`📥 Browserless response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Browserless HTTP error: ${response.status} - ${errorText.slice(0, 500)}`);
      return {
        status: 'fallback_needed',
        message: `Browserless HTTP error: ${response.status}`,
        gaavCode: -1,
        method: 'browserless_http_error'
      };
    }
    
    // Try to parse JSON response
    const responseText = await response.text();
    console.log(`📄 Response length: ${responseText.length} chars`);
    console.log(`📄 Response preview: ${responseText.slice(0, 500)}`);
    
    try {
      const result = JSON.parse(responseText);
      console.log(`✅ Browserless result:`, JSON.stringify(result, null, 2).slice(0, 1000));
      
      return {
        status: result.status || 'manual_review',
        message: result.message || 'Verification completed',
        gaavCode: result.gaavCode ?? -1,
        pageContent: result.pageContent,
        method: 'browserless_validatie_nl'
      };
    } catch (parseError) {
      console.log(`⚠️ Could not parse Browserless response as JSON`);
      
      // Check if response contains success indicators
      const responseLower = responseText.toLowerCase();
      if (responseLower.includes('authentiek') || responseLower.includes('valid')) {
        return {
          status: 'authentic_ok',
          message: 'Document verified (parsed from response)',
          gaavCode: 0,
          pageContent: responseText.slice(0, 2000),
          method: 'browserless_validatie_nl_parsed'
        };
      }
      
      return {
        status: 'fallback_needed',
        message: 'Could not parse Browserless response',
        gaavCode: -1,
        pageContent: responseText.slice(0, 2000),
        method: 'browserless_parse_error'
      };
    }
    
  } catch (fetchError) {
    clearTimeout(timeoutId);
    const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown fetch error';
    console.log(`❌ Browserless fetch error: ${errorMessage}`);
    
    return {
      status: 'fallback_needed',
      message: `Browserless fetch error: ${errorMessage}`,
      gaavCode: -1,
      method: 'browserless_fetch_error'
    };
  }
}

// =====================================================
// MAIN HANDLER
// =====================================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log(`[VERIFY-VOG-GAAV] ${DEPLOYMENT_VERSION} - Request received`);

  try {
    const { application_id, vog_file_path, force_revalidation = false } = await req.json();

    if (!application_id || !vog_file_path) {
      return errorResponse('Missing required fields: application_id and vog_file_path');
    }

    console.log(`[VERIFY-VOG-GAAV] Starting verification for application: ${application_id}`);
    
    const supabase = createAdminClient();

    // 1. Get current application state including functie_niveau and doelgroep
    const { data: application, error: appError } = await supabase
      .from('professional_applications')
      .select('id, vog_validation_status, vog_validation_source, extracted_data')
      .eq('id', application_id)
      .single();

    if (appError || !application) {
      return errorResponse(`Application not found: ${appError?.message}`);
    }

    const extractedData = (application.extracted_data as Record<string, unknown>) || {};
    const functieNiveau = extractedData.functie_niveau as string | null;
    const doelgroepen = extractedData.doelgroep_ervaring as string[] | null;

    // Skip if already verified (unless forced)
    if (!force_revalidation && application.vog_validation_status === 'authentic_ok') {
      console.log(`[VERIFY-VOG-GAAV] Already verified, skipping`);
      return jsonResponse({
        success: true,
        skipped: true,
        reason: 'Already verified',
        validation_status: application.vog_validation_status
      });
    }

    // 2. Set status to validating
    await supabase
      .from('professional_applications')
      .update({
        vog_validation_status: 'validating',
        vog_validation_source: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', application_id);

    // 3. Download VOG PDF from storage
    console.log(`[VERIFY-VOG-GAAV] Downloading VOG from: ${vog_file_path}`);
    
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('application-documents')
      .download(vog_file_path);

    if (downloadError || !fileData) {
      console.error(`[VERIFY-VOG-GAAV] Download failed:`, downloadError);
      
      await supabase
        .from('professional_applications')
        .update({
          vog_validation_status: 'manual_review',
          vog_validation_source: 'download_error',
          vog_verification_response: {
            error: 'Download failed',
            message: downloadError?.message,
            timestamp: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', application_id);
      
      return errorResponse(`Failed to download VOG file: ${downloadError?.message}`);
    }

    // 4. Extract screening profile from PDF
    const pdfArrayBuffer = await fileData.arrayBuffer();
    const pdfBytes = new Uint8Array(pdfArrayBuffer);
    const screeningProfile = await extractScreeningProfile(pdfArrayBuffer);
    console.log(`[VERIFY-VOG-GAAV] Extracted screening profile:`, JSON.stringify(screeningProfile, null, 2));

    // 5. PRIMARY: Try Browserless website verification (proven approach from DUO v5.6.0)
    console.log(`[VERIFY-VOG-GAAV] Attempting Browserless verification via validatie.nl...`);
    
    const filename = vog_file_path.split('/').pop() || 'vog.pdf';
    const browserlessResult = await verifyViaBrowserlessHttp(pdfBytes, filename);
    
    console.log(`[VERIFY-VOG-GAAV] Browserless result:`, JSON.stringify(browserlessResult, null, 2));

    let gaavResponseCode = browserlessResult.gaavCode;
    let gaavError: string | null = null;
    let verificationMethod = browserlessResult.method;

    // 6. FALLBACK: If Browserless failed, try direct API
    if (browserlessResult.status === 'fallback_needed' || browserlessResult.status === 'error') {
      console.log(`[VERIFY-VOG-GAAV] Browserless failed, trying direct GAAV API...`);
      
      verificationMethod = 'direct_api_fallback';
      
      const formData = new FormData();
      formData.append('file', fileData, 'vog.pdf');

      try {
        const gaavResponse = await fetch(GAAV_API_URL, {
          method: 'POST',
          body: formData
        });

        if (!gaavResponse.ok) {
          throw new Error(`GAAV API returned status ${gaavResponse.status}`);
        }

        const responseData = await gaavResponse.json();
        gaavResponseCode = typeof responseData === 'number' ? responseData : responseData.code ?? responseData.result ?? -1;
        
        console.log(`[VERIFY-VOG-GAAV] Direct API response code: ${gaavResponseCode}`);
      } catch (fetchError) {
        console.error(`[VERIFY-VOG-GAAV] Direct API error:`, fetchError);
        gaavError = fetchError instanceof Error ? fetchError.message : 'Unknown GAAV API error';
      }
    }

    // 7. Map response to status
    const responseMapping = GAAV_RESPONSE_MAP[gaavResponseCode] ?? {
      status: 'manual_review',
      description: gaavError ?? browserlessResult.message ?? 'Unknown response code',
      requiresManualReview: true
    };

    let validationStatus = responseMapping.status;
    let vogIssueDate: Date | null = null;
    let vogValidUntil: Date | null = null;
    let expiryCheck: { valid: boolean; daysRemaining: number } | null = null;
    let profileValidation: ProfileValidationResult | null = null;

    // 8. If authentic, check 3-month validity rule and screening profile
    if (validationStatus === 'authentic_ok') {
      // Check issue date
      vogIssueDate = extractVogIssueDate(vog_file_path);
      
      if (vogIssueDate) {
        const validityResult = isVogWithinValidity(vogIssueDate);
        expiryCheck = { valid: validityResult.valid, daysRemaining: validityResult.daysRemaining };
        vogValidUntil = validityResult.expiryDate;
        
        if (!validityResult.valid) {
          console.log(`[VERIFY-VOG-GAAV] VOG is expired (${validityResult.daysRemaining} days past expiry)`);
          validationStatus = 'expired';
        } else if (validityResult.daysRemaining <= 14) {
          console.log(`[VERIFY-VOG-GAAV] VOG expiring soon (${validityResult.daysRemaining} days remaining)`);
        }
      }

      // Validate screening profile
      profileValidation = await validateScreeningProfile(
        supabase,
        screeningProfile,
        functieNiveau,
        doelgroepen
      );

      if (!profileValidation.valid) {
        console.log(`[VERIFY-VOG-GAAV] Profile validation failed: ${profileValidation.reason}`);
        validationStatus = 'wrong_profile';
      }
    }

    // 9. Update application with verification result
    const verificationResponse = {
      deployment_version: DEPLOYMENT_VERSION,
      verification_method: verificationMethod,
      gaav_code: gaavResponseCode,
      gaav_description: responseMapping.description,
      gaav_error: gaavError,
      browserless_result: browserlessResult.status !== 'fallback_needed' ? {
        status: browserlessResult.status,
        message: browserlessResult.message,
        page_content_sample: browserlessResult.pageContent?.slice(0, 500)
      } : null,
      requires_manual_review: responseMapping.requiresManualReview,
      issue_date: vogIssueDate?.toISOString() ?? null,
      valid_until: vogValidUntil?.toISOString() ?? null,
      days_remaining: expiryCheck?.daysRemaining ?? null,
      verified_at: new Date().toISOString(),
      // Screening profile info
      screening_profile: {
        extracted_code: screeningProfile.profileCode,
        extracted_aspecten: screeningProfile.functieaspecten,
        extracted_functie: screeningProfile.functieOmschrijving,
        required_code: profileValidation?.requiredProfile ?? null,
        required_aspecten: profileValidation?.requiredAspecten ?? [],
        missing_aspecten: profileValidation?.missingAspecten ?? [],
        profile_valid: profileValidation?.valid ?? null,
        profile_reason: profileValidation?.reason ?? null
      }
    };

    const { error: updateError } = await supabase
      .from('professional_applications')
      .update({
        vog_validation_status: validationStatus,
        vog_validation_source: verificationMethod.includes('browserless') ? 'BROWSERLESS_VALIDATIE_NL' : 'GAAV_API',
        vog_issue_date: vogIssueDate?.toISOString().split('T')[0] ?? null,
        vog_valid_until: vogValidUntil?.toISOString().split('T')[0] ?? null,
        vog_verification_response: verificationResponse,
        updated_at: new Date().toISOString()
      })
      .eq('id', application_id);

    if (updateError) {
      console.error(`[VERIFY-VOG-GAAV] Update failed:`, updateError);
      return errorResponse(`Failed to update application: ${updateError.message}`);
    }

    // 10. Log system event
    await supabase.from('system_events').insert({
      org_id: '550e8400-e29b-41d4-a716-446655440000', // ABCzorg default
      event_type: 'vog_verification_completed',
      entity_type: 'professional_application',
      entity_id: application_id,
      event_data: {
        deployment_version: DEPLOYMENT_VERSION,
        verification_method: verificationMethod,
        validation_status: validationStatus,
        gaav_code: gaavResponseCode,
        days_remaining: expiryCheck?.daysRemaining ?? null,
        profile_valid: profileValidation?.valid ?? null,
        profile_code: screeningProfile.profileCode
      },
      metadata: { source: verificationMethod.includes('browserless') ? 'BROWSERLESS_VALIDATIE_NL' : 'GAAV_API' }
    });

    // 11. Send recruiter notification if VOG is successfully verified
    if (validationStatus === 'authentic_ok') {
      console.log('[VERIFY-VOG-GAAV] VOG authentic_ok - sending recruiter notification');
      
      // Get candidate name from extracted data or application
      const candidateName = extractedData?.voornaam && extractedData?.achternaam 
        ? `${extractedData.voornaam} ${extractedData.achternaam}`
        : extractedData?.full_name || 'Onbekende kandidaat';
      
      // Insert recruiter notification
      const { error: notifError } = await supabase
        .from('recruiter_notifications')
        .insert({
          org_id: '550e8400-e29b-41d4-a716-446655440000', // ABCzorg default
          notification_type: 'vog_verified',
          title: '📜 VOG Geverifieerd via GAAV',
          message: `De VOG van ${candidateName} is authentiek en geldig bevonden`,
          application_id: application_id,
          metadata: {
            candidate_name: candidateName,
            validation_status: validationStatus,
            verification_source: verificationMethod.includes('browserless') ? 'BROWSERLESS_VALIDATIE_NL' : 'GAAV_API',
            days_remaining: expiryCheck?.daysRemaining ?? null,
            screening_profile_valid: profileValidation?.valid ?? null,
            screening_profile_code: screeningProfile.profileCode
          }
        });
      
      if (notifError) {
        console.error('[VERIFY-VOG-GAAV] Failed to insert notification:', notifError);
      } else {
        console.log('[VERIFY-VOG-GAAV] ✅ Recruiter notification inserted');
      }
      
      // Optionally send email notification to recruiters
      try {
        const { data: recruiters } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('role', 'recruiter')
          .limit(5);
        
        if (recruiters && recruiters.length > 0) {
          // Send to first recruiter (or could loop for all)
          const recruiter = recruiters[0];
          if (recruiter.email) {
            await supabase.functions.invoke('send-ai-email', {
              body: {
                email_type: 'vog_verified_notification',
                recipient_email: recruiter.email,
                recipient_name: recruiter.full_name || 'Recruiter',
                subject: `📜 VOG Geverifieerd: ${candidateName}`,
                template_data: {
                  candidate_name: candidateName,
                  validation_status: validationStatus,
                  verification_source: verificationMethod.includes('browserless') ? 'BROWSERLESS_VALIDATIE_NL' : 'GAAV_API',
                  days_remaining: expiryCheck?.daysRemaining ?? null,
                  screening_profile_valid: profileValidation?.valid ?? null,
                  application_id: application_id
                },
                application_id: application_id,
                org_id: '550e8400-e29b-41d4-a716-446655440000'
              }
            });
            console.log('[VERIFY-VOG-GAAV] ✅ Email notification sent to recruiter');
          }
        }
      } catch (emailErr) {
        console.error('[VERIFY-VOG-GAAV] Failed to send email notification:', emailErr);
        // Non-blocking - continue even if email fails
      }
    }

    console.log(`[VERIFY-VOG-GAAV] ✅ Verification complete: ${validationStatus} via ${verificationMethod}`);

    return jsonResponse({
      success: true,
      deployment_version: DEPLOYMENT_VERSION,
      verification_method: verificationMethod,
      validation_status: validationStatus,
      gaav_response: {
        code: gaavResponseCode,
        description: responseMapping.description,
        requires_manual_review: responseMapping.requiresManualReview
      },
      browserless_result: browserlessResult.status !== 'fallback_needed' ? {
        status: browserlessResult.status,
        message: browserlessResult.message
      } : null,
      expiry_info: expiryCheck ? {
        issue_date: vogIssueDate?.toISOString(),
        valid_until: vogValidUntil?.toISOString(),
        days_remaining: expiryCheck.daysRemaining,
        is_valid: expiryCheck.valid
      } : null,
      screening_profile: {
        extracted: {
          code: screeningProfile.profileCode,
          aspecten: screeningProfile.functieaspecten,
          functie: screeningProfile.functieOmschrijving
        },
        validation: profileValidation ? {
          valid: profileValidation.valid,
          reason: profileValidation.reason,
          required_code: profileValidation.requiredProfile,
          required_aspecten: profileValidation.requiredAspecten,
          missing_aspecten: profileValidation.missingAspecten
        } : null
      }
    });

  } catch (error) {
    console.error('[VERIFY-VOG-GAAV] Unexpected error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unexpected error', 500);
  }
});
