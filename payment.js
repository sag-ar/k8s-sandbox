// Stripe Payment Integration for K8s Sandbox
// Handles $9/month Pro subscription

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_YOUR_TEST_KEY_HERE');

const PRICE_ID = process.env.STRIPE_PRICE_ID || 'price_YOUR_PRICE_ID_HERE';

// Create a Stripe Checkout Session
async function createCheckoutSession(deviceId, successUrl, cancelUrl) {
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: successUrl || `${process.env.BASE_URL || 'http://localhost:3000'}/pricing.html?success=true`,
      cancel_url: cancelUrl || `${process.env.BASE_URL || 'http://localhost:3000'}/pricing.html?canceled=true`,
      client_reference_id: deviceId,
      metadata: {
        deviceId: deviceId
      }
    });

    return {
      success: true,
      sessionId: session.id,
      url: session.url
    };
  } catch (err) {
    console.error('[Payment] Checkout session creation failed:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

// Handle Stripe Webhook
async function handleWebhook(body, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_YOUR_WEBHOOK_SECRET_HERE';

  try {
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    console.log(`[Webhook] Received event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const deviceId = session.client_reference_id || session.metadata.deviceId;
        console.log(`[Webhook] Checkout completed for device: ${deviceId}`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        console.log(`[Webhook] Payment succeeded for subscription: ${subscriptionId}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        console.log(`[Webhook] Subscription cancelled for customer: ${customerId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log(`[Webhook] Payment failed for subscription: ${invoice.subscription}`);
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    return { received: true };
  } catch (err) {
    console.error('[Webhook] Error:', err.message);
    throw err;
  }
}

// Get subscription status for a device
async function getSubscriptionStatus(deviceId) {
  try {
    const customers = await stripe.customers.list({
      email: `${deviceId}@k8s-sandbox.local`,
      limit: 1
    });

    if (customers.data.length === 0) {
      return { isPro: false, status: 'none' };
    }

    const customer = customers.data[0];
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1
    });

    if (subscriptions.data.length === 0) {
      return { isPro: false, status: 'inactive' };
    }

    return {
      isPro: true,
      status: subscriptions.data[0].status,
      subscriptionId: subscriptions.data[0].id,
      currentPeriodEnd: subscriptions.data[0].current_period_end
    };
  } catch (err) {
    console.error('[Payment] Error checking subscription:', err.message);
    return { isPro: false, status: 'error' };
  }
}

// Cancel subscription
async function cancelSubscription(subscriptionId) {
  try {
    const deleted = await stripe.subscriptions.del(subscriptionId);
    return { success: true, status: deleted.status };
  } catch (err) {
    console.error('[Payment] Cancel failed:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  createCheckoutSession,
  handleWebhook,
  getSubscriptionStatus,
  cancelSubscription,
  stripe
};
