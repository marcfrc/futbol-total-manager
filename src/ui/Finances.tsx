/**
 * ui/Finances.tsx — Libro de cuentas del club.
 */

import { useSyncExternalStore } from "react";
import { career } from "@/game/career/career";
import { Money } from "./helpers";

export default function Finances() {
  const state = useSyncExternalStore(career.subscribe, career.getSnapshot);
  if (!state) return null;
  const team = career.userTeam();
  const wages = career.wageBill();
  const entries = state.finances.slice(0, 24);
  const weeklyNet = 34000 * team.prestige + 8000 - wages;

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <h2>Balance</h2>
          <table className="table">
            <tbody>
              <tr><td>Presupuesto actual</td><td><b className={team.budget < 0 ? "fin-neg" : "fin-pos"}><Money v={team.budget} /></b></td></tr>
              <tr><td>Masa salarial semanal</td><td><Money v={-wages} signed /></td></tr>
              <tr><td>Patrocinio semanal</td><td><Money v={34000 * team.prestige + 8000} signed /></td></tr>
              <tr><td>Balance semanal estimado</td><td><b><Money v={weeklyNet} signed /></b></td></tr>
            </tbody>
          </table>
          <p style={{ color: "var(--text-dim)", fontSize: 12.5 }}>
            La taquilla de cada partido depende de la categoría del club y de los goles. Si el presupuesto
            cae por debajo de <b>-250 k€</b>, el club quiebra.
          </p>
        </div>
        <div className="card">
          <h2>Movimientos</h2>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {entries.map((f, i) => (
              <div key={i} className="news-item">
                <span className="wk">J{f.week + 1}</span>
                <span style={{ flex: 1 }}>{f.label}</span>
                <b><Money v={f.amount} signed /></b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
