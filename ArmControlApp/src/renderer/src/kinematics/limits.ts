import { ArmAngles, Point2D, JointLimits } from './types'
import { DEFAULT_L1, DEFAULT_L2 } from './forward'

export const L1 = DEFAULT_L1 // 0.4m
export const L2 = DEFAULT_L2 // 0.3m
export const R_MAX = L1 + L2 // 0.7m
export const R_MIN = Math.abs(L1 - L2) // 0.1m

export const DEFAULT_JOINT_LIMITS: JointLimits = {
  m1Min: (-170 * Math.PI) / 180, // -170 deg in radians (~ -2.967 rad)
  m1Max: (170 * Math.PI) / 180,  // +170 deg in radians (~ +2.967 rad)
  m2Min: (-150 * Math.PI) / 180, // -150 deg in radians (~ -2.618 rad)
  m2Max: (150 * Math.PI) / 180   // +150 deg in radians (~ +2.618 rad)
}

// 5 degrees in radians = 0.08726646259971647 rad
export const SINGULARITY_THRESHOLD_RAD = (5 * Math.PI) / 180

/**
 * Checks if a 2D target point is within the reachable workspace [R_MIN, R_MAX].
 *
 * @param target Target 2D point (x, y) in meters
 * @param l1 Length of link 1 in meters (default: 0.4)
 * @param l2 Length of link 2 in meters (default: 0.3)
 * @returns true if distance from base is between R_MIN and R_MAX
 */
export function isReachable(
  target: Point2D,
  l1: number = L1,
  l2: number = L2
): boolean {
  const rMin = Math.abs(l1 - l2)
  const rMax = l1 + l2
  const dist = Math.hypot(target.x, target.y)
  const eps = 1e-7
  return dist >= rMin - eps && dist <= rMax + eps
}

/**
 * Checks whether the given joint angles fall within the specified joint limits.
 *
 * @param angles Joint angles in radians
 * @param limits Joint angle limits in radians (defaults to DEFAULT_JOINT_LIMITS)
 * @returns true if both joints are within limits, false otherwise
 */
export function withinJointLimits(
  angles: ArmAngles,
  limits: JointLimits = DEFAULT_JOINT_LIMITS
): boolean {
  return (
    angles.theta1 >= limits.m1Min &&
    angles.theta1 <= limits.m1Max &&
    angles.theta2 >= limits.m2Min &&
    angles.theta2 <= limits.m2Max
  )
}

/**
 * Clamps joint angles to the valid limit range.
 *
 * @param angles Joint angles in radians
 * @param limits Joint limits in radians (defaults to DEFAULT_JOINT_LIMITS)
 * @returns Clamped ArmAngles
 */
export function clampToLimits(
  angles: ArmAngles,
  limits: JointLimits = DEFAULT_JOINT_LIMITS
): ArmAngles {
  return {
    theta1: Math.max(limits.m1Min, Math.min(limits.m1Max, angles.theta1)),
    theta2: Math.max(limits.m2Min, Math.min(limits.m2Max, angles.theta2))
  }
}

/**
 * Checks if theta2 is near a kinematic singularity.
 * True if theta2 is within 5 degrees (0.087 rad) of 0 (fully extended) or ±PI (fully folded).
 *
 * @param theta2 Elbow joint angle in radians
 * @param thresholdRad Angular threshold in radians (default: 5 degrees)
 * @returns true if near singularity, false otherwise
 */
export function isNearSingularity(
  theta2: number,
  thresholdRad: number = SINGULARITY_THRESHOLD_RAD
): boolean {
  const abs = Math.abs(theta2)
  // Fully extended singularity: theta2 ≈ 0
  if (abs <= thresholdRad) {
    return true
  }
  // Fully folded singularity: theta2 ≈ ±PI
  if (Math.abs(Math.PI - abs) <= thresholdRad) {
    return true
  }
  return false
}

/**
 * Generates an array of 2D points tracing the workspace boundary
 * for SVG rendering (outer arc R_MAX, inner arc R_MIN).
 *
 * @param steps Number of points around the circular arc (default: 64)
 * @param l1 Length of link 1 in meters (default: 0.4)
 * @param l2 Length of link 2 in meters (default: 0.3)
 * @returns Object with outer and inner array of Point2D
 */
export function workspaceArcPoints(
  steps: number = 64,
  l1: number = L1,
  l2: number = L2
): { outer: Point2D[]; inner: Point2D[] } {
  const rMax = l1 + l2
  const rMin = Math.abs(l1 - l2)
  const outer: Point2D[] = []
  const inner: Point2D[] = []

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    outer.push({
      x: rMax * Math.cos(angle),
      y: rMax * Math.sin(angle)
    })
    inner.push({
      x: rMin * Math.cos(angle),
      y: rMin * Math.sin(angle)
    })
  }

  return { outer, inner }
}
