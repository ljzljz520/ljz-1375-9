"""生成极简单音正弦波 WAV（仅用于演示，避免依赖真实音频素材）。"""
import math
import os
import struct
import wave


def make_wav(path, duration=6.0, freq=392.0, amp=0.18, rate=8000):
    n = int(duration * rate)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        for i in range(n):
            # 加一点泛音，更像弹拨音头
            t = i / rate
            env = math.exp(-3.0 * (t % 2.0))
            v = amp * env * (math.sin(2 * math.pi * freq * t)
                             + 0.4 * math.sin(2 * math.pi * freq * 2 * t))
            frames += struct.pack("<h", int(v * 32767))
        w.writeframes(bytes(frames))
    return path
