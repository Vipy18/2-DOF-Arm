import React from 'react'
import { forwardKinematics, DEFAULT_L1, DEFAULT_L2 } from '../kinematics'

export interface MiniArmCanvasProps {
  currentAngles: { theta1: number; theta2: number }
  previewAngles?: { theta1: number; theta2: number } | null
  l1?: number
  l2?: number
  height?: number
}

export const MiniArmCanvas: React.FC<MiniArmCanvasProps> = ({
  currentAngles,
  previewAngles,
  l1 = DEFAULT_L1,
  l2 = DEFAULT_L2,
  height = 280
}) => {
  // Max radius for viewport scaling
  const rMax = l1 + l2 // 0.7m
  const viewBoxSize = 1.6 // from -0.8 to +0.8 meters
  const scale = 140 / (rMax * 1.1) // pixels per meter centered at (150, 150)
  const cx = 150
  const cy = 150

  // Coordinate transform: X right (+), Y up (+) in physical space -> SVG canvas (X right, Y down)
  const toSvg = (x: number, y: number) => ({
    x: cx + x * scale,
    y: cy - y * scale
  })

  // Current arm points
  const currentPoints = forwardKinematics(currentAngles, l1, l2)
  const pBase = toSvg(currentPoints.base.x, currentPoints.base.y)
  const pElbow = toSvg(currentPoints.elbow.x, currentPoints.elbow.y)
  const pEnd = toSvg(currentPoints.endEffector.x, currentPoints.endEffector.y)

  // Preview / ghost arm points if available
  const previewPoints = previewAngles
    ? forwardKinematics(previewAngles, l1, l2)
    : null
  const pPrevElbow = previewPoints ? toSvg(previewPoints.elbow.x, previewPoints.elbow.y) : null
  const pPrevEnd = previewPoints ? toSvg(previewPoints.endEffector.x, previewPoints.endEffector.y) : null

  const rMaxSvg = rMax * scale
  const rMinSvg = Math.abs(l1 - l2) * scale

  return (
    <div className="relative w-full rounded-2xl bg-black/40 border border-white/[0.08] overflow-hidden flex flex-col items-center justify-center p-2">
      <svg
        viewBox="0 0 300 300"
        className="w-full max-h-[260px] select-none"
        style={{ height }}
      >
        <defs>
          {/* Subtle grid pattern */}
          <pattern id="mini-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="rgba(255, 255, 255, 0.03)"
              strokeWidth="1"
            />
          </pattern>

          {/* Radial gradient for workspace boundary */}
          <radialGradient id="workspace-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.01" />
          </radialGradient>
        </defs>

        {/* Background Grid */}
        <rect width="300" height="300" fill="url(#mini-grid)" />

        {/* Workspace Arcs */}
        <circle
          cx={cx}
          cy={cy}
          r={rMaxSvg}
          fill="url(#workspace-glow)"
          stroke="rgba(56, 189, 248, 0.25)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <circle
          cx={cx}
          cy={cy}
          r={rMinSvg}
          fill="#131318"
          stroke="rgba(239, 68, 68, 0.25)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* Coordinate Axes */}
        <line
          x1={cx - rMaxSvg - 10}
          y1={cy}
          x2={cx + rMaxSvg + 10}
          y2={cy}
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="1"
        />
        <line
          x1={cx}
          y1={cy - rMaxSvg - 10}
          x2={cx}
          y2={cy + rMaxSvg + 10}
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="1"
        />

        {/* Preview Ghost Arm (if active) */}
        {previewPoints && pPrevElbow && pPrevEnd && (
          <g opacity={0.8}>
            {/* Ghost Link 1 */}
            <line
              x1={pBase.x}
              y1={pBase.y}
              x2={pPrevElbow.x}
              y2={pPrevElbow.y}
              stroke="#F59E0B"
              strokeWidth="4"
              strokeDasharray="4 3"
              strokeLinecap="round"
            />
            {/* Ghost Link 2 */}
            <line
              x1={pPrevElbow.x}
              y1={pPrevElbow.y}
              x2={pPrevEnd.x}
              y2={pPrevEnd.y}
              stroke="#F59E0B"
              strokeWidth="3"
              strokeDasharray="4 3"
              strokeLinecap="round"
            />
            {/* Ghost Elbow */}
            <circle
              cx={pPrevElbow.x}
              cy={pPrevElbow.y}
              r="4"
              fill="#F59E0B"
              stroke="#131318"
              strokeWidth="1.5"
            />
            {/* Ghost End-Effector */}
            <circle
              cx={pPrevEnd.x}
              cy={pPrevEnd.y}
              r="5"
              fill="#F59E0B"
              stroke="#FFFFFF"
              strokeWidth="1"
            />
          </g>
        )}

        {/* Live Current Arm */}
        {/* Link 1 */}
        <line
          x1={pBase.x}
          y1={pBase.y}
          x2={pElbow.x}
          y2={pElbow.y}
          stroke="#38BDF8"
          strokeWidth="5"
          strokeLinecap="round"
        />

        {/* Link 2 */}
        <line
          x1={pElbow.x}
          y1={pElbow.y}
          x2={pEnd.x}
          y2={pEnd.y}
          stroke="#0284C7"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Base Joint */}
        <circle cx={pBase.x} cy={pBase.y} r="6" fill="#1E293B" stroke="#38BDF8" strokeWidth="2" />
        <circle cx={pBase.x} cy={pBase.y} r="2" fill="#FFFFFF" />

        {/* Elbow Joint */}
        <circle cx={pElbow.x} cy={pElbow.y} r="5" fill="#0369A1" stroke="#38BDF8" strokeWidth="2" />
        <circle cx={pElbow.x} cy={pElbow.y} r="1.5" fill="#FFFFFF" />

        {/* End-Effector Tool Point */}
        <circle cx={pEnd.x} cy={pEnd.y} r="6" fill="#38BDF8" stroke="#FFFFFF" strokeWidth="2" />
      </svg>

      {/* Mini Overlay Stats */}
      <div className="w-full flex items-center justify-between px-3 py-1 bg-black/40 border-t border-white/[0.06] text-[10px] font-mono text-slate-400">
        <div>
          EE: <span className="text-slate-200">X: {currentPoints.endEffector.x.toFixed(3)}m, Y: {currentPoints.endEffector.y.toFixed(3)}m</span>
        </div>
        {previewPoints && (
          <div className="text-amber-400 font-semibold animate-pulse">
            PREVIEW TARGET
          </div>
        )}
      </div>
    </div>
  )
}
