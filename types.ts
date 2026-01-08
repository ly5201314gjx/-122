
export enum SegmentType {
  STRAIGHT = 'STRAIGHT',
  TURN_LEFT = 'TURN_LEFT',
  TURN_RIGHT = 'TURN_RIGHT',
  U_TURN = 'U_TURN', // 新增掉头
  LANE_CHANGE_LEFT = 'LANE_CHANGE_LEFT',
  LANE_CHANGE_RIGHT = 'LANE_CHANGE_RIGHT'
}

export enum EventType {
  // 车辆操作
  GEAR_1 = 'GEAR_1',
  GEAR_2 = 'GEAR_2',
  GEAR_3 = 'GEAR_3',
  GEAR_4 = 'GEAR_4',
  TURN_SIGNAL_LEFT = 'TURN_SIGNAL_LEFT',
  TURN_SIGNAL_RIGHT = 'TURN_SIGNAL_RIGHT',
  LOOK_AROUND = 'LOOK_AROUND',
  SLOW_DOWN = 'SLOW_DOWN',
  STOP = 'STOP',
  HORN = 'HORN',
  CHANGE_LANE_LEFT = 'CHANGE_LANE_LEFT',
  CHANGE_LANE_RIGHT = 'CHANGE_LANE_RIGHT',
  OVERTAKE = 'OVERTAKE', // 超车动作

  // 环境设施 (新增)
  TRAFFIC_LIGHT = 'TRAFFIC_LIGHT',
  CROSSWALK = 'CROSSWALK',
  SCHOOL_ZONE = 'SCHOOL_ZONE',
  BUS_STOP = 'BUS_STOP'
}

export interface RouteMarker {
  id: string;
  type: EventType;
  distanceOffset: number;
  label: string;
}

export interface RouteSegment {
  id: string;
  type: SegmentType;
  length: number; // meters
  laneCount: number; // 单侧车道数量 (1, 2, 3)
  turnAngle?: number; // 转弯角度 (度)，仅对转弯有效
  markers: RouteMarker[];
}

export interface Coordinates {
  x: number;
  y: number;
  angle: number;
}

export interface SavedRoute {
  id: string;
  name: string;
  timestamp: number;
  segments: RouteSegment[];
}
