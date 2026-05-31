/**
 * API key authentication middleware.
 *
 * Set API_KEYS env var to a comma-separated list of valid keys:
 *   API_KEYS=key-alice-abc123,key-bob-xyz456
 *
 * Clients send the key via:
 *   Header:  x-api-key: key-alice-abc123
 *   OR query: ?apiKey=key-alice-abc123
 *
 * If API_KEYS is not set, auth is disabled (dev mode).
 */

const VALID_KEYS = process.env.API_KEYS
  ? new Set(process.env.API_KEYS.split(',').map(k => k.trim()))
  : null;

export function authMiddleware(req, res, next) {
  // Auth disabled — open access
  if (!VALID_KEYS || VALID_KEYS.size === 0) return next();

  const key = req.headers['x-api-key'] || req.query.apiKey;

  if (!key || !VALID_KEYS.has(key)) {
    return res.status(401).json({
      error: 'Unauthorized. Provide a valid API key via the x-api-key header.',
    });
  }

  // Attach key identity to request for logging
  req.apiKey = key.slice(0, 8) + '...';
  next();
}
