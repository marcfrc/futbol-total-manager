/**
 * ui/helpers.tsx — Componentes pequeños compartidos.
 */

import type { Player } from "@/game/career/types";
import { fmtMoney } from "@/game/career/career";

export function ovrClass(ovr: number): string {
  if (ovr >= 82) return "ovr-pill ovr-elite";
  if (ovr >= 72) return "ovr-pill ovr-good";
  if (ovr >= 62) return "ovr-pill ovr-mid";
  return "ovr-pill ovr-low";
}

export function Ovr({ v }: { v: number }) {
  return <span className={ovrClass(v)}>{v}</span>;
}

export function Bar({ v, kind }: { v: number; kind: "fit" | "mor" }) {
  return (
    <div className={`bar bar-${kind}`}>
      <i style={{ width: `${Math.round(v)}%` }} />
    </div>
  );
}

export function PosTag({ pos }: { pos: Player["pos"] }) {
  return <span className={`pos-tag pos-${pos}`}>{pos}</span>;
}

export function Money({ v, signed = false }: { v: number; signed?: boolean }) {
  const cls = signed ? (v >= 0 ? "fin-pos" : "fin-neg") : "";
  return <span className={cls}>{signed && v > 0 ? "+" : ""}{fmtMoney(v)}</span>;
}

export function Stars({ v }: { v: number }) {
  const n = Math.max(1, Math.min(5, Math.round((v - 0.55) * 8)));
  return <span className="club-prestige">{"★".repeat(n)}{"☆".repeat(5 - n)}</span>;
}
