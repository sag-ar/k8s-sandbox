// Stripe Payment Integration for K8s Sandbox
// Handles $9/month Pro subscription

const config = require('./config');
const stripe = require('stripe')(config.stripe.secretKey);
const db = require('./db');

// Create a Stripe Checkout Session
async function createCheckoutSession(deviceId, successUrl, cancelUrl) {
  try {
    // Find or create a Stripe customer with deviceId in metadata
    const customers = await stripe.customers.list({
      email: `${deviceId}@k8s-sandbox.local`,
      limit: 1
    });

    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      await stripe.customers.update(customerId, {
        metadata: { deviceId: deviceId }
      });
    } else {
      const customer = await stripe.customers.create({
        email: `${deviceId}@k8s-sandbox.local`,
        metadata: { deviceId: deviceId }
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [
        {
          price: config.stripe.priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl || `${config.baseUrl}/pricing.html?success=true`,
      cancel_url: cancelUrl || `${config.baseUrl}/pricing.html?canceled=true`,
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
  try {
    const event = stripe.webhooks.constructEvent(body, signature, config.stripe.webhookSecret);

    console.log(`[Webhook] Received event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const deviceId = session.client_reference_id || session.metadata.deviceId;
        console.log(`[Webhook] Checkout completed for device: ${deviceId}`);
        if (deviceId) {
          await db.setProStatus(deviceId, true);
          console.log(`[Webhook] Set device ${deviceId} to Pro`);
        }
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
        try {
          const customer = await stripe.customers.retrieve(customerId);
          const deviceId = customer.metadata && customer.metadata.deviceId;
          if (deviceId) {
            await db.setProStatus(deviceId, false);
            console.log(`[Webhook] Removed Pro status for device: ${deviceId}`);
          } else {
            console.error('[Webhook] No deviceId in customer metadata for customer:', customerId);
          }
        } catch (err) {
          console.error('[Webhook] Error finding device for customer:', err.message);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log(`[Webhook] Payment failed for subscription: ${invoice.subscription}`);
        // Optionally notify user or mark payment as past_due
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
