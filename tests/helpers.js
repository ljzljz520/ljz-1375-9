'use strict';
process.env.DB_PATH = require('path').join(__dirname, '..', 'data', 'test-db.json');
process.env.PORT = '0';
process.env.DB_ASYNC_SAVE = '0';
const http = require('http');
const fs = require('fs');

let server;
async function startServer() {
  try { fs.unlinkSync(process.env.DB_PATH); } catch {}
  const app = require('../server/index');
  const { load, reset, flush } = require('../server/db');
  reset(); flush();
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  return server.address().port;
}
async function stopServer() {
  if (server) await new Promise((r) => server.close(r));
  try { fs.unlinkSync(process.env.DB_PATH); } catch {}
}

function req(port, method, url, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Accept': 'application/json' };
    if (data) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({ port, method, path: url, headers }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        let json = null; try { json = JSON.parse(chunks); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: json, raw: chunks });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function login(port, name, password) {
  const r = await req(port, 'POST', '/api/auth/login', { body: { name, password } });
  return r.body.token;
}
function event(target, type, ts, deviceId, base, id) {
  const e = { target, type, ts, deviceId: deviceId || 'devX' };
  if (id) e.id = id; else e.id = 'e-' + ts + '-' + Math.random().toString(36).slice(2, 7);
  if (base !== undefined) e.base = base;
  return e;
}
const secTarget = (score, ver, sec) => `section:${score}:${ver}:${sec}`;

module.exports = { startServer, stopServer, req, login, event, secTarget };
