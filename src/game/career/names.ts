/**
 * career/names.ts — Cantera de nombres ficticios y PRNG con semilla.
 * Clubes y futbolistas inventados: sin licencias reales.
 */

/** mulberry32 — PRNG determinista con semilla. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FIRST_NAMES = [
  "Adri", "Aitor", "Álvaro", "Andoni", "Biel", "Brais", "Carles", "César", "Dani", "Darío",
  "Èric", "Fede", "Fer", "Gael", "Gonzalo", "Héctor", "Iker", "Íñigo", "Izan", "Joan",
  "Jordi", "Jules", "Kilian", "Leo", "Lisandro", "Luca", "Marc", "Martín", "Mateo", "Mikel",
  "Nabil", "Nico", "Nil", "Oier", "Pau", "Pol", "Quim", "Raúl", "Rober", "Samu",
  "Santi", "Sergi", "Teo", "Thiago", "Unai", "Víctor", "Xabi", "Yeray", "Youssef", "Zaid",
];

export const LAST_NAMES = [
  "Alberdi", "Aramburu", "Beltrán", "Cabral", "Campos", "Cardoso", "Castelló", "Cendoya", "Delmiro", "Echavarría",
  "Elizalde", "Falcó", "Ferrandis", "Gallardo", "Garmendia", "Goicoechea", "Herrasti", "Iriarte", "Izagirre", "Lacambra",
  "Larrazábal", "Lekue", "Mendizábal", "Miramón", "Muguruza", "Navascués", "Olabarri", "Ormazábal", "Palacios", "Quevedo",
  "Rementería", "Salaberri", "Solozábal", "Tellería", "Ugalde", "Urdaneta", "Valbuena", "Vergara", "Yanguas", "Zaldua",
  "Abaroa", "Benegas", "Cisneros", "Domecq", "Estébanez", "Forgas", "Gurruchaga", "Ledesma", "Mancebo", "Zubizarreta",
];

export interface ClubDef {
  name: string;
  short: string;
  color1: string;
  color2: string;
  prestige: number; // 0.6 - 1.15
}

export const CLUBS: ClubDef[] = [
  { name: "Atlético Valdés", short: "VAL", color1: "#c8102e", color2: "#101018", prestige: 1.1 },
  { name: "Real Bosque", short: "BOS", color1: "#0d5c2e", color2: "#f5f5f0", prestige: 1.0 },
  { name: "Unión Puerto", short: "UNI", color1: "#0a3d91", color2: "#ffffff", prestige: 0.95 },
  { name: "Deportivo Lanza", short: "LAN", color1: "#e8b400", color2: "#1a1a1a", prestige: 0.9 },
  { name: "C.D. Mirador", short: "MIR", color1: "#7b2d8b", color2: "#0e0e14", prestige: 0.85 },
  { name: "Sporting Riscal", short: "RIS", color1: "#0e7490", color2: "#e8f4f8", prestige: 0.8 },
  { name: "F.C. Cantera", short: "CAN", color1: "#d95b0e", color2: "#14202e", prestige: 0.72 },
  { name: "River Tormes", short: "TOR", color1: "#3355cc", color2: "#ffd24d", prestige: 0.65 },
];
