const express = require('express');
const Holding = require('../models/Holding');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// In-memory holdings storage for demo mode
const inMemoryHoldings = {};

// Helper to check if MongoDB is available
const isMongoDBAvailable = () => {
  try {
    return require('mongoose').connection.readyState === 1;
  } catch {
    return false;
  }
};

// Apply auth middleware to all routes
router.use(authMiddleware);

// GET all holdings for current user
router.get('/', async (req, res) => {
  try {
    const userId = req.userId;

    // Try MongoDB first
    const mongoAvailable = isMongoDBAvailable();
    if (mongoAvailable) {
      try {
        const holdings = await Holding.find({ userId }).sort({ createdAt: -1 });
        return res.json({ 
          success: true,
          holdings,
          timestamp: new Date(),
          dataSource: 'MongoDB'
        });
      } catch (mongoError) {
        console.error('MongoDB fetch failed:', mongoError.message);
      }
    }

    // Use in-memory storage
    const userHoldings = inMemoryHoldings[userId] || [];
    res.json({ 
      success: true,
      holdings: userHoldings,
      timestamp: new Date(),
      dataSource: 'Demo (In-Memory)'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET open holdings for current user
router.get('/open', async (req, res) => {
  try {
    const userId = req.userId;

    // Try MongoDB first
    const mongoAvailable = isMongoDBAvailable();
    if (mongoAvailable) {
      try {
        const holdings = await Holding.find({ 
          userId,
          status: 'OPEN'
        }).sort({ entryDate: -1 });

        return res.json({ 
          success: true,
          holdings,
          timestamp: new Date(),
          dataSource: 'MongoDB'
        });
      } catch (mongoError) {
        console.error('MongoDB fetch failed:', mongoError.message);
      }
    }

    // Use in-memory storage
    const userHoldings = inMemoryHoldings[userId] || [];
    const openHoldings = userHoldings.filter(h => h.status === 'OPEN');
    
    res.json({ 
      success: true,
      holdings: openHoldings,
      timestamp: new Date(),
      dataSource: 'Demo (In-Memory)'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Add new holding
router.post('/', async (req, res) => {
  try {
    const userId = req.userId;
    const {
      symbol,
      quantity,
      entryPrice,
      currentPrice,
      positionType,
      notes
    } = req.body;

    // Validation
    if (!symbol || !quantity || !entryPrice || !currentPrice) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    const holding = {
      _id: Date.now().toString(),
      userId,
      symbol,
      quantity: Math.floor(quantity),
      entryPrice,
      currentPrice,
      positionType: positionType || 'LONG',
      entryDate: new Date(),
      notes,
      status: 'OPEN',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Try MongoDB first
    const mongoAvailable = isMongoDBAvailable();
    if (mongoAvailable) {
      try {
        const newHolding = new Holding(holding);
        await newHolding.save();

        // Update user portfolio in MongoDB
        const user = await User.findById(userId);
        if (user) {
          user.portfolio.totalInvested += (quantity * entryPrice);
          user.portfolio.currentBalance -= (quantity * entryPrice);
          await user.save();
        }

        return res.status(201).json({ 
          success: true, 
          holding: newHolding,
          dataSource: 'MongoDB'
        });
      } catch (mongoError) {
        console.error('MongoDB save failed:', mongoError.message);
      }
    }

    // Use in-memory storage
    if (!inMemoryHoldings[userId]) {
      inMemoryHoldings[userId] = [];
    }

    inMemoryHoldings[userId].push(holding);

    res.status(201).json({ 
      success: true, 
      holding,
      dataSource: 'Demo (In-Memory)'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT - Update holding (for closing positions or updating price)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const updateData = req.body;

    // Try MongoDB first
    const mongoAvailable = isMongoDBAvailable();
    if (mongoAvailable) {
      try {
        const holding = await Holding.findOne({ _id: id, userId });

        if (!holding) {
          return res.status(404).json({ error: 'Holding not found' });
        }

        // Calculate P&L if closing position
        if (updateData.exitPrice && !holding.exitPrice) {
          const positionValue = updateData.exitPrice * holding.quantity;
          const originalValue = holding.entryPrice * holding.quantity;

          if (holding.positionType === 'LONG') {
            holding.profitLoss = positionValue - originalValue;
          } else {
            holding.profitLoss = originalValue - positionValue;
          }

          holding.profitLossPercentage = (holding.profitLoss / originalValue) * 100;
          holding.status = 'CLOSED';
          holding.exitPrice = updateData.exitPrice;
          holding.exitdate = new Date();

          // Update user portfolio
          const user = await User.findById(userId);
          if (user) {
            user.portfolio.currentBalance += positionValue;
            user.portfolio.totalReturns += holding.profitLoss;
            await user.save();
          }
        }

        Object.assign(holding, updateData);
        holding.updatedAt = new Date();

        await holding.save();

        return res.json({ 
          success: true, 
          holding,
          dataSource: 'MongoDB'
        });
      } catch (mongoError) {
        console.error('MongoDB update failed:', mongoError.message);
      }
    }

    // Use in-memory storage
    const userHoldings = inMemoryHoldings[userId] || [];
    const holdingIndex = userHoldings.findIndex(h => h._id === id);

    if (holdingIndex === -1) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    const holding = userHoldings[holdingIndex];

    // Calculate P&L if closing position
    if (updateData.exitPrice && !holding.exitPrice) {
      const positionValue = updateData.exitPrice * holding.quantity;
      const originalValue = holding.entryPrice * holding.quantity;

      if (holding.positionType === 'LONG') {
        holding.profitLoss = positionValue - originalValue;
      } else {
        holding.profitLoss = originalValue - positionValue;
      }

      holding.profitLossPercentage = (holding.profitLoss / originalValue) * 100;
      holding.status = 'CLOSED';
      holding.exitPrice = updateData.exitPrice;
      holding.exitdate = new Date();
    }

    Object.assign(holding, updateData);
    holding.updatedAt = new Date();

    res.json({ 
      success: true, 
      holding,
      dataSource: 'Demo (In-Memory)'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE - Remove holding
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Try MongoDB first
    const mongoAvailable = isMongoDBAvailable();
    if (mongoAvailable) {
      try {
        const holding = await Holding.findOneAndDelete({
          _id: id,
          userId
        });

        if (!holding) {
          return res.status(404).json({ error: 'Holding not found' });
        }

        return res.json({ 
          success: true, 
          message: 'Holding deleted',
          dataSource: 'MongoDB'
        });
      } catch (mongoError) {
        console.error('MongoDB delete failed:', mongoError.message);
      }
    }

    // Use in-memory storage
    const userHoldings = inMemoryHoldings[userId] || [];
    const holdingIndex = userHoldings.findIndex(h => h._id === id);

    if (holdingIndex === -1) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    userHoldings.splice(holdingIndex, 1);

    res.json({ 
      success: true, 
      message: 'Holding deleted',
      dataSource: 'Demo (In-Memory)'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
