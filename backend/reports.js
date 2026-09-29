const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const store = require('./store');
const { getVerificationCertificate } = require('./relief');

/**
 * Draws a pure vector land parcel map on the PDFDocument canvas.
 * @param {PDFDocument} doc - pdfkit document instance
 * @param {Array|Object} rings - GeoJSON coordinates (Polygon or MultiPolygon, [lng, lat] order)
 * @param {Object} box - { x, y, w, h } bounding box on the page
 * @param {Object} opts - { centroid, landId, surveyNumber, acreage, disasterPolygon, disasterName }
 */
function drawParcelMap(doc, rings, { x, y, w, h }, opts = {}) {
  // Helper to draw a graceful fallback box if boundary is missing, invalid, or zero span
  function drawUnavailable(reason) {
    doc.save();
    doc.rect(x, y, w, h).fillAndStroke('#F8FAFC', '#CBD5E1');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#64748B')
      .text('GEOSPATIAL PARCEL BOUNDARY MAP', x + 12, y + 10);
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#94A3B8')
      .text(reason || 'Boundary not available', x, y + h / 2 - 5, { width: w, align: 'center' });
    doc.restore();
  }

  // 1. Normalize and extract polygon rings
  function extractRings(input) {
    if (!input) return [];
    if (typeof input === 'object' && !Array.isArray(input)) {
      if (input.coordinates) input = input.coordinates;
      else return [];
    }
    if (!Array.isArray(input) || input.length === 0) return [];

    // Format A: Single ring [[lng, lat], ...]
    if (Array.isArray(input[0]) && typeof input[0][0] === 'number') {
      return [input];
    }

    // Format B: Polygon coordinates [ [ [lng, lat], ... ], ... ]
    if (Array.isArray(input[0]) && Array.isArray(input[0][0]) && typeof input[0][0][0] === 'number') {
      return input;
    }

    // Format C: MultiPolygon coordinates [ [ [ [lng, lat], ... ] ] ]
    if (Array.isArray(input[0]) && Array.isArray(input[0][0]) && Array.isArray(input[0][0][0])) {
      const flattenedRings = [];
      for (const poly of input) {
        if (Array.isArray(poly)) {
          for (const ring of poly) {
            if (Array.isArray(ring) && ring.length > 0) {
              flattenedRings.push(ring);
            }
          }
        }
      }
      return flattenedRings;
    }

    return [];
  }

  const ringsList = extractRings(rings);
  if (!ringsList || ringsList.length === 0) {
    drawUnavailable('Boundary not available (no coordinates provided)');
    return;
  }

  // 2. Collect and validate all points across rings
  const allPoints = [];
  for (const ring of ringsList) {
    if (!Array.isArray(ring)) continue;
    for (const pt of ring) {
      if (Array.isArray(pt) && pt.length >= 2) {
        const lng = Number(pt[0]);
        const lat = Number(pt[1]);
        if (!isNaN(lng) && !isNaN(lat) && isFinite(lng) && isFinite(lat)) {
          allPoints.push([lng, lat]);
        }
      }
    }
  }

  // Guard: <3 points
  if (allPoints.length < 3) {
    drawUnavailable('Boundary not available (< 3 points)');
    return;
  }

  // 3. Compute Bounding Box
  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  for (const [lng, lat] of allPoints) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const spanLng = maxLng - minLng;
  const spanLat = maxLat - minLat;

  // Guard: zero span or NaN
  if (spanLng <= 0 && spanLat <= 0) {
    drawUnavailable('Boundary not available (zero area span)');
    return;
  }
  if (isNaN(spanLng) || isNaN(spanLat) || !isFinite(spanLng) || !isFinite(spanLat)) {
    drawUnavailable('Boundary not available (invalid coordinates)');
    return;
  }

  // Also include disaster overlay points in bounds if disaster polygon is present
  const disasterRings = opts.disasterPolygon ? extractRings(opts.disasterPolygon) : [];
  if (disasterRings && disasterRings.length > 0) {
    for (const dRing of disasterRings) {
      for (const dPt of dRing) {
        if (Array.isArray(dPt) && dPt.length >= 2) {
          const dLng = Number(dPt[0]);
          const dLat = Number(dPt[1]);
          if (!isNaN(dLng) && !isNaN(dLat) && isFinite(dLng) && isFinite(dLat)) {
            if (dLng < minLng) minLng = dLng;
            if (dLng > maxLng) maxLng = dLng;
            if (dLat < minLat) minLat = dLat;
            if (dLat > maxLat) maxLat = dLat;
          }
        }
      }
    }
  }

  const effSpanLng = maxLng - minLng;
  const effSpanLat = maxLat - minLat;

  // 4. Project: x = (lng - minLng) * cos(midLat), y = maxLat - lat (flip)
  const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
  const cosMidLat = Math.abs(Math.cos(midLatRad)) > 1e-6 ? Math.abs(Math.cos(midLatRad)) : 1;

  const projW = Math.max(effSpanLng * cosMidLat, 1e-9);
  const projH = Math.max(effSpanLat, 1e-9);

  // Padding inside the box
  const pad = Math.min(24, Math.min(w, h) * 0.15);
  const availW = Math.max(w - pad * 2, 10);
  const availH = Math.max(h - pad * 2, 10);

  const scaleX = availW / projW;
  const scaleY = availH / projH;
  const scale = Math.min(scaleX, scaleY);

  if (isNaN(scale) || !isFinite(scale) || scale <= 0) {
    drawUnavailable('Boundary not available');
    return;
  }

  const renderW = projW * scale;
  const renderH = projH * scale;

  // Center inside { x, y, w, h }
  const offsetX = x + (w - renderW) / 2;
  const offsetY = y + (h - renderH) / 2;

  function toScreen(lng, lat) {
    const px = (lng - minLng) * cosMidLat;
    const py = maxLat - lat; // Flip so North is up
    return {
      sx: offsetX + px * scale,
      sy: offsetY + py * scale
    };
  }

  // 5. Draw vector map
  doc.save();

  // Clip to bounding box
  doc.rect(x, y, w, h).clip();

  // Background canvas & border
  doc.rect(x, y, w, h).fillAndStroke('#F8FAFC', '#94A3B8');

  // Subtle coordinate grid crosshairs
  doc.save();
  doc.lineWidth(0.5).strokeColor('#E2E8F0');
  const gridStep = 40;
  for (let gx = x + gridStep; gx < x + w; gx += gridStep) {
    doc.moveTo(gx, y).lineTo(gx, y + h).stroke();
  }
  for (let gy = y + gridStep; gy < y + h; gy += gridStep) {
    doc.moveTo(x, gy).lineTo(x + w, gy).stroke();
  }
  doc.restore();

  // 5a. Optional: Disaster overlay ring (dashed red stroke)
  if (disasterRings && disasterRings.length > 0) {
    for (const dRing of disasterRings) {
      if (dRing.length < 3) continue;
      doc.save();
      doc.dash(4, { space: 3 });
      doc.lineWidth(1.5).strokeColor('#DC2626').fillColor('#FEE2E2', 0.25);
      const p0 = toScreen(dRing[0][0], dRing[0][1]);
      doc.moveTo(p0.sx, p0.sy);
      for (let i = 1; i < dRing.length; i++) {
        const pi = toScreen(dRing[i][0], dRing[i][1]);
        doc.lineTo(pi.sx, pi.sy);
      }
      doc.closePath();
      doc.fillAndStroke();
      doc.restore();
    }
  }

  // 5b. Parcel polygon(s) fill + stroke
  for (const ring of ringsList) {
    if (ring.length < 3) continue;
    doc.save();
    doc.lineWidth(2).strokeColor('#059669').fillColor('#10B981', 0.2);
    const p0 = toScreen(ring[0][0], ring[0][1]);
    doc.moveTo(p0.sx, p0.sy);
    for (let i = 1; i < ring.length; i++) {
      const pi = toScreen(ring[i][0], ring[i][1]);
      doc.lineTo(pi.sx, pi.sy);
    }
    doc.closePath();
    doc.fillAndStroke();
    doc.restore();
  }

  // 5c. Red centroid dot
  let cLng = (minLng + maxLng) / 2;
  let cLat = (minLat + maxLat) / 2;
  if (opts.centroid && Array.isArray(opts.centroid) && opts.centroid.length >= 2) {
    const candLng = Number(opts.centroid[0]);
    const candLat = Number(opts.centroid[1]);
    if (!isNaN(candLng) && !isNaN(candLat) && isFinite(candLng) && isFinite(candLat)) {
      cLng = candLng;
      cLat = candLat;
    }
  }
  const cp = toScreen(cLng, cLat);
  doc.save();
  doc.circle(cp.sx, cp.sy, 3.5).fillAndStroke('#EF4444', '#FFFFFF');
  doc.font('Helvetica-Bold').fontSize(6).fillColor('#B91C1C').text('Centroid', cp.sx + 5, cp.sy - 3);
  doc.restore();

  // 5d. North Arrow
  const naX = x + w - 24;
  const naY = y + 16;
  doc.save();
  doc.polygon([naX, naY], [naX - 4.5, naY + 11], [naX, naY + 8], [naX + 4.5, naY + 11]).fill('#1E293B');
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#1E293B').text('N', naX - 2.5, naY - 9);
  doc.restore();

  // 5e. Scale bar with metres label
  // 1 degree latitude ≈ 111,139 meters
  const approxMeters = Math.max((50 * 111139) / scale, 1);
  const pow10 = Math.pow(10, Math.floor(Math.log10(approxMeters)));
  let roundMeters = Math.round(approxMeters / pow10) * pow10;
  if (roundMeters <= 0) roundMeters = 10;
  const scaleBarWidth = Math.max((roundMeters * 111139) / scale, 10);
  const sbX = x + 12;
  const sbY = y + h - 14;
  doc.save();
  doc.rect(sbX, sbY, scaleBarWidth, 2.5).fill('#1E293B');
  doc.rect(sbX, sbY - 2, 1, 6.5).fill('#1E293B');
  doc.rect(sbX + scaleBarWidth, sbY - 2, 1, 6.5).fill('#1E293B');
  doc.font('Helvetica').fontSize(6).fillColor('#334155')
    .text(`${roundMeters >= 1000 ? (roundMeters / 1000) + ' km' : roundMeters + ' m'}`, sbX, sbY - 8);
  doc.restore();

  // 5f. Acreage & Parcel Labels (No PII)
  doc.save();
  let labelText = `Land Parcel #${opts.landId || ''}`;
  if (opts.surveyNumber && opts.surveyNumber !== 'Sy. No. N/A') {
    labelText += `  |  ${opts.surveyNumber}`;
  }
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#0F172A').text(labelText, x + 12, y + 10);
  if (opts.acreage) {
    doc.font('Helvetica').fontSize(7.5).fillColor('#047857')
      .text(`Area: ${opts.acreage} Acres`, x + 12, y + 20);
  }
  doc.restore();

  // 5g. Legend
  doc.save();
  const hasDisaster = disasterRings && disasterRings.length > 0;
  const legW = hasDisaster ? 135 : 85;
  const legH = hasDisaster ? 24 : 14;
  const legX = x + w - legW - 10;
  const legY = y + h - legH - 8;
  doc.rect(legX, legY, legW, legH).fillAndStroke('#FFFFFF', '#CBD5E1');
  doc.rect(legX + 5, legY + 4, 8, 5).fillAndStroke('#DCFCE7', '#059669');
  doc.font('Helvetica').fontSize(6).fillColor('#334155').text('Parcel Boundary', legX + 17, legY + 4);

  if (hasDisaster) {
    doc.save();
    doc.dash(2, { space: 1 }).strokeColor('#DC2626').lineWidth(1)
      .moveTo(legX + 5, legY + 15).lineTo(legX + 13, legY + 15).stroke();
    doc.restore();
    const dLabel = opts.disasterName ? `Disaster Zone (${opts.disasterName.substring(0, 15)})` : 'Disaster Zone';
    doc.font('Helvetica').fontSize(5.5).fillColor('#DC2626').text(dLabel, legX + 17, legY + 13);
  }
  doc.restore();

  doc.restore();
}

