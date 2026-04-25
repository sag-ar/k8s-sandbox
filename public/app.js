(function() {
  function showError(msg) {
    const errDiv = document.getElementById('error-message');
    if (errDiv) {
      errDiv.style.display = 'block';
      errDiv.textContent = msg;
    }
    console.error(msg);
  }

  // Check if xterm is loaded
  if (typeof Terminal === 'undefined') {
    showError('Error: xterm.js failed to load. Check internet connection.');
    return;
  }

  const term = new Terminal({
    cols: 80,
    rows: 24,
    cursorBlink: true,
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4'
    }
  });

  // Check if FitAddon is loaded
  if (typeof FitAddon === 'undefined') {
    showError('Warning: xterm-addon-fit not loaded - terminal may not resize properly');
  } else {
    try {
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      window.addEventListener('resize', () => {
        try { fitAddon.fit(); } catch(e) {}
      });
    } catch(e) {
      console.error('Failed to load FitAddon:', e);
    }
  }

  const terminalContainer = document.getElementById('terminal');
  if (!terminalContainer) {
    console.error('Terminal container not found');
    return;
  }

  term.open(terminalContainer);
  try { term.fit(); } catch(e) {}

  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const timerEl = document.getElementById('timer');
  const statusEl = document.getElementById('session-status');
  const userTypeEl = document.getElementById('user-type');
  const upgradeLink = document.getElementById('upgrade-link');

  if (!startBtn || !stopBtn) {
    showError('Error: Page elements not found. Try refreshing.');
    return;
  }

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
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.className = className || '';
    }
  }

  function startTimer(expiresAt) {
    clearInterval(timerInterval);
    const expiry = new Date(expiresAt).getTime();

    timerInterval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, expiry - now);
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      if (timerEl) {
        timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }

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
      if (startBtn) startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'inline';
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
      if (startBtn) startBtn.style.display = 'inline';
      if (stopBtn) stopBtn.style.display = 'none';
      clearInterval(timerInterval);
      if (timerEl) timerEl.textContent = '--:--';
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
    term.write('Checking session status...\r\n');

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
          if (session.error) {
            term.write(`\x1b[31mError: ${session.error}\x1b[0m\r\n`);
            updateStatus('Error', 'error');
            return;
          }
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
        if (userTypeEl) userTypeEl.textContent = 'Pro User';
        if (upgradeLink) upgradeLink.style.display = 'none';
      }
    })
    .catch(err => console.error('Failed to check pro status:', err));

  startBtn.addEventListener('click', startSession);
  stopBtn.addEventListener('click', stopSession);

  term.write('Welcome to K8s Sandbox!\r\n');
  term.write('Click "Start Session" to begin.\r\n');
})();
