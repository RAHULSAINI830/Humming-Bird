const router = require('../src/server.js');

module.exports = (req, res) => {
  return router(req, res);
};

// Requests that fan out to multiple AI providers (business analysis,
// prompt research, visibility checks) can legitimately take longer than
// Vercel's default serverless timeout. Raise the ceiling so those requests
// have room to finish instead of being killed mid-flight.
module.exports.config = {
  maxDuration: 60
};
