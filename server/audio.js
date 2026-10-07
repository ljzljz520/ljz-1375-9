'use strict';
// 演示用：按 seed 生成一段舒缓五声音阶合成 WAV（PCM 16bit 单声道 8kHz）。
// 这样“减速/段落跳转/锚点同步”可被真实可播放媒体验证，而无需二进制素材入库。

function generateWav(durationSec, seed = 1) {
  const sampleRate = 8000;
  const n = Math.floor(durationSec * sampleRate);
  const buf = Buffer.alloc(44 + n * 2);
  // RIFF header
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);

  // 五声音阶（宫商角徵羽，F 调近似频率）
  const scale = [174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0];
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const noteLen = sampleRate * 1.2;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const note = scale[Math.floor(i / noteLen) % scale.length];
    const phase = (i % noteLen) / noteLen;
    const env = Math.min(1, phase * 10) * Math.exp(-phase * 0.6); // 拨弦包络
    const sample = 0.28 * env * (
      Math.sin(2 * Math.PI * note * t) +
      0.4 * Math.sin(2 * Math.PI * note * 2 * t) +
      0.15 * Math.sin(2 * Math.PI * note * 3 * t)
    ) + (rand() - 0.5) * 0.004;
    buf.writeInt16LE(Math.max(-1, Math.min(1, sample)) * 32767, 44 + i * 2);
  }
  return buf;
}

module.exports = { generateWav };
