import { ArmAngles } from './types'

// Default max joint speed: 180 deg/sec = PI rad/s (~3.14159 rad/s)
export const DEFAULT_MAX_JOINT_SPEED_RAD_S = Math.PI

/**
 * MOVE_J: Joint-space linear interpolation.
 * Interpolates smoothly between starting joint angles and ending joint angles across a specified number of steps.
 *
 * @param start Starting joint angles in radians
 * @param end Ending joint angles in radians
 * @param steps Number of interpolation steps (waypoints to produce)
 * @param speed Speed factor (0.0 to 1.0, where 1.0 is 100% max joint speed, default: 1.0)
 * @returns Array of interpolated ArmAngles for each step
 */
export function interpolateMoveJ(
  start: ArmAngles,
  end: ArmAngles,
  steps: number,
  speed: number = 1.0
): ArmAngles[] {
  if (steps <= 0) {
    return []
  }

  if (steps === 1) {
    return [{ theta1: end.theta1, theta2: end.theta2 }]
  }

  const waypoints: ArmAngles[] = []
  const dTheta1 = end.theta1 - start.theta1
  const dTheta2 = end.theta2 - start.theta2

  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    waypoints.push({
      theta1: start.theta1 + t * dTheta1,
      theta2: start.theta2 + t * dTheta2
    })
  }

  return waypoints
}

/**
 * Estimates the duration of a MOVE_J motion in milliseconds.
 *
 * Calculation:
 * Duration is dominated by the joint that needs to rotate the maximum angular distance:
 * duration = max(|Δtheta1|, |Δtheta2|) / (speed * maxJointSpeed)
 *
 * @param start Starting joint angles in radians
 * @param end Ending joint angles in radians
 * @param speed Speed factor (0.0 to 1.0 fraction of maximum speed)
 * @param maxJointSpeedRadPerSec Maximum joint speed in radians per second (default: PI rad/s = 180 deg/s)
 * @returns Estimated duration in milliseconds
 */
export function estimateDuration(
  start: ArmAngles,
  end: ArmAngles,
  speed: number = 1.0,
  maxJointSpeedRadPerSec: number = DEFAULT_MAX_JOINT_SPEED_RAD_S
): number {
  const dTheta1 = Math.abs(end.theta1 - start.theta1)
  const dTheta2 = Math.abs(end.theta2 - start.theta2)
  const maxDelta = Math.max(dTheta1, dTheta2)

  if (maxDelta === 0) {
    return 0
  }

  const clampedSpeed = Math.max(0.01, Math.min(1.0, speed || 0.01))
  const effectiveSpeed = clampedSpeed * maxJointSpeedRadPerSec

  const durationSec = maxDelta / effectiveSpeed
  return Math.round(durationSec * 1000)
}
