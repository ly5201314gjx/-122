import { RouteSegment, SegmentType, EventType } from '../types';

export const analyzeRoute = async (segments: RouteSegment[]): Promise<string> => {
  return "AI 功能已禁用（部署优化模式）。请联系管理员重新开启此功能。";
};

export const generateRoute = async (difficulty: 'easy' | 'medium' | 'hard'): Promise<RouteSegment[]> => {
  // Return a static example route to prevent application crash when clicking the button
  await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay
  
  return [
    {
      id: `gen-${Date.now()}-1`,
      type: SegmentType.STRAIGHT,
      length: 100,
      laneCount: 3,
      markers: []
    },
    {
      id: `gen-${Date.now()}-2`,
      type: SegmentType.TURN_LEFT,
      length: 50,
      laneCount: 3,
      markers: [],
      turnAngle: 90
    },
    {
      id: `gen-${Date.now()}-3`,
      type: SegmentType.STRAIGHT,
      length: 150,
      laneCount: 3,
      markers: [
        {
          id: `m-demo-1`,
          type: EventType.GEAR_3,
          distanceOffset: 20,
          label: '3档'
        }
      ]
    }
  ];
};