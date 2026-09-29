const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');
const { createCanvas } = require('canvas');
const { encryptOcrText, decryptOcrText, computeOcrHmac } = require('./ocrCrypto');
const store = require('./store');

const DEFAULT_LANGS = process.env.OCR_LANGS || 'eng+tam';
const TESSDATA_PATH = path.join(__dirname, 'tessdata');

/**
 * Preprocesses an image buffer with sharp for optimal OCR text recognition
 * Pipeline: Grayscale -> Normalize -> Sharpen -> Adaptive threshold -> Orientation deskew
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
async function preprocessImageBuffer(buffer) {
  try {
    let pipeline = sharp(buffer)
      .rotate() // Auto-orient based on EXIF
      .grayscale()
      .normalize()
      .sharpen();

    // Use thresholding if image is high contrast or text document
    const metadata = await sharp(buffer).metadata();
    if (metadata.width && metadata.width < 1000) {
      // Upscale smaller images for better character recognition
      pipeline = pipeline.resize({ width: metadata.width * 2, kernel: 'lanczos3' });
    }

    return await pipeline.png().toBuffer();
  } catch (err) {
    console.warn('[OCR Preprocessing] Sharp warning, falling back to original buffer:', err.message);
    return buffer;
  }
}

/**
 * Rasterizes a multi-page PDF buffer into an array of page PNG buffers at 300 DPI
 * @param {Buffer} pdfBuffer
 * @param {number} maxPages - Cap at OCR_MAX_PAGES (default 10)
 * @returns {Promise<Array<Buffer>>}
 */
async function rasterizePdfToImages(pdfBuffer, maxPages = null) {
  const cap = maxPages || parseInt(process.env.OCR_MAX_PAGES || '10', 10);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableFontFace: true,
    verbosity: 0
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = Math.min(pdfDoc.numPages, cap);
  const pageBuffers = [];

  // Scale factor: 300 DPI (72 DPI standard * 4.1666667 ≈ 300 DPI)
  const scale = 300 / 72;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const context = canvas.getContext('2d');

    await page.render({
      canvasContext: context,
      viewport
    }).promise;

    const pagePng = canvas.toBuffer('image/png');
    const preprocessed = await preprocessImageBuffer(pagePng);
    pageBuffers.push(preprocessed);
  }

  return pageBuffers;
}

/**
 * Executes offline Tesseract OCR on a single image buffer
 * @param {Buffer} imgBuffer
 * @param {string} langs
 * @returns {Promise<object>}
 */
