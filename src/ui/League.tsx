/**
 * ui/League.tsx — Clasificación completa, calendario y máximos goleadores.
 */

import { useSyncExternalStore } from "react";
import { career } from "@/game/career/career";

export default function League() {
  const state = useSyncExternalStore(career.subscribe, career.getSnapshot);
  if (!state) return null;
  const team = career.userTeam();
  const table = career.table();
  const scorers = [...state.players].sort((a, b) => b.goals - a.goals).slice(0, 5);

  return (
    <>
      <div className="card">
        <h2>Clasificación</h2>
        <table className="table">
          <thead>
            <tr>
              <th>#</th><th>Equipo</th><th className="num">PJ</th>
              <th className="num">G</th><th className="num">E</th><th className="num">P</th>
              <th className="num">GF</th><th className="num">GC</th><th className="num">Pts</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r, i) => {
              const t = state.teams.find((x) => x.id === r.teamId)!;
              return (
                <tr key={r.teamId} className={r.teamId === team.id ? "me" : ""}>
                  <td className="num">{i + 1}</td>
                  <td>{t.name}</td>
                  <td className="num">{r.w + r.d + r.l}</td>
                  <td className="num">{r.w}</td>
                  <td className="num">{r.d}</td>
                  <td className="num">{r.l}</td>
                  <td className="num">{r.gf}</td>
                  <td className="num">{r.ga}</td>
                  <td className="num" style={{ color: "#e8eef4", fontWeight: 800 }}>{r.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Calendario</h2>
          <div style={{ maxHeight: 380, overflowY: "auto" }}>
            {Array.from({ length: state.rounds }, (_, r) => r).map((r) => {
              const games = state.fixtures.filter((f) => f.round === r);
              const isCurrent = r === state.week;
              return (
                <div key={r} style={{ marginBottom: 10 }}>
                  <h3 style={isCurrent ? { color: "var(--accent)" } : undefined}>
                    Jornada {r + 1} {isCurrent ? "· actual" : ""}
                  </h3>
                  {games.map((f, i) => {
                    const h = state.teams.find((t) => t.id === f.homeId)!;
                    const a = state.teams.find((t) => t.id === f.awayId)!;
                    const mine = f.homeId === team.id || f.awayId === team.id;
                    return (
                      <div key={i} className="news-item" style={mine ? { color: "var(--accent)", fontWeight: 700 } : undefined}>
                        <span style={{ flex: 1 }}>
                          {h.short} {f.played ? `${f.homeGoals} - ${f.awayGoals}` : "—"} {a.short}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h2>Pichichi</h2>
          <table className="table">
            <thead><tr><th>Jugador</th><th>Equipo</th><th className="num">Goles</th></tr></thead>
            <tbody>
              {scorers.map((p) => {
                const t = state.teams.find((x) => x.id === p.teamId);
                return (
                  <tr key={p.id} className={p.teamId === team.id ? "me" : ""}>
                    <td>{p.name}</td>
                    <td>{t?.short ?? "—"}</td>
                    <td className="num" style={{ fontWeight: 800 }}>{p.goals}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ color: "var(--text-dim)", fontSize: 12 }}>
            Los goles en partidos jugados cuentan para tus jugadores; la IA acumula los suyos en simulación.
          </p>
        </div>
      </div>
    </>
  );
}
