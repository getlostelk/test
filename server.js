const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// 管理密碼:由環境變數提供;沒設定時刪除功能停用
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

function isValidAdmin(req) {
  if (!ADMIN_TOKEN) return false;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(ADMIN_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const PORT = process.env.PORT || 8080;

// 優先存到掛載的持久化磁碟(/data),否則存在專案目錄
const DB_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const db = new DatabaseSync(path.join(DB_DIR, 'guestbook.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// 允許 GitHub Pages 版頁面跨域呼叫
const ALLOWED_ORIGINS = ['https://getlostelk.github.io'];

function corsHeaders(req) {
  const origin = req.headers.origin;
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
  }
  return headers;
}

// 極簡的每 IP 頻率限制:每分鐘最多 5 則
const postLog = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (postLog.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 5) return true;
  recent.push(now);
  postLog.set(ip, recent);
  return false;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/messages') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req));
      return res.end();
    }

    if (req.method === 'GET') {
      const rows = db
        .prepare('SELECT id, name, message, created_at FROM messages ORDER BY id DESC LIMIT 100')
        .all();
      res.writeHead(200, corsHeaders(req));
      return res.end(JSON.stringify(rows));
    }

    if (req.method === 'POST') {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
      if (rateLimited(ip)) {
        res.writeHead(429, corsHeaders(req));
        return res.end(JSON.stringify({ error: '留言太頻繁,請稍後再試' }));
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 10_000) req.destroy();
      });
      req.on('end', () => {
        try {
          const { name, message } = JSON.parse(body);
          const cleanName = String(name ?? '').trim().slice(0, 30);
          const cleanMsg = String(message ?? '').trim().slice(0, 200);
          if (!cleanName || !cleanMsg) {
            res.writeHead(400, corsHeaders(req));
            return res.end(JSON.stringify({ error: '名字和留言都不能是空的' }));
          }
          db.prepare('INSERT INTO messages (name, message) VALUES (?, ?)').run(cleanName, cleanMsg);
          res.writeHead(201, corsHeaders(req));
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400, corsHeaders(req));
          res.end(JSON.stringify({ error: '格式錯誤' }));
        }
      });
      return;
    }

    res.writeHead(405, corsHeaders(req));
    return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  // 管理員刪除留言
  if (url.pathname === '/api/messages/delete') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req));
      return res.end();
    }
    if (req.method !== 'POST') {
      res.writeHead(405, corsHeaders(req));
      return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    }
    if (!isValidAdmin(req)) {
      res.writeHead(403, corsHeaders(req));
      return res.end(JSON.stringify({ error: '管理密碼錯誤' }));
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000) req.destroy();
    });
    req.on('end', () => {
      try {
        const { ids } = JSON.parse(body);
        const cleanIds = (Array.isArray(ids) ? ids : [])
          .map(Number)
          .filter(Number.isInteger)
          .slice(0, 100);
        if (!cleanIds.length) {
          res.writeHead(400, corsHeaders(req));
          return res.end(JSON.stringify({ error: '沒有指定要刪除的留言' }));
        }
        const placeholders = cleanIds.map(() => '?').join(',');
        const result = db
          .prepare(`DELETE FROM messages WHERE id IN (${placeholders})`)
          .run(...cleanIds);
        res.writeHead(200, corsHeaders(req));
        res.end(JSON.stringify({ ok: true, deleted: result.changes }));
      } catch {
        res.writeHead(400, corsHeaders(req));
        res.end(JSON.stringify({ error: '格式錯誤' }));
      }
    });
    return;
  }

  // 其餘一律回首頁
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Guestbook server running on port ${PORT}, db at ${DB_DIR}`);
});
