import { describe, it, expect } from 'vitest'
import {
  forwardKinematics,
  radToDeg,
  degToRad,
  DEFAULT_L1,
  DEFAULT_L2
} from '../forward'
import { inverseKinematics } from '../inverse'
import {
  isReachable,
  withinJointLimits,
  clampToLimits,
  isNearSingularity,
  workspaceArcPoints,
  DEFAULT_JOINT_LIMITS,
  R_MAX,
  R_MIN
} from '../limits'
import { interpolateMoveJ, estimateDuration, DEFAULT_MAX_JOINT_SPEED_RAD_S } from '../interpolate'
import { ArmAngles, Point2D } from '../types'

describe('Forward Kinematics', () => {
  it('computes correct positions for theta1=0, theta2=0 (fully extended along +X)', () => {
    const angles: ArmAngles = { theta1: 0, theta2: 0 }
    const points = forwardKinematics(angles)

    expect(points.base).toEqual({ x: 0, y: 0 })
    expect(points.elbow.x).toBeCloseTo(0.4, 6)
    expect(points.elbow.y).toBeCloseTo(0.0, 6)
    expect(points.endEffector.x).toBeCloseTo(0.7, 6)
    expect(points.endEffector.y).toBeCloseTo(0.0, 6)
  })

  it('computes correct positions for theta1=PI/2, theta2=0 (fully extended along +Y)', () => {
    const angles: ArmAngles = { theta1: Math.PI / 2, theta2: 0 }
    const points = forwardKinematics(angles)

    expect(points.base).toEqual({ x: 0, y: 0 })
    expect(points.elbow.x).toBeCloseTo(0.0, 6)
    expect(points.elbow.y).toBeCloseTo(0.4, 6)
    expect(points.endEffector.x).toBeCloseTo(0.0, 6)
    expect(points.endEffector.y).toBeCloseTo(0.7, 6)
  })

  it('computes correct positions for theta1=0, theta2=PI/2 (elbow 90 deg up)', () => {
    const angles: ArmAngles = { theta1: 0, theta2: Math.PI / 2 }
    const points = forwardKinematics(angles)

    expect(points.elbow.x).toBeCloseTo(0.4, 6)
    expect(points.elbow.y).toBeCloseTo(0.0, 6)
    expect(points.endEffector.x).toBeCloseTo(0.4, 6)
    expect(points.endEffector.y).toBeCloseTo(0.3, 6)
  })

  it('computes correct positions for theta1=0, theta2=PI (arm folded back onto link 1)', () => {
    const angles: ArmAngles = { theta1: 0, theta2: Math.PI }
    const points = forwardKinematics(angles)

    expect(points.elbow.x).toBeCloseTo(0.4, 6)
    expect(points.elbow.y).toBeCloseTo(0.0, 6)
    expect(points.endEffector.x).toBeCloseTo(0.1, 6) // L1 - L2 = 0.4 - 0.3 = 0.1
    expect(points.endEffector.y).toBeCloseTo(0.0, 6)
  })

  it('correctly converts between radians and degrees', () => {
    expect(radToDeg(0)).toBeCloseTo(0, 6)
    expect(radToDeg(Math.PI)).toBeCloseTo(180, 6)
    expect(radToDeg(Math.PI / 2)).toBeCloseTo(90, 6)
    expect(radToDeg(-Math.PI / 4)).toBeCloseTo(-45, 6)

    expect(degToRad(0)).toBeCloseTo(0, 6)
    expect(degToRad(180)).toBeCloseTo(Math.PI, 6)
    expect(degToRad(90)).toBeCloseTo(Math.PI / 2, 6)
    expect(degToRad(-45)).toBeCloseTo(-Math.PI / 4, 6)
  })
})

