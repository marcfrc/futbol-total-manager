/**
 * ui/Dashboard.tsx — Inicio: próximo partido, forma, clasificación resumida y noticias.
 */

import { useSyncExternalStore } from "react";
import { career } from "@/game/career/career";
import { Ovr } from "./helpers";

export default function Dashboard({ onPlayMatch }: { onPlayMatch: () => void }) {
  const state = useSyncExternalStore(career.subscribe, career.getSnapshot);
  if (!state) return null;

  const team = career.userTeam();
  const fx = career.userFixture();
  const rival = fx ? state.teams.find((t) => t.id === (fx.homeId === team.id ? fx.awayId : fx.homeId)) : null;
  const isHome = fx?.homeId === team.id;
  const matchDone = career.userMatchDone();
  const table = career.table();
  const pos = table.findIndex((r) => r.teamId === team.id) + 1;
  const squad = career.squad();
  const xi = career.xi();
  const avgOvr = xi.length ? Math.round(xi.reduce((a, p) => a + (p.pos === "GK" ? p.gk : p.ovr), 0) / xi.length) : 0;
  const avgMor = squad.length ? Math.round(squad.reduce((a, p) => a + p.morale, 0) / squad.length) : 0;
  const lastResults = state.fixtures
    .filter((f) => f.played && (f.homeId === team.id || f.awayId === team.id))
    .slice(-5)
    .map((f) => {
      const gf = f.homeId === team.id ? f.homeGoals! : f.awayGoals!;
      const ga = f.homeId === team.id ? f.awayGoals! : f.homeGoals!;
      return gf > ga ? "V" : gf < ga ? "D" : "E";
    });

  return (
    <>
      {/* próximo partido */}
      {fx && rival && (
        <div className="next-match">
          <div className="nm-teams">
            <span>{isHome ? team.name : rival.name}</span>
            <span className="nm-vs">{isHome ? "vs (casa)" : "vs (fuera)"}</span>
            <span>{isHome ? rival.name : team.name}</span>
          </div>
          {!matchDone ? (
            <div className="nm-actions">
              <button className="btn btn-primary" onClick={onPlayMatch}>▶ Jugar partido</button>
              <button className="btn" onClick={() => { if (window.confirm("¿Simular el partido sin jugarlo?")) career.simUserMatch(); }}>⏩ Simular</button>
            </div>
          ) : (
            <div className="nm-actions">
              <button className="btn btn-primary" onClick={() => career.advanceWeek()}>Avanzar semana →</button>
            </div>
          )}
        </div>
      )}
      {!fx && !state.championTeamId && (
        <div className="next-match">
          <div className="nm-teams">Temporada completada</div>
          <button className="btn btn-primary" onClick={() => career.advanceWeek()}>Ver campeón →</button>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h2>Estado del equipo</h2>
          <table className="table">
            <tbody>
              <tr><td>Posición en liga</td><td><b>{pos}º</b> de {table.length}</td></tr>
              <tr><td>Puntos</td><td><b>{table[pos - 1]?.pts ?? 0}</b></td></tr>
              <tr><td>Media del once tipo</td><td><Ovr v={avgOvr} /></td></tr>
              <tr><td>Moral media</td><td>{avgMor}/100</td></tr>
              <tr><td>Lesionados</td><td>{squad.filter((p) => p.injuredW > 0).length}</td></tr>
              <tr>
                <td>Racha</td>
                <td>
                  {lastResults.length === 0 ? "—" : lastResults.map((r, i) => (
                    <span key={i} style={{ marginRight: 4, fontWeight: 800, color: r === "V" ? "var(--good)" : r === "D" ? "var(--bad)" : "var(--warn)" }}>{r}</span>
                  ))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Clasificación (top 5)</h2>
          <table className="table">
            <thead><tr><th>#</th><th>Equipo</th><th className="num">Pts</th><th className="num">DG</th></tr></thead>
            <tbody>
              {table.slice(0, 5).map((r, i) => {
                const t = state.teams.find((x) => x.id === r.teamId)!;
                return (
                  <tr key={r.teamId} className={r.teamId === team.id ? "me" : ""}>
                    <td className="num">{i + 1}</td>
                    <td>{t.name}</td>
                    <td className="num">{r.pts}</td>
                    <td className="num">{r.gf - r.ga > 0 ? "+" : ""}{r.gf - r.ga}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Noticias del club</h2>
        {state.news.slice(0, 9).map((n, i) => (
          <div key={i} className={`news-item ${n.kind === "good" ? "news-good" : n.kind === "bad" ? "news-bad" : ""}`}>
            <span className="wk">J{n.week + 1}</span>
            <span>{n.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}
