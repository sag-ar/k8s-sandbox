const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'sandbox.db');
const db = new sqlite3.Database(dbPath);

function init() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        last_session_date TEXT,
        session_count_today INTEGER DEFAULT 0,
        is_pro INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        device_id TEXT,
        namespace TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (device_id) REFERENCES devices(device_id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        device_id TEXT PRIMARY KEY,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        status TEXT,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(device_id)
      )`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

function getDevice(deviceId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM devices WHERE device_id = ?', [deviceId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function createOrUpdateDevice(deviceId) {
  return new Promise((resolve, reject) => {
    const today = new Date().toISOString().split('T')[0];
    db.get('SELECT * FROM devices WHERE device_id = ?', [deviceId], (err, row) => {
      if (err) return reject(err);
      if (!row) {
        db.run('INSERT INTO devices (device_id, last_session_date, session_count_today) VALUES (?, ?, 0)',
          [deviceId, today], (err) => {
            if (err) reject(err);
            else resolve({ device_id: deviceId, session_count_today: 0, is_pro: 0 });
          });
      } else {
        if (row.last_session_date !== today) {
          db.run('UPDATE devices SET last_session_date = ?, session_count_today = 0 WHERE device_id = ?',
            [today, deviceId], (err) => {
              if (err) reject(err);
              else resolve({ ...row, session_count_today: 0, last_session_date: today });
            });
        } else {
          resolve(row);
        }
      }
    });
  });
}

function canStartSession(deviceId) {
  return new Promise(async (resolve, reject) => {
    try {
      const device = await createOrUpdateDevice(deviceId);
      if (device.is_pro) {
        resolve({ allowed: true, reason: null });
      } else if (device.session_count_today >= 1) {
        resolve({ allowed: false, reason: 'Daily session limit reached. Upgrade to Pro for unlimited sessions.' });
      } else {
        resolve({ allowed: true, reason: null });
      }
    } catch (err) {
      reject(err);
    }
  });
}

function incrementSessionCount(deviceId) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE devices SET session_count_today = session_count_today + 1 WHERE device_id = ?',
      [deviceId], (err) => {
        if (err) reject(err);
        else resolve();
      });
  });
}

function createSession(sessionId, deviceId, namespace, expiresAt) {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO sessions (session_id, device_id, namespace, expires_at) VALUES (?, ?, ?, ?)',
      [sessionId, deviceId, namespace, expiresAt], (err) => {
        if (err) reject(err);
        else resolve();
      });
  });
}

function getSession(sessionId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM sessions WHERE session_id = ?', [sessionId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function deactivateSession(sessionId) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE sessions SET is_active = 0 WHERE session_id = ?', [sessionId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getExpiredSessions() {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.all('SELECT * FROM sessions WHERE is_active = 1 AND expires_at < ?', [now], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function setProStatus(deviceId, isPro) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE devices SET is_pro = ? WHERE device_id = ?', [isPro ? 1 : 0, deviceId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = {
  init,
  getDevice,
  createOrUpdateDevice,
  canStartSession,
  incrementSessionCount,
  createSession,
  getSession,
  deactivateSession,
  getExpiredSessions,
  setProStatus,
  close
};
