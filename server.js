require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const pty = require('node-pty');
const db = require('./db');
const k8sManager = require('./k8s-manager');
const commandFilter = require('./command-filter');
const { startCleanupJob } = require('./cleanup');
const mockKubectl = require('./mock-kubectl');
const MOCK_MODE = process.env.MOCK_MODE === 'true';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get('/terminal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/session/check/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
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

app.post('/api/session/start', async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID required' });
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

wss.on('connection', (ws, req) => {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const sessionId = params.get('sessionId');
  const namespace = params.get('namespace');

  if (!sessionId || !namespace) {
    ws.close(1008, 'Missing sessionId or namespace');
    return;
  }

  let isPro = false;
  db.getSession(sessionId).then(async (session) => {
    if (session) {
      const device = await db.getDevice(session.device_id);
      isPro = device && device.is_pro === 1;
    }
  });

  // In mock mode, don't spawn PTY - handle commands directly
  if (MOCK_MODE) {
    console.log(`[MOCK] WebSocket connected for session ${sessionId}`);

    ws.on('message', (msg) => {
      try {
        const message = JSON.parse(msg);
        if (message.type === 'input') {
          const input = message.data;

          // Filter commands for free tier
          if (!isPro && input.trim().startsWith('kubectl')) {
            const filterResult = commandFilter.filterCommand(input, false);
            if (!filterResult.allowed) {
              ws.send(JSON.stringify({ type: 'output', data: `\x1b[31m${filterResult.reason}\x1b[0m\r\n` }));
              return;
            }
          }

          // Handle kubectl commands with mock
          if (input.trim().startsWith('kubectl ')) {
            const output = mockKubectl.handleKubectlCommand(input);
            ws.send(JSON.stringify({ type: 'output', data: output }));
          } else if (input.trim() === 'clear') {
            ws.send(JSON.stringify({ type: 'output', data: '\x1b[2J\x1b[H' }));
          } else if (input.trim() !== '') {
            ws.send(JSON.stringify({ type: 'output', data: `[Mock Mode] Command not supported: ${input.trim()}\r\n` }));
          }
        } else if (message.type === 'resize') {
          // Ignore resize in mock mode
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    ws.on('close', () => {
      console.log(`[MOCK] WebSocket disconnected for session ${sessionId}`);
    });

    return; // Don't spawn PTY in mock mode
  }

  // Real mode: spawn PTY
  const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
  const env = {
    ...process.env,
    KUBECONFIG: `/tmp/kubeconfig-${sessionId}`,
    NAMESPACE: namespace
  };

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: env
  });

  ptyProcess.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data }));
    }
  });

  ws.on('message', (msg) => {
    try {
      const message = JSON.parse(msg);
      if (message.type === 'input') {
        // Filter commands for free tier
        if (!isPro && message.data.trim().startsWith('kubectl')) {
          const filterResult = commandFilter.filterCommand(message.data, false);
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
    ptyProcess.kill();
  });

  db.getSession(sessionId).then((session) => {
    if (session && session.namespace === namespace) {
      const expiresAt = new Date(session.expiresAt);
      const now = new Date();
      const timeout = expiresAt - now;

      if (timeout > 0) {
        setTimeout(() => {
          ptyProcess.kill();
          ws.close(1000, 'Session expired');
        }, timeout);
      }
    }
  });
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
