import React from 'react';
import { Composition } from 'remotion';
import { Intro, INTRO_DURATION, INTRO_FPS } from './Intro';

export const Root: React.FC = () => (
  <Composition
    id="CasinoIntro"
    component={Intro}
    durationInFrames={INTRO_DURATION}
    fps={INTRO_FPS}
    width={1280}
    height={720}
  />
);
