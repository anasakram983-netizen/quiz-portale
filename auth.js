const jwt = require('jsonwebtoken');
const sanitizeHtml = require('sanitize-html');
const { queryOne } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'your_custom_jwt_secret_key_2026!';

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, msg: 'Authentication token missing or invalid format.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = queryOne('SELECT id, name, email, role FROM users WHERE id = ?', [decoded.id]);
    if (!user) {
      return res.status(401).json({ ok: false, msg: 'User account no longer exists.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ ok: false, msg: 'Invalid or expired session token.' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ ok: false, msg: `Access denied. Requires ${role} role permissions.` });
    }
    next();
  };
}

function sanitizeInputs(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  next();
}

function sanitizeObject(obj) {
  for (let key in obj) {
    if (typeof obj[key] === 'string') {
      // Retain formatted code snippets / text while sanitizing scripts
      obj[key] = sanitizeHtml(obj[key], {
        allowedTags: ['b', 'i', 'em', 'strong', 'code', 'pre', 'p', 'br', 'span', 'img'],
        allowedAttributes: {
          'img': ['src', 'alt', 'width', 'height'],
          'code': ['class'],
          'span': ['class', 'style']
        }
      }).trim();
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  }
}

module.exports = {
  verifyToken,
  requireRole,
  sanitizeInputs,
  JWT_SECRET
};
