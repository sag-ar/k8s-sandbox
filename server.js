const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const pty = require('node-pty');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const config = require('./config');
const k8sManager = require('./k8s-manager');
const commandFilter = require('./command-filter');
const { startCleanupJob } = require('./cleanup');
const mockKubectl = require('./mock-kubectl');
const payment = require('./payment');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = config.port;
const MOCK_MODE = config.mockMode;

// Stripe webhook needs raw body for signature verification - must be before express.json()
app.use('/api/webhook', express.raw({type: 'application/json'}));

app.use(express.json());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

// Stricter rate limit for session creation
const sessionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Session creation limit reached, please try again later.' }
});
app.use('/api/session/start', sessionLimiter);

// Serve config with Stripe public key
app.get('/api/config', (req, res) => {
  res.json({ stripePublicKey: config.stripe.publicKey });
});

// Device ID validation middleware
function validateDeviceId(req, res, next) {
  const deviceId = req.params.deviceId || (req.body && req.body.deviceId);
  if (!deviceId || !/^dev-\d+-[a-z0-9]{9}$/.test(deviceId)) {
    return res.status(400).json({ error: 'Invalid device ID' });
  }
  next();
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get('/terminal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// Apply deviceId validation to relevant routes
app.get('/api/session/check/:deviceId', validateDeviceId, async (req, res) => {
  try {
    const { deviceId } = req.params;

    // In mock mode, auto-set Pro status for easy testing
    if (MOCK_MODE) {
      await db.createOrUpdateDevice(deviceId);
      await db.setProStatus(deviceId, true);
    }

    const result = await db.canStartSession(deviceId);
    const device = await db.getDevice(deviceId);
    res.json({
      ...result,
      isPro: device ? device.is_pro === 1 : false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/session/start', validateDeviceId, async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID required' });
    }

    // In mock mode, auto-set Pro status for easy testing
    if (MOCK_MODE) {
      await db.createOrUpdateDevice(deviceId);
      await db.setProStatus(deviceId, true);
    }

    const check = await db.canStartSession(deviceId);
    if (!check.allowed) {
      return res.status(403).json({ error: check.reason });
    }

    const device = await db.getDevice(deviceId);
    const isPro = device && device.is_pro === 1;

    const session = await k8sManager.createSession(isPro);

    await db.createSession(session.sessionId, deviceId, session.namespace, session.expiresAt);
    await db.incrementSessionCount(deviceId);

    res.json({
      sessionId: session.sessionId,
      namespace: session.namespace,
      expiresAt: session.expiresAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await db.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await db.getSession(sessionId);
    if (session) {
      await k8sManager.cleanupNamespace(session.namespace);
      await db.deactivateSession(sessionId);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Payment Routes

// Create Stripe Checkout Session
app.post('/api/create-checkout-session', validateDeviceId, async (req, res) => {
  try {
    const { deviceId, successUrl, cancelUrl } = req.body;
    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID required' });
    }

    const result = await payment.createCheckoutSession(deviceId, successUrl, cancelUrl);
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({ url: result.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stripe Webhook - uses raw body for signature verification
app.post('/api/webhook', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const body = req.body;

  try {
    const result = await payment.handleWebhook(body, signature);
    res.json(result);
  } catch (err) {
    console.error('[Webhook] Error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Get subscription status (combined Pro status check)
app.get('/api/subscription-status/:deviceId', validateDeviceId, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const status = await payment.getSubscriptionStatus(deviceId);

    // Also check DB for is_pro flag
    const device = await db.getDevice(deviceId);
    status.isPro = status.isPro || (device && device.is_pro === 1);

    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel subscription
app.post('/api/cancel-subscription', async (req, res) => {
  try {
    const { subscriptionId } = req.body;
    if (!subscriptionId) {
      return res.status(400).json({ error: 'Subscription ID required' });
    }

    const result = await payment.cancelSubscription(subscriptionId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

wss.on('connection', async (ws, req) => {
  const params = new URL(req.url, 'http://localhost');
  const sessionId = params.searchParams.get('sessionId');
  const namespace = params.searchParams.get('namespace');

  if (!sessionId || !namespace) {
    ws.close(1008, 'Missing sessionId or namespace');
    return;
  }

  let isPro = false;
  let session;
  try {
    session = await db.getSession(sessionId);
    if (session) {
      const device = await db.getDevice(session.device_id);
      isPro = device && device.is_pro === 1;
    }
  } catch (err) {
    console.error('[WebSocket] Error fetching session:', err.message);
  }

  // In mock mode, don't spawn PTY - handle commands directly
  if (MOCK_MODE) {
    console.log(`[MOCK] WebSocket connected for session ${sessionId}`);

    let commandBuffer = '';

    ws.on('message', (msg) => {
      try {
        const message = JSON.parse(msg);
        if (message.type === 'input') {
          const data = message.data;

          // Process each character - echo back and build command buffer
          for (let i = 0; i < data.length; i++) {
            const char = data[i];

            if (char === '\r' || char === '\n') {
              // Enter pressed - execute the command
              ws.send(JSON.stringify({ type: 'output', data: '\r\n' }));

              const input = commandBuffer.trim();
              commandBuffer = '';

              if (input === '') {
                // Empty command, just show prompt
                ws.send(JSON.stringify({ type: 'output', data: '$ ' }));
                continue;
              }

              // Filter commands for free tier
              if (!isPro && input.startsWith('kubectl')) {
                const filterResult = commandFilter.filterCommand(input, isPro);
                if (!filterResult.allowed) {
                  ws.send(JSON.stringify({ type: 'output', data: `\x1b[31m${filterResult.reason}\x1b[0m\r\n$ ` }));
                  continue;
                }
              }

              // Handle kubectl commands with mock
              if (input.startsWith('kubectl')) {
                const output = mockKubectl.handleKubectlCommand(input);
                ws.send(JSON.stringify({ type: 'output', data: output + '$ ' }));
              } else if (input === 'clear') {
                ws.send(JSON.stringify({ type: 'output', data: '\x1b[2J\x1b[H$ ' }));
              } else if (input === 'exit') {
                ws.send(JSON.stringify({ type: 'output', data: 'Session ended.\r\n' }));
                ws.close(1000, 'Session ended by user');
                continue;
              } else {
                ws.send(JSON.stringify({ type: 'output', data: `[Mock Mode] Command not supported: ${input}\r\n$ ` }));
              }
            } else if (char === '\x03') {
              // Ctrl+C - cancel current command
              commandBuffer = '';
              ws.send(JSON.stringify({ type: 'output', data: '^C\r\n$ ' }));
            } else if (char === '\x7f' || char === '\b') {
              // Backspace
              if (commandBuffer.length > 0) {
                commandBuffer = commandBuffer.slice(0, -1);
                ws.send(JSON.stringify({ type: 'output', data: '\b \b' }));
              }
            } else if (char >= ' ' || char === '\t') {
              // Printable character or tab
              commandBuffer += char;
              ws.send(JSON.stringify({ type: 'output', data: char }));
            }
          }
        } else if (message.type === 'resize') {
          // Ignore resize in mock mode
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    // Send initial prompt
    ws.send(JSON.stringify({ type: 'output', data: 'K8s Sandbox [Mock Mode]\r\n$ ' }));

    ws.on('close', () => {
      console.log(`[MOCK] WebSocket disconnected for session ${sessionId}`);
    });

    ws.on('error', (err) => {
      console.error(`[MOCK] WebSocket error for session ${sessionId}:`, err.message);
    });

    return;
  }

  // Real mode: spawn PTY
  const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
  const env = {
    ...process.env,
    KUBECONFIG: path.join(os.tmpdir(), `kubeconfig-${sessionId}`),
    NAMESPACE: namespace
  };

  let ptyProcess;
  try {
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: env
    });
  } catch (err) {
    console.error('[PTY] Failed to spawn shell:', err.message);
    ws.close(1011, 'Failed to start terminal');
    return;
  }

  ptyProcess.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data }));
    }
  });

  ptyProcess.on('error', (err) => {
    console.error('[PTY] Process error:', err.message);
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1011, 'Terminal error');
    }
  });

  ws.on('message', (msg) => {
    try {
      const message = JSON.parse(msg);
      if (message.type === 'input') {
        // Filter commands for free tier
        if (!isPro && message.data.trim().startsWith('kubectl')) {
          const filterResult = commandFilter.filterCommand(message.data, isPro);
          if (!filterResult.allowed) {
            ptyProcess.write(`\x1b[31m${filterResult.reason}\x1b[0m\r\n`);
            return;
          }
        }
        ptyProcess.write(message.data);
      } else if (message.type === 'resize') {
        ptyProcess.resize(message.cols, message.rows);
      }
    } catch (e) {
      ptyProcess.write(msg);
    }
  });

  ws.on('close', () => {
    if (ptyProcess) {
      ptyProcess.kill();
    }
  });

  ws.on('error', (err) => {
    console.error(`[WebSocket] Error for session ${sessionId}:`, err.message);
    if (ptyProcess) {
      ptyProcess.kill();
    }
  });

  if (session && session.namespace === namespace) {
    const expiresAt = new Date(session.expiresAt);
    const now = new Date();
    const timeout = expiresAt - now;

    if (timeout > 0) {
      setTimeout(() => {
        if (ptyProcess) ptyProcess.kill();
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, 'Session expired');
        }
      }, timeout);
    }
  }
});

db.init().then(() => {
  // Start cleanup job (runs every 5 minutes)
  startCleanupJob(5);

  server.listen(PORT, () => {
    console.log(`K8s Sandbox server running on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  db.close().then(() => {
    process.exit(0);
  });
});
