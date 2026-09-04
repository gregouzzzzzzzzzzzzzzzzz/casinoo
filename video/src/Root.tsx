import React from 'react';
import { Composition } from 'remotion';
import { Intro, INTRO_DURATION, INTRO_FPS } from './Intro';
import {
  GameRoulette, GameAvion, GameBlackjack, GameMines, GameDerby,
  GAME_DURATION, GAME_FPS,
} from './GameExplainers';

const game = { durationInFrames: GAME_DURATION, fps: GAME_FPS, width: 1280, height: 720 } as const;

export const Root: React.FC = () => (
  <>
    <Composition id="CasinoIntro" component={Intro} durationInFrames={INTRO_DURATION} fps={INTRO_FPS} width={1280} height={720} />
    <Composition id="GameRoulette" component={GameRoulette} {...game} />
    <Composition id="GameAvion" component={GameAvion} {...game} />
    <Composition id="GameBlackjack" component={GameBlackjack} {...game} />
    <Composition id="GameMines" component={GameMines} {...game} />
    <Composition id="GameDerby" component={GameDerby} {...game} />
  </>
);
