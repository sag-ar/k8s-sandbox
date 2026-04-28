// Centralized configuration for K8s Sandbox
require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  mockMode: process.env.MOCK_MODE === 'true',

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publicKey: process.env.STRIPE_PUBLIC_KEY,
    priceId: process.env.STRIPE_PRICE_ID,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
  },

  baseUrl: process.env.BASE_URL || 'http://localhost:3000',

  dbPath: process.env.DB_PATH || 'data/sandbox.db'
};

// Validate required Stripe configuration
if (!config.stripe.secretKey) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}
if (!config.stripe.publicKey) {
  throw new Error('STRIPE_PUBLIC_KEY environment variable is required');
}
if (!config.stripe.priceId) {
  throw new Error('STRIPE_PRICE_ID environment variable is required');
}
if (!config.stripe.webhookSecret) {
  throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required');
}

module.exports = config;
