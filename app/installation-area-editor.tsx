"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, Layer, Line, Stage } from "react-konva";

export type PolygonPoint = { x: number; y: number };

export default function InstallationAreaEditor({
  points,
  onChange,
  disabled = false,
}: {
  points: PolygonPoint[];
  onChange: (points: PolygonPoint[]) => void;
  disabled?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0)
        setSize({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  const stagePoints = points.flatMap((point) => [
    point.x * size.width,
    point.y * size.height,
  ]);

  return (
    <div
      ref={hostRef}
      className="installation-area-editor"
      aria-label="Four-corner installation area editor"
    >
      {size.width > 0 && size.height > 0 && (
        <Stage
          width={size.width}
          height={size.height}
          onPointerDown={(event) => {
            if (disabled || points.length >= 4) return;
            const stage = event.target.getStage();
            if (!stage || event.target !== stage) return;
            const pointer = stage.getPointerPosition();
            if (!pointer) return;
            onChange([
              ...points,
              {
                x: Math.max(0, Math.min(1, pointer.x / size.width)),
                y: Math.max(0, Math.min(1, pointer.y / size.height)),
              },
            ]);
          }}
        >
          <Layer>
            {points.length > 1 && (
              <Line
                points={stagePoints}
                closed={points.length === 4}
                stroke="#f4f1ea"
                strokeWidth={2}
                dash={[7, 6]}
                fill={points.length === 4 ? "rgba(216,176,142,0.14)" : undefined}
                listening={false}
              />
            )}
            {points.map((point, index) => (
              <Circle
                key={index}
                x={point.x * size.width}
                y={point.y * size.height}
                radius={9}
                fill="#d8b08e"
                stroke="#ffffff"
                strokeWidth={2}
                draggable={!disabled}
                onDragMove={(event) => {
                  const next = [...points];
                  next[index] = {
                    x: Math.max(0, Math.min(1, event.target.x() / size.width)),
                    y: Math.max(0, Math.min(1, event.target.y() / size.height)),
                  };
                  onChange(next);
                }}
              />
            ))}
          </Layer>
        </Stage>
      )}
    </div>
  );
}
