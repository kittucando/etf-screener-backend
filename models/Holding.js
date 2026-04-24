const mongoose = require('mongoose');

const HoldingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  entryPrice: {
    type: Number,
    required: true
  },
  currentPrice: {
    type: Number,
    required: true
  },
  positionType: {
    type: String,
    enum: ['LONG', 'SHORT'],
    default: 'LONG'
  },
  entryDate: {
    type: Date,
    required: true
  },
  exitPrice: Number,
  exitdate: Date,
  profitLoss: Number,
  profitLossPercentage: Number,
  status: {
    type: String,
    enum: ['OPEN', 'CLOSED'],
    default: 'OPEN'
  },
  charges: {
    mtfCharges: { type: Number, default: 0 },
    transactionFees: { type: Number, default: 0 },
    tax: { type: Number, default: 0 }
  },
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for user queries
HoldingSchema.index({ userId: 1 });
HoldingSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Holding', HoldingSchema);
