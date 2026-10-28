/**
 * Kinematics Type Definitions for Robstride 2-DOF SCARA / Planar Arm.
 *
 * Geometry:
 * - Link 1 (L1): 400mm = 0.4m (base -> elbow), controlled by Motor 1
 * - Link 2 (L2): 300mm = 0.3m (elbow -> end-effector), controlled by Motor 2
 * - Base pivot: fixed at (0, 0) in 2D plane
 * - All angles in RADIANS internally, converted to degrees for display
 */

export interface Point2D {
  x: number // meters
  y: number // meters
}

export interface ArmAngles {
  theta1: number // radians (Motor 1 / Shoulder / Base joint)
  theta2: number // radians (Motor 2 / Elbow joint relative to Link 1)
}

export interface ArmPoints {
  base: Point2D // Fixed base at (0, 0)
  elbow: Point2D // Elbow joint position (x1, y1)
  endEffector: Point2D // End-effector position (x2, y2)
}

export type ElbowConfig = 'up' | 'down'

export interface IKResult {
  solution: ArmAngles | null
  elbow: ElbowConfig
  isReachable: boolean
  isSingular: boolean
  alternativeSolution: ArmAngles | null
}

export interface JointLimits {
  m1Min: number // radians
  m1Max: number // radians
  m2Min: number // radians
  m2Max: number // radians
}

export interface ArmDimensions {
  l1: number // meters (default: 0.4)
  l2: number // meters (default: 0.3)
}