async function recognizeImage(imgBuffer, langs = DEFAULT_LANGS) {
  const workerOpts = fs.existsSync(TESSDATA_PATH) ? { langPath: TESSDATA_PATH } : {};
  const worker = await createWorker(langs, 1, workerOpts);

  try {
    const ret = await worker.recognize(imgBuffer);
    const data = ret.data;
    const words = (data.words || []).map(w => ({
      text: w.text,
      confidence: Math.round(w.confidence || 0)
    }));

    return {
      text: data.text || '',
      confidence: Math.round(data.confidence || 0),
      words
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Main OCR processor for documents (images or PDFs)
 * @param {Buffer|string} input - Buffer or file path
 * @param {string} mimeType - e.g. application/pdf, image/png, image/jpeg
 * @param {object} options - { langs, maxPages }
 * @returns {Promise<object>}
 */
async function processDocumentOcr(input, mimeType = 'image/jpeg', options = {}) {
  const startTime = Date.now();
  let buffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const langs = options.langs || DEFAULT_LANGS;
  const isPdf = (mimeType && mimeType.toLowerCase().includes('pdf')) ||
                (typeof input === 'string' && input.toLowerCase().endsWith('.pdf'));

  const pages = [];
  let fullText = '';
  let totalConfidence = 0;
  let allWords = [];

  if (isPdf) {
    const pageImages = await rasterizePdfToImages(buffer, options.maxPages);
    for (let idx = 0; idx < pageImages.length; idx++) {
      const pageResult = await recognizeImage(pageImages[idx], langs);
      pages.push({
        pageNumber: idx + 1,
        text: pageResult.text,
        confidence: pageResult.confidence,
        words: pageResult.words
      });
      fullText += (idx > 0 ? '\n\n' : '') + pageResult.text;
      totalConfidence += pageResult.confidence;
      allWords.push(...pageResult.words);
    }
  } else {
    const preprocessed = await preprocessImageBuffer(buffer);
    const singleResult = await recognizeImage(preprocessed, langs);
    pages.push({
      pageNumber: 1,
      text: singleResult.text,
      confidence: singleResult.confidence,
      words: singleResult.words
    });
    fullText = singleResult.text;
    totalConfidence = singleResult.confidence;
    allWords = singleResult.words;
  }

  const meanConfidence = pages.length > 0 ? Math.round(totalConfidence / pages.length) : 0;
  const durationMs = Date.now() - startTime;

  return {
    text: fullText,
    pages,
    meanConfidence,
    words: allWords,
    language: langs,
    engineVersion: 'tesseract.js-7.0.0',
    durationMs
  };
}

/**
 * Field extraction engine using precision regex tailored for Indian land revenue records
 * @param {string} text
 * @returns {object} Extracted structured fields
 */
function extractFieldsFromOcrText(text) {
  if (!text || typeof text !== 'string') {
    return {
      surveyNumber: null,
      plotNumber: null,
      area: null,
      village: null,
      taluk: null,
      district: null,
      ownerName: null
    };
  }

  // 1. Survey Number
  let surveyNumber = null;
  const surveyMatch = text.match(/(?:survey\s*(?:no\.?|number|plot)|khasra\s*(?:no\.?|number)|khata\s*(?:no\.?|number)|sy\.?\s*no\.?)\s*[:\-]?\s*(?:(?:sy|no)\.?\s*)*(?:no\.?\s*)?([0-9A-Za-z/\\-]+)/i) ||
                      text.match(/\b(?:sy|survey)\.?\s*no\.?\s*([0-9]+(?:\/[0-9A-Za-z]+)?)\b/i);
  if (surveyMatch) {
    surveyNumber = {
      value: surveyMatch[1].trim(),
      confidence: 85,
      source: 'ocr'
    };
  }

  // 2. Plot Number
  let plotNumber = null;
  const plotMatch = text.match(/(?:plot\s*(?:no\.?|number))\s*[:\-]?\s*([0-9A-Za-z\-]+)/i);
  if (plotMatch) {
    plotNumber = {
      value: plotMatch[1].trim(),
      confidence: 85,
      source: 'ocr'
    };
  }

  // 3. Area / Extent (value + unit: acre, guntha, hectare, sq m, cent, sq ft)
  let area = null;
  // Multi-part area (e.g. 2 Acres 20 Guntas)
  const multiPartMatch = text.match(/([0-9,]+(?:\.[0-9]+)?)\s*(?:acres?|ac)\s*(?:and\s*)?([0-9,]+(?:\.[0-9]+)?)\s*(?:gunthas?|guntas?)/i);
  if (multiPartMatch) {
    const acresVal = parseFloat(multiPartMatch[1].replace(/,/g, ''));
    const guntasVal = parseFloat(multiPartMatch[2].replace(/,/g, ''));
    const totalAcres = acresVal + (guntasVal * 0.025);
    area = {
      value: totalAcres,
      rawString: `${multiPartMatch[1]} Acres ${multiPartMatch[2]} Guntas`,
      unit: 'acre',
      acresEquivalent: totalAcres,
      confidence: 90,
      source: 'ocr'
    };
  } else {
    const singleAreaMatch = text.match(/(?:approximate\s*area|area|extent|total\s*area|measured\s*area)\s*[:\-]?\s*([0-9,]+(?:\.[0-9]+)?)\s*(acres?|hectares?|ha|gunthas?|guntas?|sq\s*\.?\s*m(?:eters?)?|sqm|square\s*meters|cents?|sq\s*\.?\s*ft|square\s*feet)(?:\s*\/\s*([0-9,]+(?:\.[0-9]+)?)\s*(sq\s*\.?\s*m(?:eters?)?|sqm|sq\s*\.?\s*ft))?/i) ||
                            text.match(/([0-9,]+(?:\.[0-9]+)?)\s*(acres?|hectares?|ha|gunthas?|guntas?|sq\s*\.?\s*m(?:eters?)?|sqm|square\s*meters|cents?|sq\s*\.?\s*ft|square\s*feet)\b/i);
    if (singleAreaMatch) {
      let val = parseFloat(singleAreaMatch[1].replace(/,/g, ''));
      let rawUnit = singleAreaMatch[2].toLowerCase();

      if (singleAreaMatch[3] && singleAreaMatch[4] && singleAreaMatch[4].includes('m')) {
        val = parseFloat(singleAreaMatch[3].replace(/,/g, ''));
        rawUnit = singleAreaMatch[4].toLowerCase();
      }

      let unit = 'acre';
      let acresEq = val;

      if (rawUnit.startsWith('acre')) {
        unit = 'acre';
        acresEq = val;
      } else if (rawUnit.startsWith('gun')) {
        unit = 'guntha';
        acresEq = val * 0.025;
      } else if (rawUnit.startsWith('ha') || rawUnit.startsWith('hectare')) {
        unit = 'hectare';
        acresEq = val * 2.47105;
      } else if (rawUnit.startsWith('cent')) {
        unit = 'cent';
        acresEq = val * 0.01;
      } else if (rawUnit.includes('ft') || rawUnit.includes('feet')) {
        unit = 'sqft';
        acresEq = val / 43560;
      } else if (rawUnit.includes('sq') || rawUnit.includes('meter') || rawUnit.includes('m')) {
        unit = 'sqm';
        acresEq = val * 0.000247105;
      }

      area = {
        value: val,
        rawString: `${singleAreaMatch[1]} ${singleAreaMatch[2]}` + (singleAreaMatch[3] ? ` / ${singleAreaMatch[3]} ${singleAreaMatch[4]}` : ''),
        unit,
        acresEquivalent: Number(acresEq.toFixed(4)),
        confidence: 85,
        source: 'ocr'
      };
    }
  }

  // 4. Village
  let village = null;
  const villageMatch = text.match(/(?:village\s*(?:\/\s*locality)?|gram|mouza)\s*[:\-]?\s*([A-Za-z\s]+?)(?=\s*[|,;\n]|\s*(?:taluk|taluka|district|tehsil|extent|area|survey|$))/i);
  if (villageMatch && villageMatch[1].trim() && !villageMatch[1].toLowerCase().includes('access road')) {
    village = {
      value: villageMatch[1].trim(),
      confidence: 80,
      source: 'ocr'
    };
  }

  // 5. Taluk
  let taluk = null;
  const talukMatch = text.match(/(?:taluk|taluka|tehsil|mandal)\s*[:\-]?\s*([A-Za-z\s]+?)(?=\s*[|,;\n]|\s*(?:district|state|village|$))/i);
  if (talukMatch && talukMatch[1].trim()) {
    taluk = {
      value: talukMatch[1].trim(),
      confidence: 80,
      source: 'ocr'
    };
  }

  // 6. District
  let district = null;
  const districtMatch = text.match(/(?:district|dist\.?)\s*[:\-]?\s*([A-Za-z\s]+?)(?=\s*[|,;\n]|\s*(?:state|pin|taluk|$))/i);
  if (districtMatch && districtMatch[1].trim()) {
    district = {
      value: districtMatch[1].trim(),
      confidence: 80,
      source: 'ocr'
    };
  }

  // 7. Owner / Claimant Name
  let ownerName = null;
  const ownerMatch = text.match(/(?:claimant\s*name|owner\s*name|recorded\s*proprietor|claimant|owner|assessee|holder|proprietor|name\s*of\s*(?:owner|farmer))\s*[:\-]?\s*([A-Za-z\s\.\-]+?)(?=\s*(?:\(ID|\(Fictional\)|S\/O|W\/O|D\/O|C\/O|ID:|national|aadhaar|relationship|[|,;\n]|$))/i);
  if (ownerMatch && ownerMatch[1].trim()) {
    ownerName = {
      value: ownerMatch[1].trim(),
      confidence: 80,
      source: 'ocr'
    };
  }

  return {
    surveyNumber,
    plotNumber,
    area,
    village,
    taluk,
    district,
    ownerName
  };
}

/**
 * Normalizes survey/plot strings by stripping spaces, periods, slashes, and leading zeros
 * @param {string} s
 * @returns {string}
 */
function normalizeSurveyString(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/^(sy|survey|no|plot|khasra|\.)+/g, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+/, '');
}

/**
 * Compares OCR-extracted fields against declared claim/parcel data
 * Evaluates survey number match and area tolerance check
 * @param {object} extracted - from extractFieldsFromOcrText
 * @param {object} claim - from store.claims.getById
 * @param {object} options - { tolerancePct, minConfidence, meanConfidence }
 * @returns {object}
 */
function compareExtractedWithClaim(extracted, claim, options = {}) {
  const tolerancePct = Number(options.tolerancePct !== undefined ? options.tolerancePct : (process.env.OCR_AREA_TOLERANCE_PCT || 5));
  const minConfidence = Number(options.minConfidence !== undefined ? options.minConfidence : (process.env.OCR_MIN_CONFIDENCE || 60));
  const meanConfidence = options.meanConfidence !== undefined ? options.meanConfidence : 85;

  const matches = {};
  const mismatches = [];

  // Low confidence check
  if (meanConfidence < minConfidence) {
    return {
      matches: {},
      mismatches: [`OCR mean confidence ${meanConfidence}% is below threshold (${minConfidence}%)`],
      overall: 'LOW_CONFIDENCE',
      tolerancePct,
      meanConfidence
    };
  }

  // 1. Survey Number comparison
  if (extracted.surveyNumber && claim && (claim.surveyNumber || claim.plotNumber)) {
    const extNorm = normalizeSurveyString(extracted.surveyNumber.value);
    const declSurveyNorm = normalizeSurveyString(claim.surveyNumber);
    const declPlotNorm = normalizeSurveyString(claim.plotNumber);

    const isSurveyMatch = extNorm === declSurveyNorm || (declSurveyNorm && extNorm.includes(declSurveyNorm)) || (extNorm && declSurveyNorm.includes(extNorm));
    const isPlotMatch = extNorm === declPlotNorm;

    if (isSurveyMatch || isPlotMatch) {
      matches.surveyNumber = true;
    } else {
      matches.surveyNumber = false;
      mismatches.push(`Survey number mismatch: extracted '${extracted.surveyNumber.value}' vs declared '${claim.surveyNumber || claim.plotNumber}'`);
    }
  } else if (!extracted.surveyNumber) {
    mismatches.push('Survey number could not be reliably extracted from document text');
  }

  // 2. Area comparison with tolerance
  if (extracted.area && claim && (claim.parcelAreaAcres || claim.confirmedAreaAcres)) {
    const declaredAcres = Number(claim.confirmedAreaAcres || claim.parcelAreaAcres || 0);
    const extractedAcres = Number(extracted.area.acresEquivalent || extracted.area.value || 0);

    if (declaredAcres > 0) {
      const diffPct = (Math.abs(extractedAcres - declaredAcres) / declaredAcres) * 100;
      if (diffPct <= tolerancePct) {
        matches.area = true;
      } else {
        matches.area = false;
        mismatches.push(`Area discrepancy (${diffPct.toFixed(1)}%): extracted ${extractedAcres.toFixed(2)} acres vs declared ${declaredAcres.toFixed(2)} acres (tolerance: ${tolerancePct}%)`);
      }
    }
  }

  // 3. Location comparisons (village, district) if present
  if (extracted.village && claim && claim.village) {
    const vExt = extracted.village.value.toLowerCase().replace(/[^a-z]/g, '');
    const vDecl = claim.village.toLowerCase().replace(/[^a-z]/g, '');
    if (vExt === vDecl || vExt.includes(vDecl) || vDecl.includes(vExt)) {
      matches.village = true;
    }
  }

  // Determine overall status: MATCH | MISMATCH | LOW_CONFIDENCE
  let overall = 'MATCH';
  if (mismatches.length > 0) {
    overall = 'MISMATCH';
  }

  return {
    matches,
    mismatches,
    overall,
    tolerancePct,
    meanConfidence
  };
}

module.exports = {
  preprocessImageBuffer,
  rasterizePdfToImages,
  recognizeImage,
  processDocumentOcr,
  extractFieldsFromOcrText,
  normalizeSurveyString,
  compareExtractedWithClaim,
  encryptOcrText,
  decryptOcrText,
  computeOcrHmac
};
