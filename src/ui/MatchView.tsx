/**
 * ui/MatchView.tsx — Vista del partido 3D: canvas, HUD, controles táctiles,
 * pausa y pantalla de resultado.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getEngine, startGame, stopGame } from "@/game/boot";
import type { HudState, MatchOutcome, MatchSetup } from "@/game/match/rt";

interface Props {
  setup: MatchSetup;
  onFinish: (outcome: MatchOutcome) => void;
}

export default function MatchView({ setup, onFinish }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const nubRef = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [feed, setFeed] = useState<{ id: number; text: string; kind: string }[]>([]);
  const [outcome, setOutcome] = useState<MatchOutcome | null>(null);
  const [muted, setMuted] = useState(false);
  const feedId = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    startGame(canvas, setup, {
      onHud: setHud,
      onEvent: (text, kind) => {
        setFeed((f) => [{ id: ++feedId.current, text, kind }, ...f].slice(0, 3));
      },
      onEnd: setOutcome,
    });
    // el partido se juega en horizontal: intenta bloquear la orientación
    // (funciona en PWA instalada y en Android; en navegador normal se ignora)
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };
    so.lock?.("landscape").catch(() => {});
    return () => {
      stopGame();
      so.unlock?.();
    };
  }, [setup]);

  // ---------- joystick táctil ----------
  const stickVector = useCallback((clientX: number, clientY: number) => {
    const el = stickRef.current;
    if (!el) return { x: 0, z: 0 };
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (clientX - cx) / (r.width / 2);
    let dy = (clientY - cy) / (r.height / 2);
    const mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; }
    return { x: dx, z: -dy }; // arriba en pantalla = hacia adelante (ataque)
  }, []);

  const moveNub = useCallback((x: number, y: number) => {
    const nub = nubRef.current;
    if (nub) nub.style.transform = `translate(calc(-50% + ${x * 34}px), calc(-50% + ${y * 34}px))`;
  }, []);

  const onStickDown = (e: React.PointerEvent) => {
    stickPointer.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const v = stickVector(e.clientX, e.clientY);
    getEngine()?.setMove(v.x, v.z);
    moveNub(v.x, -v.z);
  };
  const onStickMove = (e: React.PointerEvent) => {
    if (stickPointer.current !== e.pointerId) return;
    const v = stickVector(e.clientX, e.clientY);
    getEngine()?.setMove(v.x, v.z);
    moveNub(v.x, -v.z);
  };
  const onStickUp = (e: React.PointerEvent) => {
    if (stickPointer.current !== e.pointerId) return;
    stickPointer.current = null;
    getEngine()?.setMove(0, 0);
    moveNub(0, 0);
  };

  const eng = () => getEngine();

  return (
    <div className="match-view">
      <canvas id="game-canvas" ref={canvasRef} />
      {/* aviso en vertical: el partido está pensado para horizontal */}
      <div className="rotate-hint">
        <span className="rotate-ico">📱</span>
        <span>Gira el móvil para jugar en horizontal</span>
      </div>
      <div className="match-hud">
        {/* marcador */}
        <div className="scoreboard">
          <span>{setup.home.short}</span>
          <span>{hud?.homeGoals ?? 0} - {hud?.awayGoals ?? 0}</span>
          <span>{setup.away.short}</span>
          <span className="clk">{hud ? `${hud.minute}'` : "0'"}</span>
          <span className="half">{hud?.half === 2 ? "2ª" : "1ª"}</span>
        </div>

        <div className="hud-topright">
          <button className="hud-btn" title={muted ? "Activar sonido" : "Silenciar"} onClick={() => setMuted(eng()?.toggleMute() ?? false)}>
            {muted ? "🔇" : "🔊"}
          </button>
          <button className="hud-btn" title="Pausa" onClick={() => eng()?.pause()}>⏸</button>
        </div>

        {/* jugador controlado */}
        {hud?.controlledName && hud.phase !== "paused" && (
          <div className="player-tag">
            <span className="nm">🎮 {hud.controlledName}</span>
            <div className="stamina"><i style={{ width: `${hud.stamina}%` }} /></div>
          </div>
        )}

        {/* potencia de tiro */}
        {hud && hud.charging > 0 && (
          <div className="charge-wrap"><i style={{ width: `${hud.charging * 100}%` }} /></div>
        )}

        {/* mensaje central */}
        {hud?.message && <div className="match-msg">{hud.message}</div>}

        {/* ticker de eventos */}
        <div className="event-ticker">
          {feed.map((e) => <span key={e.id} className={e.kind}>{e.text}</span>)}
        </div>

        {/* controles táctiles */}
        {hud?.phase !== "paused" && hud?.phase !== "fulltime" && (
          <>
            <div
              ref={stickRef}
              className="touch-stick"
              onPointerDown={onStickDown}
              onPointerMove={onStickMove}
              onPointerUp={onStickUp}
              onPointerCancel={onStickUp}
            >
              <div ref={nubRef} className="nub" />
            </div>
            <button
              className="touch-sprint"
              onPointerDown={() => eng()?.setSprint(true)}
              onPointerUp={() => eng()?.setSprint(false)}
              onPointerCancel={() => eng()?.setSprint(false)}
            >SPRINT</button>
            <div className="touch-buttons">
              <button className="tbtn" onPointerDown={() => eng()?.pressPass()}>PASAR</button>
              <button
                className="tbtn tbtn-big"
                onPointerDown={() => eng()?.chargeStart()}
                onPointerUp={() => eng()?.chargeRelease()}
                onPointerCancel={() => eng()?.chargeRelease()}
              >TIRAR</button>
              <button className="tbtn" onPointerDown={() => eng()?.pressLob()}>GLOBO</button>
              <button className="tbtn" onPointerDown={() => eng()?.pressTackle()}>ENTRADA</button>
            </div>
          </>
        )}

        <div className="desktop-keys">
          WASD mover · Shift sprint · Espacio pasar · K (mantener) tirar · L globo · J entrada · Q cambiar · Esc pausa
        </div>
      </div>

      {/* pausa */}
      {hud?.phase === "paused" && (
        <div className="match-overlay">
          <div className="overlay-panel">
            <h2>⏸ Pausa</h2>
            <button className="btn btn-primary" onClick={() => eng()?.resume()}>Reanudar</button>
            <button className="btn" onClick={() => eng()?.simulateRest()}>⏩ Simular el resto</button>
            <button
              className="btn btn-danger"
              onClick={() => { if (window.confirm("Abandonar cuenta como derrota 0-3. ¿Seguro?")) eng()?.abandon(); }}
            >
              Abandonar partido
            </button>
            <button className="btn btn-sm" onClick={() => setMuted(eng()?.toggleMute() ?? false)}>
              {muted ? "🔇 Sonido: OFF" : "🔊 Sonido: ON"}
            </button>
          </div>
        </div>
      )}

      {/* resultado final */}
      {outcome && (
        <div className="match-overlay">
          <div className="overlay-panel">
            <h2>{outcome.abandoned ? "Partido abandonado" : "¡Final del partido!"}</h2>
            <div className="overlay-score">
              {setup.home.short} {outcome.homeGoals} - {outcome.awayGoals} {setup.away.short}
            </div>
            <div className="overlay-events">
              {outcome.events.length === 0 && <span>Sin goles. Partido de ajedrez.</span>}
              {outcome.events.map((e, i) => <span key={i}>⚽ <b>{e}</b></span>)}
              {outcome.userInjuries.length > 0 && (
                <span style={{ color: "var(--bad)" }}>🚑 {outcome.userInjuries.length} lesionado(s) en tu equipo</span>
              )}
            </div>
            <button className="btn btn-primary" onClick={() => onFinish(outcome)}>
              Continuar →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
