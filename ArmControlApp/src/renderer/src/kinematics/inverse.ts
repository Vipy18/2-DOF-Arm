import { Point2D, ArmAngles, ElbowConfig, IKResult } from './types'
import { DEFAULT_L1, DEFAULT_L2 } from './forward'
import { isReachable, isNearSingularity } from './limits'

/**
 * Normalizes an angle in radians to the range (-PI, PI].
 */
function normalizeAngle(rad: number): number {
  let a = rad % (2 * Math.PI)
  if (a > Math.PI) a -= 2 * Math.PI
  if (a <= -Math.PI) a += 2 * Math.PI
  return a
}

/**
 * Geometric 2-link Inverse Kinematics (IK).
 *
 * Mathematical derivation:
 * cos(theta2) = (x^2 + y^2 - L1^2 - L2^2) / (2 * L1 * L2)
 * If |cos(theta2)| > 1: unreachable
 * theta2_up = -acos(cos_theta2)   (elbow-up: negative theta2)
 * theta2_down = +acos(cos_theta2) (elbow-down: positive theta2)
 * k1 = L1 + L2 * cos(theta2)
 * k2 = L2 * sin(theta2)
 * theta1 = atan2(y, x) - atan2(k2, k1)
 *
 * @param target Target position (x, y) in meters
 * @param elbow Desired elbow configuration: 'up' or 'down' (default: 'down')
 * @param l1 Length of link 1 in meters (default: 0.4)
 * @param l2 Length of link 2 in meters (default: 0.3)
 * @returns IKResult with primary solution, alternative solution, reachability, and singularity flag
 */
export function inverseKinematics(
  target: Point2D,
  elbow: ElbowConfig = 'down',
  l1: number = DEFAULT_L1,
  l2: number = DEFAULT_L2
): IKResult {
  const { x, y } = target

  // Check physical reachability
  if (!isReachable(target, l1, l2)) {
    return {
      solution: null,
      elbow,
      isReachable: false,
      isSingular: false,
      alternativeSolution: null
    }
  }

  const distSq = x * x + y * y
  let cosTheta2 = (distSq - l1 * l1 - l2 * l2) / (2 * l1 * l2)

  // Clamp numerical inaccuracies to [-1, 1]
  if (cosTheta2 > 1) cosTheta2 = 1
  if (cosTheta2 < -1) cosTheta2 = -1

  const acosVal = Math.acos(cosTheta2)

  // Elbow-down (theta2 >= 0)
  const theta2Down = acosVal
  const k1Down = l1 + l2 * Math.cos(theta2Down)
  const k2Down = l2 * Math.sin(theta2Down)
  const theta1Down = normalizeAngle(Math.atan2(y, x) - Math.atan2(k2Down, k1Down))

  // Elbow-up (theta2 <= 0)
  const theta2Up = -acosVal
  const k1Up = l1 + l2 * Math.cos(theta2Up)
  const k2Up = l2 * Math.sin(theta2Up)
  const theta1Up = normalizeAngle(Math.atan2(y, x) - Math.atan2(k2Up, k1Up))

  const solutionDown: ArmAngles = {
    theta1: theta1Down,
    theta2: theta2Down
  }

  const solutionUp: ArmAngles = {
    theta1: theta1Up,
    theta2: theta2Up
  }

  const primarySolution = elbow === 'up' ? solutionUp : solutionDown
  const alternativeSolution = elbow === 'up' ? solutionDown : solutionUp
  const isSingular = isNearSingularity(primarySolution.theta2)

  return {
    solution: primarySolution,
    elbow,
    isReachable: true,
    isSingular,
    alternativeSolution
  }
}
