const express = require('express');
const router = express.Router();
const db = require('../services/db');

// GET /api/config - Public configuration
router.get('/', async (req, res) => {
  try {
    const settings = await db.getSettings();
    res.json({
      status: 'success',
      data: settings
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve configuration',
      error: err.message
    });
  }
});

module.exports = router;
