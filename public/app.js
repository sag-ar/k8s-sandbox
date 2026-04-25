(function() {
  const term = new Terminal({
    cols: 80,
    rows: 24,
    cursorBlink: true,
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4'
    }
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);

  const terminalContainer = document.getElementById('terminal');
  term.open(terminalContainer);
  fitAddon.fit();

  window.addEventListener('resize', () => fitAddon.fit());

  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const timerEl = document.getElementById('timer');
  const statusEl = document.getElementById('session-status');
  const userTypeEl = document.getElementById('user-type');
  const upgradeLink = document.getElementById('upgrade-link');

  let sessionId = null;
  let namespace = null;
  let ws = null;
  let timerInterval = null;
  let deviceId = localStorage.getItem('deviceId');

  if (!deviceId) {
    deviceId = 'dev-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('deviceId', deviceId);
  }

  function updateStatus(text, className) {
    statusEl.textContent = text;
    statusEl.className = className || '';
  }

  function startTimer(expiresAt) {
    clearInterval(timerInterval);
    const expiry = new Date(expiresAt).getTime();

    timerInterval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, expiry - now);
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      if (remaining <= 0) {
        clearInterval(timerInterval);
        term.write('\r\n\x1b[31mSession expired.\x1b[0m\r\n');
        stopSession();
      }
    }, 1000);
  }

  function connectTerminal() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}?sessionId=${sessionId}&namespace=${namespace}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      updateStatus('Connected', 'connected');
      startBtn.style.display = 'none';
      stopBtn.style.display = 'inline';
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output') {
          term.write(msg.data);
        }
      } catch (e) {
        term.write(event.data);
      }
    };

    ws.onclose = () => {
      updateStatus('Disconnected', 'disconnected');
      startBtn.style.display = 'inline';
      stopBtn.style.display = 'none';
      clearInterval(timerInterval);
      timerEl.textContent = '--:--';
    };

    term.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    term.onResize((size) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }));
      }
    });
  }

  function startSession() {
    updateStatus('Checking...', '');

    fetch(`/api/session/check/${deviceId}`)
      .then(res => res.json())
      .then(data => {
        if (!data.allowed) {
          term.write(`\x1b[31m${data.reason}\x1b[0m\r\n`);
          updateStatus('Limit reached', 'error');
          return;
        }

        updateStatus('Starting...', '');
        term.write('Starting Kubernetes session...\r\n');

        return fetch('/api/session/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId })
        })
        .then(res => res.json())
        .then(session => {
          sessionId = session.sessionId;
          namespace = session.namespace;
          term.write(`Session started. Namespace: ${namespace}\r\n`);
          term.write('Type kubectl commands below:\r\n\r\n');
          connectTerminal();
          startTimer(session.expiresAt);
        });
      })
      .catch(err => {
        term.write(`\x1b[31mError: ${err.message}\x1b[0m\r\n`);
        updateStatus('Error', 'error');
      });
  }

  function stopSession() {
    if (sessionId) {
      fetch(`/api/session/${sessionId}`, { method: 'DELETE' })
        .then(() => {
          sessionId = null;
          namespace = null;
          if (ws) ws.close();
        });
    }
  }

  fetch(`/api/session/check/${deviceId}`)
    .then(res => res.json())
    .then(data => {
      if (data.isPro) {
        userTypeEl.textContent = 'Pro User';
        upgradeLink.style.display = 'none';
      }
    });

  startBtn.addEventListener('click', startSession);
  stopBtn.addEventListener('click', stopSession);

  term.write('Welcome to K8s Sandbox!\r\n');
  term.write('Click "Start Session" to begin.\r\n');
})();
