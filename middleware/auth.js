const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'residency-scheduler-secret-2024-change-in-prod';

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const rawToken = (header && header.startsWith('Bearer ')) ? header.slice(7) : req.query.token;
  if (!rawToken) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(rawToken, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { requireAuth, signToken };
