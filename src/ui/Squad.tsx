/**
 * ui/Squad.tsx — Plantilla: rendimiento, estado físico/moral, ventas.
 */

import { useSyncExternalStore } from "react";
import { career } from "@/game/career/career";
import { Bar, Money, Ovr, PosTag } from "./helpers";

export default function Squad() {
  const state = useSyncExternalStore(career.subscribe, career.getSnapshot);
  if (!state) return null;
  const squad = career.squad();
  const xiIds = new Set(career.xi().map((p) => p.id));

  return (
    <div className="card">
      <div className="section-title-row">
        <h2>Plantilla ({squad.length}/24)</h2>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>★ = titular según tu táctica · vender ingresa al instante</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th></th><th>Jugador</th><th>Pos</th><th className="num">Edad</th>
              <th className="num">Media</th><th className="num">Pot.</th>
              <th>Forma</th><th>Moral</th>
              <th className="num">Goles</th><th className="num">Salario</th><th className="num">Valor</th><th></th>
            </tr>
          </thead>
          <tbody>
            {squad.map((p) => (
              <tr key={p.id}>
                <td>{xiIds.has(p.id) ? "★" : ""}</td>
                <td>
                  {p.name}
                  {p.injuredW > 0 && <span className="injured"> 🚑{p.injuredW}sem</span>}
                </td>
                <td><PosTag pos={p.pos} /></td>
                <td className="num">{p.age}</td>
                <td className="num"><Ovr v={p.ovr} /></td>
                <td className="num" style={{ color: "var(--text-dim)" }}>{p.pot}</td>
                <td><Bar v={p.fitness} kind="fit" /></td>
                <td><Bar v={p.morale} kind="mor" /></td>
                <td className="num">{p.goals}</td>
                <td className="num"><Money v={p.wage} /></td>
                <td className="num"><Money v={p.value} /></td>
                <td>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      const err = career.sellPlayer(p.id);
                      if (err) window.alert(err);
                    }}
                  >
                    Vender
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
