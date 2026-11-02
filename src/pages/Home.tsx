/**
 * Home.tsx — Orquestador: título → gestión (hub) → partido 3D.
 * El canvas solo se monta durante los partidos; la gestión es DOM/React.
 */

import { useCallback, useEffect, useState } from "react";
import { useSyncExternalStore } from "react";
import { career } from "@/game/career/career";
import { bestXI } from "@/game/career/sim";
import type { CareerState, MatchResult, Player } from "@/game/career/types";
import type { MatchOutcome, MatchSetup, SideSetup } from "@/game/match/rt";
import Title from "@/ui/Title";
import Hub from "@/ui/Hub";
import MatchView from "@/ui/MatchView";

function toLite(p: Player) {
  return {
    id: p.id, name: p.name, pos: p.pos,
    pac: p.pac, sho: p.sho, pas: p.pas, def: p.def, gk: p.gk, sta: p.sta,
    ovr: p.ovr, fitness: p.fitness,
  };
}

function buildMatchSetup(state: CareerState): MatchSetup | null {
  const fx = state.fixtures.find(
    (f) => f.round === state.week && (f.homeId === state.userTeamId || f.awayId === state.userTeamId) && !f.played,
  );
  if (!fx) return null;

  const mkSide = (teamId: string): SideSetup => {
    const t = state.teams.find((x) => x.id === teamId)!;
    const tactics = teamId === state.userTeamId ? state.tactics : career.aiTacticsFor(teamId);
    const xi = bestXI(state.players, teamId, tactics.formation);
    return {
      name: t.name, short: t.short, color1: t.color1, color2: t.color2,
      xi: xi.map(toLite),
      formation: tactics.formation,
      mentality: tactics.mentality,
      pressing: tactics.pressing,
    };
  };

  return {
    home: mkSide(fx.homeId),
    away: mkSide(fx.awayId),
    userSide: fx.homeId === state.userTeamId ? "home" : "away",
    seed: (state.seed ^ (state.week * 2654435761) ^ (state.season * 97)) >>> 0,
    strength: career.matchStrengths(fx.homeId, fx.awayId),
  };
}

declare global {
  interface Window {
    __FTM_DEBUG__?: { quickMatch: () => void; career: typeof career };
  }
}

export default function Home() {
  const state = useSyncExternalStore(career.subscribe, career.getSnapshot);
  const [matchSetup, setMatchSetup] = useState<MatchSetup | null>(null);
  const [matchFixture, setMatchFixture] = useState<{ homeId: string; awayId: string } | null>(null);

  const startUserMatch = useCallback(() => {
    const s = career.getSnapshot();
    if (!s) return;
    const setup = buildMatchSetup(s);
    if (!setup) return;
    const fx = career.userFixture()!;
    setMatchFixture({ homeId: fx.homeId, awayId: fx.awayId });
    setMatchSetup(setup);
  }, []);

  const finishMatch = useCallback((outcome: MatchOutcome) => {
    if (!matchFixture) return;
    const result: MatchResult = {
      homeId: matchFixture.homeId,
      awayId: matchFixture.awayId,
      homeGoals: outcome.homeGoals,
      awayGoals: outcome.awayGoals,
      events: outcome.events,
      playedByUser: !outcome.abandoned,
      userScorerIds: outcome.userScorerIds,
      allScorerIds: outcome.allScorerIds,
      userInjuries: outcome.userInjuries,
    };
    career.recordUserResult(result);
    setMatchSetup(null);
    setMatchFixture(null);
  }, [matchFixture]);

  // gancho de verificación automática: entra directo a un partido
  useEffect(() => {
    window.__FTM_DEBUG__ = {
      quickMatch: () => {
        if (!career.getSnapshot()) career.newCareer(0);
        if (!career.userMatchDone()) startUserMatch();
      },
      career,
    };
    return () => { delete window.__FTM_DEBUG__; };
  }, [startUserMatch]);

  if (matchSetup) return <MatchView setup={matchSetup} onFinish={finishMatch} />;
  if (!state) return <Title />;
  return <Hub onPlayMatch={startUserMatch} />;
}
