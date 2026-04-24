const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// In-memory user storage for demo/testing (when MongoDB is unavailable)
const DEMO_USERS = {
  'test@example.com': {
    id: '1',
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123', // In production, this would be hashed
    portfolio: {
      initialCapital: 1000000,
      currentBalance: 1000000,
      totalInvested: 0,
      totalReturns: 0
    }
  }
};

let inMemoryUsers = { ...DEMO_USERS };

// Helper to generate JWT
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

// Helper to check if MongoDB is available
const isMongoDBAvailable = () => {
  try {
    return require('mongoose').connection.readyState === 1;
  } catch {
    return false;
  }
};

// SIGNUP - Register new user
router.post('/signup', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check in-memory users first
    if (inMemoryUsers[email] || Object.values(inMemoryUsers).find(u => u.username === username)) {
      return res.status(400).json({ 
        error: inMemoryUsers[email] 
          ? 'Email already registered' 
          : 'Username already taken'
      });
    }

    // Try MongoDB if available
    const mongoAvailable = isMongoDBAvailable();
    if (mongoAvailable) {
      try {
        const existingUser = await User.findOne({
          $or: [{ email }, { username }]
        });

        if (existingUser) {
          return res.status(400).json({ 
            error: existingUser.email === email 
              ? 'Email already registered' 
              : 'Username already taken'
          });
        }

        const user = new User({
          username,
          email,
          password,
          portfolio: {
            initialCapital: 1000000,
            currentBalance: 1000000,
            totalInvested: 0,
            totalReturns: 0
          }
        });

        await user.save();
        const token = generateToken(user._id);

        return res.status(201).json({
          success: true,
          message: 'User registered successfully',
          token,
          user: user.toJSON(),
          dataSource: 'MongoDB'
        });
      } catch (mongoError) {
        console.error('MongoDB signup failed:', mongoError.message);
        // Fall through to in-memory
      }
    }

    // Use in-memory storage for demo
    const userId = Date.now().toString();
    inMemoryUsers[email] = {
      id: userId,
      username,
      email,
      password, // In production, hash this!
      portfolio: {
        initialCapital: 1000000,
        currentBalance: 1000000,
        totalInvested: 0,
        totalReturns: 0
      }
    };

    const token = generateToken(userId);

    res.status(201).json({
      success: true,
      message: 'User registered successfully (Demo Mode)',
      token,
      user: {
        _id: userId,
        username,
        email,
        portfolio: inMemoryUsers[email].portfolio
      },
      dataSource: 'Demo (In-Memory)'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LOGIN - Authenticate user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check in-memory users first
    const inMemoryUser = inMemoryUsers[email];
    if (inMemoryUser) {
      if (inMemoryUser.password === password) { // In production, use bcrypt!
        const token = generateToken(inMemoryUser.id);

        return res.json({
          success: true,
          message: 'Login successful (Demo Mode)',
          token,
          user: {
            _id: inMemoryUser.id,
            username: inMemoryUser.username,
            email: inMemoryUser.email,
            portfolio: inMemoryUser.portfolio
          },
          dataSource: 'Demo (In-Memory)'
        });
      } else {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
    }

    // Try MongoDB if available
    const mongoAvailable = isMongoDBAvailable();
    if (mongoAvailable) {
      try {
        const user = await User.findOne({ email });

        if (!user) {
          return res.status(401).json({ error: 'Invalid email or password' });
        }

        const isPasswordValid = await user.comparePassword(password);

        if (!isPasswordValid) {
          return res.status(401).json({ error: 'Invalid email or password' });
        }

        user.lastLogin = new Date();
        await user.save();

        const token = generateToken(user._id);

        return res.json({
          success: true,
          message: 'Login successful',
          token,
          user: user.toJSON(),
          dataSource: 'MongoDB'
        });
      } catch (mongoError) {
        console.error('MongoDB login failed:', mongoError.message);
        return res.status(401).json({ error: 'Invalid email or password' });
      }
    }

    // User not found
    return res.status(401).json({ error: 'Invalid email or password' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check in-memory users first
    const inMemoryUser = Object.values(inMemoryUsers).find(u => u.id === decoded.userId);
    if (inMemoryUser) {
      return res.json({ 
        success: true, 
        user: {
          _id: inMemoryUser.id,
          username: inMemoryUser.username,
          email: inMemoryUser.email,
          portfolio: inMemoryUser.portfolio
        },
        dataSource: 'Demo (In-Memory)'
      });
    }

    // Try MongoDB if available
    const mongoAvailable = isMongoDBAvailable();
    if (mongoAvailable) {
      try {
        const user = await User.findById(decoded.userId);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }
        return res.json({ 
          success: true, 
          user: user.toJSON(),
          dataSource: 'MongoDB'
        });
      } catch (mongoError) {
        console.error('MongoDB user fetch failed:', mongoError.message);
      }
    }

    res.status(404).json({ error: 'User not found' });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// LOGOUT - Client-side only, but return success for consistency
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// Get authentication status
router.get('/status', (req, res) => {
  const mongoAvailable = isMongoDBAvailable();
  res.json({
    ready: true,
    mongoAvailable,
    mode: mongoAvailable ? 'Production (MongoDB)' : 'Demo (In-Memory)',
    demoUsers: !mongoAvailable ? Object.keys(inMemoryUsers).length : 0,
    demoCredentials: {
      email: 'test@example.com',
      password: 'password123'
    }
  });
});

module.exports = router;

