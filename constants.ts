import { EventType, SegmentType } from './types';
import { 
  ArrowUp, 
  CornerUpLeft, 
  CornerUpRight, 
  ArrowLeftRight, 
  Gauge, 
  Eye, 
  AlertOctagon, 
  Volume2,
  MoveLeft,
  MoveRight,
  RefreshCcw,
  Footprints, // For Crosswalk
  TrafficCone, // For School/Bus
  Zap, // Overtake
  Lightbulb // Traffic Light placeholder
} from 'lucide-react';

export const PIXELS_PER_METER = 5;
export const LANE_WIDTH_METERS = 3.5;
export const CAR_WIDTH = 2; 
export const CAR_LENGTH = 4.5; 

export const SEGMENT_CONFIG = {
  [SegmentType.STRAIGHT]: { label: '直线行驶', icon: ArrowUp, defaultLen: 100 },
  [SegmentType.TURN_LEFT]: { label: '左转弯', icon: CornerUpLeft, defaultLen: 50 },
  [SegmentType.TURN_RIGHT]: { label: '右转弯', icon: CornerUpRight, defaultLen: 50 },
  [SegmentType.U_TURN]: { label: '掉头', icon: RefreshCcw, defaultLen: 30 },
  [SegmentType.LANE_CHANGE_LEFT]: { label: '道路变窄(左)', icon: MoveLeft, defaultLen: 60 },
  [SegmentType.LANE_CHANGE_RIGHT]: { label: '道路变窄(右)', icon: MoveRight, defaultLen: 60 },
};

export const EVENT_CONFIG = {
  // 动作类
  [EventType.GEAR_1]: { label: '1档', color: 'bg-yellow-500', icon: Gauge, isEnv: false },
  [EventType.GEAR_2]: { label: '2档', color: 'bg-yellow-600', icon: Gauge, isEnv: false },
  [EventType.GEAR_3]: { label: '3档', color: 'bg-green-500', icon: Gauge, isEnv: false },
  [EventType.GEAR_4]: { label: '4档', color: 'bg-blue-500', icon: Gauge, isEnv: false },
  [EventType.TURN_SIGNAL_LEFT]: { label: '左转向灯', color: 'bg-orange-500', icon: ArrowLeftRight, isEnv: false },
  [EventType.TURN_SIGNAL_RIGHT]: { label: '右转向灯', color: 'bg-orange-500', icon: ArrowLeftRight, isEnv: false },
  [EventType.LOOK_AROUND]: { label: '左右观察', color: 'bg-purple-500', icon: Eye, isEnv: false },
  [EventType.SLOW_DOWN]: { label: '减速', color: 'bg-red-500', icon: AlertOctagon, isEnv: false },
  [EventType.STOP]: { label: '停车', color: 'bg-red-700', icon: AlertOctagon, isEnv: false },
  [EventType.HORN]: { label: '鸣笛', color: 'bg-gray-500', icon: Volume2, isEnv: false },
  [EventType.CHANGE_LANE_LEFT]: { label: '向左变道', color: 'bg-indigo-500', icon: MoveLeft, isEnv: false },
  [EventType.CHANGE_LANE_RIGHT]: { label: '向右变道', color: 'bg-indigo-500', icon: MoveRight, isEnv: false },
  [EventType.OVERTAKE]: { label: '超车动作', color: 'bg-rose-500', icon: Zap, isEnv: false },

  // 环境类
  [EventType.TRAFFIC_LIGHT]: { label: '红绿灯路口', color: 'bg-red-500', icon: Lightbulb, isEnv: true },
  [EventType.CROSSWALK]: { label: '人行横道', color: 'bg-white', text: 'text-slate-900', icon: Footprints, isEnv: true },
  [EventType.SCHOOL_ZONE]: { label: '学校区域', color: 'bg-yellow-400', text: 'text-slate-900', icon: TrafficCone, isEnv: true },
  [EventType.BUS_STOP]: { label: '公交车站', color: 'bg-blue-400', icon: TrafficCone, isEnv: true },
};

export const INITIAL_SEGMENTS = [
  { id: '1', type: SegmentType.STRAIGHT, length: 200, laneCount: 3, markers: [], turnAngle: 90 },
];