import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "./game/engine";
import type { Snapshot } from "./game/engine";
import { audio } from "./game/audio";
import Hud from "./components/Hud";
import { DeadScreen, MenuScreen, PauseScreen } from "./components/Screens";
import type { ScreenHandlers } from "./components/Screens";

const INITIAL: Snapshot = {
  phase: "menu",
  locked: false,
  hp: 100,
  maxHp: 100,
  shield: 0,
  score: 0,
  best: 0,
  combo: 0,
  mult: 1,
  comboTime: 0,
  wave: 0,
  waveBanner: null,
  enemiesLeft: 0,
  channel: 0,
  saturation: 0,
  overcharge: 0,
  dashCharges: 2,
  dashMax: 2,
  dashRecharge: 1,
  kills: 0,
  accuracy: 0,
  elapsed: 0,
  boss: null,
  aim: 0,
  hurt: 0,
  slowmo: 0,
  muted: false,
  sensitivity: 1,
  pickupToast: null,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [snap, setSnap] = useState<Snapshot>(INITIAL);
  const [booted, setBooted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(
      typeof window !== "undefined" &&
        (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window),
    );
  }, []);

  // first gesture anywhere wakes the ambient spectrum drone
  useEffect(() => {
    const kick = () => {
      audio.resume();
      audio.startDrone();
    };
    window.addEventListener("pointerdown", kick, { once: true });
    window.addEventListener("keydown", kick, { once: true });
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let game: Game;
    try {
      game = new Game(canvas, setSnap);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    gameRef.current = game;
    (window as unknown as Record<string, unknown>).__game = game;
    const id = window.setTimeout(() => setBooted(true), 260);
    return () => {
      window.clearTimeout(id);
      game.dispose();
      gameRef.current = null;
    };
  }, []);

  const handlers: ScreenHandlers = {
    onBegin: useCallback(() => {
      audio.resume();
      gameRef.current?.beginRun();
    }, []),
    onResume: useCallback(() => gameRef.current?.resume(), []),
    onRestart: useCallback(() => {
      audio.resume();
      gameRef.current?.beginRun();
    }, []),
    onMenu: useCallback(() => {
      if (document.pointerLockElement) document.exitPointerLock();
      gameRef.current?.toMenu();
    }, []),
    onToggleMute: useCallback(() => {
      const g = gameRef.current;
      if (g) g.setMuted(!g.muted);
    }, []),
    onSensitivity: useCallback((v: number) => gameRef.current?.setSensitivity(v), []),
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#07050f]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* boot veil */}
      <div
        className={`pointer-events-none absolute inset-0 z-30 bg-[#07050f] transition-opacity duration-700 ${
          booted && !error ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="flex h-full w-full items-center justify-center">
          <div className="text-center font-hud">
            <div className="font-display text-2xl font-black tracking-[0.5em] text-white/80">
              PRISMBREAK
            </div>
            <div className="mx-auto mt-4 h-[2px] w-40 overflow-hidden bg-white/10">
              <div className="anim-sweep h-full w-12 bg-white/70" />
            </div>
            <div className="mt-3 text-[10px] uppercase tracking-[0.4em] text-white/30">
              calibrating spectrum
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#07050f] p-8 font-hud">
          <div className="max-w-md border-l-2 border-[#ff5470] bg-[rgba(20,6,14,0.8)] p-6">
            <div className="font-display text-lg font-black tracking-[0.2em] text-white">
              WEBGL UNAVAILABLE
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/55">
              PRISMBREAK needs a WebGL2-capable browser with hardware acceleration enabled.
            </p>
            <p className="mt-2 break-words text-[10px] text-white/30">{error}</p>
          </div>
        </div>
      )}

      {!error && (
        <>
          <Hud snap={snap} />
          {snap.phase === "menu" && !isTouch && <MenuScreen snap={snap} h={handlers} />}
          {snap.phase === "paused" && <PauseScreen snap={snap} h={handlers} />}
          {snap.phase === "dead" && <DeadScreen snap={snap} h={handlers} />}
          {snap.phase === "menu" && isTouch && (
            <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-[rgba(5,4,12,0.9)] p-8 font-hud">
              <div className="max-w-sm border-l-2 border-[#25e6ff] bg-[rgba(10,8,24,0.9)] p-6">
                <div className="font-display text-lg font-black tracking-[0.2em] text-white">
                  MOUSE REQUIRED
                </div>
                <p className="mt-2 text-xs leading-relaxed text-white/55">
                  PRISMBREAK uses pointer-lock aiming and a keyboard spectrum shifter. Open it on a
                  desktop or laptop to play.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
