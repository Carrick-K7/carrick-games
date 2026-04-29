export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ParkingSpot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ParkingTechnique =
  | 'front-bay-top'
  | 'front-bay-bottom'
  | 'reverse-bay-top'
  | 'reverse-bay-bottom'
  | 'parallel-right'
  | 'reverse-parallel-right'
  | 'angled-bay'
  | 'tight-garage'
  | 'alley-weave'
  | 'precision-curb';

export interface Level {
  id: string;
  technique: ParkingTechnique;
  variant: number;
  playerStart: { x: number; y: number; angle: number };
  obstacles: Obstacle[];
  spot: ParkingSpot;
  targetAngle?: number;
}

export interface ParkingDemoWaypoint {
  x: number;
  y: number;
}

export interface ParkingDemoPose {
  x: number;
  y: number;
  angle: number;
}

export interface ParkingDemoRoute {
  waypoints: ParkingDemoWaypoint[];
  poses: ParkingDemoPose[];
  finalAngle: number;
  arrivalAngle: number;
  length: number;
  clearance: number;
}
