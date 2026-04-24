const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    // Get token from header
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No authentication token, access denied' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
    req.userId = decoded.userId;
    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token is not valid' });
  }
};

module.exports = authMiddleware;
