/**
 * ui/Market.tsx — Mercado de fichajes: compra de jugadores libres. Se renueva cada semana.
 */

import { useSyncExternalStore } from "react";
import { career } from "@/game/career/career";
import { Money, Ovr, PosTag } from "./helpers";

export default function Market() {
  const state = useSyncExternalStore(career.subscribe, career.getSnapshot);
  if (!state) return null;
  const team = career.userTeam();

  return (
    <div className="card">
      <div className="section-title-row">
        <h2>Mercado de fichajes</h2>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Se renueva al avanzar de semana · vende desde Plantilla</span>
      </div>
      {state.market.length === 0 && <div className="empty-hint">No hay jugadores disponibles esta semana.</div>}
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Jugador</th><th>Pos</th><th className="num">Edad</th>
              <th className="num">Media</th><th className="num">Pot.</th>
              <th className="num">Rit</th><th className="num">Tir</th><th className="num">Pas</th><th className="num">Def</th>
              <th className="num">Precio</th><th></th>
            </tr>
          </thead>
          <tbody>
            {state.market.map((m, i) => (
              <tr key={m.player.id}>
                <td>{m.player.name}</td>
                <td><PosTag pos={m.player.pos} /></td>
                <td className="num">{m.player.age}</td>
                <td className="num"><Ovr v={m.player.ovr} /></td>
                <td className="num" style={{ color: "var(--text-dim)" }}>{m.player.pot}</td>
                <td className="num">{m.player.pac}</td>
                <td className="num">{m.player.sho}</td>
                <td className="num">{m.player.pas}</td>
                <td className="num">{m.player.def}</td>
                <td className="num"><Money v={m.asking} /></td>
                <td>
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={team.budget < m.asking}
                    onClick={() => {
                      const err = career.buyPlayer(i);
                      if (err) window.alert(err);
                    }}
                  >
                    Fichar
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