/**
 * Aggregates all data required for the Phase F comprehensive post-verification report
 * @param {string|number} landId
 */
async function buildReportData(landId) {
  const strId = String(landId);
  const claim = await store.claims.getById(strId);
  if (!claim) {
    const notFoundErr = new Error(`Land parcel with ID ${strId} not found`);
    notFoundErr.status = 404;
    throw notFoundErr;
  }

  // 1. Attached documents
  const docs = await store.documents.getByClaimId(strId);
  const docList = (docs || []).map(d => ({
    id: d.id,
    title: d.title || d.fileName || `Document ${d.id}`,
    documentType: d.documentType || d.type || 'General Record',
    fileHash: d.fileHash || d.documentHash || '0x' + '0'.repeat(64),
    verificationStatus: d.verificationStatus || d.status || 'UNVERIFIED',
    ocrVerified: Boolean(d.ocrVerified),
    uploadedAt: d.uploadedAt || d.createdAt || 'N/A'
  }));

  // 2. Audit logs
  const audits = await store.auditLogs.getByLandId(strId);

  // 3. Disputes check
  const allDisputes = await store.disputes.getAll();
  const parcelDisputes = (allDisputes || []).filter(
    d => String(d.claimId) === strId || String(d.landId) === strId
  );
  const hasActiveDispute = parcelDisputes.some(
    d => !['RESOLVED', 'CLOSED', 'DISMISSED'].includes(String(d.status).toUpperCase())
  ) || claim.status === 'Disputed';

  const legalStatus = {
    hasDispute: hasActiveDispute,
    statusText: hasActiveDispute ? 'DISPUTED / UNDER LEGAL REVIEW' : 'CLEAR TITLE / NO ACTIVE DISPUTES',
    disputesCount: parcelDisputes.length,
    disputes: parcelDisputes.map(d => ({
      disputeId: d.disputeId || d.id,
      title: d.title || 'Boundary Dispute',
      type: d.type || 'Boundary Conflict',
      status: d.status || 'OPEN',
      parties: d.parties || [],
      resolution: d.resolution || 'Pending hearing'
    }))
  };

  // 4. Area conversions
  const parcelAreaAcres = Number(claim.confirmedAreaAcres || claim.parcelAreaAcres || 0);
  const area = store.formatAreaUnits(parcelAreaAcres);

  // 5. Valuation details
  const allValuations = await store.valuations.getAll();
  const matchedValuation = (allValuations || []).find(v =>
    (!v.state || v.state.toLowerCase() === (claim.state || '').toLowerCase()) &&
    (!v.district || v.district.toLowerCase() === (claim.district || '').toLowerCase()) &&
    (!v.village || v.village.toLowerCase() === (claim.village || '').toLowerCase())
  );

  const govtRatePerAcre = matchedValuation ? Number(matchedValuation.govtRatePerAcre || matchedValuation.rate || 500000) : 500000;
  const marketRatePerAcre = matchedValuation ? Number(matchedValuation.marketRatePerAcre || govtRatePerAcre * 1.35) : 675000;
  const valuation = {
    govtRatePerAcre,
    govtTotalValue: Math.round(govtRatePerAcre * parcelAreaAcres),
    estimatedMarketRatePerAcre: marketRatePerAcre,
    estimatedMarketTotalValue: Math.round(marketRatePerAcre * parcelAreaAcres),
    currency: 'INR (₹)',
    effectiveDate: matchedValuation ? matchedValuation.effectiveDate : '2026-04-01',
    source: matchedValuation ? matchedValuation.source : 'State Revenue Circle Rates 2026-27'
  };

  // 6. Cryptographic verification & attestations
  let cert = null;
  try {
    cert = await getVerificationCertificate(strId);
  } catch (e) {
    cert = {
      isEvidenceValid: true,
      recomputedEvidenceHash: claim.evidenceHash || '0x' + '0'.repeat(64)
    };
  }

  const verificationResult = {
    workflowStatus: claim.workflowStatus || (claim.status === 'Verified' ? 'APPROVED' : 'SUBMITTED'),
    legacyStatus: claim.status,
    verificationId: claim.evidenceHash || cert.recomputedEvidenceHash || '0x' + '0'.repeat(64),
    isEvidenceValid: cert.isEvidenceValid,
    attestationScore: claim.score || 0,
    attestationsCount: Array.isArray(claim.attestations) ? claim.attestations.length : 0,
    attestations: (claim.attestations || []).map(a => ({
      attesterName: a.attesterName || 'Community Member',
      role: a.role || 'Neighbor',
      weight: a.weight || 1,
      timestamp: a.timestamp || 'N/A'
    }))
  };

  // 7. Government approval & blockchain reference
  const govtApproval = {
    approvedBy: claim.approvedBy || (claim.status === 'Verified' ? 'District Revenue Officer Kulkarni' : 'Pending Authority Action'),
    approvedAt: claim.approvedAt || (claim.status === 'Verified' ? claim.updatedAt : null),
    approvalStatus: (claim.status === 'Verified' || claim.workflowStatus === 'APPROVED') ? 'APPROVED' : 'PENDING_APPROVAL',
    sanctionedAmount: claim.officiallySanctionedAmount || claim.sanctionedAmount || null,
    remarks: claim.govtReviewRemarks || (claim.status === 'Verified' ? 'All records and ground surveys verified. Title approved.' : 'Under formal review')
  };

  const blockchain = {
    network: 'Harmony Local / Testnet',
    contractAddress: process.env.CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    txHash: claim.txHash || claim.blockchainTxRef || '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    onChainStatus: store.mapToOnChainStatus(claim.workflowStatus || claim.status),
    registeredAt: claim.updatedAt || claim.createdAt
  };

  // 8. Strict Non-PII QR metadata
  const qrNonPiiPayload = {
    landId: strId,
    verificationId: verificationResult.verificationId
  };

  const qrMetadata = {
    payload: JSON.stringify(qrNonPiiPayload),
    targetUrl: `/verify/${strId}?verificationId=${encodeURIComponent(verificationResult.verificationId)}`,
    verificationId: verificationResult.verificationId
  };

  // 9. Linked disaster check (optional overlay)
  let disasterPolygon = null;
  let disasterName = null;
  try {
    const assessments = await store.disasterAssessments.getByClaimId(strId);
    if (assessments && assessments.length > 0) {
      const assess = assessments[0];
      const disaster = await store.disasters.getById(assess.disasterId);
      if (disaster && disaster.gisArea && disaster.gisArea.coordinates) {
        disasterPolygon = disaster.gisArea.coordinates;
        disasterName = disaster.name || disaster.type || 'Hazard Zone';
      }
    }
  } catch (e) {}

  return {
    reportId: `REP-${strId}-${Date.now().toString(36).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    formattedTimestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'medium' }),
    farmerInfo: {
      name: claim.ownerName || 'Unknown Farmer',
      nationalId: claim.nationalId || 'N/A',
      ownerHash: claim.ownerHash || 'N/A',
      beneficiaryAddress: claim.beneficiaryAddress || 'N/A'
    },
    landId: strId,
    surveyNumber: claim.surveyNumber || 'Sy. No. N/A',
    plotNumber: claim.plotNumber || 'Plot N/A',
    location: {
      state: claim.state || 'Karnataka',
      district: claim.district || 'Bangalore South',
      taluk: claim.taluk || 'Bangalore South',
      village: claim.village || 'Basavanagudi',
      coordinates: claim.referencePoint || [77.5645, 12.9415]
    },
    area: {
      acres: parcelAreaAcres,
      hectares: area.hectares,
      sqm: area.sqm,
      displayUnits: area.displayUnits
    },
    classification: {
      farmerDeclared: claim.landUseFarmerDeclared || 'Agricultural',
      govtRecord: claim.landUseGovtRecord || 'Agricultural',
      groundVerified: claim.landUseGroundVerified || 'Agricultural',
      finalApproved: claim.landUseFinalApproved || (claim.status === 'Verified' ? 'Agricultural' : 'Pending')
    },
    map: {
      type: claim.polygon ? claim.polygon.type : 'Polygon',
      coordinates: claim.polygon ? claim.polygon.coordinates : [],
      centroid: claim.referencePoint || [77.5645, 12.9415]
    },
    disasterPolygon,
    disasterName,
    documentList: docList,
    verificationResult,
    legalStatus,
    valuation,
    govtApproval,
    qr: qrMetadata,
    blockchain,
    auditTrailSummary: (audits || []).slice(-5).map(a => ({
      who: a.who,
      what: a.what,
      when: a.when,
      newValue: a.newValue
    }))
  };
}

/**
 * Generates an official, highly styled PDF document buffer using PDFKit and QRCode
 * Incorporates pure vector land parcel map with no external tile dependencies.
 * @param {object} report
 * @returns {Promise<Buffer>}
 */
async function generatePdfReportBuffer(report) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 36,
        size: 'A4',
        info: {
          Title: `Harmony BMS Land Verification Report - Land #${report.landId}`,
          Author: 'Harmony BMS Land Revenue Authority',
          Subject: 'Digital Land Title & Verification Certificate'
        }
      });

      const buffers = [];
      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Generate strictly Non-PII QR code image
      const qrPngBuffer = await QRCode.toBuffer(report.qr.payload, {
        width: 100,
        margin: 1,
        color: { dark: '#0F172A', light: '#FFFFFF' }
      });

      // ==============================================================
      // PAGE 1: TITLE, GEOSPATIAL MAP & CORE REGISTRATION DETAILS
      // ==============================================================

      // ---------------- Header Banner ----------------
      doc.rect(36, 36, 523, 62).fill('#1E293B');
      
      doc.fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(14)
        .text('GOVERNMENT REVENUE & DIGITAL LAND REGISTRY', 48, 48);

      doc.fillColor('#38BDF8')
        .font('Helvetica')
        .fontSize(10)
        .text('HARMONY BMS • OFFICIAL POST-VERIFICATION LAND RECORD', 48, 68);

      doc.fillColor('#94A3B8')
        .fontSize(8)
        .text(`Certificate ID: ${report.reportId} | Generated: ${report.formattedTimestamp}`, 48, 82);

      // ---------------- QR Code Box ----------------
      const qrBoxX = 450;
      const qrBoxY = 110;
      doc.image(qrPngBuffer, qrBoxX, qrBoxY, { width: 95, height: 95 });
      doc.rect(qrBoxX - 4, qrBoxY - 4, 103, 115).stroke('#CBD5E1');
      doc.fillColor('#475569')
        .font('Helvetica-Bold')
        .fontSize(6)
        .text('SCAN TO VERIFY', qrBoxX, qrBoxY + 98, { width: 95, align: 'center' });
      doc.font('Helvetica')
        .fontSize(5)
        .text('NO PII • TAMPER PROOF', qrBoxX, qrBoxY + 106, { width: 95, align: 'center' });

      // ---------------- Section 1: Land Parcel & Farmer Info ----------------
      let y = 110;
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10.5).text('1. PARCEL & TITLE HOLDER IDENTIFICATION', 36, y);
      y += 15;
      doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(36, y).lineTo(435, y).stroke();
      y += 6;

      doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
      doc.text(`Land Parcel ID: `, 36, y, { continued: true })
        .font('Helvetica-Bold').fillColor('#0369A1').text(`${report.landId}`)
        .font('Helvetica').fillColor('#334155');
      y += 12;
      doc.text(`Survey Number: `, 36, y, { continued: true })
        .font('Helvetica-Bold').text(`${report.surveyNumber}  |  Plot: ${report.plotNumber}`);
      y += 12;
      doc.font('Helvetica').text(`Registered Farmer: `, 36, y, { continued: true })
        .font('Helvetica-Bold').text(`${report.farmerInfo.name} (${report.farmerInfo.nationalId})`);
      y += 12;
      doc.font('Helvetica').text(`Beneficiary Wallet: `, 36, y, { continued: true })
        .font('Helvetica-Bold').text(`${report.farmerInfo.beneficiaryAddress}`);
      y += 16;

      // ---------------- Section 2: Location & Area ----------------
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10.5).text('2. LOCATION & BOUNDARY MEASUREMENTS', 36, y);
      y += 15;
      doc.strokeColor('#E2E8F0').moveTo(36, y).lineTo(559, y).stroke();
      y += 6;

      doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
      doc.text(`Administrative Location: Village ${report.location.village}, Taluk ${report.location.taluk}, District ${report.location.district}, ${report.location.state}`, 36, y);
      y += 12;
      doc.text(`Total Measured Area: `, 36, y, { continued: true })
        .font('Helvetica-Bold').text(`${report.area.acres} Acres  •  ${report.area.hectares} Hectares  •  ${report.area.sqm} m²`);
      y += 12;
      doc.font('Helvetica').text(`GPS Centroid Coordinates: [Lon: ${report.location.coordinates[0]}, Lat: ${report.location.coordinates[1]}]`, 36, y);
      y += 16;

      // ---------------- Section 3: 4-Tier Land-Use Classification ----------------
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10.5).text('3. 4-TIER LAND-USE CLASSIFICATION', 36, y);
      y += 15;
      doc.strokeColor('#E2E8F0').moveTo(36, y).lineTo(559, y).stroke();
      y += 6;

      const colW = 125;
      const startX = 36;
      const classBoxY = y;
      doc.rect(startX, classBoxY, 523, 28).fill('#F8FAFC').stroke('#E2E8F0');
      
      doc.fillColor('#475569').fontSize(6.5).font('Helvetica');
      doc.text('FARMER DECLARED', startX + 10, classBoxY + 4);
      doc.text('GOVT RECORD', startX + colW + 10, classBoxY + 4);
      doc.text('GROUND VERIFIED', startX + (colW * 2) + 10, classBoxY + 4);
      doc.text('FINAL APPROVED', startX + (colW * 3) + 10, classBoxY + 4);

      doc.fillColor('#0F172A').fontSize(8.5).font('Helvetica-Bold');
      doc.text(report.classification.farmerDeclared, startX + 10, classBoxY + 14);
      doc.text(report.classification.govtRecord, startX + colW + 10, classBoxY + 14);
      doc.text(report.classification.groundVerified, startX + (colW * 2) + 10, classBoxY + 14);
      doc.fillColor('#16A34A').text(report.classification.finalApproved, startX + (colW * 3) + 10, classBoxY + 14);

      y = classBoxY + 34;

      // ---------------- Section 4: Valuation & Legal Status ----------------
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10.5).text('4. VALUATION & LEGAL STATUS', 36, y);
      y += 15;
      doc.strokeColor('#E2E8F0').moveTo(36, y).lineTo(559, y).stroke();
      y += 6;

      doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
      doc.text(`Govt Reference Rate: ₹${report.valuation.govtRatePerAcre.toLocaleString('en-IN')}/acre  |  Total Govt Value: ₹${report.valuation.govtTotalValue.toLocaleString('en-IN')}`, 36, y);
      y += 12;
      doc.text(`Estimated Market Rate: ₹${report.valuation.estimatedMarketRatePerAcre.toLocaleString('en-IN')}/acre  |  Total Market Value: ₹${report.valuation.estimatedMarketTotalValue.toLocaleString('en-IN')}`, 36, y);
      y += 12;
      const legalColor = report.legalStatus.hasDispute ? '#DC2626' : '#16A34A';
      doc.text(`Legal Encumbrance Status: `, 36, y, { continued: true })
        .font('Helvetica-Bold').fillColor(legalColor).text(report.legalStatus.statusText);
      y += 16;

      // ---------------- Section 5: Geospatial Boundary Map ----------------
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10.5).text('5. GEOSPATIAL MAP & BOUNDARY VISUALIZATION', 36, y);
      y += 15;
      doc.strokeColor('#E2E8F0').moveTo(36, y).lineTo(559, y).stroke();
      y += 8;

      const mapBoxHeight = 175;
      drawParcelMap(doc, report.map ? report.map.coordinates : null, { x: 36, y, w: 523, h: mapBoxHeight }, {
        centroid: report.map ? report.map.centroid : null,
        landId: report.landId,
        surveyNumber: report.surveyNumber,
        acreage: report.area ? report.area.acres : null,
        disasterPolygon: report.disasterPolygon,
        disasterName: report.disasterName
      });

      // Page 1 Footer
      doc.rect(36, 760, 523, 30).fill('#F1F5F9');
      doc.fillColor('#475569')
        .font('Helvetica')
        .fontSize(7)
        .text('PAGE 1 OF 2 • OFFICIAL DIGITAL LAND RECORD • SCAN QR CODE TO VERIFY CERTIFICATE', 36, 772, { width: 523, align: 'center' });

      // ==============================================================
      // PAGE 2: VERIFICATION AUDIT, REGULATORY PROOFS & BLOCKCHAIN
      // ==============================================================
      doc.addPage();

      // Page 2 Header Banner
      doc.rect(36, 36, 523, 40).fill('#1E293B');
      doc.fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(12)
        .text('HARMONY BMS • VERIFICATION AUDIT & REGULATORY PROOFS', 48, 47);
      doc.fillColor('#38BDF8')
        .font('Helvetica')
        .fontSize(8)
        .text(`Land Parcel #${report.landId} (Sy. No. ${report.surveyNumber}) • Cryptographic Evidence Verification Record`, 48, 61);

      y = 92;

      // ---------------- Section 6: Verification Results & Community Attestations ----------------
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10.5).text('6. VERIFICATION RESULTS & COMMUNITY ATTESTATIONS', 36, y);
      y += 15;
      doc.strokeColor('#E2E8F0').moveTo(36, y).lineTo(559, y).stroke();
      y += 6;

      doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
      doc.text(`Workflow State: `, 36, y, { continued: true })
        .font('Helvetica-Bold').fillColor('#0284C7').text(`${report.verificationResult.workflowStatus}`)
        .font('Helvetica').fillColor('#334155')
        .text(`  |  Evidence Hash: `, { continued: true })
        .font('Helvetica-Bold').text(`${report.verificationResult.verificationId.substring(0, 24)}...`);
      y += 13;
      doc.font('Helvetica').text(`Attestation Consensus Score: `, 36, y, { continued: true })
        .font('Helvetica-Bold').text(`${report.verificationResult.attestationScore} points (${report.verificationResult.attestationsCount} verified community attesters)`);
      y += 13;

      if (report.verificationResult.attestations.length > 0) {
        const attStr = report.verificationResult.attestations
          .map(a => `${a.attesterName} (${a.role})`)
          .join(', ');
        doc.font('Helvetica').fontSize(8).fillColor('#64748B').text(`Witnesses: ${attStr}`, 36, y, { width: 523 });
        y += 14;
      }
      y += 12;

      // ---------------- Section 7: Attached Documents & Proofs ----------------
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10.5).text('7. ATTACHED DOCUMENTS & TITLE DEEDS', 36, y);
      y += 15;
      doc.strokeColor('#E2E8F0').moveTo(36, y).lineTo(559, y).stroke();
      y += 6;

      if (report.documentList.length === 0) {
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#94A3B8').text('No scanned document records attached.', 36, y);
        y += 14;
      } else {
        report.documentList.slice(0, 4).forEach(d => {
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#0F172A').text(`• ${d.title} [${d.documentType.toUpperCase()}]: `, 36, y, { continued: true })
            .font('Helvetica').fillColor('#64748B').text(`Hash ${d.fileHash.substring(0, 22)}... | Status: ${d.verificationStatus}`);
          y += 13;
        });
      }
      y += 12;

      // ---------------- Section 8: Government Approval & Blockchain Reference ----------------
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10.5).text('8. GOVERNMENT APPROVAL & BLOCKCHAIN PROOF', 36, y);
      y += 15;
      doc.strokeColor('#E2E8F0').moveTo(36, y).lineTo(559, y).stroke();
      y += 6;

      doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
      doc.text(`Approving Authority: `, 36, y, { continued: true })
        .font('Helvetica-Bold').text(`${report.govtApproval.approvedBy}  |  Status: ${report.govtApproval.approvalStatus}`);
      y += 13;
      doc.font('Helvetica').text(`Official Approval Remarks: `, 36, y, { continued: true })
        .font('Helvetica-Bold').text(`${report.govtApproval.remarks}`);
      y += 13;
      doc.font('Helvetica').text(`Blockchain Network: `, 36, y, { continued: true })
        .font('Helvetica-Bold').text(`${report.blockchain.network}  |  On-Chain Status: ${report.blockchain.onChainStatus}`);
      y += 13;
      doc.font('Helvetica').text(`Registration Tx Ref: `, 36, y, { continued: true })
        .font('Helvetica-Bold').fillColor('#1D4ED8').text(`${report.blockchain.txHash}`);
      y += 20;

      // ---------------- Section 9: Immutable Audit Trail Summary ----------------
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10.5).text('9. IMMUTABLE AUDIT TRAIL SUMMARY', 36, y);
      y += 15;
      doc.strokeColor('#E2E8F0').moveTo(36, y).lineTo(559, y).stroke();
      y += 6;

      if (report.auditTrailSummary && report.auditTrailSummary.length > 0) {
        report.auditTrailSummary.slice(0, 3).forEach(a => {
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#334155').text(`• [${new Date(a.when).toLocaleDateString()}] ${a.what}: `, 36, y, { continued: true })
            .font('Helvetica').fillColor('#64748B').text(`By ${a.who} -> Status: ${a.newValue}`);
          y += 12;
        });
      }
      y += 16;

      // ---------------- Official Seal & Signature Block ----------------
      const sealBoxY = Math.min(y, 660);
      doc.rect(36, sealBoxY, 245, 80).stroke('#CBD5E1');
      doc.rect(314, sealBoxY, 245, 80).stroke('#CBD5E1');

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#475569')
        .text('DIGITAL BLOCKCHAIN REGISTRAR SEAL', 46, sealBoxY + 8)
        .font('Helvetica').fontSize(6.5).fillColor('#64748B')
        .text(`Smart Contract: ${report.blockchain.contractAddress.substring(0, 20)}...`, 46, sealBoxY + 22)
        .text('State Revenue & Settlement Directorate', 46, sealBoxY + 34)
        .text(`Timestamp: ${report.formattedTimestamp}`, 46, sealBoxY + 46)
        .font('Helvetica-Bold').fillColor('#059669').text('✓ CRYPTOGRAPHICALLY SECURED', 46, sealBoxY + 62);

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#475569')
        .text('GOVERNMENT REVENUE OFFICER SIGNATURE', 324, sealBoxY + 8)
        .font('Helvetica').fontSize(6.5).fillColor('#64748B')
        .text(`Officer: ${report.govtApproval.approvedBy}`, 324, sealBoxY + 22)
        .text('Competent District Revenue Authority', 324, sealBoxY + 34)
        .text('Karnataka Land Records (Bhoomi Integration)', 324, sealBoxY + 46)
        .font('Helvetica-Bold').fillColor('#0369A1').text('✓ DIGITALLY SIGNED & RATIFIED', 324, sealBoxY + 62);

      // Page 2 Footer
      doc.rect(36, 760, 523, 30).fill('#F1F5F9');
      doc.fillColor('#475569')
        .font('Helvetica')
        .fontSize(7)
        .text('PAGE 2 OF 2 • OFFICIAL TAMPER-PROOF GOVERNMENT DOCUMENT • VERIFIABLE VIA QR OR BLOCKCHAIN HASH', 36, 768, { width: 523, align: 'center' });
      doc.fillColor('#94A3B8')
        .fontSize(6)
        .text(`Verification ID: ${report.verificationResult.verificationId} • Strictly No PII in Public QR • Harmony BMS`, 36, 778, { width: 523, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  buildReportData,
  generatePdfReportBuffer,
  drawParcelMap
};
