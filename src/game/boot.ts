/**
 * boot.ts — Contrato con el shell React (src/pages/Home.tsx):
 *   startGame(canvas, setup, callbacks)  monta el partido 3D sobre el <canvas>
 *   stopGame()                           desmonta todo (loop, renderer, listeners)
 * La gestión (carrera) vive en src/game/career/ y se renderiza con React.
 */

import { startMatch, type MatchEngine } from "./match/engine";
import type { MatchCallbacks, MatchSetup } from "./match/rt";

declare global {
  interface Window {
    __gameProbe?: () => { x: number; y: number; z: number; id?: string };
    __GAME_READY__?: boolean;
  }
}

let session: MatchEngine | null = null;

export function startGame(canvas: HTMLCanvasElement, setup: MatchSetup, cb: MatchCallbacks): MatchEngine {
  stopGame();
  session = startMatch(canvas, setup, cb);
  return session;
}

export function getEngine(): MatchEngine | null {
  return session;
}

export function stopGame(): void {
  session?.dispose();
  session = null;
}
