import { ArmAngles, ArmPoints } from './types'

export const DEFAULT_L1 = 0.4 // meters (400 mm)
export const DEFAULT_L2 = 0.3 // meters (300 mm)

/**
 * Converts radians to degrees.
 */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

/**
 * Converts degrees to radians.
 */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Calculates Forward Kinematics (FK) for a 2-DOF planar arm.
 * Base is fixed at (0, 0).
 *
 * x_elbow = L1 * cos(theta1)
 * y_elbow = L1 * sin(theta1)
 * x_end = x_elbow + L2 * cos(theta1 + theta2)
 * y_end = y_elbow + L2 * sin(theta1 + theta2)
 *
 * @param angles Joint angles in radians (theta1, theta2)
 * @param l1 Length of link 1 in meters (default: 0.4)
 * @param l2 Length of link 2 in meters (default: 0.3)
 * @returns ArmPoints containing 2D coordinates of base, elbow, and end-effector
 */
export function forwardKinematics(
  angles: ArmAngles,
  l1: number = DEFAULT_L1,
  l2: number = DEFAULT_L2
): ArmPoints {
  const { theta1, theta2 } = angles

  const xElbow = l1 * Math.cos(theta1)
  const yElbow = l1 * Math.sin(theta1)

  const xEnd = xElbow + l2 * Math.cos(theta1 + theta2)
  const yEnd = yElbow + l2 * Math.sin(theta1 + theta2)

  return {
    base: { x: 0, y: 0 },
    elbow: { x: xElbow, y: yElbow },
    endEffector: { x: xEnd, y: yEnd }
  }
}
