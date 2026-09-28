const express = require('express');
const router = express.Router();
const store = require('../store');
const { buildReportData, generatePdfReportBuffer } = require('../reports');

/**
 * 1. GET /reports - List summaries of available land reports
 */
router.get('/', async (req, res, next) => {
  try {
    const claims = await store.claims.getAll();
    const reportsSummary = (claims || []).map(c => {
      const id = String(c.claimId || c.landId);
      return {
        landId: id,
        claimId: id,
        surveyNumber: c.surveyNumber || 'Sy. No. N/A',
        ownerName: c.ownerName || 'Unknown',
        workflowStatus: c.workflowStatus || (c.status === 'Verified' ? 'APPROVED' : 'SUBMITTED'),
        status: c.status,
        reportUrl: `/reports/${id}`,
        pdfUrl: `/reports/${id}/pdf`
      };
    });
    res.json(reportsSummary);
  } catch (err) {
    next(err);
  }
});

/**
 * 2. POST /reports/generate - Generate on-demand report for a land parcel
 */
router.post('/generate', async (req, res, next) => {
  try {
    const landId = req.body.landId || req.body.claimId;
    if (!landId) {
      return res.status(400).json({ error: 'landId or claimId is required' });
    }
    const reportData = await buildReportData(landId);

    if (req.body.format === 'pdf') {
      const pdfBuffer = await generatePdfReportBuffer(reportData);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="land-report-${landId}.pdf"`);
      return res.send(pdfBuffer);
    }

    res.status(201).json({
      success: true,
      message: `Report successfully generated for Land Parcel #${landId}`,
      report: reportData,
      pdfUrl: `/reports/${landId}/pdf`
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 3. GET /reports/:landId/pdf - Generate and stream PDF report
 */
router.get('/:landId/pdf', async (req, res, next) => {
  try {
    const reportData = await buildReportData(req.params.landId);
    const pdfBuffer = await generatePdfReportBuffer(reportData);

    const isDownload = req.query.download === 'true';
    const disposition = isDownload ? 'attachment' : 'inline';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="land-report-${req.params.landId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

/**
 * 4. GET /reports/download/:landId - Attachment download endpoint
 */
router.get('/download/:landId', async (req, res, next) => {
  try {
    const reportData = await buildReportData(req.params.landId);
    const pdfBuffer = await generatePdfReportBuffer(reportData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="land-report-${req.params.landId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

/**
 * 5. GET /reports/:landId - Get comprehensive JSON report data
 */
router.get('/:landId', async (req, res, next) => {
  try {
    const reportData = await buildReportData(req.params.landId);
    res.json(reportData);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
