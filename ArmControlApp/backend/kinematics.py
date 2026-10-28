"""
kinematics.py
Robstride 2-DOF Planar Arm Kinematics

Implements:
- Forward Kinematics (FK)
- Inverse Kinematics (IK) with geometric 2-link solver & elbow up/down configuration
- Reachability, singularity, and joint limit validation
"""

import math
from typing import Dict, Any, Tuple, Optional

DEFAULT_L1 = 0.4  # meters (400 mm)
DEFAULT_L2 = 0.3  # meters (300 mm)

# Default joint limits in radians
M1_MIN = (-170.0 * math.pi) / 180.0  # -170 deg
M1_MAX = (170.0 * math.pi) / 180.0   # +170 deg
M2_MIN = (-150.0 * math.pi) / 180.0  # -150 deg
M2_MAX = (150.0 * math.pi) / 180.0   # +150 deg

SINGULARITY_THRESHOLD_RAD = (5.0 * math.pi) / 180.0  # 5 degrees


def normalize_angle(rad: float) -> float:
    """Normalizes an angle in radians to (-PI, PI]."""
    a = rad % (2.0 * math.pi)
    if a > math.pi:
        a -= 2.0 * math.pi
    if a <= -math.pi:
        a += 2.0 * math.pi
    return a


def is_near_singularity(theta2: float, threshold_rad: float = SINGULARITY_THRESHOLD_RAD) -> bool:
    """Checks if theta2 is near fully extended (0) or fully folded (+/- PI) singularity."""
    abs_t2 = abs(theta2)
    if abs_t2 <= threshold_rad:
        return True
    if abs(math.pi - abs_t2) <= threshold_rad:
        return True
    return False


def within_joint_limits(
    theta1: float,
    theta2: float,
    m1_min: float = M1_MIN,
    m1_max: float = M1_MAX,
    m2_min: float = M2_MIN,
    m2_max: float = M2_MAX
) -> bool:
    """Checks if theta1 and theta2 are within joint safety limits."""
    return (m1_min <= theta1 <= m1_max) and (m2_min <= theta2 <= m2_max)


def forward_kinematics(
    theta1: float,
    theta2: float,
    l1: float = DEFAULT_L1,
    l2: float = DEFAULT_L2
) -> Dict[str, Any]:
    """
    Calculates Forward Kinematics (FK) for 2-DOF planar arm.
    
    Returns end-effector position (x, y) and elbow position.
    """
    x_elbow = l1 * math.cos(theta1)
    y_elbow = l1 * math.sin(theta1)
    x_end = x_elbow + l2 * math.cos(theta1 + theta2)
    y_end = y_elbow + l2 * math.sin(theta1 + theta2)

    return {
        "x": round(x_end, 6),
        "y": round(y_end, 6),
        "elbow": {"x": round(x_elbow, 6), "y": round(y_elbow, 6)},
        "endEffector": {"x": round(x_end, 6), "y": round(y_end, 6)},
        "base": {"x": 0.0, "y": 0.0}
    }


def inverse_kinematics(
    x: float,
    y: float,
    elbow_config: str = "down",
    l1: float = DEFAULT_L1,
    l2: float = DEFAULT_L2
) -> Dict[str, Any]:
    """
    Calculates Inverse Kinematics (IK) for 2-DOF planar arm.
    
    Returns primary solution, alternative solution, reachability and singularity flags.
    """
    dist_sq = x * x + y * y
    dist = math.sqrt(dist_sq)
    r_min = abs(l1 - l2)
    r_max = l1 + l2

    # Reachability validation
    if dist < (r_min - 1e-7) or dist > (r_max + 1e-7):
        return {
            "type": "ik_result",
            "isReachable": False,
            "isSingular": False,
            "solution": None,
            "theta1": None,
            "theta2": None,
            "elbow": elbow_config,
            "alternativeSolution": None
        }

    cos_theta2 = (dist_sq - l1 * l1 - l2 * l2) / (2.0 * l1 * l2)
    cos_theta2 = max(-1.0, min(1.0, cos_theta2))
    acos_val = math.acos(cos_theta2)

    # Elbow Down (theta2 >= 0)
    theta2_down = acos_val
    k1_down = l1 + l2 * math.cos(theta2_down)
    k2_down = l2 * math.sin(theta2_down)
    theta1_down = normalize_angle(math.atan2(y, x) - math.atan2(k2_down, k1_down))

    # Elbow Up (theta2 <= 0)
    theta2_up = -acos_val
    k1_up = l1 + l2 * math.cos(theta2_up)
    k2_up = l2 * math.sin(theta2_up)
    theta1_up = normalize_angle(math.atan2(y, x) - math.atan2(k2_up, k1_up))

    is_up = elbow_config.lower() in ("up", "elbow_up")
    primary_theta1 = theta1_up if is_up else theta1_down
    primary_theta2 = theta2_up if is_up else theta2_down
    alt_theta1 = theta1_down if is_up else theta1_up
    alt_theta2 = theta2_down if is_up else theta2_up

    is_singular = is_near_singularity(primary_theta2)
    in_limits = within_joint_limits(primary_theta1, primary_theta2)

    return {
        "type": "ik_result",
        "isReachable": True,
        "isSingular": is_singular,
        "withinLimits": in_limits,
        "theta1": round(primary_theta1, 6),
        "theta2": round(primary_theta2, 6),
        "elbow": elbow_config,
        "solution": {
            "theta1": round(primary_theta1, 6),
            "theta2": round(primary_theta2, 6)
        },
        "alternativeSolution": {
            "theta1": round(alt_theta1, 6),
            "theta2": round(alt_theta2, 6)
        }
    }
