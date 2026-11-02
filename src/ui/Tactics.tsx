/**
 * ui/Tactics.tsx — Formación, mentalidad, presión y plan de entrenamiento.
 * Todo afecta al partido 3D y a la simulación.
 */

import { useSyncExternalStore } from "react";
import { career } from "@/game/career/career";
import { FORMATION_KEYS } from "@/game/career/formations";
import { Ovr, PosTag } from "./helpers";
import type { Mentality, Pressing, TrainingFocus } from "@/game/career/types";

const MENTALITIES: { id: Mentality; label: string; desc: string }[] = [
  { id: "defensive", label: "🛡️ Defensiva", desc: "Menos goles encajados, menos ocasiones" },
  { id: "balanced", label: "⚖️ Equilibrada", desc: "Sin riesgos ni regalos" },
  { id: "attacking", label: "⚔️ Ofensiva", desc: "Más goles… y más espacios atrás" },
];

const PRESSINGS: { id: Pressing; label: string; desc: string }[] = [
  { id: "low", label: "Baja", desc: "Bloque bajo, piernas frescas" },
  { id: "mid", label: "Media", desc: "Presión selectiva" },
  { id: "high", label: "Alta", desc: "Robras antes, pero desgasta (más fatiga)" },
];

const TRAININGS: { id: TrainingFocus; label: string; desc: string }[] = [
  { id: "attack", label: "⚔️ Ataque", desc: "Progresan delanteros y medios" },
  { id: "defense", label: "🛡️ Defensa", desc: "Progresan defensas y porteros" },
  { id: "physical", label: "💪 Físico", desc: "Más recuperación, menos lesiones" },
  { id: "youth", label: "🌱 Cantera", desc: "Los jóvenes crecen más rápido" },
];

export default function Tactics() {
  const state = useSyncExternalStore(career.subscribe, career.getSnapshot);
  if (!state) return null;
  const t = state.tactics;
  const xi = career.xi();

  return (
    <>
      <div className="card">
        <h2>Formación</h2>
        <div className="chips">
          {FORMATION_KEYS.map((f) => (
            <button key={f} className={`chip ${t.formation === f ? "active" : ""}`} onClick={() => career.setTactics({ formation: f })}>
              {f}
            </button>
          ))}
        </div>

        <h3>Mentalidad</h3>
        <div className="chips">
          {MENTALITIES.map((m) => (
            <button key={m.id} className={`chip ${t.mentality === m.id ? "active" : ""}`} title={m.desc} onClick={() => career.setTactics({ mentality: m.id })}>
              {m.label}
            </button>
          ))}
        </div>

        <h3>Presión</h3>
        <div className="chips">
          {PRESSINGS.map((p) => (
            <button key={p.id} className={`chip ${t.pressing === p.id ? "active" : ""}`} title={p.desc} onClick={() => career.setTactics({ pressing: p.id })}>
              {p.label}
            </button>
          ))}
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: 12.5, marginBottom: 0 }}>
          {MENTALITIES.find((m) => m.id === t.mentality)!.desc} · {PRESSINGS.find((p) => p.id === t.pressing)!.desc}
        </p>
      </div>

      <div className="card">
        <h2>Once titular ({state.tactics.formation})</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 12.5, marginTop: -6 }}>
          Se alinea automáticamente el mejor jugador disponible de cada posición.
        </p>
        <div className="chips" style={{ gap: 8 }}>
          {xi.map((p) => (
            <span key={p.id} className="chip" style={{ cursor: "default" }}>
              <PosTag pos={p.pos} /> {p.name.split(" ").slice(-1)[0]} <Ovr v={p.pos === "GK" ? p.gk : p.ovr} />
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Plan de entrenamiento semanal</h2>
        <div className="chips">
          {TRAININGS.map((tr) => (
            <button key={tr.id} className={`chip ${state.training === tr.id ? "active" : ""}`} title={tr.desc} onClick={() => career.setTraining(tr.id)}>
              {tr.label}
            </button>
          ))}
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: 12.5, marginBottom: 0 }}>
          {TRAININGS.find((x) => x.id === state.training)!.desc}
        </p>
      </div>
    </>
  );
}
