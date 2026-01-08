import React from 'react';
import { RouteSegment, SegmentType, EventType } from '../types';
import { SEGMENT_CONFIG, EVENT_CONFIG } from '../constants';
import { Plus, Play, Pause, RotateCcw, Trash2, Wand2, Search, Settings2, Eye, Map } from 'lucide-react';

interface ControlsProps {
  segments: RouteSegment[];
  selectedSegmentId: string | null;
  onSelectSegment: (id: string) => void;
  onAddSegment: (type: SegmentType) => void;
  onRemoveSegment: (id: string) => void;
  onUpdateSegment: (id: string, updates: Partial<RouteSegment>) => void;
  onAddMarker: (segmentId: string, type: EventType) => void;
  onPlayToggle: () => void;
  onReset: () => void;
  isPlaying: boolean;
  onAnalyze: () => void;
  onGenerate: () => void;
  analysisLoading: boolean;
  generationLoading: boolean;
  viewMode: 'driver' | 'macro';
  onToggleView: () => void;
}

const Controls: React.FC<ControlsProps> = ({
  segments,
  selectedSegmentId,
  onSelectSegment,
  onAddSegment,
  onRemoveSegment,
  onUpdateSegment,
  onAddMarker,
  onPlayToggle,
  onReset,
  isPlaying,
  onAnalyze,
  onGenerate,
  analysisLoading,
  generationLoading,
  viewMode,
  onToggleView
}) => {
  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-300 w-full">
      
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur z-10 flex justify-between items-center sticky top-0">
        <h2 className="text-lg lg:text-xl font-bold text-white tracking-tight flex items-center gap-2">
           <span className="w-2 h-6 bg-blue-500 rounded-full inline-block"></span>
           科目三 <span className="text-xs font-normal text-slate-500 uppercase px-2 py-0.5 border border-slate-700 rounded hidden sm:inline-block">模拟系统 Pro</span>
        </h2>
        <button 
           onClick={onToggleView}
           className={`p-2 rounded hover:bg-slate-700 transition-colors ${viewMode === 'macro' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
           title={viewMode === 'macro' ? "切换回驾驶视角" : "切换至全局地图"}
        >
            {viewMode === 'macro' ? <Map size={20} /> : <Eye size={20} />}
        </button>
      </div>

      {/* Main Actions */}
      <div className="p-4 grid grid-cols-2 gap-2 border-b border-slate-800 shrink-0">
         <button 
           onClick={onGenerate}
           disabled={generationLoading}
           className="col-span-1 bg-slate-800 hover:bg-slate-700 text-xs font-medium py-2 rounded flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
         >
           {generationLoading ? <div className="animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"></div> : <Wand2 size={14} className="text-purple-400"/>}
           智能生成
         </button>
         <button 
           onClick={onAnalyze}
           disabled={analysisLoading}
           className="col-span-1 bg-slate-800 hover:bg-slate-700 text-xs font-medium py-2 rounded flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
         >
           {analysisLoading ? <div className="animate-spin w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full"></div> : <Search size={14} className="text-green-400"/>}
           AI 评判
         </button>
      </div>

      {/* Route Builder */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Add Segment Buttons */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
             <Plus size={12}/> 拼接道路
          </label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(SEGMENT_CONFIG).map(([type, config]) => (
              <button
                key={type}
                onClick={() => onAddSegment(type as SegmentType)}
                className="flex flex-col items-center justify-center p-2 bg-slate-800/50 border border-slate-700 rounded hover:border-blue-500 hover:bg-slate-800 transition-all group"
              >
                <config.icon size={16} className="text-slate-400 group-hover:text-blue-400 mb-1" />
                <span className="text-[10px] text-center leading-tight scale-90">{config.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Segments List */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold text-slate-500 uppercase">路线详情</label>
            <span className="text-xs text-slate-600">总长 {segments.reduce((acc, s)=>acc+s.length, 0)}米</span>
          </div>
          
          <div className="space-y-4 relative pb-20">
            <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-slate-800"></div>

            {segments.map((seg, idx) => {
              const SegIcon = SEGMENT_CONFIG[seg.type].icon;
              const isTurn = seg.type === SegmentType.TURN_LEFT || seg.type === SegmentType.TURN_RIGHT;
              const isSelected = selectedSegmentId === seg.id;

              return (
                <div 
                    key={seg.id} 
                    className={`relative pl-10 group cursor-pointer`}
                    onClick={() => onSelectSegment(seg.id)}
                >
                  <div className={`absolute left-[13px] top-3 w-2.5 h-2.5 rounded-full border-2 border-slate-900 transition-colors z-10 ${isSelected ? 'bg-blue-500 scale-125' : 'bg-slate-700 group-hover:bg-blue-400'}`}></div>
                  
                  <div className={`border rounded-lg p-3 transition-all ${isSelected ? 'bg-slate-800 border-blue-500 shadow-lg shadow-blue-900/20' : 'bg-slate-800/40 border-slate-800 hover:border-slate-600'}`}>
                    
                    {/* Segment Header */}
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-2">
                        <SegIcon size={16} className={isSelected ? 'text-blue-400' : 'text-slate-500'}/>
                        <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>{SEGMENT_CONFIG[seg.type].label}</span>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); onRemoveSegment(seg.id); }} className="text-slate-600 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Config Inputs */}
                    <div className="space-y-2 mb-3 bg-slate-900/50 p-2 rounded">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[10px] text-slate-500 block mb-1">长度 (米)</label>
                                <input 
                                    type="number" 
                                    value={seg.length}
                                    onChange={(e) => onUpdateSegment(seg.id, { length: parseInt(e.target.value) || 50 })}
                                    className="w-full bg-slate-800 border border-slate-700 text-xs px-2 py-1 rounded text-center focus:border-blue-500 outline-none text-white"
                                />
                            </div>
                            {isTurn && (
                                <div>
                                    <label className="text-[10px] text-slate-500 block mb-1">转弯角度 (°)</label>
                                    <input 
                                        type="number" 
                                        value={seg.turnAngle || 90}
                                        onChange={(e) => onUpdateSegment(seg.id, { turnAngle: parseInt(e.target.value) || 90 })}
                                        className="w-full bg-slate-800 border border-slate-700 text-xs px-2 py-1 rounded text-center focus:border-blue-500 outline-none text-white"
                                    />
                                </div>
                            )}
                        </div>
                        
                        <div>
                            <label className="text-[10px] text-slate-500 block mb-1">单侧车道数</label>
                            <div className="flex gap-1">
                                <button 
                                    onClick={() => onUpdateSegment(seg.id, { laneCount: 1 })}
                                    className={`flex-1 py-1 rounded text-xs border ${seg.laneCount === 1 ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                                >1道</button>
                                <button 
                                    onClick={() => onUpdateSegment(seg.id, { laneCount: 2 })}
                                    className={`flex-1 py-1 rounded text-xs border ${seg.laneCount === 2 ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                                >2道</button>
                                <button 
                                    onClick={() => onUpdateSegment(seg.id, { laneCount: 3 })}
                                    className={`flex-1 py-1 rounded text-xs border ${seg.laneCount === 3 ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                                >3道</button>
                            </div>
                        </div>
                    </div>

                    {/* Markers List */}
                    <div className="flex flex-wrap gap-1 mb-2">
                       {seg.markers.map((m) => (
                         <span key={m.id} className={`text-[10px] px-1.5 py-0.5 rounded text-white flex items-center gap-1 border border-white/5 ${EVENT_CONFIG[m.type]?.color.replace('bg-', 'bg-opacity-80 bg-') || 'bg-slate-600'}`}>
                           {EVENT_CONFIG[m.type]?.label}
                         </span>
                       ))}
                    </div>

                    {/* Add Marker */}
                    <div className="relative">
                      <select 
                        className="w-full bg-slate-900 border border-slate-700 text-xs text-slate-400 rounded px-2 py-1.5 appearance-none focus:border-blue-500 outline-none cursor-pointer hover:bg-slate-800"
                        onChange={(e) => {
                          if (e.target.value) {
                             onAddMarker(seg.id, e.target.value as EventType);
                             e.target.value = '';
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>+ 添加环境设施或动作</option>
                        <optgroup label="环境设施">
                            {Object.entries(EVENT_CONFIG).filter(([_,c])=>c.isEnv).map(([k,c]) => <option key={k} value={k}>{c.label}</option>)}
                        </optgroup>
                        <optgroup label="驾驶动作">
                            {Object.entries(EVENT_CONFIG).filter(([_,c])=>!c.isEnv).map(([k,c]) => <option key={k} value={k}>{c.label}</option>)}
                        </optgroup>
                      </select>
                      <Plus size={10} className="absolute right-2 top-2.5 text-slate-500 pointer-events-none"/>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 bg-slate-900 border-t border-slate-800 text-[10px] text-slate-600 text-center shrink-0">
         支持键盘 WASD 控制车辆，方向键变道
      </div>
    </div>
  );
};

export default Controls;