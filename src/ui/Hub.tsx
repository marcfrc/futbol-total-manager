/**
 * ui/Hub.tsx — Centro de gestión: cabecera del club, pestañas y modales de temporada.
 */

import { useState } from "react";
import { useSyncExternalStore } from "react";
import { career } from "@/game/career/career";
import Dashboard from "./Dashboard";
import Squad from "./Squad";
import Tactics from "./Tactics";
import Market from "./Market";
import League from "./League";
import Finances from "./Finances";
import { Money } from "./helpers";

const TABS = [
  { id: "inicio", label: "Inicio", ico: "🏟️" },
  { id: "plantilla", label: "Plantilla", ico: "👥" },
  { id: "tacticas", label: "Tácticas", ico: "♟️" },
  { id: "mercado", label: "Mercado", ico: "💼" },
  { id: "liga", label: "Liga", ico: "🏆" },
  { id: "finanzas", label: "Finanzas", ico: "💰" },
] as const;

export default function Hub({ onPlayMatch }: { onPlayMatch: () => void }) {
  const state = useSyncExternalStore(career.subscribe, career.getSnapshot);
  const [tab, setTab] = useState<string>("inicio");
  if (!state) return null;

  const team = career.userTeam();
  const seasonDone = !!state.championTeamId;
  const champion = state.teams.find((t) => t.id === state.championTeamId);

  return (
    <div className="hub">
      <header className="hub-header">
        <div className="hub-club">
          <span className="hub-badge" style={{ background: team.color1 }}>{team.short}</span>
          {team.name}
        </div>
        <div className="hub-meta">
          <span className="hub-stat">Temporada <b>{state.season}</b></span>
          <span className="hub-stat">Jornada <b>{Math.min(state.week + 1, state.rounds)}/{state.rounds}</b></span>
          <span className="hub-stat">Presupuesto <b className={team.budget < 0 ? "neg" : ""}><Money v={team.budget} /></b></span>
        </div>
      </header>

      <main className="hub-body">
        <div className="hub-body-inner">
          {tab === "inicio" && <Dashboard onPlayMatch={onPlayMatch} />}
          {tab === "plantilla" && <Squad />}
          {tab === "tacticas" && <Tactics />}
          {tab === "mercado" && <Market />}
          {tab === "liga" && <League />}
          {tab === "finanzas" && <Finances />}
        </div>
      </main>

      <nav className="hub-nav">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            <span className="ico">{t.ico}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* temporada finalizada */}
      {seasonDone && champion && !state.gameOver && (
        <div className="modal-back">
          <div className="overlay-panel">
            <h2>🏆 Fin de la temporada {state.season}</h2>
            <div className="overlay-score" style={{ fontSize: 22 }}>{champion.name}</div>
            <p style={{ textAlign: "center", color: "var(--text-dim)", margin: 0 }}>
              {champion.id === state.userTeamId
                ? "¡ENHORABUENA, CAMPEÓN! La ciudad está de fiesta."
                : `El título se lo lleva ${champion.name}. El año que viene será el vuestro.`}
            </p>
            <button className="btn btn-primary" onClick={() => career.nextSeason()}>
              Comenzar temporada {state.season + 1} →
            </button>
          </div>
        </div>
      )}

      {/* quiebra */}
      {state.gameOver && (
        <div className="modal-back">
          <div className="overlay-panel">
            <h2>💀 Quiebra</h2>
            <p style={{ textAlign: "center", color: "var(--text-dim)" }}>
              Las cuentas del club no aguantan más. La directiva te destituye… pero siempre puedes volver a empezar.
            </p>
            <button className="btn btn-primary" onClick={() => career.wipe()}>Nueva carrera</button>
          </div>
        </div>
      )}
    </div>
  );
}
