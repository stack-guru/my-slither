export type Vec2 = { x: number; y: number };

export type SnakeSegment = Vec2;

export type Snake = {
  id: string;
  name: string;
  color: number;
  angle: number; // radians, current heading
  desiredAngle: number; // target heading from input
  boosting: boolean;
  speedUnitsPerSec: number;
  radius: number;
  segmentSpacing: number;
  targetSegments: number; // desired number of spaced segments (length)
  segments: SnakeSegment[]; // [0] is head
};

export type Food = {
  id: number;
  x: number;
  y: number;
  radius: number;
  color: number;
};

export type PublicSnapshot = {
  tick: number;
  now: number;
  world: { width: number; height: number };
  snakes: Array<{
    id: string;
    name: string;
    color: number;
    radius: number;
    segments: Array<[number, number]>;
  }>;
  food: Array<[number, number, number, number, number]>; // id,x,y,r,color
};

export type ClientToServerMessage =
  | { type: "hello"; name?: string }
  | { type: "input"; angle: number; boost?: boolean };

export type ServerToClientMessage =
  | { type: "welcome"; id: string; world: { width: number; height: number } }
  | { type: "state"; snapshot: PublicSnapshot };


