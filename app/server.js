'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const store = require('./store');

// Initialize the JSON data store (seeds admin user + sample domains on first run).
store.init();

const app = express();
const PORT = process.env.PORT || 80;

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dmz-domain-manager-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8 // 8 hours
    }
  })
);

// ---- Auth middleware for protected API routes ----
function requireAuth(req, res, next) {
  if (req.session && req.session.username) return next();
  return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });
}

// ---- Auth routes ----

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (store.verifyUser(username, password)) {
    req.session.username = username;
    store.addLog(username, 'auth.login', '로그인');
    return res.status(200).json({ ok: true, username });
  }
  return res.status(401).json({ ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
});

app.post('/api/logout', (req, res) => {
  if (req.session) {
    if (req.session.username) {
      store.addLog(req.session.username, 'auth.logout', '로그아웃');
    }
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.status(200).json({ ok: true });
    });
  } else {
    res.status(200).json({ ok: true });
  }
});

app.get('/api/session', (req, res) => {
  if (req.session && req.session.username) {
    return res.status(200).json({ authenticated: true, username: req.session.username });
  }
  return res.status(200).json({ authenticated: false });
});

app.post('/api/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const result = store.changePassword(req.session.username, currentPassword, newPassword);
  if (result.ok) return res.status(200).json({ ok: true });
  return res.status(400).json({ ok: false, error: result.error });
});

// ---- Domain routes (all auth-protected) ----

app.get('/api/domains', requireAuth, (req, res) => {
  res.status(200).json(store.listDomains());
});

app.post('/api/domains', requireAuth, (req, res) => {
  const result = store.createDomain(req.body, req.session.username);
  if (result.ok) return res.status(201).json(result.domain);
  return res.status(400).json({ ok: false, error: result.error });
});

app.post('/api/domains/bulk', requireAuth, (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.domains) || body.domains.length === 0) {
    return res.status(400).json({ ok: false, error: 'domains 배열을 입력하세요.' });
  }
  const result = store.createDomainsBulk(body.domains, req.session.username);
  return res.status(200).json(result);
});

app.put('/api/domains/:id', requireAuth, (req, res) => {
  const result = store.updateDomain(req.params.id, req.body, req.session.username);
  if (result.notFound) {
    return res.status(404).json({ ok: false, error: '도메인을 찾을 수 없습니다.' });
  }
  if (result.ok) return res.status(200).json(result.domain);
  return res.status(400).json({ ok: false, error: result.error });
});

app.delete('/api/domains/:id', requireAuth, (req, res) => {
  const result = store.deleteDomain(req.params.id, req.session.username);
  if (result.notFound) {
    return res.status(404).json({ ok: false, error: '도메인을 찾을 수 없습니다.' });
  }
  return res.status(200).json({ ok: true });
});

// ---- Audit log route (auth-protected) ----

app.get('/api/logs', requireAuth, (req, res) => {
  let limit = parseInt(req.query.limit, 10);
  if (!Number.isFinite(limit)) limit = 100;
  if (limit < 1) limit = 1;
  if (limit > 500) limit = 500;
  res.status(200).json(store.listLogs(limit));
});

// ---- Static frontend (owned by the frontend team) ----
app.use('/', express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`DMZ domain manager listening on port ${PORT}`);
  console.log(`Data file: ${store.DATA_FILE}`);
});
