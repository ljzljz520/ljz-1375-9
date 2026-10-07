'use strict';
// 服务端许可控制：谱例打印/分享 + 音频取流。
// 授权与“谱例版本”绑定：旧版本授权到期后，即便客户端仍持有缓存索引/token，也无法重新取流。
const crypto = require('crypto');

const SECRET = process.env.MEDIA_SECRET || 'guqin-dev-secret';

function sign(payload, expiresAt) {
  const body = `${payload}.${expiresAt}`;
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  return `${Buffer.from(body).toString('base64url')}.${sig}`;
}

function verify(token) {
  if (!token || token.split('.').length !== 2) return { ok: false, reason: 'MALFORMED' };
  const [b64, sig] = token.split('.');
  let body;
  try { body = Buffer.from(b64, 'base64url').toString('utf8'); }
  catch { return { ok: false, reason: 'MALFORMED' }; }
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }
  const [payload, expiresAt] = body.split('.');
  return { ok: true, payload, expiresAt: Number(expiresAt) };
}

/** 颁发取流/打印/分享令牌（服务端先确认许可有效） */
function issueToken(kind, scoreId, versionId, now = Date.now(), ttlMs = 30 * 60 * 1000) {
  return sign(`${kind}:${scoreId}:${versionId}`, now + ttlMs);
}

/**
 * 取流鉴权：token 有效 + 未过期 + 版本当前仍在许可期内。
 * licenseValidUntil 是版本级许可（可因版权到期而过期），与 token TTL 双重校验。
 */
function authorizeStream(token, versionId, licenseValidUntil, now = Date.now()) {
  const v = verify(token);
  if (!v.ok) return { ok: false, status: 403, reason: v.reason };
  if (now > v.expiresAt) return { ok: false, status: 403, reason: 'TOKEN_EXPIRED' };
  const [kind, , tokVersion] = v.payload.split(':');
  if (kind !== 'stream' || tokVersion !== String(versionId)) {
    return { ok: false, status: 403, reason: 'SCOPE_MISMATCH' };
  }
  // 关键：旧版本授权到期后，任何缓存的 token / 缓存索引都无法复活访问
  if (licenseValidUntil == null) return { ok: false, status: 403, reason: 'NO_LICENSE' };
  if (now > licenseValidUntil) return { ok: false, status: 410, reason: 'LICENSE_EXPIRED' };
  return { ok: true };
}

module.exports = { sign, verify, issueToken, authorizeStream };
