"""
Generate local, real music tracks + vector covers for 伴游FM.

No network dependency at runtime: MP3 files live in public/audio/fm and
SVG covers live in public/images/fm. Run: python scripts/gen_fm_assets.py
"""
import os
import shutil
import subprocess
import tempfile
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT, "public", "audio", "fm")
COVER_DIR = os.path.join(ROOT, "public", "images", "fm")
os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(COVER_DIR, exist_ok=True)

SR = 44100
FFMPEG = "D:/Anaconda3/Scripts/ffmpeg.exe"
if not os.path.exists(FFMPEG):
    FFMPEG = shutil.which("ffmpeg") or "ffmpeg"

# id, title, subtitle, key(midi), bpm, lead instrument, seed, colors, motif
TRACKS = [
    dict(id="heritage", title="锦绣蜀韵", en="BROCADE OF SHU", key=60, bpm=76,
         lead="pluck", seed=11, c1="#7C2E3E", c2="#C9795A", accent="#F0C987", motif="silk"),
    dict(id="celebrities", title="草堂听雨", en="RAIN AT THE COTTAGE", key=62, bpm=66,
         lead="flute", seed=23, c1="#2E4A47", c2="#6E8F80", accent="#DCE7C8", motif="rain"),
    dict(id="history", title="古蜀回响", en="ECHOES OF ANCIENT SHU", key=57, bpm=60,
         lead="flute", seed=37, c1="#4A3826", c2="#9C7840", accent="#E8C88A", motif="bronze"),
    dict(id="food", title="烟火成都", en="FLAVORS OF CHENGDU", key=65, bpm=96,
         lead="pluck", seed=41, c1="#9E3A2C", c2="#D97A3C", accent="#FFD79A", motif="ripple"),
    dict(id="life", title="盖碗茶香", en="TEA HOUSE HOURS", key=60, bpm=72,
         lead="pluck", seed=53, c1="#5D6650", c2="#A8A079", accent="#E9DCBB", motif="steam"),
    dict(id="landmarks", title="巷陌慢行", en="WANDERING THE LANES", key=67, bpm=80,
         lead="flute", seed=67, c1="#354F60", c2="#6F8C99", accent="#E3C89B", motif="lanes"),
    dict(id="legends", title="神鸟逐日", en="SUN BIRD IN FLIGHT", key=64, bpm=88,
         lead="bell", seed=79, c1="#8A5322", c2="#C99342", accent="#FFE3A6", motif="sun"),
]

PENTATONIC = [0, 2, 4, 7, 9]


