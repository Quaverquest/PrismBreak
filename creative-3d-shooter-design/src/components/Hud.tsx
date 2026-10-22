import { CHANNELS } from "../game/config";
import type { Snapshot } from "../game/engine";

const fmt = (n: number) => n.toLocaleString("en-US");
const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
};

/* ------------------------------------------------------------------ bits */

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[9px] font-semibold uppercase tracking-[0.42em] text-white/40 ${className}`}>
      {children}
    </div>
  );
}

function Crosshair({ snap }: { snap: Snapshot }) {
  const col = CHANNELS[snap.channel].css;
  const lock = snap.aim === 1;
  const wrong = snap.aim === 2;
  const gap = lock ? 5 : wrong ? 15 : 10;
  const size = lock ? 9 : 13;
  const tint = lock ? col : wrong ? "#ff5470" : col;
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <div className="relative h-16 w-16">
        {[
          { t: "left-1/2 top-1/2", x: "-50%", y: `calc(-100% - ${gap}px)`, w: 2, h: size, r: 0 },
          { t: "left-1/2 top-1/2", x: "-50%", y: `${gap}px`, w: 2, h: size, r: 0 },
          { t: "left-1/2 top-1/2", x: `calc(-100% - ${gap}px)`, y: "-50%", w: size, h: 2, r: 0 },
          { t: "left-1/2 top-1/2", x: `${gap}px`, y: "-50%", w: size, h: 2, r: 0 },
        ].map((b, i) => (
          <span
            key={i}
            className={`absolute ${b.t} origin-center transition-all duration-100`}
            style={{
              transform: `translate(${b.x}, ${b.y}) rotate(${lock ? 45 : 0}deg)`,
              width: b.w,
              height: b.h,
              background: tint,
              boxShadow: `0 0 8px ${tint}`,
              opacity: 0.95,
            }}
          />
        ))}
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-100"
          style={{
            width: lock ? 4 : 2.5,
            height: lock ? 4 : 2.5,
            background: lock ? "#fff" : tint,
            boxShadow: `0 0 ${lock ? 14 : 6}px ${lock ? "#fff" : tint}`,
          }}
        />
        {wrong && (
          <span
            className="absolute left-1/2 top-1/2 h-[2px] w-9 -translate-x-1/2 -translate-y-1/2 rotate-45"
            style={{ background: "#ff5470", boxShadow: "0 0 10px #ff5470" }}
          />
        )}
        {lock && (
          <span
            className="absolute left-1/2 top-[calc(100%+2px)] -translate-x-1/2 text-[8px] font-bold tracking-[0.3em]"
            style={{ color: tint }}
          >
            SYNC
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- HUD */

export default function Hud({ snap }: { snap: Snapshot }) {
  const ch = CHANNELS[snap.channel];
  if (snap.phase === "menu") return null;
  const hpPct = Math.max(0, snap.hp / snap.maxHp);
  const critical = hpPct <= 0.3;
  const segments = 12;
  const filled = Math.ceil(hpPct * segments);
  const over = snap.overcharge > 0;

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-hud">
      {/* damage + atmosphere overlays */}
      <div
        className="absolute inset-0 transition-opacity duration-150"
        style={{
          opacity: snap.hurt * 0.85,
          background:
            "radial-gradient(ellipse at center, rgba(255,20,60,0) 35%, rgba(255,20,60,0.55) 100%)",
        }}
      />
      {critical && snap.phase === "playing" && (
        <div
          className="anim-crit absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255,0,50,0) 52%, rgba(255,0,50,0.65) 100%)",
          }}
        />
      )}
      <div
        className="absolute inset-x-0 top-0 h-[3px] transition-all duration-200"
        style={{ background: ch.css, opacity: over ? 1 : 0.35, boxShadow: `0 0 22px ${ch.css}` }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[3px] transition-all duration-200"
        style={{ background: ch.css, opacity: over ? 1 : 0.35, boxShadow: `0 0 22px ${ch.css}` }}
      />

      {snap.phase === "playing" && <Crosshair snap={snap} />}

      {/* ---------------------------------------------------------- top left */}
      <div className="absolute left-6 top-6 flex items-start gap-4">
        <div
          className="clip-tag-l relative px-5 py-3 backdrop-blur-[2px]"
          style={{ background: "rgba(8,6,20,0.62)", borderLeft: `3px solid ${ch.css}` }}
        >
          <Label>wave</Label>
          <div className="flex items-baseline gap-2">
            <span
              className="font-display text-5xl font-black leading-none tnum"
              style={{ color: "#fff", textShadow: `0 0 26px ${ch.css}` }}
            >
              {snap.wave.toString().padStart(2, "0")}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
              {snap.wave % 5 === 0 && snap.wave > 0 ? "specter" : "breach"}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">hostiles</span>
            <span className="font-display text-sm font-bold tnum" style={{ color: ch.css }}>
              {snap.enemiesLeft}
            </span>
          </div>
        </div>

        {snap.boss && (
          <div className="anim-slide mt-1 w-[340px]">
            <div className="mb-1 flex items-end justify-between">
              <span className="font-display text-xs font-extrabold tracking-[0.3em] text-white/85">
                {snap.boss.name}
              </span>
              <span
                className="text-[10px] font-bold uppercase tracking-[0.25em]"
                style={{ color: CHANNELS[snap.boss.channel].css }}
              >
                {CHANNELS[snap.boss.channel].name} LOCK
              </span>
            </div>
            <div className="relative h-3 w-full overflow-hidden bg-white/8" style={{ clipPath: "polygon(0 0,100% 0,calc(100% - 8px) 100%,0 100%)" }}>
              <div
                className="h-full transition-[width] duration-150"
                style={{
                  width: `${(snap.boss.hp / snap.boss.max) * 100}%`,
                  background: `linear-gradient(90deg, ${CHANNELS[snap.boss.channel].css}, #ffffff)`,
                  boxShadow: `0 0 18px ${CHANNELS[snap.boss.channel].css}`,
                }}
              />
              <div className="absolute inset-0 flex">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className="h-full flex-1 border-r border-black/50" />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------- top right */}
      <div className="absolute right-6 top-6 text-right">
        <Label className="text-right">score</Label>
        <div
          key={snap.score}
          className="anim-pop font-display text-6xl font-black leading-[0.9] tnum text-white"
          style={{ textShadow: `0 0 34px ${ch.css}66` }}
        >
          {fmt(snap.score)}
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.3em] text-white/35">
          best {fmt(snap.best)}
        </div>

        <div className="mt-3 flex items-center justify-end gap-3">
          {snap.combo > 1 && (
            <div className="text-right">
              <div
                key={snap.mult}
                className="anim-pop font-display text-3xl font-black leading-none"
                style={{ color: ch.css, textShadow: `0 0 20px ${ch.css}` }}
              >
                ×{snap.mult}
              </div>
              <div className="mt-1 h-[3px] w-24 bg-white/12">
                <div
                  className="h-full"
                  style={{ width: `${snap.comboTime * 100}%`, background: ch.css }}
                />
              </div>
              <div className="mt-0.5 text-[9px] uppercase tracking-[0.3em] text-white/35">
                chain {snap.combo}
              </div>
            </div>
          )}
          <div
            className="clip-tag px-3 py-2 text-left"
            style={{ background: "rgba(8,6,20,0.6)", borderRight: `2px solid ${ch.css}` }}
          >
            <Label>kills</Label>
            <div className="font-display text-xl font-bold tnum text-white/90">{snap.kills}</div>
            <Label className="mt-1">time</Label>
            <div className="font-display text-sm font-bold tnum text-white/60">
              {clock(snap.elapsed)}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------ bottom left */}
      <div className="absolute bottom-6 left-6 w-[300px]">
        <div className="mb-1 flex items-end justify-between">
          <Label>integrity</Label>
          <span
            className="font-display text-2xl font-black leading-none tnum"
            style={{ color: critical ? "#ff4d6d" : "#fff" }}
          >
            {snap.hp}
            <span className="text-xs font-bold text-white/30">/{snap.maxHp}</span>
          </span>
        </div>
        <div className="flex h-4 gap-[3px]">
          {Array.from({ length: segments }).map((_, i) => {
            const on = i < filled;
            return (
              <div
                key={i}
                className="flex-1 transition-all duration-150"
                style={{
                  background: on
                    ? critical
                      ? "linear-gradient(180deg,#ff8098,#ff2244)"
                      : `linear-gradient(180deg, ${ch.css}, ${ch.css}55)`
                    : "rgba(255,255,255,0.07)",
                  boxShadow: on ? `0 0 12px ${critical ? "#ff224488" : ch.css + "66"}` : "none",
                  transform: on ? "scaleY(1)" : "scaleY(0.55)",
                  clipPath: "polygon(0 0,100% 0,100% 100%,3px 100%)",
                }}
              />
            );
          })}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Label>shield</Label>
          <div className="h-[5px] flex-1 bg-white/8">
            <div
              className="h-full transition-all duration-200"
              style={{
                width: `${(snap.shield / 60) * 100}%`,
                background: "linear-gradient(90deg,#8f7fff,#d9ccff)",
                boxShadow: "0 0 12px #8f7fff",
              }}
            />
          </div>
          <span className="w-6 text-right text-[10px] tnum text-white/40">{snap.shield}</span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Label>blink</Label>
          <div className="flex gap-1.5">
            {Array.from({ length: snap.dashMax }).map((_, i) => {
              const ready = i < snap.dashCharges;
              const charging = i === snap.dashCharges;
              return (
                <div
                  key={i}
                  className="relative h-3 w-9 overflow-hidden bg-white/8"
                  style={{ clipPath: "polygon(0 0,100% 0,calc(100% - 5px) 100%,0 100%)" }}
                >
                  <div
                    className="absolute inset-0 transition-transform duration-100"
                    style={{
                      background: ch.css,
                      boxShadow: `0 0 14px ${ch.css}`,
                      transform: ready
                        ? "scaleX(1)"
                        : charging
                          ? `scaleX(${snap.dashRecharge})`
                          : "scaleX(0)",
                      transformOrigin: "left",
                      opacity: ready ? 1 : 0.55,
                    }}
                  />
                </div>
              );
            })}
          </div>
          <span className="text-[9px] uppercase tracking-[0.25em] text-white/25">shift</span>
        </div>
      </div>

      {/* ---------------------------------------------------- bottom center */}
      <div className="absolute bottom-6 left-1/2 w-[440px] -translate-x-1/2">
        {/* saturation */}
        <div className="mb-2">
          <div className="mb-1 flex items-end justify-between">
            <Label>saturation</Label>
            <span
              className={`text-[10px] font-bold uppercase tracking-[0.3em] ${
                snap.saturation >= 1 ? "anim-flicker" : ""
              }`}
              style={{ color: snap.saturation >= 1 ? "#fff" : "rgba(255,255,255,0.35)" }}
            >
              {snap.saturation >= 1 ? "prism burst ready · rmb" : `${Math.round(snap.saturation * 100)}%`}
            </span>
          </div>
          <div
            className={`relative h-[10px] overflow-hidden bg-white/8 ${
              snap.saturation >= 1 ? "anim-ready" : ""
            }`}
            style={{ clipPath: "polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%)" }}
          >
            <div
              className="h-full transition-[width] duration-200"
              style={{
                width: `${snap.saturation * 100}%`,
                background:
                  snap.saturation >= 1
                    ? "linear-gradient(90deg,#25e6ff,#ff2f9e,#ffb020,#a6ff3d)"
                    : `linear-gradient(90deg, ${ch.css}88, ${ch.css})`,
                boxShadow: `0 0 18px ${ch.css}`,
              }}
            />
            {snap.saturation >= 1 && (
              <div className="anim-sweep absolute inset-y-0 w-10 bg-white/40 blur-[6px]" />
            )}
          </div>
        </div>

        {/* spectrum selector */}
        <div className="flex items-stretch gap-1.5">
          {CHANNELS.map((c) => {
            const active = c.id === snap.channel;
            return (
              <div
                key={c.id}
                className="relative flex-1 overflow-hidden px-2 py-1.5 transition-all duration-150"
                style={{
                  background: active ? `${c.css}22` : "rgba(10,8,24,0.6)",
                  border: `1px solid ${active ? c.css : "rgba(255,255,255,0.09)"}`,
                  boxShadow: active ? `0 0 26px ${c.css}55, inset 0 0 22px ${c.css}22` : "none",
                  transform: active ? "translateY(-4px)" : "none",
                  clipPath: "polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-[10px] font-bold tnum"
                    style={{ color: active ? c.css : "rgba(255,255,255,0.3)" }}
                  >
                    {c.id + 1}
                  </span>
                  <span
                    className="text-xs leading-none"
                    style={{ color: active ? c.css : "rgba(255,255,255,0.22)" }}
                  >
                    {c.glyph}
                  </span>
                </div>
                <div
                  className="mt-0.5 font-display text-[10px] font-extrabold tracking-[0.18em]"
                  style={{ color: active ? "#fff" : "rgba(255,255,255,0.28)" }}
                >
                  {c.name}
                </div>
                {active && (
                  <div
                    className="absolute inset-x-0 bottom-0 h-[2px]"
                    style={{ background: c.css, boxShadow: `0 0 12px ${c.css}` }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {over && (
          <div className="anim-pop mt-2 text-center">
            <span className="font-display text-[11px] font-black tracking-[0.45em] text-white">
              OVERCHARGE {snap.overcharge.toFixed(1)}s
            </span>
            <span className="ml-2 text-[10px] uppercase tracking-[0.25em] text-white/50">
              all colours vulnerable
            </span>
          </div>
        )}
        {snap.pickupToast && !over && (
          <div key={snap.pickupToast.key} className="anim-rise mt-2 text-center">
            <span className="font-display text-[11px] font-bold tracking-[0.35em]" style={{ color: ch.css }}>
              {snap.pickupToast.text}
            </span>
          </div>
        )}
      </div>

      {/* ----------------------------------------------------- bottom right */}
      <div className="absolute bottom-6 right-6 text-right">
        <Label>accuracy</Label>
        <div className="font-display text-2xl font-bold tnum text-white/80">
          {Math.round(snap.accuracy * 100)}
          <span className="text-sm text-white/30">%</span>
        </div>
        <div className="mt-2 space-y-0.5 text-[9px] uppercase tracking-[0.22em] text-white/25">
          <div>q/e · wheel — shift spectrum</div>
          <div>shift — blink · space — vault</div>
          <div>rmb / r — prism burst</div>
          <div>m — audio · p — pause</div>
        </div>
      </div>

      {/* ----------------------------------------------------------- banner */}
      {snap.waveBanner && (
        <div
          key={snap.waveBanner.key}
          className="anim-banner absolute left-1/2 top-[26%] -translate-x-1/2 text-center"
        >
          <div
            className="font-display text-5xl font-black tracking-[0.14em] text-white"
            style={{ textShadow: `0 0 40px ${ch.css}, 0 0 90px ${ch.css}66` }}
          >
            {snap.waveBanner.title}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.5em] text-white/45">
            {snap.waveBanner.sub}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------- slowmo badge */}
      {snap.slowmo > 0.25 && snap.phase === "playing" && (
        <div className="absolute left-1/2 top-14 -translate-x-1/2">
          <div className="flex items-center gap-2 border border-white/15 bg-black/40 px-3 py-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-white/70">
              time fracture
            </span>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- lock hint */}
      {snap.phase === "playing" && !snap.locked && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="clip-slant border border-white/20 bg-black/70 px-8 py-4 text-center">
            <div className="font-display text-lg font-black tracking-[0.3em] text-white">
              CLICK TO RE-ENGAGE
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.35em] text-white/40">
              mouse capture released
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
