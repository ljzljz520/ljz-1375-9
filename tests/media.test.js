'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { issueToken, authorizeStream, verify } = require('../server/mediaAuth');

test('许可与 token 均有效 -> 放行', () => {
  const now = 1000000;
  const tok = issueToken('stream', 'sc1', 'v1', now, 1000);
  const r = authorizeStream(tok, 'v1', now + 5000, now + 500);
  assert.equal(r.ok, true);
});

test('token 过期 -> 403 TOKEN_EXPIRED（缓存索引不能续命）', () => {
  const now = 1000000;
  const tok = issueToken('stream', 'sc1', 'v1', now - 5000, 1000);
  const r = authorizeStream(tok, 'v1', now + 5000, now);
  assert.equal(r.status, 403);
  assert.equal(r.reason, 'TOKEN_EXPIRED');
});

test('旧版本授权到期 -> 410 LICENSE_EXPIRED，即便 token 仍新', () => {
  const now = 1000000;
  const tok = issueToken('stream', 'sc1', 'v-old', now, 10 * 86400000);
  const r = authorizeStream(tok, 'v-old', now - 1, now + 1000);
  assert.equal(r.status, 410);
  assert.equal(r.reason, 'LICENSE_EXPIRED');
});

test('token 与版本不匹配（拿旧缓存 token 取别的版本）-> SCOPE_MISMATCH', () => {
  const now = 1000000;
  const tok = issueToken('stream', 'sc1', 'v-old', now, 100000);
  const r = authorizeStream(tok, 'v-new', now + 500000, now + 1000);
  assert.equal(r.status, 403);
  assert.equal(r.reason, 'SCOPE_MISMATCH');
});

test('篡改 token 签名 -> BAD_SIGNATURE', () => {
  const now = 1000000;
  let tok = issueToken('stream', 'sc1', 'v1', now, 100000);
  tok = tok.slice(0, -2) + (tok.endsWith('aa') ? 'bb' : 'aa');
  const r = authorizeStream(tok, 'v1', now + 5000, now + 1000);
  assert.equal(r.status, 403);
});

test('打印/分享令牌作用域隔离', () => {
  const now = 1000000;
  const print = issueToken('print', 'sc1', 'v1', now, 100000);
  const r = authorizeStream(print, 'v1', now + 5000, now + 1000);
  assert.equal(r.status, 403);
  assert.equal(r.reason, 'SCOPE_MISMATCH');
});
