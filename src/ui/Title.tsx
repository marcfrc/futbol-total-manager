/**
 * ui/Title.tsx — Pantalla de título: nueva carrera (elección de club) o continuar.
 */

import { useState } from "react";
import { career, CLUBS } from "@/game/career/career";
import { Stars } from "./helpers";

export default function Title() {
  const [picking, setPicking] = useState(false);
  const hasSave = career.hasSave();

  return (
    <div className="title-screen">
      <div className="title-logo">FÚTBOL<br />TOTAL MANAGER</div>
      <div className="title-sub">Juega los partidos. Dirige el club. Gana la liga.</div>

      {!picking ? (
        <div className="title-menu">
          {hasSave && (
            <button className="btn btn-primary" onClick={() => career.load()}>
              ▶ Continuar carrera
            </button>
          )}
          <button className={`btn ${hasSave ? "" : "btn-primary"}`} onClick={() => setPicking(true)}>
            ⚽ Nueva carrera
          </button>
          {hasSave && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => { if (window.confirm("¿Borrar la carrera guardada?")) career.wipe(); }}
            >
              Borrar partida guardada
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="title-sub">Elige tu club — cada uno parte de una situación distinta</div>
          <div className="club-grid">
            {CLUBS.map((c, i) => (
              <button key={c.short} className="club-card" onClick={() => career.newCareer(i)}>
                <span className="club-badge" style={{ background: c.color1 }}>{c.short}</span>
                <span className="club-name">{c.name}</span>
                <Stars v={c.prestige} />
              </button>
            ))}
          </div>
          <button className="btn btn-sm" onClick={() => setPicking(false)}>← Volver</button>
        </>
      )}

      <div className="title-sub" style={{ marginTop: 22, fontSize: 12 }}>
        Carrera local: el progreso se guarda en este navegador.
      </div>
    </div>
  );
}