describe('Inverse Kinematics', () => {
  it('round-trip FK -> IK recovers original joint angles for elbow-down', () => {
    const testCases: ArmAngles[] = [
      { theta1: degToRad(30), theta2: degToRad(45) },
      { theta1: degToRad(-45), theta2: degToRad(60) },
      { theta1: degToRad(90), theta2: degToRad(30) },
      { theta1: degToRad(-120), theta2: degToRad(80) }
    ]

    for (const originalAngles of testCases) {
      const fk = forwardKinematics(originalAngles)
      const ik = inverseKinematics(fk.endEffector, 'down')

      expect(ik.isReachable).toBe(true)
      expect(ik.solution).not.toBeNull()
      expect(ik.solution!.theta1).toBeCloseTo(originalAngles.theta1, 5)
      expect(ik.solution!.theta2).toBeCloseTo(originalAngles.theta2, 5)

      // Verify FK on recovered IK angles matches original end-effector position
      const verifiedFK = forwardKinematics(ik.solution!)
      expect(verifiedFK.endEffector.x).toBeCloseTo(fk.endEffector.x, 5)
      expect(verifiedFK.endEffector.y).toBeCloseTo(fk.endEffector.y, 5)
    }
  })

  it('round-trip FK -> IK recovers original joint angles for elbow-up', () => {
    const testCases: ArmAngles[] = [
      { theta1: degToRad(30), theta2: degToRad(-45) },
      { theta1: degToRad(-45), theta2: degToRad(-60) },
      { theta1: degToRad(90), theta2: degToRad(-30) },
      { theta1: degToRad(-120), theta2: degToRad(-80) }
    ]

    for (const originalAngles of testCases) {
      const fk = forwardKinematics(originalAngles)
      const ik = inverseKinematics(fk.endEffector, 'up')

      expect(ik.isReachable).toBe(true)
      expect(ik.solution).not.toBeNull()
      expect(ik.solution!.theta1).toBeCloseTo(originalAngles.theta1, 5)
      expect(ik.solution!.theta2).toBeCloseTo(originalAngles.theta2, 5)

      const verifiedFK = forwardKinematics(ik.solution!)
      expect(verifiedFK.endEffector.x).toBeCloseTo(fk.endEffector.x, 5)
      expect(verifiedFK.endEffector.y).toBeCloseTo(fk.endEffector.y, 5)
    }
  })

  it('returns both primary and alternative solutions', () => {
    const target: Point2D = { x: 0.4, y: 0.3 }
    const ikDown = inverseKinematics(target, 'down')
    const ikUp = inverseKinematics(target, 'up')

    expect(ikDown.isReachable).toBe(true)
    expect(ikDown.solution).not.toBeNull()
    expect(ikDown.alternativeSolution).not.toBeNull()

    // Primary of 'down' matches alternative of 'up'
    expect(ikDown.solution!.theta1).toBeCloseTo(ikUp.alternativeSolution!.theta1, 5)
    expect(ikDown.solution!.theta2).toBeCloseTo(ikUp.alternativeSolution!.theta2, 5)

    // Alternative of 'down' matches primary of 'up'
    expect(ikDown.alternativeSolution!.theta1).toBeCloseTo(ikUp.solution!.theta1, 5)
    expect(ikDown.alternativeSolution!.theta2).toBeCloseTo(ikUp.solution!.theta2, 5)

    // Theta2 for down is positive, for up is negative
    expect(ikDown.solution!.theta2).toBeGreaterThan(0)
    expect(ikUp.solution!.theta2).toBeLessThan(0)
  })

  it('detects unreachable targets beyond R_MAX (0.7m)', () => {
    const target: Point2D = { x: 0.8, y: 0.0 }
    const ik = inverseKinematics(target, 'down')

    expect(ik.isReachable).toBe(false)
    expect(ik.solution).toBeNull()
    expect(ik.alternativeSolution).toBeNull()
  })

  it('detects unreachable targets inside R_MIN (0.1m)', () => {
    const target: Point2D = { x: 0.0, y: 0.0 }
    const ik = inverseKinematics(target, 'down')

    expect(ik.isReachable).toBe(false)
    expect(ik.solution).toBeNull()

    const targetInside: Point2D = { x: 0.05, y: 0.05 } // distance ≈ 0.0707m < 0.1m
    const ikInside = inverseKinematics(targetInside, 'down')
    expect(ikInside.isReachable).toBe(false)
    expect(ikInside.solution).toBeNull()
  })

  it('detects singularity at full extension (theta2=0) and full fold (theta2=PI)', () => {
    // Target on outer boundary: distance = 0.7m -> theta2 = 0
    const targetOuter: Point2D = { x: 0.7, y: 0.0 }
    const ikOuter = inverseKinematics(targetOuter, 'down')
    expect(ikOuter.isReachable).toBe(true)
    expect(ikOuter.isSingular).toBe(true)

    // Target on inner boundary: distance = 0.1m -> theta2 = PI
    const targetInner: Point2D = { x: 0.1, y: 0.0 }
    const ikInner = inverseKinematics(targetInner, 'down')
    expect(ikInner.isReachable).toBe(true)
    expect(ikInner.isSingular).toBe(true)

    // Mid-range target: distance = 0.5m -> not singular
    const targetMid: Point2D = { x: 0.35, y: 0.35 } // distance ≈ 0.495m
    const ikMid = inverseKinematics(targetMid, 'down')
    expect(ikMid.isReachable).toBe(true)
    expect(ikMid.isSingular).toBe(false)
  })
})

