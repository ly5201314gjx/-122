import React, { useEffect, useRef, useState, useMemo } from 'react';
import { RouteSegment, SegmentType, Coordinates, EventType } from '../types';
import { PIXELS_PER_METER, EVENT_CONFIG, LANE_WIDTH_METERS } from '../constants';

interface RoadCanvasProps {
  segments: RouteSegment[];
  selectedSegmentId: string | null;
  currentDistance: number;
  currentLaneIndex: number; // 0 = rightmost, increases left
  isPlaying: boolean;
  onMarkerReached: (label: string) => void;
  onRoadClick: (segmentId: string, distanceOffset: number, x: number, y: number) => void;
  onCarUpdate?: (distance: number, laneIndex: number) => void;
  onSteeringUpdate?: (angle: number) => void;
  onMarkerMove?: (markerId: string, globalDistance: number) => void;
  turnSignal: 'left' | 'right' | 'none';
  isBraking: boolean;
  viewMode: 'driver' | 'macro';
}

const RoadCanvas: React.FC<RoadCanvasProps> = ({ 
  segments,
  selectedSegmentId,
  currentDistance, 
  currentLaneIndex,
  isPlaying,
  onMarkerReached,
  onRoadClick,
  onCarUpdate,
  onSteeringUpdate,
  onMarkerMove,
  turnSignal,
  isBraking,
  viewMode
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  
  // View State
  const [viewBox, setViewBox] = useState("0 0 800 600");
  const [carPos, setCarPos] = useState<Coordinates>({ x: 0, y: 0, angle: 0 });
  const [visualLaneOffset, setVisualLaneOffset] = useState(0); 

  // Macro View State
  const [macroOffset, setMacroOffset] = useState({ x: 0, y: 0 });
  const [macroZoom, setMacroZoom] = useState(0.8);
  const isDraggingRef = useRef(false);
  const isDraggingCarRef = useRef(false);
  const [draggingMarkerId, setDraggingMarkerId] = useState<string | null>(null);
  const [draggedMarkerPos, setDraggedMarkerPos] = useState<{dist: number, x: number, y: number} | null>(null);

  const lastMousePosRef = useRef({ x: 0, y: 0 });
  
  const lastMarkerCheckRef = useRef<number>(-1);

  // --- Animation for Smooth Lane Change (Driver View) ---
  useEffect(() => {
     let d = 0;
     let activeSeg = segments[0];
     for(const seg of segments) {
         if (currentDistance >= d && currentDistance < d + seg.length) {
             activeSeg = seg;
             break;
         }
         d += seg.length;
     }
     
     const laneCount = activeSeg ? activeSeg.laneCount : 1;
     const laneWidthPx = LANE_WIDTH_METERS * PIXELS_PER_METER;
     
     const targetOffset = (laneCount - currentLaneIndex - 0.5) * laneWidthPx;
     
     const step = (targetOffset - visualLaneOffset) * 0.1;
     if (Math.abs(targetOffset - visualLaneOffset) > 0.5) {
        requestAnimationFrame(() => setVisualLaneOffset(prev => prev + step));
     } else {
        setVisualLaneOffset(targetOffset);
     }
  }, [currentLaneIndex, visualLaneOffset, currentDistance, segments]);

  const LANE_WIDTH_PX = LANE_WIDTH_METERS * PIXELS_PER_METER;

  // --- 1. Generate SVG Path Data & Geometry ---
  const { pathData, segmentGeometries, totalLength, markerPositions } = useMemo(() => {
    let d = "M 400 500"; 
    let currentX = 400;
    let currentY = 500;
    let currentAngle = -90; // Up
    let accumulatedLength = 0;
    
    const markers: { 
        id: string; 
        distance: number; 
        type: string; 
        x: number; 
        y: number; 
        angle: number, 
        isEnv: boolean,
        roadWidth: number
    }[] = [];

    const geometries: { 
        id: string; 
        type: SegmentType;
        d: string; 
        length: number; 
        laneCount: number;
        startPoint: {x:number, y:number};
        endPoint: {x:number, y:number};
        angle: number;
        turnAngle?: number;
        isSharpTurn: boolean;
        lanes: { left: string[], right: string[] }; 
    }[] = [];

    const rad = (deg: number) => deg * (Math.PI / 180);

    segments.forEach((seg) => {
      const startDist = accumulatedLength;
      const startX = currentX;
      const startY = currentY;
      const startAngle = currentAngle;
      let pathChunk = "";
      
      const pxLen = seg.length * PIXELS_PER_METER;

      // Helper for calculating parallel lines for lanes
      const calculateLanes = (p1: {x:number, y:number}, p2: {x:number, y:number}, count: number, angle: number) => {
          const leftLanes: string[] = [];
          const rightLanes: string[] = [];
          
          // Normal vector pointing Right
          const nx = -Math.sin(rad(angle));
          const ny = Math.cos(rad(angle));
          
          for (let i = 1; i < count; i++) {
              const off = i * LANE_WIDTH_PX;
              
              // Right side lines (Driving direction)
              const rx1 = p1.x + nx * off;
              const ry1 = p1.y + ny * off;
              const rx2 = p2.x + nx * off;
              const ry2 = p2.y + ny * off;
              rightLanes.push(`M ${rx1} ${ry1} L ${rx2} ${ry2}`);

              // Left side lines (Opposite direction)
              const lx1 = p1.x - nx * off;
              const ly1 = p1.y - ny * off;
              const lx2 = p2.x - nx * off;
              const ly2 = p2.y - ny * off;
              leftLanes.push(`M ${lx1} ${ly1} L ${lx2} ${ly2}`);
          }
          return { left: leftLanes, right: rightLanes };
      };


      if (seg.type === SegmentType.STRAIGHT || seg.type === SegmentType.LANE_CHANGE_LEFT || seg.type === SegmentType.LANE_CHANGE_RIGHT) {
        const dx = Math.cos(rad(currentAngle)) * pxLen;
        const dy = Math.sin(rad(currentAngle)) * pxLen;
        const endX = currentX + dx;
        const endY = currentY + dy;
        pathChunk = `L ${endX} ${endY}`;
        
        const lanes = calculateLanes({x: currentX, y: currentY}, {x: endX, y: endY}, seg.laneCount, currentAngle);

        currentX = endX;
        currentY = endY;

        geometries.push({
            id: seg.id,
            type: seg.type,
            d: `M ${startX} ${startY} ${pathChunk}`,
            length: seg.length,
            laneCount: seg.laneCount,
            startPoint: {x: startX, y: startY},
            endPoint: {x: currentX, y: currentY},
            angle: currentAngle,
            isSharpTurn: false,
            lanes: lanes
        });

      } else if (seg.type === SegmentType.TURN_LEFT || seg.type === SegmentType.TURN_RIGHT) {
        const turnDeg = seg.turnAngle || 90;
        const isLeft = seg.type === SegmentType.TURN_LEFT;
        
        const halfLen = pxLen / 2;
        
        // 1. Straight part
        const dx1 = Math.cos(rad(currentAngle)) * halfLen;
        const dy1 = Math.sin(rad(currentAngle)) * halfLen;
        const midX = currentX + dx1;
        const midY = currentY + dy1;
        
        // 2. Turn part
        const nextAngle = currentAngle + (isLeft ? -turnDeg : turnDeg);
        const dx2 = Math.cos(rad(nextAngle)) * halfLen;
        const dy2 = Math.sin(rad(nextAngle)) * halfLen;
        const endX = midX + dx2;
        const endY = midY + dy2;
        
        pathChunk = `L ${midX} ${midY} L ${endX} ${endY}`;

        const lanes1 = calculateLanes({x: currentX, y: currentY}, {x: midX, y: midY}, seg.laneCount, currentAngle);
        const lanes2 = calculateLanes({x: midX, y: midY}, {x: endX, y: endY}, seg.laneCount, nextAngle);
        
        currentX = endX;
        currentY = endY;
        currentAngle = nextAngle;

        geometries.push({
            id: seg.id,
            type: seg.type,
            d: `M ${startX} ${startY} ${pathChunk}`,
            length: seg.length,
            laneCount: seg.laneCount,
            startPoint: {x: startX, y: startY},
            endPoint: {x: currentX, y: currentY},
            angle: startAngle, 
            turnAngle: turnDeg,
            isSharpTurn: true,
            lanes: { 
              left: [...lanes1.left, ...lanes2.left], 
              right: [...lanes1.right, ...lanes2.right] 
            }
        });

      } else if (seg.type === SegmentType.U_TURN) {
        const uRadius = 15 * PIXELS_PER_METER; 
        const cx = currentX + uRadius * Math.cos(rad(currentAngle - 90));
        const cy = currentY + uRadius * Math.sin(rad(currentAngle - 90));
        const ex = cx + uRadius * Math.cos(rad(currentAngle + 90));
        const ey = cy + uRadius * Math.sin(rad(currentAngle + 90));

        pathChunk = `A ${uRadius} ${uRadius} 0 0 0 ${ex} ${ey}`;
        
        currentX = ex;
        currentY = ey;
        currentAngle -= 180;
        
        geometries.push({
            id: seg.id,
            type: seg.type,
            d: `M ${startX} ${startY} ${pathChunk}`,
            length: seg.length,
            laneCount: seg.laneCount,
            startPoint: {x: startX, y: startY},
            endPoint: {x: currentX, y: currentY},
            angle: startAngle,
            isSharpTurn: false,
            lanes: { left: [], right: [] }
        });
      }

      d += ` ${pathChunk}`;
      
      const totalRoadWidth = seg.laneCount * LANE_WIDTH_PX * 2;
      seg.markers.forEach(m => {
        markers.push({
          id: m.id,
          distance: startDist + m.distanceOffset,
          type: m.type,
          x: 0, y: 0, angle: 0, 
          isEnv: EVENT_CONFIG[m.type].isEnv || false,
          roadWidth: totalRoadWidth
        });
      });

      accumulatedLength += seg.length;
    });

    return { pathData: d, segmentGeometries: geometries, totalLength: accumulatedLength, markerPositions: markers };
  }, [segments]);


  // --- 2. Update Car Position & Marker Resolution ---
  const [resolvedMarkers, setResolvedMarkers] = useState<any[]>([]);
  const prevAngleRef = useRef(0);
  
  useEffect(() => {
    if (pathRef.current) {
      const pathEl = pathRef.current;
      const totalPathLen = pathEl.getTotalLength();
      
      const ratio = Math.min(Math.max(currentDistance, 0) / (totalLength || 1), 1);
      const targetLen = totalPathLen * ratio;

      const point = pathEl.getPointAtLength(targetLen);
      // Increased lookahead for better steering visualization (approx 6 meters ahead)
      const lookAhead = Math.min(targetLen + 30, totalPathLen); 
      const pointAhead = pathEl.getPointAtLength(lookAhead);
      
      const rawAngle = Math.atan2(pointAhead.y - point.y, pointAhead.x - point.x);
      const angleDeg = rawAngle * (180 / Math.PI);

      // Normal Vector (Right)
      const perpX = -Math.sin(rawAngle);
      const perpY = Math.cos(rawAngle);

      const finalCarX = point.x + (perpX * visualLaneOffset);
      const finalCarY = point.y + (perpY * visualLaneOffset);

      setCarPos({
        x: finalCarX,
        y: finalCarY,
        angle: angleDeg
      });
      
      // Steering logic
      const deltaAngle = angleDeg - prevAngleRef.current;
      let normalizedDelta = deltaAngle;
      while (normalizedDelta > 180) normalizedDelta -= 360;
      while (normalizedDelta < -180) normalizedDelta += 360;
      
      if (onSteeringUpdate) {
         // Calculate curvature based on lookahead angle difference relative to car
         // Current Heading vs Road Heading ahead
         // Actually, if we are ON the curve, the car rotates. The steering wheel should hold steady.
         // A constant curvature means steering wheel held at angle X.
         // Curvature K ~ (AngleAhead - AngleCurrent) / LookaheadDist
         
         const currentPathAngle = angleDeg; // Tangent at car (approx)
         // Recalculate precise tangent at current point for comparison
         const pJustAhead = pathEl.getPointAtLength(Math.min(targetLen + 1, totalPathLen));
         const currentTangent = Math.atan2(pJustAhead.y - point.y, pJustAhead.x - point.x) * (180/Math.PI);
         
         // Angle 30px ahead
         const futureTangent = Math.atan2(
             pathEl.getPointAtLength(Math.min(lookAhead + 1, totalPathLen)).y - pointAhead.y, 
             pathEl.getPointAtLength(Math.min(lookAhead + 1, totalPathLen)).x - pointAhead.x
         ) * (180/Math.PI);

         let curveDelta = futureTangent - currentTangent;
         while (curveDelta > 180) curveDelta -= 360;
         while (curveDelta < -180) curveDelta += 360;
         
         // If curveDelta is significant, we are entering or in a turn
         // Multiplier to make it visible
         const steeringForce = curveDelta * 3; 
         
         onSteeringUpdate(steeringForce); 
      }
      prevAngleRef.current = angleDeg;

      if (viewMode === 'driver') {
        const vx = finalCarX - 400;
        const vy = finalCarY - 450; 
        setViewBox(`${vx} ${vy} 800 600`);
      } else {
        const w = 800 / macroZoom;
        const h = 600 / macroZoom;
        const vx = macroOffset.x - (w / 2);
        const vy = macroOffset.y - (h / 2);
        setViewBox(`${vx} ${vy} ${w} ${h}`);
      }

      if (markerPositions.length > 0) {
          const resolved = markerPositions.map(m => {
            // Check if this marker is being dragged
            let effectiveDistance = m.distance;
            if (draggingMarkerId === m.id && draggedMarkerPos) {
                effectiveDistance = draggedMarkerPos.dist;
            }

            const mRatio = effectiveDistance / (totalLength || 1);
            const mPoint = pathEl.getPointAtLength(Math.max(0, Math.min(totalPathLen * mRatio, totalPathLen)));
            
            // Get angle for this specific point
            const lookAheadDist = Math.min(totalPathLen * mRatio + 1, totalPathLen);
            const mNext = pathEl.getPointAtLength(lookAheadDist);
            const mA = Math.atan2(mNext.y - mPoint.y, mNext.x - mPoint.x);
            
            // Generate pseudo-random side for text placement based on ID hash
            const idHash = m.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const isLeft = idHash % 2 === 0;
            const textOffset = 80;
            
            const mPerpX = -Math.sin(mA);
            const mPerpY = Math.cos(mA);
            
            // Calculate label position (for text markers)
            const labelX = mPoint.x + mPerpX * (isLeft ? -textOffset : textOffset);
            const labelY = mPoint.y + mPerpY * (isLeft ? -textOffset : textOffset);

            return { 
                ...m, 
                x: mPoint.x, 
                y: mPoint.y, 
                angle: mA * (180/Math.PI),
                labelX,
                labelY,
                isLeft
            };
          });
          setResolvedMarkers(resolved);
      }
    }
  }, [currentDistance, totalLength, pathData, visualLaneOffset, markerPositions, viewMode, macroOffset, macroZoom, draggingMarkerId, draggedMarkerPos]);

  // --- 3. Event Triggers ---
  useEffect(() => {
    const passed = markerPositions.filter(m => 
      m.distance <= currentDistance && 
      m.distance > lastMarkerCheckRef.current
    );
    passed.forEach(p => {
       const cfg = EVENT_CONFIG[p.type as keyof typeof EVENT_CONFIG];
       onMarkerReached(cfg?.label || p.type);
    });
    lastMarkerCheckRef.current = currentDistance;
  }, [currentDistance, markerPositions, onMarkerReached]);

  useEffect(() => {
      if (currentDistance === 0) {
          lastMarkerCheckRef.current = -1;
          prevAngleRef.current = -90; // Reset angle
      }
  }, [currentDistance]);

  // --- 4. Macro View Interactions ---
  const handleWheel = (e: React.WheelEvent) => {
      if (viewMode !== 'macro') return;
      const scale = 0.1;
      const newZoom = Math.max(0.1, Math.min(5, macroZoom - Math.sign(e.deltaY) * scale));
      setMacroZoom(newZoom);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      if (viewMode !== 'macro') return;
      isDraggingRef.current = true;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const getClosestPointOnPath = (mouseX: number, mouseY: number) => {
      const svg = svgRef.current;
      if (!svg || !pathRef.current) return null;
      
      const pt = svg.createSVGPoint();
      pt.x = mouseX;
      pt.y = mouseY;
      const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
      
      const pathEl = pathRef.current;
      const totalPathLen = pathEl.getTotalLength();
      
      // Coarse search
      const precision = 100;
      let bestDist = 0;
      let minDist = Infinity;
      
      for(let l=0; l<=totalPathLen; l+= totalPathLen/precision) {
           const p = pathEl.getPointAtLength(l);
           const dist = Math.hypot(p.x - svgP.x, p.y - svgP.y);
           if (dist < minDist) {
               minDist = dist;
               bestDist = l;
           }
      }
      
      // Fine search
      const range = totalPathLen/precision;
      for(let l=Math.max(0, bestDist - range); l<=Math.min(totalPathLen, bestDist + range); l+=5) {
            const p = pathEl.getPointAtLength(l);
            const dist = Math.hypot(p.x - svgP.x, p.y - svgP.y);
            if (dist < minDist) {
               minDist = dist;
               bestDist = l;
            }
      }
      
      return { dist: bestDist, totalLen: totalPathLen, point: pathEl.getPointAtLength(bestDist) };
  }

  const handleMouseMove = (e: React.MouseEvent) => {
      if (viewMode !== 'macro') return;

      // Handle Marker Dragging
      if (draggingMarkerId) {
          e.stopPropagation();
          const result = getClosestPointOnPath(e.clientX, e.clientY);
          if (result) {
              const rawRatio = result.dist / result.totalLen;
              const newDistance = rawRatio * totalLength;
              setDraggedMarkerPos({ dist: newDistance, x: result.point.x, y: result.point.y });
          }
          return;
      }

      // Handle Car Dragging
      if (isDraggingCarRef.current && onCarUpdate) {
         e.stopPropagation();
         const result = getClosestPointOnPath(e.clientX, e.clientY);
         
         if (result && pathRef.current) {
            const rawRatio = result.dist / result.totalLen;
            const newDistance = rawRatio * totalLength;
            
            // Calculate Lane
            const p = result.point;
            const pNext = pathRef.current.getPointAtLength(Math.min(result.dist+1, result.totalLen));
            const angle = Math.atan2(pNext.y - p.y, pNext.x - p.x);
            const nx = -Math.sin(angle); // Right
            const ny = Math.cos(angle);
            
            const svg = svgRef.current;
            if(svg) {
                const pt = svg.createSVGPoint();
                pt.x = e.clientX;
                pt.y = e.clientY;
                const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
                
                const dx = svgP.x - p.x;
                const dy = svgP.y - p.y;
                const projection = dx * nx + dy * ny; 
                
                let d = 0;
                let currentSeg = segments[0];
                for(const seg of segments) {
                    if (newDistance >= d && newDistance < d + seg.length) {
                        currentSeg = seg;
                        break;
                    }
                    d += seg.length;
                }
                
                const w = LANE_WIDTH_PX;
                let rawIndex = currentSeg.laneCount - 0.5 - (projection / w);
                const newLane = Math.max(0, Math.min(currentSeg.laneCount - 1, Math.round(rawIndex)));
                
                onCarUpdate(newDistance, newLane);
            }
         }
         return;
      }

      // Handle Pan
      if (isDraggingRef.current) {
          const dx = e.clientX - lastMousePosRef.current.x;
          const dy = e.clientY - lastMousePosRef.current.y;
          setMacroOffset(prev => ({
              x: prev.x - dx / macroZoom,
              y: prev.y - dy / macroZoom
          }));
          lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
  };

  const handleMouseUp = () => {
      if (draggingMarkerId && draggedMarkerPos && onMarkerMove) {
          onMarkerMove(draggingMarkerId, draggedMarkerPos.dist);
      }
      isDraggingRef.current = false;
      isDraggingCarRef.current = false;
      setDraggingMarkerId(null);
      setDraggedMarkerPos(null);
  };

  useEffect(() => {
      if (viewMode === 'macro' && carPos.x !== 0 && macroOffset.x === 0 && macroOffset.y === 0) {
         setMacroOffset({ x: carPos.x, y: carPos.y });
      }
  }, [viewMode]);


  const handleInteractionClick = (e: React.MouseEvent<SVGPathElement>, segId: string, segLengthMeters: number) => {
    if (isDraggingRef.current || isDraggingCarRef.current || draggingMarkerId) return;
    
    e.stopPropagation();
    const result = getClosestPointOnPath(e.clientX, e.clientY);
    if(result) {
         const metersOffset = (result.dist / result.totalLen) * segLengthMeters;
         onRoadClick(segId, metersOffset, result.point.x, result.point.y);
    }
  };

  const handleCarMouseDown = (e: React.MouseEvent) => {
     if (viewMode === 'macro') {
         e.stopPropagation();
         isDraggingCarRef.current = true;
     }
  };

  const handleMarkerMouseDown = (e: React.MouseEvent, markerId: string) => {
     if (viewMode === 'macro') {
         e.stopPropagation();
         setDraggingMarkerId(markerId);
     }
  }

  return (
    <div 
        className={`w-full h-full bg-slate-900 overflow-hidden relative shadow-2xl rounded-xl border border-slate-800 ${viewMode === 'macro' ? 'cursor-move' : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
    >
      <svg 
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-full transition-all duration-75 ease-linear"
        preserveAspectRatio="xMidYMid slice"
        onClick={() => {}}
      >
        <defs>
           <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#1e293b" strokeWidth="1"/>
          </pattern>
          <pattern id="zebra" width="20" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(90)">
              <rect width="12" height="10" fill="white" fillOpacity="0.8"/>
          </pattern>
           <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#cbd5e1" />
          </marker>
        </defs>
        
        <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#grid)" />

        {/* --- ROAD RENDERING LAYER --- */}
        {segmentGeometries.map((seg, i) => {
            const totalWidth = seg.laneCount * 2 * LANE_WIDTH_PX;
            const isSelected = selectedSegmentId === seg.id;
            
            return (
                <g key={seg.id}>
                    {/* Highlight Selection Border */}
                    {isSelected && (
                         <path 
                            d={seg.d} 
                            fill="none" 
                            stroke="#3b82f6" 
                            strokeWidth={totalWidth + 10} 
                            strokeDasharray="10, 10"
                            strokeOpacity="0.5"
                        />
                    )}

                    {/* Road Base (Asphalt) */}
                    <path 
                        d={seg.d} 
                        fill="none" 
                        stroke="#1e293b" 
                        strokeWidth={totalWidth + 4} // Shoulder
                        strokeLinecap="butt"
                        strokeLinejoin="round"
                    />
                    <path 
                        d={seg.d} 
                        fill="none" 
                        stroke="#334155" 
                        strokeWidth={totalWidth} 
                        strokeLinecap="butt"
                        strokeLinejoin="round"
                    />
                    
                    {/* Center Line (Yellow) */}
                    <path 
                        d={seg.d} 
                        fill="none" 
                        stroke="#fbbf24" 
                        strokeWidth="2" 
                        strokeLinecap="butt"
                        strokeLinejoin="round"
                        strokeDasharray={seg.type === SegmentType.LANE_CHANGE_LEFT ? "10,10" : "none"}
                    />

                    {/* Lane Dividers */}
                    {seg.lanes.right.map((dPath, idx) => (
                        <path key={`r-${idx}`} d={dPath} fill="none" stroke="white" strokeWidth="1" strokeDasharray="15, 15" strokeOpacity="0.6"/>
                    ))}
                    {seg.lanes.left.map((dPath, idx) => (
                        <path key={`l-${idx}`} d={dPath} fill="none" stroke="white" strokeWidth="1" strokeDasharray="15, 15" strokeOpacity="0.6"/>
                    ))}

                    {/* Interaction Hitbox */}
                     <path 
                        d={seg.d} 
                        fill="none" 
                        stroke="transparent" 
                        strokeWidth={totalWidth} 
                        className="cursor-pointer hover:stroke-white/5 transition-colors"
                        onClick={(e) => handleInteractionClick(e, seg.id, seg.length)}
                    />
                </g>
            )
        })}

        {/* Hidden Path for physics calculation */}
        <path ref={pathRef} d={pathData} fill="none" stroke="none" />

        {/* --- MARKER LAYER --- */}
        {resolvedMarkers.map((m, i) => {
           const cfg = EVENT_CONFIG[m.type as keyof typeof EVENT_CONFIG];
           const isDragging = draggingMarkerId === m.id;
           
           // Environment Facilities (On Road)
           if (m.type === EventType.CROSSWALK) {
               return (
                  <g 
                    key={i} 
                    transform={`translate(${m.x}, ${m.y}) rotate(${m.angle})`}
                    className={viewMode === 'macro' ? 'cursor-grab active:cursor-grabbing hover:opacity-80' : ''}
                    onMouseDown={(e) => handleMarkerMouseDown(e, m.id)}
                  >
                      {/* Full width across road */}
                      <rect 
                        x={-15} 
                        y={-m.roadWidth/2} 
                        width="30" 
                        height={m.roadWidth} 
                        fill="url(#zebra)" 
                        opacity={isDragging ? 0.5 : 0.9} 
                      />
                  </g>
               )
           }
           
           if (m.type === EventType.SCHOOL_ZONE || m.type === EventType.BUS_STOP) {
               return (
                   <g 
                     key={i} 
                     transform={`translate(${m.x}, ${m.y}) rotate(${m.angle})`}
                     className={viewMode === 'macro' ? 'cursor-grab active:cursor-grabbing hover:opacity-80' : ''}
                     onMouseDown={(e) => handleMarkerMouseDown(e, m.id)}
                   >
                       {/* Painted Box on Road */}
                       <rect x="-20" y={5} width="40" height="20" fill={cfg?.color.replace('bg-', '') || "#f59e0b"} fillOpacity="0.3" stroke={cfg?.color.replace('bg-', '') || "orange"} strokeWidth="2" />
                       <text x="0" y="20" fill="white" fontSize="10" textAnchor="middle" transform="rotate(90)">{cfg?.label}</text>
                   </g>
               )
           }

           if (m.type === EventType.TRAFFIC_LIGHT) {
             return (
                   <g 
                      key={i} 
                      transform={`translate(${m.x}, ${m.y})`}
                      className={viewMode === 'macro' ? 'cursor-grab active:cursor-grabbing hover:opacity-80' : ''}
                      onMouseDown={(e) => handleMarkerMouseDown(e, m.id)}
                   >
                       <line x1="0" y1="0" x2="40" y2="-40" stroke="white" strokeWidth="2" opacity={isDragging ? 0.5 : 1}/>
                       <rect x="30" y="-60" width="20" height="40" rx="4" fill="#1e293b" stroke="white" strokeWidth="1"/>
                       <circle cx="40" cy="-50" r="4" fill="#ef4444" />
                       <circle cx="40" cy="-30" r="4" fill="#22c55e" opacity="0.2"/>
                   </g>
               )
           }

           // Action Markers (Text + Arrow)
           return (
             <g 
                key={i}
                className={viewMode === 'macro' ? 'cursor-grab active:cursor-grabbing' : ''}
                onMouseDown={(e) => handleMarkerMouseDown(e, m.id)}
                opacity={isDragging ? 0.6 : 1}
             >
                {/* Connector Line */}
                <line 
                  x1={m.x} y1={m.y} 
                  x2={m.labelX} y2={m.labelY} 
                  stroke="#cbd5e1" 
                  strokeWidth="1" 
                  strokeDasharray="2,2"
                />
                
                {/* Arrow Head at Path */}
                <circle cx={m.x} cy={m.y} r="2" fill="white" />
                
                {/* Text Label Box */}
                <g transform={`translate(${m.labelX}, ${m.labelY})`}>
                    <rect 
                        x="-24" y="-10" 
                        width="48" height="20" 
                        rx="4" 
                        fill="#0f172a" 
                        stroke={cfg?.color ? (cfg.color.includes('red') ? '#ef4444' : '#3b82f6') : '#cbd5e1'}
                        strokeWidth="1"
                        fillOpacity="0.8"
                    />
                    <text 
                        x="0" y="4" 
                        textAnchor="middle" 
                        fill="white" 
                        fontSize="10" 
                        fontWeight="bold"
                        pointerEvents="none"
                    >
                        {cfg?.label.replace('向', '').replace('变道', '') || m.type}
                    </text>
                </g>
             </g>
           );
        })}

        {/* --- CAR LAYER --- */}
        <g 
           transform={`translate(${carPos.x}, ${carPos.y}) rotate(${carPos.angle})`} 
           onMouseDown={handleCarMouseDown}
           className={viewMode === 'macro' ? 'cursor-grab active:cursor-grabbing hover:opacity-80' : ''}
        >
          <rect x="-10" y="-8" width="24" height="16" rx="3" fill="black" opacity="0.3" transform="translate(4, 4)" />
          <rect x="-12" y="-10" width="24" height="20" rx="4" fill="#3b82f6" stroke="#1d4ed8" strokeWidth="1" />
          <rect x="-6" y="-9" width="14" height="18" rx="2" fill="#2563eb" />
          <path d="M 8 -8 L 10 -8 L 10 8 L 8 8 Z" fill="#93c5fd" />
          <path d="M -4 -8 L -2 -8 L -2 8 L -4 8 Z" fill="#93c5fd" />
          <rect x="-12" y="-10" width="2" height="6" fill={isBraking ? "#ff0000" : "#7f1d1d"} className={isBraking ? "animate-pulse" : ""}/>
          <rect x="-12" y="4" width="2" height="6" fill={isBraking ? "#ff0000" : "#7f1d1d"} className={isBraking ? "animate-pulse" : ""}/>
          <rect x="10" y="-10" width="2" height="6" fill="#facc15" className={turnSignal === 'left' ? "animate-pulse" : "opacity-0"} />
          <rect x="10" y="4" width="2" height="6" fill="#facc15" className={turnSignal === 'right' ? "animate-pulse" : "opacity-0"} />
          <path d="M 12 -8 L 14 -8 L 14 -4 L 12 -4 Z" fill="#facc15" className={isPlaying ? "animate-pulse" : ""} />
          <path d="M 12 4 L 14 4 L 14 8 L 12 8 Z" fill="#facc15" className={isPlaying ? "animate-pulse" : ""} />
          {isPlaying && (
             <path d="M 14 -7 L 150 -40 L 150 40 L 14 7 Z" fill="url(#headlightGradient)" opacity="0.3" />
          )}
        </g>
        
        <defs>
          <linearGradient id="headlightGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#facc15" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
          </linearGradient>
        </defs>

      </svg>
      
      {/* UI Overlays */}
      <div className="absolute top-4 left-4 font-mono text-xs text-slate-400 bg-slate-900/80 px-2 py-1 rounded backdrop-blur pointer-events-none border border-slate-700">
        视角: {viewMode === 'macro' ? '全局地图 (拖拽路标/车辆)' : '驾驶跟随'}
      </div>

    </div>
  );
};

export default RoadCanvas;