import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RouteSegment, SegmentType, EventType, RouteMarker } from './types';
import { INITIAL_SEGMENTS, SEGMENT_CONFIG, EVENT_CONFIG } from './constants';
import RoadCanvas from './components/RoadCanvas';
import Controls from './components/Controls';
import { analyzeRoute, generateRoute } from './services/geminiService';
import { MessageSquare, X, Gauge, ArrowBigUp, ArrowBigDown, Repeat, ArrowLeftRight, Play, Pause, RotateCcw, Zap } from 'lucide-react';

const App: React.FC = () => {
  const [segments, setSegments] = useState<RouteSegment[]>(INITIAL_SEGMENTS);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(INITIAL_SEGMENTS[0]?.id || null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [distance, setDistance] = useState(0);
  const [speed, setSpeed] = useState(0); // km/h
  const [gear, setGear] = useState(1);
  const [currentLane, setCurrentLane] = useState(2); // Initialized to 2 (Leftmost in 3-lane config, closest to center)
  const [turnSignal, setTurnSignal] = useState<'left' | 'right' | 'none'>('none');
  const [viewMode, setViewMode] = useState<'driver' | 'macro'>('driver');
  const [overtakeDir, setOvertakeDir] = useState<'left' | 'right'>('left');
  
  const [steeringAngle, setSteeringAngle] = useState(0); // Visual steering angle
  const targetSteeringAngleRef = useRef(0);
  
  const [logs, setLogs] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  
  // Interaction Modal State
  const [markerModal, setMarkerModal] = useState<{
    segmentId: string;
    offset: number;
    screenX: number;
    screenY: number;
  } | null>(null);

  const requestRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number | undefined>(undefined);
  const overtakeTimeoutRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalRouteLength = segments.reduce((acc, seg) => acc + seg.length, 0);

  // Manual Controls Handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
      if (!isPlaying) return;
      
      switch(e.key) {
          case 'ArrowUp':
          case 'w':
              setSpeed(s => Math.min(s + 2, 80));
              break;
          case 'ArrowDown':
          case 's':
              setSpeed(s => Math.max(s - 5, 0));
              break;
          case 'ArrowLeft':
          case 'a':
              changeLane('left');
              break;
          case 'ArrowRight':
          case 'd':
              changeLane('right');
              break;
      }
  }, [isPlaying]);

  useEffect(() => {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);


  // Simulation Loop
  const animate = useCallback((time: number) => {
    if (lastTimeRef.current !== undefined) {
      const deltaTime = (time - lastTimeRef.current) / 1000; // seconds
      const currentSpeedMps = speed / 3.6;
      
      setDistance(prev => {
        let next = prev + (currentSpeedMps * deltaTime);
        if (next < 0) next = 0;
        if (next >= totalRouteLength) {
           setIsPlaying(false);
           setLogs(p => ["抵达终点，考试结束", ...p]);
           return totalRouteLength; 
        }
        return next;
      });

      // Smooth steering animation
      setSteeringAngle(prev => {
         const diff = targetSteeringAngleRef.current - prev;
         if (Math.abs(diff) < 0.5) return targetSteeringAngleRef.current;
         return prev + diff * 0.1; 
      });
    }
    lastTimeRef.current = time;
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    }
  }, [isPlaying, speed, totalRouteLength]);

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      lastTimeRef.current = undefined;
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, animate]);


  // Actions
  const addSegment = (type: SegmentType) => {
    const newSeg: RouteSegment = {
      id: `seg-${Date.now()}`,
      type,
      length: SEGMENT_CONFIG[type].defaultLen,
      laneCount: 3, // Default to 3 lanes
      markers: [],
      turnAngle: 90 
    };
    setSegments(prev => {
        const next = [...prev, newSeg];
        setSelectedSegmentId(newSeg.id); // Auto select new
        return next;
    });
  };

  const updateSegment = (id: string, updates: Partial<RouteSegment>) => {
      setSegments(segments.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeSegment = (id: string) => {
    setSegments(prev => {
        const next = prev.filter(s => s.id !== id);
        if (selectedSegmentId === id && next.length > 0) {
            setSelectedSegmentId(next[next.length - 1].id);
        }
        return next;
    });
  };

  const addMarker = (segmentId: string, type: EventType, customOffset?: number) => {
    setSegments(segments.map(seg => {
      if (seg.id === segmentId) {
        const newMarker: RouteMarker = {
          id: `mk-${Date.now()}`,
          type,
          distanceOffset: customOffset !== undefined ? customOffset : seg.length / 2, 
          label: type
        };
        return { ...seg, markers: [...seg.markers, newMarker].sort((a,b) => a.distanceOffset - b.distanceOffset) };
      }
      return seg;
    }));
    setMarkerModal(null);
  };

  const moveMarker = (markerId: string, newGlobalDistance: number) => {
      // 1. Find the marker and remove it from its current segment
      let markerToMove: RouteMarker | undefined;
      const tempSegments = segments.map(seg => {
          const found = seg.markers.find(m => m.id === markerId);
          if (found) {
              markerToMove = found;
              return { ...seg, markers: seg.markers.filter(m => m.id !== markerId) };
          }
          return seg;
      });

      if (!markerToMove) return;

      // 2. Find the new segment based on global distance
      let accum = 0;
      let targetSegIndex = -1;
      let offsetInSeg = 0;

      for (let i = 0; i < tempSegments.length; i++) {
          const seg = tempSegments[i];
          if (newGlobalDistance >= accum && newGlobalDistance <= accum + seg.length) {
              targetSegIndex = i;
              offsetInSeg = newGlobalDistance - accum;
              break;
          }
          accum += seg.length;
      }

      // Handle edge case: dragged past end
      if (targetSegIndex === -1 && newGlobalDistance > accum) {
          targetSegIndex = tempSegments.length - 1;
          offsetInSeg = tempSegments[targetSegIndex].length;
      } else if (targetSegIndex === -1 && newGlobalDistance < 0) {
           targetSegIndex = 0;
           offsetInSeg = 0;
      }

      if (targetSegIndex !== -1) {
          const targetSeg = tempSegments[targetSegIndex];
          // Update segment with marker
          tempSegments[targetSegIndex] = {
              ...targetSeg,
              markers: [...targetSeg.markers, { ...markerToMove, distanceOffset: offsetInSeg }].sort((a,b) => a.distanceOffset - b.distanceOffset)
          };
          setSegments(tempSegments);
          // Auto-select the segment where marker dropped
          setSelectedSegmentId(targetSeg.id);
      }
  };

  // Lane Index: 0 = Rightmost, Max = Leftmost (Closest to Center Line)
  // Left Change = Move Closer to Center = Index + 1
  // Right Change = Move Away from Center = Index - 1
  const changeLane = (dir: 'left' | 'right') => {
      setTurnSignal(dir);
      setLogs(p => [`准备向${dir === 'left' ? '左' : '右'}变道...`, ...p]);
      // Lane change steering override
      targetSteeringAngleRef.current = dir === 'left' ? -30 : 30;
      
      setTimeout(() => {
          setCurrentLane(prev => {
              if (dir === 'left') return Math.min(prev + 1, 2); 
              return Math.max(prev - 1, 0); 
          });
          setTurnSignal('none');
          // Let road curvature take over again after lane change
          // We don't reset to 0 immediately here, RoadCanvas will update it based on road geometry
      }, 1000); 
  };

  const performOvertake = () => {
      if (overtakeDir === 'left' && currentLane >= 2) {
          setLogs(p => ["左侧无车道，无法从左侧超车", ...p]);
          return;
      }
      if (overtakeDir === 'right' && currentLane <= 0) {
          setLogs(p => ["右侧无车道，无法从右侧超车", ...p]);
          return;
      }

      setLogs(p => [`开始${overtakeDir === 'left' ? '左侧' : '右侧'}超车程序...`, ...p]);
      setTurnSignal(overtakeDir);
      
      const targetLaneOffset = overtakeDir === 'left' ? 1 : -1;

      setTimeout(() => {
          setCurrentLane(prev => prev + targetLaneOffset);
          setSpeed(s => s + 10);
          setTurnSignal('none');
          
          overtakeTimeoutRef.current = window.setTimeout(() => {
              setTurnSignal(overtakeDir === 'left' ? 'right' : 'left'); // Signal back
              setTimeout(() => {
                   setCurrentLane(prev => prev - targetLaneOffset); // Return
                   setTurnSignal('none');
                   setSpeed(s => Math.max(s - 10, 0));
                   setLogs(p => ["超车完成", ...p]);
              }, 1500);
          }, 3000);
      }, 1000);
  };

  const handleMarkerReached = (label: string) => {
    setLogs(prev => [`遇到: ${label}`, ...prev].slice(0, 5));
    if (label.includes('红绿灯') || label.includes('停车')) {
        // Warning
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const newRoute = await generateRoute('medium');
      setSegments(newRoute);
      setSelectedSegmentId(newRoute[0]?.id || null);
      setDistance(0);
      setLogs(['AI 已生成新路线']);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setShowAnalysis(true);
    try {
      const result = await analyzeRoute(segments);
      setAnalysisResult(result);
    } catch (e) {
       setAnalysisResult("分析失败");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetSim = () => {
      setIsPlaying(false);
      setDistance(0);
      setSpeed(0);
      setCurrentLane(2);
      setLogs([]);
      setTurnSignal('none');
      setSteeringAngle(0);
      targetSteeringAngleRef.current = 0;
      if (overtakeTimeoutRef.current) clearTimeout(overtakeTimeoutRef.current);
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-slate-950 font-sans text-slate-200 overflow-hidden" ref={containerRef}>
      
      {/* Sidebar Controls - Responsive: Bottom on Mobile/Tablet if squeezed, or Left on Desktop */}
      <div className="lg:w-80 w-full lg:h-full h-auto max-h-[40vh] lg:max-h-none overflow-y-auto order-3 lg:order-1 border-t lg:border-t-0 lg:border-r border-slate-800 shrink-0">
          <Controls 
            segments={segments}
            selectedSegmentId={selectedSegmentId}
            onSelectSegment={setSelectedSegmentId}
            onAddSegment={addSegment}
            onRemoveSegment={removeSegment}
            onUpdateSegment={updateSegment}
            onAddMarker={(segId, type) => addMarker(segId, type)} 
            onPlayToggle={() => setIsPlaying(!isPlaying)}
            onReset={resetSim}
            isPlaying={isPlaying}
            onAnalyze={handleAnalyze}
            onGenerate={handleGenerate}
            analysisLoading={isAnalyzing}
            generationLoading={isGenerating}
            viewMode={viewMode}
            onToggleView={() => setViewMode(v => v === 'driver' ? 'macro' : 'driver')}
          />
      </div>

      <main className="flex-1 flex flex-col relative bg-slate-900 m-0 lg:m-4 rounded-none lg:rounded-2xl overflow-hidden border-none lg:border border-slate-800 shadow-2xl order-1 lg:order-2 h-[60vh] lg:h-auto">
         
         <div className="flex-1 relative min-h-0">
            <RoadCanvas 
                segments={segments} 
                selectedSegmentId={selectedSegmentId}
                currentDistance={distance}
                currentLaneIndex={currentLane}
                isPlaying={isPlaying}
                onMarkerReached={handleMarkerReached}
                turnSignal={turnSignal}
                isBraking={false} 
                viewMode={viewMode}
                onRoadClick={(segId, offset, x, y) => {
                    setSelectedSegmentId(segId);
                    setMarkerModal({ segmentId: segId, offset, screenX: x, screenY: y });
                }}
                onCarUpdate={(d, l) => {
                    setDistance(d);
                    setCurrentLane(l);
                }}
                onMarkerMove={moveMarker}
                onSteeringUpdate={(angle) => {
                   targetSteeringAngleRef.current = angle;
                }}
            />

            {/* Event Log Overlay */}
            <div className="absolute top-4 right-4 pointer-events-none space-y-1 w-64 z-20">
                {logs.map((log, i) => (
                    <div key={i} className="text-xs bg-black/60 backdrop-blur text-white px-3 py-1.5 rounded-full animate-fade-in border border-white/10 shadow-lg text-right">
                    {log}
                    </div>
                ))}
            </div>
         </div>

         {/* DASHBOARD / DRIVER CONTROLS - Responsive Layout */}
         <div className="bg-slate-950 border-t border-slate-800 p-2 lg:p-4 flex flex-wrap items-center justify-between gap-2 lg:gap-8 z-10 relative shrink-0 min-h-[140px]">
            {/* Speed & Gear - Compact on mobile */}
            <div className="flex items-center gap-2 lg:gap-6 scale-90 lg:scale-100 origin-left">
                <div className="relative w-24 h-24 lg:w-32 lg:h-32 bg-slate-900 rounded-full border-4 border-slate-800 flex items-center justify-center shadow-inner">
                    <div className="text-center">
                        <div className="text-2xl lg:text-4xl font-bold text-blue-400 font-mono">{speed.toFixed(0)}</div>
                        <div className="text-[8px] lg:text-[10px] text-slate-500 uppercase">km/h</div>
                    </div>
                    {/* Simple needle visualization */}
                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500/30 rotate-45" style={{ transform: `rotate(${-135 + (speed * 2.5)}deg)` }}></div>
                </div>

                <div className="hidden sm:flex bg-slate-900 p-2 lg:p-3 rounded-xl border border-slate-800 flex-col gap-1 lg:gap-2">
                    <div className="text-[8px] lg:text-[10px] text-slate-500 text-center">档位</div>
                    <div className="flex flex-col gap-1">
                        <button onClick={() => setGear(Math.min(gear+1, 4))} className="p-1 lg:p-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"><ArrowBigUp size={16}/></button>
                        <div className="text-center font-bold text-lg lg:text-xl text-yellow-500 bg-black/50 rounded py-0.5">{gear}</div>
                        <button onClick={() => setGear(Math.max(gear-1, 1))} className="p-1 lg:p-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"><ArrowBigDown size={16}/></button>
                    </div>
                </div>
            </div>

            {/* Central Controls (Steering Wheel) */}
            <div className="flex-1 flex flex-col items-center justify-center gap-2 lg:gap-4">
                 <div className="flex items-center gap-4 lg:gap-8">
                     {/* Left Controls */}
                     <button 
                        onClick={() => setTurnSignal(prev => prev === 'left' ? 'none' : 'left')}
                        className={`p-2 lg:p-3 rounded-full border-2 transition-all ${turnSignal === 'left' ? 'border-green-500 bg-green-500/20 text-green-500 animate-pulse' : 'border-slate-700 text-slate-600'}`}
                     >
                         <ArrowLeftRight size={16} className="rotate-180 lg:w-5 lg:h-5"/>
                     </button>
                     
                     {/* STEERING WHEEL VISUAL */}
                     <div className="relative w-24 h-24 lg:w-32 lg:h-32 rounded-full border-4 lg:border-8 border-slate-700 bg-slate-900 shadow-2xl flex items-center justify-center transition-transform duration-100 ease-out" 
                          style={{ transform: `rotate(${steeringAngle}deg)` }}>
                         {/* Spokes */}
                         <div className="absolute w-full h-3 lg:h-4 bg-slate-700"></div>
                         <div className="absolute h-1/2 w-3 lg:w-4 bg-slate-700 bottom-0"></div>
                         {/* Hub */}
                         <div className="absolute w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-slate-600 border-2 border-slate-500 flex items-center justify-center">
                             <div className="w-4 h-4 lg:w-6 lg:h-6 rounded-full bg-slate-800"></div>
                         </div>
                     </div>

                     {/* Right Controls */}
                     <button 
                        onClick={() => setTurnSignal(prev => prev === 'right' ? 'none' : 'right')}
                        className={`p-2 lg:p-3 rounded-full border-2 transition-all ${turnSignal === 'right' ? 'border-green-500 bg-green-500/20 text-green-500 animate-pulse' : 'border-slate-700 text-slate-600'}`}
                     >
                         <ArrowLeftRight size={16} className="lg:w-5 lg:h-5"/>
                     </button>
                 </div>

                 {/* Pedals & Play */}
                 <div className="flex gap-2 lg:gap-4 w-full justify-center items-center">
                     <button 
                        onMouseDown={() => setSpeed(s => Math.max(s - 20, 0))}
                        className="h-8 lg:h-10 w-16 lg:w-20 bg-red-900/50 border border-red-700 rounded-lg text-red-500 font-bold active:bg-red-700 active:text-white transition-colors text-[10px] lg:text-xs"
                     >刹车</button>
                     
                     <div className="flex gap-2">
                        <button onClick={() => setIsPlaying(!isPlaying)} className="p-2 lg:p-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg transition-transform active:scale-95">
                             {isPlaying ? <Pause size={16} fill="currentColor" className="lg:w-5 lg:h-5"/> : <Play size={16} fill="currentColor" className="ml-0.5 lg:w-5 lg:h-5"/>}
                        </button>
                        <button onClick={resetSim} className="p-2 lg:p-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors">
                             <RotateCcw size={16} className="lg:w-5 lg:h-5"/>
                        </button>
                     </div>

                     <button 
                        onMouseDown={() => { if(!isPlaying) setIsPlaying(true); setSpeed(s => Math.min(s + 5, 80)); }}
                        className="h-8 lg:h-10 w-16 lg:w-20 bg-green-900/50 border border-green-700 rounded-lg text-green-500 font-bold active:bg-green-700 active:text-white transition-colors text-[10px] lg:text-xs"
                     >油门</button>
                 </div>
            </div>

            {/* Action Buttons - Hidden on very small screens or adaptable */}
            <div className="hidden md:grid grid-cols-2 gap-2 w-32">
                <button onClick={() => changeLane('left')} className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:border-blue-500 flex flex-col items-center">
                    <ArrowLeftRight size={14} className="mb-1 text-slate-400 rotate-180"/>
                    <span className="text-[10px]">左变道</span>
                </button>
                <button onClick={() => changeLane('right')} className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:border-blue-500 flex flex-col items-center">
                    <ArrowLeftRight size={14} className="mb-1 text-slate-400"/>
                    <span className="text-[10px]">右变道</span>
                </button>
                
                <div className="col-span-2 flex gap-1">
                   <button 
                      onClick={performOvertake} 
                      className="flex-1 p-2 bg-indigo-900/30 border border-indigo-700 rounded-l-lg hover:bg-indigo-900/50 flex items-center justify-center gap-1 text-indigo-300 text-[10px]"
                   >
                      <Zap size={12}/> {overtakeDir === 'left' ? '左' : '右'}侧超车
                   </button>
                   <button 
                      onClick={() => setOvertakeDir(prev => prev === 'left' ? 'right' : 'left')}
                      className="w-6 bg-indigo-900/50 border border-indigo-700 border-l-0 rounded-r-lg hover:bg-indigo-800 flex items-center justify-center text-indigo-300"
                   >
                      <Repeat size={10}/>
                   </button>
                </div>
            </div>
         </div>

         {/* Markers Modal */}
         {markerModal && (
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 pb-48">
              <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
                   <h3 className="font-bold text-white">在该位置添加...</h3>
                   <button onClick={() => setMarkerModal(null)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                </div>
                
                <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-2">
                   {Object.entries(EVENT_CONFIG).map(([type, cfg]) => (
                      <button 
                        key={type}
                        onClick={() => addMarker(markerModal.segmentId, type as EventType, markerModal.offset)}
                        className={`flex items-center gap-3 p-3 rounded-lg border border-slate-700 bg-slate-900/50 hover:bg-slate-700 hover:border-${cfg.color.replace('bg-', '')} transition-all group`}
                      >
                         <div className={`p-2 rounded-full ${cfg.color} text-white`}>
                            <cfg.icon size={16} />
                         </div>
                         <div className="text-left">
                           <div className="text-sm font-medium text-slate-200">{cfg.label}</div>
                         </div>
                      </button>
                   ))}
                </div>
              </div>
            </div>
         )}
         
         {/* Analysis Modal */}
         {showAnalysis && (
           <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 lg:p-12">
              <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-full flex flex-col">
                 <div className="p-4 lg:p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <MessageSquare className="text-green-500"/> AI 教练评估
                    </h3>
                    <button onClick={() => setShowAnalysis(false)} className="text-slate-400 hover:text-white">✕</button>
                 </div>
                 <div className="p-4 lg:p-6 overflow-y-auto font-mono text-sm leading-relaxed text-slate-300">
                    {isAnalyzing ? (
                      <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
                        <p className="text-slate-500">正在回放并分析您的驾驶操作...</p>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">
                        {analysisResult}
                      </div>
                    )}
                 </div>
                 <div className="p-4 border-t border-slate-700 bg-slate-800/50 rounded-b-xl flex justify-end">
                   <button onClick={() => setShowAnalysis(false)} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-sm text-white">关闭</button>
                 </div>
              </div>
           </div>
         )}

      </main>
    </div>
  );
};

export default App;