import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Point2D } from '../kinematics/types'
import { forwardKinematics } from '../kinematics/forward'
import { R_MAX, R_MIN } from '../kinematics/limits'

export interface ArmCanvasProps {
  theta1: number // radians (Motor 1 angle)
  theta2: number // radians (Motor 2 angle)
  interactive?: boolean // enables drag handles
  showWorkspace?: boolean // show workspace arc
  onEndEffectorDrag?: (point: Point2D) => void // called during drag
  onEndEffectorDragEnd?: (point: Point2D) => void // called on mouse up
  width?: number | string
  height?: number | string
  l1?: number // link 1 length in meters (default 0.4)
  l2?: number // link 2 length in meters (default 0.3)
}

const SCALE = 600 // 1 meter = 600px
const ORIGIN_X = 500
const ORIGIN_Y = 500

export default function ArmCanvas({
  theta1,
  theta2,
  interactive = false,
  showWorkspace = true,
  onEndEffectorDrag,
  onEndEffectorDragEnd,
  width = '100%',
  height = '100%',
  l1 = 0.4,
  l2 = 0.3
}: ArmCanvasProps): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  // Compute forward kinematics
  const points = forwardKinematics({ theta1, theta2 }, l1, l2)

  // Convert meters to SVG coordinate space
  const elbowPx = {
    x: points.elbow.x * SCALE,
    y: points.elbow.y * SCALE
  }

  const endPx = {
    x: points.endEffector.x * SCALE,
    y: points.endEffector.y * SCALE
  }

  const rMaxPx = (R_MAX ?? l1 + l2) * SCALE
  const rMinPx = (R_MIN ?? Math.abs(l1 - l2)) * SCALE

  // Convert client coordinates to world coordinates in meters
  const clientToWorld = useCallback((clientX: number, clientY: number): Point2D | null => {
    const svg = svgRef.current
    if (!svg) return null

    try {
      const pt = svg.createSVGPoint()
      pt.x = clientX
      pt.y = clientY
      const ctm = svg.getScreenCTM()
      if (!ctm) return null

      const svgPt = pt.matrixTransform(ctm.inverse())
      const worldX = (svgPt.x - ORIGIN_X) / SCALE
      const worldY = (ORIGIN_Y - svgPt.y) / SCALE // inverted Y axis

      return { x: worldX, y: worldY }
    } catch (err) {
      console.error('Error converting coordinates:', err)
      return null
    }
  }, [])

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent): void => {
    if (!interactive) return
    e.preventDefault()
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent): void => {
      const worldPoint = clientToWorld(e.clientX, e.clientY)
      if (worldPoint && onEndEffectorDrag) {
        onEndEffectorDrag(worldPoint)
      }
    }

    const handleMouseUp = (e: MouseEvent): void => {
      setIsDragging(false)
      const worldPoint = clientToWorld(e.clientX, e.clientY)
      if (worldPoint && onEndEffectorDragEnd) {
        onEndEffectorDragEnd(worldPoint)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, clientToWorld, onEndEffectorDrag, onEndEffectorDragEnd])

  // Annular workspace path
  const workspacePath = `
    M 0, -${rMaxPx}
    A ${rMaxPx},${rMaxPx} 0 1,0 0,${rMaxPx}
    A ${rMaxPx},${rMaxPx} 0 1,0 0,-${rMaxPx}
    M 0, -${rMinPx}
    A ${rMinPx},${rMinPx} 0 1,1 0,${rMinPx}
    A ${rMinPx},${rMinPx} 0 1,1 0,-${rMinPx}
    Z
  `

  return (
    <div
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
        userSelect: 'none'
      }}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        height="100%"
        style={{
          width: '100%',
          height: '100%',
          maxHeight: '100%',
          maxWidth: '100%',
          display: 'block'
        }}
      >
        <defs>
          {/* Subtle 50px dot grid */}
          <pattern id="armDotGrid" width="50" height="50" patternUnits="userSpaceOnUse">
            <circle cx="25" cy="25" r="1.5" fill="rgba(255, 255, 255, 0.06)" />
          </pattern>

          {/* Elbow Glow Filter */}
          <filter id="elbowGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#38BDF8" floodOpacity="0.8" />
          </filter>

          {/* End-Effector Glow Filter */}
          <filter id="eeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#ffffff" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* Background Dot Grid */}
        <rect width="1000" height="1000" fill="url(#armDotGrid)" />

        {/* Transformed Arm Space: Base at (ORIGIN_X, ORIGIN_Y), Y+ upwards */}
        <g transform={`translate(${ORIGIN_X}, ${ORIGIN_Y}) scale(1, -1)`}>
          {/* Workspace Annulus */}
          {showWorkspace && (
            <path
              d={workspacePath}
              fill="rgba(56, 189, 248, 0.04)"
              stroke="rgba(56, 189, 248, 0.15)"
              strokeWidth="1.5"
              strokeDasharray="4,4"
              fillRule="evenodd"
            />
          )}

          {/* X and Y subtle coordinate axes at base */}
          <line x1="-450" y1="0" x2="450" y2="0" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" />
          <line x1="0" y1="-450" x2="0" y2="450" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" />

          {/* Link 1: Base -> Elbow */}
          <line
            x1={0}
            y1={0}
            x2={elbowPx.x}
            y2={elbowPx.y}
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth={12}
            strokeLinecap="round"
          />

          {/* Link 2: Elbow -> End-Effector */}
          <line
            x1={elbowPx.x}
            y1={elbowPx.y}
            x2={endPx.x}
            y2={endPx.y}
            stroke="rgba(255, 255, 255, 0.70)"
            strokeWidth={10}
            strokeLinecap="round"
          />

          {/* Base Pivot */}
          <circle
            cx={0}
            cy={0}
            r={12}
            fill="none"
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth={2}
          />
          <circle cx={0} cy={0} r={8} fill="#e4e1e9" />

          {/* Elbow Joint */}
          <circle
            cx={elbowPx.x}
            cy={elbowPx.y}
            r={10}
            fill="#38BDF8"
            filter="url(#elbowGlow)"
          />

          {/* End-Effector Interactive Joint */}
          <g
            style={{
              cursor: interactive ? (isDragging ? 'grabbing' : 'crosshair') : 'default'
            }}
            onMouseEnter={() => interactive && setIsHovered(true)}
            onMouseLeave={() => interactive && setIsHovered(false)}
            onMouseDown={handleMouseDown}
          >
            {/* Outer ring on hover or drag */}
            {interactive && (isHovered || isDragging) && (
              <circle
                cx={endPx.x}
                cy={endPx.y}
                r={18}
                fill="none"
                stroke="#38BDF8"
                strokeWidth={2}
                strokeDasharray={isDragging ? 'none' : '3,3'}
              />
            )}

            {/* End-Effector solid circle */}
            <circle
              cx={endPx.x}
              cy={endPx.y}
              r={12}
              fill="#ffffff"
              filter="url(#eeGlow)"
            />

            {/* Center dot */}
            <circle
              cx={endPx.x}
              cy={endPx.y}
              r={3}
              fill="#131318"
            />
          </g>
        </g>
      </svg>
    </div>
  )
}
