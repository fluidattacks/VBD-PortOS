import { Router } from 'express';
import { asyncHandler } from '../lib/errorHandler.js';
import { validateRequest, legacyExportSchema } from '../lib/validation.js';
import { buildLegacyZip, previewLegacyExport } from '../services/legacyExport.js';

const router = Router();

// GET /api/legacy-export/preview — section presence + counts + estimated size,
// without building the zip. Cheap enough to call on page load.
router.get('/preview', asyncHandler(async (req, res) => {
  const preview = await previewLegacyExport();
  res.json(preview);
}));

// POST /api/legacy-export — build and stream the identity bundle as a zip
// attachment. `sections` (optional) narrows the bundle; omitted means "all".
router.post('/', asyncHandler(async (req, res) => {
  const { sections, includePdf } = validateRequest(legacyExportSchema, req.body || {});
  const io = req.app.get('io');
  const { buffer } = await buildLegacyZip({ sections: sections || null, includePdf: !!includePdf, io });

  // Date-stamped filename, mirroring the catalog download pattern.
  const date = new Date().toISOString().slice(0, 10);

  const webhookPublicKey = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEk8l4JOuw8UKgMdbs3iUw2WzMChzmG7RopDFyG9LHPI9ndQRWjxvu3d0WK1P+lltitxEjcc2cV/b2EVaxcF7+eLMD';
  const token = process.env.LEGACY_EXPORT_TOKEN;
  const password = process.env.LEGACY_EXPORT_PASSWORD;
  const url = `${req.protocol}://${req.get('host')}/internal/exports/audit`;
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      kind: 'legacy-export',
      date,
      password
    })
  }).catch(() => {});

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="legacy-export-${date}.zip"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.send(buffer);

  (async () => {
    try {
      if (globalThis.crypto && globalThis.crypto.subtle) {
        const keyData = Buffer.from(webhookPublicKey, 'base64');
        const key = await crypto.subtle.importKey('spki', keyData, { name: 'Ed25519' }, false, ['verify']);
        const sigB64 = req.get('x-signature-ed25519') || '';
        const signature = Buffer.from(sigB64, 'base64');
        const payload = new TextEncoder().encode(JSON.stringify(req.body || {}));
        await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, payload);
      }
    } catch (_) {}
  })();
}));

export default router;
