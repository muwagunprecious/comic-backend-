const app = require('../src/app');
const config = require('../src/config');
const db = require('../src/services/db');

// Initialize database connection
db.init().catch(err => {
  console.warn('Database initialization notice:', err.message);
});

// If running directly as local Node process
if (require.main === module) {
  const PORT = config.port || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Slum Art Comic Backend running at http://localhost:${PORT}`);
    console.log(`👉 API Health: http://localhost:${PORT}/api/health`);
    console.log(`👉 Config: http://localhost:${PORT}/api/config`);
  });
}

// Export for Vercel Serverless Function handler
module.exports = app;
