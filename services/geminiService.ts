import { GoogleGenAI, Type } from "@google/genai";
import { RouteSegment, SegmentType, EventType } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const MODEL_NAME = 'gemini-3-flash-preview';

export const analyzeRoute = async (segments: RouteSegment[]): Promise<string> => {
  if (!process.env.API_KEY) return "错误：未找到 API Key，无法分析。";

  const prompt = `
    你是一位严格的中国驾考科目三考试员。
    请分析以下驾驶路线和考试项目标记。
    请指出任何逻辑错误（例如：在短距离转弯时挂入4档、变道未打转向灯、转弯未减速、通过路口未观察等）。
    请使用中文回答，语言风格简练、专业、严厉。
    
    路线数据:
    ${JSON.stringify(segments.map(s => ({
      type: s.type,
      length: s.length,
      markers: s.markers.map(m => m.type)
    })), null, 2)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: "你是一位专业的中国驾校教练助手。",
      }
    });
    return response.text || "暂无分析结果。";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "AI 分析失败，请稍后重试。";
  }
};

export const generateRoute = async (difficulty: 'easy' | 'medium' | 'hard'): Promise<RouteSegment[]> => {
  if (!process.env.API_KEY) throw new Error("API Key missing");

  // Keep internal Types in English for parsing, but context is Chinese exam
  const prompt = `Generate a JSON driving route for a Chinese Subject 3 driving exam. Difficulty: ${difficulty}.
  Return an array of segments. 
  Available Types: STRAIGHT, TURN_LEFT, TURN_RIGHT, LANE_CHANGE_LEFT, LANE_CHANGE_RIGHT.
  Default lengths: Straight (100-300m), Turns (50m), Lane Changes (60m).
  
  Format:
  [
    { "type": "STRAIGHT", "length": 200, "markers": ["GEAR_1", "TURN_SIGNAL_LEFT"] }
  ]
  
  Markers are optional hints of what happens. 
  Map marker strings to: GEAR_1, GEAR_2, GEAR_3, GEAR_4, TURN_SIGNAL_LEFT, TURN_SIGNAL_RIGHT, LOOK_AROUND, SLOW_DOWN, STOP.
  The sequence should make logical sense for a driving test (e.g. start with Gear 1, then Gear 2).
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              length: { type: Type.NUMBER },
              markers: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING } 
              }
            }
          }
        }
      }
    });

    const rawData = JSON.parse(response.text || "[]");
    
    // Transform to internal format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rawData.map((item: any, index: number) => ({
      id: `gen-${Date.now()}-${index}`,
      type: item.type as SegmentType,
      length: item.length,
      markers: (item.markers || []).map((m: string, mIdx: number) => ({
        id: `m-${index}-${mIdx}`,
        type: m as EventType,
        distanceOffset: item.length * 0.2 * (mIdx + 1), // Distribute markers roughly
        label: m // The code downstream will look up the Chinese label from EVENT_CONFIG
      }))
    }));

  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
};