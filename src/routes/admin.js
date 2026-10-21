const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../services/db');
const config = require('../config');

// Authentication middleware for admin routes
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized. Admin authorization token required.'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded && decoded.role === 'admin') {
      req.admin = decoded;
      return next();
    }
    return res.status(403).json({ status: 'error', message: 'Forbidden. Admin privileges required.' });
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired token.' });
  }
}

/**
 * POST /api/admin/login
 * Admin authentication
 */
router.post('/login', (req, res) => {
  const { password } = req.body;

  if (!password || password !== config.adminSecret) {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid administrative password.'
    });
  }

  const token = jwt.sign(
    { role: 'admin', user: 'slumart-admin' },
    config.jwtSecret,
    { expiresIn: '24h' }
  );

  return res.json({
    status: 'success',
    message: 'Authenticated successfully',
    data: {
      token,
      expiresIn: '24h'
    }
  });
});

/**
 * GET /api/admin/metrics
 * Overview analytics
 */
router.get('/metrics', requireAdminAuth, async (req, res) => {
  try {
    const metrics = await db.getMetrics();
    return res.json({
      status: 'success',
      data: metrics
    });
  } catch (err) {
    console.error('Error fetching admin metrics:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch metrics', error: err.message });
  }
});

/**
 * GET /api/admin/registrations
 * List and filter registrations
 */
router.get('/registrations', requireAdminAuth, async (req, res) => {
  try {
    const { search, format, fulfilment, payment_status, page = 1, limit = 50 } = req.query;
    const result = await db.getAllRegistrations({ search, format, fulfilment, payment_status, page, limit });
    return res.json({
      status: 'success',
      ...result
    });
  } catch (err) {
    console.error('Error listing registrations:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch registrations', error: err.message });
  }
});

/**
 * GET /api/admin/export
 * Export registrations as CSV
 */
router.get('/export', requireAdminAuth, async (req, res) => {
  try {
    const result = await db.getAllRegistrations({ limit: 5000 });
    const registrations = result.data;

    // Build CSV header
    const headers = [
      'Registration Reference',
      'Full Name',
      'Phone Number',
      'Date of Birth',
      'Comic Format',
      'Fulfilment Method',
      'Delivery Address',
      'Delivery Instructions',
      'Payment Status',
      'Contribution Amount (NGN)',
      'Payment Reference',
      'Payment Gateway',
      'Verified At',
      'Fulfilment Status',
      'Tracking Reference',
      'Registered At'
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const clean = String(str).replace(/"/g, '""');
      return `"${clean}"`;
    };

    const rows = registrations.map(r => [
      escapeCsv(r.registration_reference),
      escapeCsv(r.full_name),
      escapeCsv(r.phone_number),
      escapeCsv(r.date_of_birth),
      escapeCsv(r.comic_format),
      escapeCsv(r.physical_fulfilment),
      escapeCsv(r.delivery_address),
      escapeCsv(r.delivery_instructions),
      escapeCsv(r.payment_status),
      escapeCsv(r.amount),
      escapeCsv(r.payment_reference),
      escapeCsv(r.gateway),
      escapeCsv(r.verified_at),
      escapeCsv(r.fulfilment_status),
      escapeCsv(r.tracking_reference),
      escapeCsv(r.created_at)
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="slumart-comic-registrations-${Date.now()}.csv"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('Export error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to export CSV', error: err.message });
  }
});

/**
 * PATCH /api/admin/registration/:id/fulfilment
 * Update fulfilment status and tracking
 */
router.patch('/registration/:id/fulfilment', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { fulfilment_status, tracking_reference } = req.body;

    if (!fulfilment_status) {
      return res.status(400).json({ status: 'error', message: 'fulfilment_status is required' });
    }

    const updated = await db.updateFulfilmentStatus(id, fulfilment_status, tracking_reference);
    return res.json({
      status: 'success',
      message: 'Fulfilment status updated',
      data: updated
    });
  } catch (err) {
    console.error('Fulfilment update error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to update fulfilment', error: err.message });
  }
});

/**
 * POST /api/admin/config
 * Update campaign settings
 */
router.post('/config', requireAdminAuth, async (req, res) => {
  try {
    const newSettings = req.body;
    const updated = await db.updateSettings(newSettings);
    return res.json({
      status: 'success',
      message: 'Campaign configuration updated',
      data: updated
    });
  } catch (err) {
    console.error('Config update error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to update configuration', error: err.message });
  }
});

module.exports = router;
