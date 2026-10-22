import { useState } from "react";
import { CHANNELS } from "../game/config";
import type { Snapshot } from "../game/engine";

const fmt = (n: number) => n.toLocaleString("en-US");
const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
};

export interface ScreenHandlers {
  onBegin: () => void;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
  onToggleMute: () => void;
  onSensitivity: (v: number) => void;
}

/* --------------------------------------------------------------- atoms */

function Key({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <span
      className={`inline-flex ${wide ? "min-w-[54px]" : "min-w-[26px]"} items-center justify-center border border-white/25 bg-white/8 px-1.5 py-[3px] font-display text-[10px] font-bold tracking-widest text-white/85`}
    >
      {children}
    </span>
  );
}

function Row({ keys, label }: { keys: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/6 py-[7px] last:border-0">
      <span className="text-[11px] uppercase tracking-[0.18em] text-white/55">{label}</span>
      <span className="flex shrink-0 items-center gap-1">{keys}</span>
    </div>
  );
}

function Panel({
  title,
  children,
  accent,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  accent: string;
  className?: string;
}) {
  return (
    <div
      className={`clip-tag-l relative bg-[rgba(8,6,20,0.72)] p-4 backdrop-blur-[3px] ${className}`}
      style={{ borderTop: `2px solid ${accent}` }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2" style={{ background: accent, boxShadow: `0 0 10px ${accent}` }} />
        <span className="font-display text-[10px] font-extrabold tracking-[0.42em] text-white/70">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function Settings({
  snap,
  onToggleMute,
  onSensitivity,
}: {
  snap: Snapshot;
  onToggleMute: () => void;
  onSensitivity: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <button
        onClick={onToggleMute}
        className="pointer-events-auto group flex items-center gap-2 border border-white/15 px-3 py-1.5 transition-colors hover:border-white/45 hover:bg-white/8"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/70 group-hover:text-white">
          <path d="M11 5 6 9H2v6h4l5 4V5z" />
          {snap.muted ? <path d="m22 9-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/60 group-hover:text-white">
          {snap.muted ? "muted" : "audio on"}
        </span>
      </button>

      <label className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/45">
          look
        </span>
        <input
          type="range"
          min={0.3}
          max={2.5}
          step={0.05}
          value={snap.sensitivity}
          onChange={(e) => onSensitivity(Number(e.target.value))}
          className="pointer-events-auto h-1 w-28 cursor-pointer appearance-none bg-white/20 accent-white"
        />
        <span className="w-8 text-[10px] tnum text-white/45">{snap.sensitivity.toFixed(2)}</span>
      </label>
    </div>
  );
}

/* ---------------------------------------------------------------- menu */

export function MenuScreen({ snap, h }: { snap: Snapshot; h: ScreenHandlers }) {
  const [hover, setHover] = useState<number | null>(null);
  const active = hover ?? snap.channel;
  const c = CHANNELS[active];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden font-hud">
      {/* scrim so type stays legible over the live arena */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, rgba(5,4,12,0.94) 0%, rgba(5,4,12,0.86) 38%, rgba(5,4,12,0.25) 68%, rgba(5,4,12,0.55) 100%)",
        }}
      />
      <div className="noise-layer absolute inset-0 opacity-[0.05] mix-blend-overlay" />
      <div className="scanlines absolute inset-0" />

      {/* left spectrum rail */}
      <div className="absolute inset-y-0 left-0 flex w-14">
        {CHANNELS.map((ch) => (
          <button
            key={ch.id}
            onMouseEnter={() => setHover(ch.id)}
            onMouseLeave={() => setHover(null)}
            className="pointer-events-auto group relative flex-1 transition-all duration-200"
            style={{
              background: `linear-gradient(180deg, ${ch.css}${active === ch.id ? "8c" : "2e"} 0%, ${ch.css}0d 55%, transparent 100%)`,
              boxShadow: active === ch.id ? `inset 0 0 46px ${ch.css}66` : "none",
            }}
          >
            <span
              className="absolute inset-y-0 right-0 w-[3px] transition-all duration-200"
              style={{
                background: ch.css,
                boxShadow: `0 0 16px ${ch.css}`,
                opacity: active === ch.id ? 1 : 0.5,
                transform: `scaleY(${active === ch.id ? 1 : 0.55})`,
              }}
            />
            <span
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-180 font-display text-[10px] font-extrabold tracking-[0.4em] transition-colors"
              style={{
                writingMode: "vertical-rl",
                color: active === ch.id ? "#fff" : "rgba(255,255,255,0.45)",
              }}
            >
              {ch.name}
            </span>
            <span
              className="absolute bottom-3 left-1/2 -translate-x-1/2 text-sm"
              style={{ color: ch.css }}
            >
              {ch.glyph}
            </span>
          </button>
        ))}
      </div>

      <div className="absolute inset-y-0 left-14 right-0 flex flex-col justify-between px-8 py-7 lg:px-14">
        {/* ---------------------------------------------- title block */}
        <div className="max-w-4xl">
          <div className="anim-rise mb-3 flex items-center gap-3">
            <span className="h-[2px] w-10" style={{ background: c.css, boxShadow: `0 0 12px ${c.css}` }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.55em] text-white/50">
              chromatic arena shooter
            </span>
          </div>

          <h1 className="anim-rise font-display leading-[0.78]" style={{ animationDelay: "60ms" }}>
            <span
              className="block text-[clamp(3.2rem,11vw,9.5rem)] font-black tracking-[-0.03em] text-white"
              style={{ textShadow: `0 0 70px ${c.css}55` }}
            >
              PRISM
            </span>
            <span className="stroke-text anim-flicker block text-[clamp(3.2rem,11vw,9.5rem)] font-black tracking-[-0.03em]">
              BREAK
            </span>
          </h1>

          <p
            className="anim-rise mt-5 max-w-lg text-[13px] leading-relaxed text-white/55"
            style={{ animationDelay: "160ms" }}
          >
            Four spectra bleed through the breach. Your cannon only speaks one at a time —{" "}
            <span className="font-semibold text-white/85">
              a prism can only be shattered by its own colour
            </span>
            . Cycle the spectrum faster than they cycle you.
          </p>
        </div>

        {/* ---------------------------------------------- lower grid */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <Panel title="the one rule" accent={c.css} className="anim-rise" >
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <svg width="34" height="22" viewBox="0 0 34 22" className="shrink-0">
                  <circle cx="6" cy="11" r="4.5" fill={c.css} />
                  <path d="M13 11h12" stroke={c.css} strokeWidth="1.6" strokeDasharray="3 2" />
                  <path d="M25 4.5 32 11l-7 6.5z" fill={c.css} opacity="0.85" />
                </svg>
                <div>
                  <div className="font-display text-[11px] font-extrabold tracking-[0.2em] text-white">
                    MATCHED → SHATTER
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-white/40">
                    full damage · +saturation
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <svg width="34" height="22" viewBox="0 0 34 22" className="shrink-0">
                  <circle cx="6" cy="11" r="4.5" fill="#ff5470" opacity="0.5" />
                  <path d="M13 11h12" stroke="#ff5470" strokeWidth="1.6" opacity="0.4" />
                  <path d="m25 6 8 10M33 6l-8 10" stroke="#ff5470" strokeWidth="1.8" />
                </svg>
                <div>
                  <div className="font-display text-[11px] font-extrabold tracking-[0.2em] text-white/60">
                    MISMATCH → DISSONANCE
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-white/35">
                    bolt fizzles · combo resets
                  </div>
                </div>
              </div>
              <div className="mt-2 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-white/45">
                Fill <span className="text-white/80">SATURATION</span> by shattering matched prisms,
                then unleash a <span className="text-white/80">PRISM BURST</span> — a chromatic nova
                that fractures time and makes every colour vulnerable.
              </div>
            </div>
          </Panel>

          <Panel title="controls" accent="#8f7fff" className="anim-rise" >
            <div className="[&>*]:border-white/8">
              <Row label="move" keys={<><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key></>} />
              <Row label="look" keys={<Key wide>MOUSE</Key>} />
              <Row label="fire" keys={<Key wide>LMB hold</Key>} />
              <Row label="spectrum" keys={<><Key>Q</Key><Key>E</Key><Key wide>WHEEL</Key><Key>1-4</Key></>} />
              <Row label="blink dash" keys={<Key wide>SHIFT</Key>} />
              <Row label="vault" keys={<Key wide>SPACE</Key>} />
              <Row label="prism burst" keys={<><Key wide>RMB</Key><Key>R</Key></>} />
              <Row label="pause / mute" keys={<><Key>P</Key><Key>M</Key></>} />
            </div>
          </Panel>

          <div className="anim-rise flex flex-col items-start gap-4 lg:items-end">
            <div className="text-left lg:text-right">
              <div className="text-[9px] font-semibold uppercase tracking-[0.42em] text-white/35">
                personal best
              </div>
              <div className="font-display text-4xl font-black tnum text-white/85">
                {fmt(snap.best)}
              </div>
            </div>
            <button
              onClick={h.onBegin}
              onMouseEnter={() => h.onSensitivity(snap.sensitivity)}
              className="pointer-events-auto clip-blade group relative overflow-hidden px-10 py-5 text-left transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: c.css, boxShadow: `0 0 60px ${c.css}66` }}
            >
              <span className="absolute inset-0 bg-white/0 transition-colors duration-200 group-hover:bg-white/15" />
              <span className="relative block font-display text-2xl font-black tracking-[0.16em] text-black">
                ENTER THE ARENA
              </span>
              <span className="relative mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.34em] text-black/60">
                mouse will be captured · esc to pause
              </span>
            </button>
            <Settings snap={snap} onToggleMute={h.onToggleMute} onSensitivity={h.onSensitivity} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- pause */

export function PauseScreen({ snap, h }: { snap: Snapshot; h: ScreenHandlers }) {
  const c = CHANNELS[snap.channel];
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-hud">
      <div className="absolute inset-0 bg-[rgba(5,4,12,0.72)] backdrop-blur-[6px]" />
      <div className="scanlines absolute inset-0" />
      <div className="pointer-events-auto relative w-[min(560px,92vw)]">
        <div className="clip-tag-l border-l-[3px] bg-[rgba(10,8,24,0.9)] p-7" style={{ borderColor: c.css }}>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.5em] text-white/40">
                simulation halted
              </div>
              <h2 className="font-display text-5xl font-black tracking-[0.06em] text-white">
                PAUSED
              </h2>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-[0.35em] text-white/35">wave</div>
              <div className="font-display text-3xl font-black tnum" style={{ color: c.css }}>
                {snap.wave.toString().padStart(2, "0")}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 border-y border-white/10 py-4">
            {[
              ["score", fmt(snap.score)],
              ["kills", String(snap.kills)],
              ["integrity", `${snap.hp}%`],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-[9px] uppercase tracking-[0.3em] text-white/35">{k}</div>
                <div className="font-display text-xl font-bold tnum text-white/85">{v}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={h.onResume}
              className="clip-slant flex-1 bg-white px-6 py-3 font-display text-sm font-black tracking-[0.2em] text-black transition-transform hover:scale-[1.02]"
            >
              RESUME
            </button>
            <button
              onClick={h.onRestart}
              className="clip-slant border border-white/25 px-5 py-3 font-display text-sm font-bold tracking-[0.2em] text-white/80 transition-colors hover:border-white/60 hover:bg-white/10"
            >
              RESTART
            </button>
            <button
              onClick={h.onMenu}
              className="clip-slant border border-white/15 px-5 py-3 font-display text-sm font-bold tracking-[0.2em] text-white/50 transition-colors hover:border-white/40 hover:text-white"
            >
              ABANDON
            </button>
          </div>

          <div className="mt-5">
            <Settings snap={snap} onToggleMute={h.onToggleMute} onSensitivity={h.onSensitivity} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- dead */

function rank(score: number) {
  if (score >= 40000) return { r: "S", c: "#ffb020", t: "spectrum sovereign" };
  if (score >= 22000) return { r: "A", c: "#a6ff3d", t: "prism breaker" };
  if (score >= 11000) return { r: "B", c: "#25e6ff", t: "chromatic adept" };
  if (score >= 4500) return { r: "C", c: "#8f7fff", t: "spectrum initiate" };
  return { r: "D", c: "#ff5470", t: "refracted" };
}

export function DeadScreen({ snap, h }: { snap: Snapshot; h: ScreenHandlers }) {
  const rk = rank(snap.score);
  const stats: [string, string][] = [
    ["final score", fmt(snap.score)],
    ["waves survived", String(Math.max(0, snap.wave - 1))],
    ["prisms shattered", String(snap.kills)],
    ["accuracy", `${Math.round(snap.accuracy * 100)}%`],
    ["time in breach", clock(snap.elapsed)],
    ["personal best", fmt(snap.best)],
  ];
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-hud">
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, rgba(30,4,14,0.72), rgba(4,3,10,0.94))" }}
      />
      <div className="noise-layer absolute inset-0 opacity-[0.07] mix-blend-overlay" />
      <div className="scanlines absolute inset-0" />

      <div className="pointer-events-auto relative grid w-[min(940px,94vw)] gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
        {/* rank */}
        <div className="anim-rise flex flex-col items-center lg:items-start">
          <div className="text-[10px] font-bold uppercase tracking-[0.5em] text-white/40">
            signal lost
          </div>
          <div
            className="font-display text-[clamp(6rem,17vw,13rem)] font-black leading-[0.78]"
            style={{ color: rk.c, textShadow: `0 0 80px ${rk.c}77` }}
          >
            {rk.r}
          </div>
          <div className="-mt-1 font-display text-xs font-extrabold uppercase tracking-[0.4em] text-white/70">
            {rk.t}
          </div>
          {snap.score >= snap.best && snap.score > 0 && (
            <div className="anim-flicker mt-3 border border-white/25 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.35em] text-white">
              new personal best
            </div>
          )}
        </div>

        {/* stats */}
        <div className="anim-rise" style={{ animationDelay: "90ms" }}>
          <div className="clip-tag-l bg-[rgba(9,7,20,0.8)] p-6" style={{ borderTop: `2px solid ${rk.c}` }}>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {stats.map(([k, v], i) => (
                <div key={k} className="border-b border-white/8 pb-2">
                  <div className="text-[9px] uppercase tracking-[0.32em] text-white/35">{k}</div>
                  <div
                    className="font-display text-2xl font-bold tnum"
                    style={{ color: i === 0 ? "#fff" : "rgba(255,255,255,0.78)", animationDelay: `${i * 40}ms` }}
                  >
                    {v}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                onClick={h.onRestart}
                className="clip-slant flex-1 px-7 py-4 font-display text-base font-black tracking-[0.2em] text-black transition-transform hover:scale-[1.02]"
                style={{ background: rk.c, boxShadow: `0 0 50px ${rk.c}55` }}
              >
                RE-ENTER
              </button>
              <button
                onClick={h.onMenu}
                className="clip-slant border border-white/25 px-6 py-4 font-display text-base font-bold tracking-[0.2em] text-white/75 transition-colors hover:border-white/60 hover:bg-white/10 hover:text-white"
              >
                MAIN MENU
              </button>
            </div>
            <div className="mt-3 text-[9px] uppercase tracking-[0.3em] text-white/25">
              press enter to re-enter · r to restart
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
