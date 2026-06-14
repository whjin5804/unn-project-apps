'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Resolve the data file path. Prefer DATA_FILE (default /data/domains.json).
// If the chosen directory is not writable, fall back to ./data/domains.json
// inside the app directory.
function resolveDataFile() {
  const preferred = process.env.DATA_FILE || '/data/domains.json';
  const fallback = path.join(__dirname, 'data', 'domains.json');

  for (const candidate of [preferred, fallback]) {
    const dir = path.dirname(candidate);
    try {
      fs.mkdirSync(dir, { recursive: true });
      // Probe writability of the directory.
      fs.accessSync(dir, fs.constants.W_OK);
      return candidate;
    } catch (err) {
      // Try the next candidate.
    }
  }
  // Last resort: return fallback even if probing failed; write attempts will surface errors.
  return fallback;
}

const DATA_FILE = resolveDataFile();

function defaultData() {
  return { users: [], domains: [], logs: [] };
}

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultData();
    if (!Array.isArray(parsed.users)) parsed.users = [];
    if (!Array.isArray(parsed.domains)) parsed.domains = [];
    if (!Array.isArray(parsed.logs)) parsed.logs = [];
    return parsed;
  } catch (err) {
    return defaultData();
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function genId() {
  return crypto.randomBytes(8).toString('hex');
}

// ---- Audit log helpers ----

const MAX_LOGS = 500;

// Append an audit log entry and persist. Caps the log at the most recent
// MAX_LOGS entries (oldest trimmed).
function addLog(user, action, detail) {
  const data = readData();
  appendLog(data, user, action, detail);
  writeData(data);
}

// Append a log entry to an in-memory data object (caller persists).
function appendLog(data, user, action, detail) {
  if (!Array.isArray(data.logs)) data.logs = [];
  data.logs.push({
    id: genId(),
    time: new Date().toISOString(),
    user: typeof user === 'string' ? user : '',
    action: action,
    detail: typeof detail === 'string' ? detail : ''
  });
  if (data.logs.length > MAX_LOGS) {
    data.logs.splice(0, data.logs.length - MAX_LOGS);
  }
  return data;
}

// Return the most recent `limit` logs, newest first.
function listLogs(limit) {
  const n = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : 100;
  const logs = readData().logs.slice();
  logs.reverse();
  return logs.slice(0, n);
}

function seedDomains() {
  const now = new Date().toISOString();
  const base = [
    {
      name: 'www.hanwhasystems.com',
      ip: '203.241.10.21',
      owner: '한화시스템 ICT부문',
      affiliate: '한화시스템',
      isHanwha: true,
      webFirewall: true,
      webSSL: true,
      vulnScan: true,
      dnsApproval: true,
      description: '대표 홈페이지 - 모든 보안 점검 완료'
    },
    {
      name: 'portal.hanwha-ict.co.kr',
      ip: '203.241.10.55',
      owner: '한화시스템 플랫폼팀',
      affiliate: '한화시스템ICT',
      isHanwha: true,
      webFirewall: true,
      webSSL: true,
      vulnScan: false,
      dnsApproval: false,
      description: '내부 포털 - 취약점진단/DNS 결재 진행 예정'
    },
    {
      name: 'shop.partner-example.com',
      ip: '198.51.100.30',
      owner: '외부 협력사 (위탁운영)',
      affiliate: '',
      isHanwha: false,
      webFirewall: false,
      webSSL: true,
      vulnScan: false,
      dnsApproval: false,
      description: '외부 협력사 운영 도메인 - 한화 비운영'
    },
    {
      name: 'api.dmz-service.co.kr',
      ip: '203.241.10.88',
      owner: '한화시스템 인프라운영팀',
      affiliate: '한화시스템',
      isHanwha: true,
      webFirewall: true,
      webSSL: false,
      vulnScan: true,
      dnsApproval: true,
      description: 'DMZ API 게이트웨이 - 웹 SSL 적용 검토 중'
    }
  ];
  return base.map((d) => ({
    id: genId(),
    ...d,
    createdAt: now,
    updatedAt: now
  }));
}

// Ensure the store exists, the admin user is seeded, and sample domains exist.
function init() {
  const data = readData();
  let changed = false;

  if (!data.users.some((u) => u.username === 'admin')) {
    data.users.push({ username: 'admin', password: 'admin' });
    changed = true;
  }

  if (!Array.isArray(data.domains) || data.domains.length === 0) {
    data.domains = seedDomains();
    changed = true;
  }

  if (changed) writeData(data);
  return data;
}

// ---- User helpers ----

function findUser(username) {
  const data = readData();
  return data.users.find((u) => u.username === username) || null;
}

function verifyUser(username, password) {
  const user = findUser(username);
  return !!user && user.password === password;
}

function changePassword(username, currentPassword, newPassword) {
  const data = readData();
  const user = data.users.find((u) => u.username === username);
  if (!user) return { ok: false, error: '사용자를 찾을 수 없습니다.' };
  if (user.password !== currentPassword) {
    return { ok: false, error: '현재 비밀번호가 일치하지 않습니다.' };
  }
  if (!newPassword || typeof newPassword !== 'string') {
    return { ok: false, error: '새 비밀번호를 입력하세요.' };
  }
  user.password = newPassword;
  appendLog(data, username, 'auth.password', '비밀번호 변경');
  writeData(data);
  return { ok: true };
}

// ---- Domain helpers ----

function normalizeDomainInput(body) {
  body = body || {};
  return {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    ip: typeof body.ip === 'string' ? body.ip.trim() : '',
    owner: typeof body.owner === 'string' ? body.owner : '',
    affiliate: typeof body.affiliate === 'string' ? body.affiliate.trim() : '',
    isHanwha: !!body.isHanwha,
    webFirewall: !!body.webFirewall,
    webSSL: !!body.webSSL,
    vulnScan: !!body.vulnScan,
    dnsApproval: !!body.dnsApproval,
    description: typeof body.description === 'string' ? body.description : ''
  };
}

function listDomains() {
  return readData().domains;
}

function createDomain(body, actor) {
  const fields = normalizeDomainInput(body);
  if (!fields.name) {
    return { ok: false, error: '도메인명(name)은 필수입니다.' };
  }
  const now = new Date().toISOString();
  const domain = { id: genId(), ...fields, createdAt: now, updatedAt: now };
  const data = readData();
  data.domains.push(domain);
  appendLog(data, actor, 'domain.create', domain.name);
  writeData(data);
  return { ok: true, domain };
}

function updateDomain(id, body, actor) {
  const data = readData();
  const idx = data.domains.findIndex((d) => d.id === id);
  if (idx === -1) return { ok: false, notFound: true };

  const fields = normalizeDomainInput(body);
  if (!fields.name) {
    return { ok: false, error: '도메인명(name)은 필수입니다.' };
  }
  const existing = data.domains[idx];
  const updated = {
    ...existing,
    ...fields,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString()
  };
  data.domains[idx] = updated;
  appendLog(data, actor, 'domain.update', updated.name);
  writeData(data);
  return { ok: true, domain: updated };
}

function deleteDomain(id, actor) {
  const data = readData();
  const idx = data.domains.findIndex((d) => d.id === id);
  if (idx === -1) return { ok: false, notFound: true };
  const removed = data.domains[idx];
  data.domains.splice(idx, 1);
  appendLog(data, actor, 'domain.delete', removed.name);
  writeData(data);
  return { ok: true };
}

// Validate and create many domains in one pass, persisting once at the end.
function createDomainsBulk(arrayOfBodies, actor) {
  const rows = Array.isArray(arrayOfBodies) ? arrayOfBodies : [];
  const data = readData();
  const now = new Date().toISOString();
  let created = 0;
  const errors = [];

  rows.forEach((body, i) => {
    const fields = normalizeDomainInput(body);
    if (!fields.name) {
      errors.push({ row: i, name: fields.name, error: '도메인명(name)은 필수입니다.' });
      return;
    }
    const domain = { id: genId(), ...fields, createdAt: now, updatedAt: now };
    data.domains.push(domain);
    created += 1;
  });

  appendLog(data, actor, 'domain.bulk', created + '건 등록');
  writeData(data);
  return { ok: true, created: created, failed: errors.length, errors: errors };
}

module.exports = {
  DATA_FILE,
  init,
  verifyUser,
  changePassword,
  listDomains,
  createDomain,
  updateDomain,
  deleteDomain,
  createDomainsBulk,
  addLog,
  listLogs
};