def midi_to_freq(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def render_note(freq, dur, amp, style):
    n = max(1, int(SR * dur))
    t = np.arange(n, dtype=np.float64) / SR
    phase = 2.0 * np.pi * freq * t

    if style == "pluck":  # guzheng-like plucked string
        y = (np.sin(phase) + 0.45 * np.sin(2 * phase)
             + 0.22 * np.sin(3 * phase) + 0.10 * np.sin(4 * phase))
        env = (1 - np.exp(-t / 0.003)) * np.exp(-2.4 * t)
    elif style == "flute":  # bamboo flute with vibrato
        p = phase + 0.020 * np.sin(2 * np.pi * 5.2 * t)
        y = np.sin(p) + 0.13 * np.sin(2 * p) + 0.05 * np.sin(3 * p)
        env = np.clip(t / 0.09, 0, 1) * np.clip((dur - t) / 0.18, 0, 1)
        env *= 0.93 + 0.07 * np.sin(2 * np.pi * 3.1 * t)
    elif style == "bell":  # bronze bell / chime
        y = (np.sin(phase) + 0.32 * np.sin(2.76 * phase)
             + 0.14 * np.sin(5.4 * phase) + 0.06 * np.sin(8.9 * phase))
        env = (1 - np.exp(-t / 0.002)) * np.exp(-2.8 * t)
    elif style == "bass":
        y = np.sin(phase) + 0.18 * np.sin(2 * phase)
        env = (1 - np.exp(-t / 0.02)) * np.exp(-1.2 * t)
    elif style == "pad":
        y = np.zeros(n)
        for mult, w in [(1, 1.0), (2, 0.16), (3, 0.06)]:
            y += w * np.sin(phase * mult + 0.4 * mult)
        env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.8
    else:
        y, env = np.sin(phase), np.ones(n)

    return amp * y * env


def add(buf, start_sec, samples):
    i = int(start_sec * SR)
    if i >= len(buf):
        return
    if i < 0:
        samples = samples[-i:]
        i = 0
    j = min(len(buf), i + len(samples))
    buf[i:j] += samples[: j - i]


def compose(cfg):
    bpm, beat, bars = cfg["bpm"], 60.0 / cfg["bpm"], 8
    key = cfg["key"]
    rng = np.random.default_rng(cfg["seed"])
    total = bars * 4 * beat + 2.6
    buf = np.zeros(int(SR * total))

    chords = [[0, 4, 7], [-5, 0, 4], [2, 7, 9], [-3, 2, 7]]
    scale = [key + 12 + o for o in [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]]

    # sustained harmonic bed, one chord per two bars
    for ci in range(4):
        ch = chords[ci]
        start = ci * 8 * beat
        for off in ch:
            add(buf, start, render_note(midi_to_freq(key + off), 8 * beat, 0.052, "pad"))

    for bar in range(bars):
        ch = chords[(bar // 2) % 4]
        # bass on beat 1 and 3
        for b in (0, 2):
            add(buf, (bar * 4 + b) * beat,
                render_note(midi_to_freq(key - 24 + ch[0]), beat * 2.2, 0.17, "bass"))
        # arpeggio on off-beats
        for b in range(4):
            note = key + 12 + ch[(bar + b) % 3]
            add(buf, (bar * 4 + b + 0.5) * beat,
                render_note(midi_to_freq(note), beat * 1.9, 0.095, "pluck"))
        # soft shaker pulse
        for b in range(4):
            n = int(SR * 0.045)
            t = np.arange(n) / SR
            click = rng.normal(0, 1, n) * np.exp(-t / 0.009) * 0.018
            add(buf, (bar * 4 + b) * beat, click)

    # melody: pentatonic random walk, resolves to tonic every two bars
    idx = 4
    for bar in range(bars):
        for b in range(4):
            if b == 0 and bar % 2 == 0:
                idx = 4
            else:
                idx = int(np.clip(idx + rng.choice([-2, -1, -1, 0, 1, 1, 2]), 0, len(scale) - 1))
            if rng.random() < 0.12 and b != 0:
                continue
            dur = beat * {"pluck": 2.3, "flute": 1.7, "bell": 2.6}[cfg["lead"]]
            add(buf, (bar * 4 + b) * beat,
                render_note(midi_to_freq(scale[idx]), dur, 0.23, cfg["lead"]))
        # chime accent at the end of every other bar
        if bar % 2 == 1:
            add(buf, (bar * 4 + 3.5) * beat,
                render_note(midi_to_freq(key + 24), beat * 2.4, 0.075, "bell"))

    # simple multi-tap reverb
    out = buf.copy()
    for delay_ms, gain in [(113, 0.26), (227, 0.17), (389, 0.09)]:
        d = int(SR * delay_ms / 1000)
        out[d:] += gain * buf[:-d]

    fade_in, fade_out = int(SR * 0.7), int(SR * 2.1)
    out[:fade_in] *= np.linspace(0, 1, fade_in)
    out[-fade_out:] *= np.linspace(1, 0, fade_out)
    peak = np.max(np.abs(out)) or 1.0
    out = out / peak * 0.84
    return out, total


def write_wav(path, y):
    data = (np.clip(y, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


# ---------------------------------------------------------------- covers
def motif_svg(kind, accent):
    a = accent
    if kind == "silk":
        return "".join(
            f'<path d="M{-80 + i * 46} 600 Q{130 + i * 12} {330 - i * 8} {160 + i * 46} 60" '
            f'fill="none" stroke="{a}" stroke-width="1.1" opacity=".30"/>' for i in range(16)
        ) + "".join(
            f'<path d="M-80 {70 + i * 42} Q300 {230 + i * 14} 680 {110 + i * 42}" '
            f'fill="none" stroke="{a}" stroke-width=".8" opacity=".22"/>' for i in range(13)
        )
    if kind == "rain":
        return "".join(
            f'<line x1="{28 + i * 22}" y1="{70 + (i % 5) * 26}" x2="{28 + i * 22}" '
            f'y2="{430 + (i % 4) * 34}" stroke="{a}" stroke-width="1" opacity=".30"/>' for i in range(26)
        ) + f'<path d="M60 250 L300 150 L540 250" fill="none" stroke="{a}" stroke-width="2" opacity=".55"/>' \
            f'<path d="M90 255 L300 175 L510 255" fill="none" stroke="{a}" stroke-width="1" opacity=".4"/>'
    if kind == "bronze":
        s = "".join(
            f'<circle cx="300" cy="300" r="{r}" fill="none" stroke="{a}" stroke-width="1.2" opacity="{op}"/>'
            for r, op in [(70, .5), (110, .35), (150, .28), (192, .22), (234, .16)]
        )
        s += "".join(
            f'<rect x="{x}" y="{y}" width="34" height="34" fill="none" stroke="{a}" '
            f'stroke-width="1" opacity=".22" transform="rotate({(x + y) % 45} {x + 17} {y + 17})"/>'
            for x in range(40, 580, 62) for y in range(40, 580, 62)
        )
        return s
    if kind == "ripple":
        return "".join(
            f'<circle cx="300" cy="316" r="{r}" fill="none" stroke="{a}" '
            f'stroke-width="{1.4 if r % 60 == 0 else 0.9}" opacity="{0.42 - r / 900:.2f}"/>'
            for r in range(32, 300, 26)
        )
    if kind == "steam":
        s = "".join(
            f'<path d="M{120 + i * 90} 470 C{80 + i * 90} 390 {180 + i * 90} 340 '
            f'{120 + i * 90} 250 C{80 + i * 90} 190 {160 + i * 90} 150 {140 + i * 90} 80" '
            f'fill="none" stroke="{a}" stroke-width="1.4" opacity=".34"/>' for i in range(5)
        )
        s += f'<ellipse cx="300" cy="492" rx="150" ry="26" fill="none" stroke="{a}" stroke-width="1.6" opacity=".55"/>'
        return s
    if kind == "lanes":
        s = ""
        for row in range(9):
            y = 60 + row * 60
            s += f'<line x1="30" y1="{y}" x2="570" y2="{y}" stroke="{a}" stroke-width="1" opacity=".20"/>'
            offset = 0 if row % 2 == 0 else 34
            for col in range(9):
                x = 30 + col * 68 + offset
                s += f'<line x1="{x}" y1="{y}" x2="{x}" y2="{y + 60}" stroke="{a}" stroke-width="1" opacity=".20"/>'
        s += f'<path d="M228 560 L228 340 Q300 276 372 340 L372 560" fill="none" stroke="{a}" stroke-width="2.2" opacity=".6"/>'
        return s
    # sun
    rays = "".join(
        f'<line x1="{300 + 120 * np.cos(i * np.pi / 12):.1f}" y1="{300 + 120 * np.sin(i * np.pi / 12):.1f}" '
        f'x2="{300 + 265 * np.cos(i * np.pi / 12):.1f}" y2="{300 + 265 * np.sin(i * np.pi / 12):.1f}" '
        f'stroke="{a}" stroke-width="1.5" opacity=".38"/>' for i in range(24)
    )
    arcs = "".join(
        f'<path d="M{300 + 105 * np.cos(k * np.pi / 2):.1f} {300 + 105 * np.sin(k * np.pi / 2):.1f} '
        f'A105 105 0 0 1 {300 + 105 * np.cos((k + 1) * np.pi / 2):.1f} '
        f'{300 + 105 * np.sin((k + 1) * np.pi / 2):.1f}" fill="none" stroke="{a}" '
        f'stroke-width="3" opacity=".55"/>' for k in range(4)
    )
    return rays + f'<circle cx="300" cy="300" r="105" fill="none" stroke="{a}" stroke-width="1.4" opacity=".65"/>' + arcs


def cover_svg(cfg, number, duration_label):
    c1, c2, accent = cfg["c1"], cfg["c2"], cfg["accent"]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="65%">
      <stop offset="0%" stop-color="{accent}" stop-opacity=".22"/>
      <stop offset="100%" stop-color="{accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="45%" stop-color="{c1}" stop-opacity="0"/>
      <stop offset="100%" stop-color="#10100E" stop-opacity=".62"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#bg)"/>
  <rect width="600" height="600" fill="url(#glow)"/>
  <g>{motif_svg(cfg["motif"], accent)}</g>
  <rect width="600" height="600" fill="url(#veil)"/>
  <rect x="26" y="26" width="548" height="548" fill="none" stroke="{accent}" stroke-width="1" opacity=".38"/>
  <rect x="34" y="34" width="532" height="532" fill="none" stroke="{accent}" stroke-width=".5" opacity=".22"/>
  <text x="58" y="76" fill="{accent}" font-size="15" letter-spacing="5" opacity=".9"
        font-family="Arial, Helvetica, sans-serif">TRAVELER FM  ·  伴游FM</text>
  <line x1="58" y1="92" x2="542" y2="92" stroke="{accent}" stroke-width="1" opacity=".38"/>
  <text x="300" y="330" text-anchor="middle" fill="#FFF9EE" font-size="66" font-weight="700"
        letter-spacing="10" font-family="Noto Serif SC, Songti SC, STSong, SimSun, serif">{cfg["title"]}</text>
  <text x="300" y="374" text-anchor="middle" fill="{accent}" font-size="15" letter-spacing="6"
        font-family="Arial, Helvetica, sans-serif" opacity=".92">{cfg["en"]}</text>
  <line x1="240" y1="404" x2="360" y2="404" stroke="{accent}" stroke-width="1" opacity=".6"/>
  <text x="58" y="548" fill="{accent}" font-size="17" letter-spacing="3"
        font-family="Arial, Helvetica, sans-serif">NO.{number:02d}</text>
  <text x="542" y="548" text-anchor="end" fill="{accent}" font-size="17" letter-spacing="2"
        font-family="Arial, Helvetica, sans-serif">{duration_label}</text>
</svg>
'''


def main():
    tmp = tempfile.mkdtemp(prefix="fm_wav_")
    print("ffmpeg:", FFMPEG)
    for i, cfg in enumerate(TRACKS, 1):
        y, total = compose(cfg)
        wav = os.path.join(tmp, cfg["id"] + ".wav")
        mp3 = os.path.join(AUDIO_DIR, cfg["id"] + ".mp3")
        write_wav(wav, y)
        subprocess.run(
            [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", wav,
             "-codec:a", "libmp3lame", "-b:a", "96k", "-ar", "44100", "-ac", "1", mp3],
            check=True,
        )
        secs = int(round(total))
        label = f"{secs // 60:02d}:{secs % 60:02d}"
        svg_path = os.path.join(COVER_DIR, cfg["id"] + ".svg")
        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(cover_svg(cfg, i, label))
        size_kb = os.path.getsize(mp3) / 1024
        print(f"{i}. {cfg['id']:12s} {label}  {size_kb:7.1f} KB  -> {mp3}")
    shutil.rmtree(tmp, ignore_errors=True)
    print("DONE:", len(TRACKS), "tracks +", len(TRACKS), "covers")


if __name__ == "__main__":
    main()