describe('Limits and Workspace', () => {
  it('correctly validates workspace reachability', () => {
    expect(isReachable({ x: 0.7, y: 0 })).toBe(true)
    expect(isReachable({ x: 0.1, y: 0 })).toBe(true)
    expect(isReachable({ x: 0.4, y: 0.3 })).toBe(true) // distance = 0.5m

    expect(isReachable({ x: 0.8, y: 0 })).toBe(false) // > 0.7m
    expect(isReachable({ x: 0.0, y: 0 })).toBe(false) // < 0.1m
    expect(isReachable({ x: 0.05, y: 0.05 })).toBe(false)
  })

  it('correctly checks joint limits', () => {
    expect(withinJointLimits({ theta1: 0, theta2: 0 })).toBe(true)
    expect(
      withinJointLimits({
        theta1: degToRad(160),
        theta2: degToRad(140)
      })
    ).toBe(true)

    // Motor 1 exceeds limit (+170 deg)
    expect(
      withinJointLimits({
        theta1: degToRad(175),
        theta2: 0
      })
    ).toBe(false)

    // Motor 2 exceeds limit (-150 deg)
    expect(
      withinJointLimits({
        theta1: 0,
        theta2: degToRad(-155)
      })
    ).toBe(false)
  })

  it('clamps angles to specified limits', () => {
    const outOfBounds: ArmAngles = {
      theta1: degToRad(180),
      theta2: degToRad(-170)
    }
    const clamped = clampToLimits(outOfBounds)

    expect(clamped.theta1).toBeCloseTo(DEFAULT_JOINT_LIMITS.m1Max, 6)
    expect(clamped.theta2).toBeCloseTo(DEFAULT_JOINT_LIMITS.m2Min, 6)
  })

  it('detects singularity within 5 degrees of 0 and PI', () => {
    expect(isNearSingularity(0)).toBe(true)
    expect(isNearSingularity(degToRad(3))).toBe(true)
    expect(isNearSingularity(degToRad(-4.9))).toBe(true)
    expect(isNearSingularity(degToRad(6))).toBe(false)

    expect(isNearSingularity(Math.PI)).toBe(true)
    expect(isNearSingularity(Math.PI - degToRad(3))).toBe(true)
    expect(isNearSingularity(-Math.PI + degToRad(4))).toBe(true)
    expect(isNearSingularity(degToRad(90))).toBe(false)
  })

  it('generates correct workspace arc points', () => {
    const { outer, inner } = workspaceArcPoints(16)

    expect(outer.length).toBe(17)
    expect(inner.length).toBe(17)

    for (const pt of outer) {
      expect(Math.hypot(pt.x, pt.y)).toBeCloseTo(R_MAX, 6)
    }

    for (const pt of inner) {
      expect(Math.hypot(pt.x, pt.y)).toBeCloseTo(R_MIN, 6)
    }
  })
})

describe('Interpolation and Motion Planning', () => {
  it('returns empty array for steps <= 0', () => {
    expect(interpolateMoveJ({ theta1: 0, theta2: 0 }, { theta1: 1, theta2: 1 }, 0)).toEqual([])
    expect(interpolateMoveJ({ theta1: 0, theta2: 0 }, { theta1: 1, theta2: 1 }, -1)).toEqual([])
  })

  it('returns end angles for steps = 1', () => {
    const start: ArmAngles = { theta1: 0, theta2: 0 }
    const end: ArmAngles = { theta1: 1.0, theta2: 2.0 }
    const res = interpolateMoveJ(start, end, 1)

    expect(res).toHaveLength(1)
    expect(res[0]).toEqual(end)
  })

  it('correctly interpolates intermediate steps for MOVE_J', () => {
    const start: ArmAngles = { theta1: 0, theta2: 0 }
    const end: ArmAngles = { theta1: 1.0, theta2: 2.0 }
    const steps = 4
    const res = interpolateMoveJ(start, end, steps)

    expect(res).toHaveLength(4)
    expect(res[0].theta1).toBeCloseTo(0.25, 6)
    expect(res[0].theta2).toBeCloseTo(0.5, 6)
    expect(res[1].theta1).toBeCloseTo(0.5, 6)
    expect(res[1].theta2).toBeCloseTo(1.0, 6)
    expect(res[2].theta1).toBeCloseTo(0.75, 6)
    expect(res[2].theta2).toBeCloseTo(1.5, 6)
    expect(res[3].theta1).toBeCloseTo(1.0, 6)
    expect(res[3].theta2).toBeCloseTo(2.0, 6)
  })

  it('estimates duration correctly based on angle delta and speed factor', () => {
    const start: ArmAngles = { theta1: 0, theta2: 0 }
    const end: ArmAngles = { theta1: Math.PI, theta2: 0 }

    // Delta is PI rad. Max speed is PI rad/s.
    // At speed 1.0: 1 second = 1000 ms
    expect(estimateDuration(start, end, 1.0)).toBe(1000)

    // At speed 0.5: 2 seconds = 2000 ms
    expect(estimateDuration(start, end, 0.5)).toBe(2000)

    // Identical start & end: 0 ms
    expect(estimateDuration(start, start, 1.0)).toBe(0)
  })
})
