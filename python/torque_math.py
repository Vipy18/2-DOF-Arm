"""
Torque Calculation Logic Module for 2-Link Robotic Arm.

This module provides data models, functions, and a calculator class to compute
continuous holding torques, moments of inertia, and peak dynamic torques for a 2-link
robotic manipulator at specified joint angles or in worst-case conditions.

Physics & Coordinate Conventions:
- 0 position for both joints means both links are pointing STRAIGHT DOWN (gravity direction).
- Positive angle = Clockwise (CW) rotation. Negative = Counter-Clockwise (CCW).
- theta1 is the absolute angle of Joint 1 (base / shoulder) in degrees.
- theta2 is the relative angle of Joint 2 (elbow) with respect to Link 1 in degrees.
- Absolute angle of Link 1: phi1 = theta1
- Absolute angle of Link 2: phi2 = theta1 + theta2
- Horizontal distance from Base to Elbow: dx1 = -L1 * sin(phi1) (assuming CW is -X direction)
- Horizontal distance from Elbow to End: dx2 = -L2 * sin(phi2)
- Links are solid, uniform cylinders/beams where the center of mass (CoM) is at L / 2.
- Base motor drives the shoulder/base joint.
- Elbow motor is located at the elbow joint (loads the base motor at base_link_length).
- Payload is attached at the distal end of the forelink (at base_link_length + fore_link_length).
- Default acceleration due to gravity g = 9.81 m/s^2.
- Continuous Base Torque = absolute magnitude of gravity acting on all CoMs horizontally from the base.
- Continuous Elbow Torque = absolute magnitude of gravity acting on Link 2 CoM and Payload horizontally from the elbow.
- Peak Dynamic Torque = Continuous Torque + I * alpha (where I is mass moment of inertia about the joint axis).

Formulas:
- Horizontal moment arms from Elbow:
    dx_fore_com_elbow = -(ForeLinkLength / 2) * sin(phi2)
    dx_payload_elbow = -ForeLinkLength * sin(phi2)
- Continuous Elbow Torque = |g * (ForeLinkWeight * dx_fore_com_elbow + PayloadWeight * dx_payload_elbow)|
                           = g * (ForeLinkWeight * ForeLinkLength / 2 + PayloadWeight * ForeLinkLength) * |sin(phi2)|
- Horizontal moment arms from Base:
    dx_base_com = -(BaseLinkLength / 2) * sin(phi1)
    dx_motor = -BaseLinkLength * sin(phi1)
    dx_fore_com = -BaseLinkLength * sin(phi1) - (ForeLinkLength / 2) * sin(phi2)
    dx_payload = -BaseLinkLength * sin(phi1) - ForeLinkLength * sin(phi2)
- Continuous Base Torque = |g * (BaseLinkWeight * dx_base_com
                                 + MotorWeight * dx_motor
                                 + ForeLinkWeight * dx_fore_com
                                 + PayloadWeight * dx_payload)|
- Moment of Inertia (I):
    I_elbow = (1/3) * ForeLinkWeight * ForeLinkLength^2 + PayloadWeight * ForeLinkLength^2
    I_base = (1/3) * BaseLinkWeight * BaseLinkLength^2
             + MotorWeight * BaseLinkLength^2
             + ForeLinkWeight * ((1/3) * ForeLinkLength^2 + BaseLinkLength^2 + BaseLinkLength * ForeLinkLength)
             + PayloadWeight * (BaseLinkLength + ForeLinkLength)^2
- Peak Torques:
    Peak Elbow Torque = Cont Elbow Torque + I_elbow * elbow_angular_accel
    Peak Base Torque = Cont Base Torque + I_base * base_angular_accel
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import math
from typing import Any, Dict, Optional

# Standard Constants
DEFAULT_GRAVITY: float = 9.81  # Acceleration due to gravity in m/s^2
DEFAULT_BASE_ANGULAR_ACCEL: float = 0.0  # Default base angular acceleration in rad/s^2
DEFAULT_ELBOW_ANGULAR_ACCEL: float = 0.0  # Default elbow angular acceleration in rad/s^2
DEFAULT_THETA1: float = 0.0  # Default Joint 1 angle in degrees (pointing straight down)
DEFAULT_THETA2: float = 0.0  # Default Joint 2 angle in degrees relative to Link 1


@dataclass(frozen=True)
class JointTorqueResult:
    """
    Represents the calculated torque and inertia values for an individual joint.

    Attributes:
        continuous_torque: Continuous holding torque required (Nm).
        peak_torque: Peak holding/acceleration torque required (Nm).
        inertia: Mass moment of inertia about the joint axis (kg*m^2).
    """
    continuous_torque: float
    peak_torque: float
    inertia: float = 0.0

    def to_dict(self) -> Dict[str, float]:
        """Return the torque values as a dictionary."""
        return asdict(self)


@dataclass(frozen=True)
class ArmParameters:
    """
    Input parameters for a 2-link robotic arm torque calculation.

    All units are standard metric (kg, meters, rad/s^2, degrees).

    Coordinate convention:
        - theta1 and theta2 are in degrees.
        - 0 degrees for both joints points straight down (direction of gravity).
        - Positive angle = Clockwise (CW) rotation. Negative = Counter-Clockwise (CCW).
        - theta2 is relative to Link 1.

    Attributes:
        motor_weight: Weight of an actuator motor in kg.
                      Assumed to be identical for base and elbow.
                      The elbow motor weight acts as a point mass on the base motor.
        base_link_weight: Weight of the base (proximal / shoulder) link in kg.
        fore_link_weight: Weight of the fore (distal / elbow) link in kg.
        payload_weight: Weight of the payload at the end-effector in kg.
        base_link_length: Center-to-center length of the base link in meters.
        fore_link_length: Center-to-center length of the fore link in meters.
        base_angular_accel: Angular acceleration of the base joint in rad/s^2 (default 0.0).
        elbow_angular_accel: Angular acceleration of the elbow joint in rad/s^2 (default 0.0).
        gravity: Gravitational acceleration in m/s^2 (default 9.81).
        theta1: Joint 1 (base/shoulder) angle in degrees (default 0.0, pointing straight down).
        theta2: Joint 2 (elbow) angle in degrees relative to Link 1 (default 0.0).
    """
    motor_weight: float
    base_link_weight: float
    fore_link_weight: float
    payload_weight: float
    base_link_length: float
    fore_link_length: float
    base_angular_accel: float = DEFAULT_BASE_ANGULAR_ACCEL
    elbow_angular_accel: float = DEFAULT_ELBOW_ANGULAR_ACCEL
    gravity: float = DEFAULT_GRAVITY
    theta1: float = DEFAULT_THETA1
    theta2: float = DEFAULT_THETA2

    def __post_init__(self) -> None:
        """Validate input parameters."""
        non_negative_numeric_fields = {
            "motor_weight": self.motor_weight,
            "base_link_weight": self.base_link_weight,
            "fore_link_weight": self.fore_link_weight,
            "payload_weight": self.payload_weight,
            "base_link_length": self.base_link_length,
            "fore_link_length": self.fore_link_length,
            "base_angular_accel": self.base_angular_accel,
            "elbow_angular_accel": self.elbow_angular_accel,
            "gravity": self.gravity,
        }
        for field_name, value in non_negative_numeric_fields.items():
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise TypeError(f"'{field_name}' must be a number, got {type(value).__name__}")
            if value < 0:
                raise ValueError(f"'{field_name}' must be non-negative, got {value}")

        angle_fields = {
            "theta1": self.theta1,
            "theta2": self.theta2,
        }
        for field_name, value in angle_fields.items():
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise TypeError(f"'{field_name}' must be a number, got {type(value).__name__}")


@dataclass(frozen=True)
class TwoLinkTorqueResult:
    """
    Calculated torques and mechanical metrics for a 2-link robotic arm.

    Attributes:
        base: Torque result for the base (shoulder) joint (Nm).
        elbow: Torque result for the elbow joint (Nm).
        total_reach: Total extended reach from base center to payload end (m).
        total_moving_mass: Sum of link weights, elbow motor weight, and payload (kg).
        parameters: The input arm parameters used for calculation.
    """
    base: JointTorqueResult
    elbow: JointTorqueResult
    total_reach: float
    total_moving_mass: float
    parameters: ArmParameters

    def to_dict(self) -> Dict[str, Any]:
        """Convert calculation results to a nested dictionary."""
        return {
            "base": self.base.to_dict(),
            "elbow": self.elbow.to_dict(),
            "total_reach_m": self.total_reach,
            "total_moving_mass_kg": self.total_moving_mass,
            "parameters": asdict(self.parameters),
        }


def calculate_elbow_inertia(
    fore_link_weight: float,
    fore_link_length: float,
    payload_weight: float,
) -> float:
    """
    Calculate mass moment of inertia about the elbow joint.

    Formula:
        I_elbow = (1/3) * ForeLinkWeight * ForeLinkLength^2 + PayloadWeight * ForeLinkLength^2

    Args:
        fore_link_weight: Weight of the fore link in kg.
        fore_link_length: Length of the fore link in meters.
        payload_weight: Weight of the payload at the distal tip in kg.

    Returns:
        Moment of inertia about the elbow joint in kg*m^2.
    """
    return (
        (1.0 / 3.0) * fore_link_weight * (fore_link_length ** 2)
        + payload_weight * (fore_link_length ** 2)
    )


def calculate_base_inertia(
    motor_weight: float,
    base_link_weight: float,
    fore_link_weight: float,
    payload_weight: float,
    base_link_length: float,
    fore_link_length: float,
) -> float:
    """
    Calculate mass moment of inertia about the base joint in worst-case fully extended horizontal pose.

    Formula:
        I_base = (1/3) * BaseLinkWeight * BaseLinkLength^2
                 + MotorWeight * BaseLinkLength^2
                 + ForeLinkWeight * ((1/3)*ForeLinkLength^2 + BaseLinkLength^2 + BaseLinkLength*ForeLinkLength)
                 + PayloadWeight * (BaseLinkLength + ForeLinkLength)^2

    Args:
        motor_weight: Weight of elbow motor acting at base_link_length in kg.
        base_link_weight: Weight of the base link in kg.
        fore_link_weight: Weight of the fore link in kg.
        payload_weight: Weight of the payload at the end-effector in kg.
        base_link_length: Length of base link in meters.
        fore_link_length: Length of fore link in meters.

    Returns:
        Moment of inertia about the base joint in kg*m^2.
    """
    return (
        (1.0 / 3.0) * base_link_weight * (base_link_length ** 2)
        + motor_weight * (base_link_length ** 2)
        + fore_link_weight * (
            (1.0 / 3.0) * (fore_link_length ** 2)
            + (base_link_length ** 2)
            + base_link_length * fore_link_length
        )
        + payload_weight * ((base_link_length + fore_link_length) ** 2)
    )


def calculate_elbow_torque(
    fore_link_weight: float,
    fore_link_length: float,
    payload_weight: float,
    elbow_angular_accel: float = DEFAULT_ELBOW_ANGULAR_ACCEL,
    gravity: float = DEFAULT_GRAVITY,
    theta1: float = DEFAULT_THETA1,
    theta2: float = DEFAULT_THETA2,
) -> JointTorqueResult:
    """
    Calculate continuous holding torque, moment of inertia, and peak torque for the elbow joint.

    Coordinate / Physical convention:
        - 0 position means links point straight down (gravity direction).
        - Positive angle = Clockwise (CW) rotation, Negative = Counter-Clockwise (CCW).
        - theta2 is relative to Link 1.
        - Absolute angle of Link 2: phi2 = theta1 + theta2.
        - Horizontal moment arms from Elbow:
            dx_fore_com = -(ForeLinkLength / 2) * sin(phi2)
            dx_payload = -ForeLinkLength * sin(phi2)
        - Continuous Elbow Torque = absolute magnitude of gravity acting on Link 2 CoM
          and Payload horizontally from the elbow.
        - Peak Elbow Torque = Continuous Elbow Torque + I_elbow * elbow_angular_accel.

    Args:
        fore_link_weight: Weight of the fore link in kg.
        fore_link_length: Length of the fore link in meters.
        payload_weight: Weight of the payload at the end of the fore link in kg.
        elbow_angular_accel: Angular acceleration in rad/s^2 (default 0.0).
        gravity: Acceleration due to gravity in m/s^2 (default 9.81).
        theta1: Joint 1 angle in degrees (default 0.0).
        theta2: Joint 2 angle in degrees relative to Link 1 (default 0.0).

    Returns:
        JointTorqueResult containing continuous torque, peak torque, and inertia in Nm and kg*m^2.
    """
    phi2_rad = math.radians(theta1 + theta2)

    # Horizontal moment arms from elbow (CW positive -> -X direction)
    dx_fore_com = -(fore_link_length / 2.0) * math.sin(phi2_rad)
    dx_payload = -fore_link_length * math.sin(phi2_rad)

    # Continuous gravitational torque about elbow axis (absolute magnitude)
    tau_elbow_grav = gravity * (
        fore_link_weight * dx_fore_com + payload_weight * dx_payload
    )
    continuous_torque = abs(tau_elbow_grav)

    inertia = calculate_elbow_inertia(
        fore_link_weight=fore_link_weight,
        fore_link_length=fore_link_length,
        payload_weight=payload_weight,
    )
    peak_torque = continuous_torque + inertia * elbow_angular_accel
    return JointTorqueResult(
        continuous_torque=continuous_torque,
        peak_torque=peak_torque,
        inertia=inertia,
    )


def calculate_base_torque(
    motor_weight: float,
    base_link_weight: float,
    fore_link_weight: float,
    payload_weight: float,
    base_link_length: float,
    fore_link_length: float,
    base_angular_accel: float = DEFAULT_BASE_ANGULAR_ACCEL,
    gravity: float = DEFAULT_GRAVITY,
    theta1: float = DEFAULT_THETA1,
    theta2: float = DEFAULT_THETA2,
) -> JointTorqueResult:
    """
    Calculate continuous holding torque, moment of inertia, and peak torque for the base joint.

    Coordinate / Physical convention:
        - 0 position means links point straight down (gravity direction).
        - Positive angle = Clockwise (CW) rotation, Negative = Counter-Clockwise (CCW).
        - theta2 is relative to Link 1.
        - Absolute angle of Link 1: phi1 = theta1.
        - Absolute angle of Link 2: phi2 = theta1 + theta2.
        - Horizontal positions relative to Base (CW positive -> -X direction):
            dx1 = -BaseLinkLength * sin(phi1)
            dx2 = -ForeLinkLength * sin(phi2)
            dx_base_com = -(BaseLinkLength / 2) * sin(phi1)
            dx_motor = dx1
            dx_fore_com = dx1 - (ForeLinkLength / 2) * sin(phi2)
            dx_payload = dx1 + dx2
        - Continuous Base Torque = absolute magnitude of gravity acting on all CoMs
          horizontally from the base.
        - Peak Base Torque = Continuous Base Torque + I_base * base_angular_accel.

    Args:
        motor_weight: Weight of elbow motor acting at base_link_length in kg.
        base_link_weight: Weight of the base link in kg.
        fore_link_weight: Weight of the fore link in kg.
        payload_weight: Weight of the payload at the end-effector in kg.
        base_link_length: Length of base link in meters.
        fore_link_length: Length of fore link in meters.
        base_angular_accel: Angular acceleration in rad/s^2 (default 0.0).
        gravity: Acceleration due to gravity in m/s^2 (default 9.81).
        theta1: Joint 1 angle in degrees (default 0.0).
        theta2: Joint 2 angle in degrees relative to Link 1 (default 0.0).

    Returns:
        JointTorqueResult containing continuous torque, peak torque, and inertia in Nm and kg*m^2.
    """
    phi1_rad = math.radians(theta1)
    phi2_rad = math.radians(theta1 + theta2)

    # Horizontal positions relative to the base (CW positive -> -X direction)
    dx1 = -base_link_length * math.sin(phi1_rad)
    dx2 = -fore_link_length * math.sin(phi2_rad)

    dx_base_com = -(base_link_length / 2.0) * math.sin(phi1_rad)
    dx_motor = dx1
    dx_fore_com = dx1 - (fore_link_length / 2.0) * math.sin(phi2_rad)
    dx_payload = dx1 + dx2

    tau_base_grav = gravity * (
        base_link_weight * dx_base_com
        + motor_weight * dx_motor
        + fore_link_weight * dx_fore_com
        + payload_weight * dx_payload
    )
    continuous_torque = abs(tau_base_grav)

    inertia = calculate_base_inertia(
        motor_weight=motor_weight,
        base_link_weight=base_link_weight,
        fore_link_weight=fore_link_weight,
        payload_weight=payload_weight,
        base_link_length=base_link_length,
        fore_link_length=fore_link_length,
    )
    peak_torque = continuous_torque + inertia * base_angular_accel
    return JointTorqueResult(
        continuous_torque=continuous_torque,
        peak_torque=peak_torque,
        inertia=inertia,
    )


def calculate_2link_torques(
    motor_weight: float,
    base_link_weight: float,
    fore_link_weight: float,
    payload_weight: float,
    base_link_length: float,
    fore_link_length: float,
    base_angular_accel: float = DEFAULT_BASE_ANGULAR_ACCEL,
    elbow_angular_accel: float = DEFAULT_ELBOW_ANGULAR_ACCEL,
    gravity: float = DEFAULT_GRAVITY,
    theta1: float = 0.0,
    theta2: float = 0.0,
) -> TwoLinkTorqueResult:
    """
    Compute continuous and peak torques for both base and elbow joints of a 2-link robotic arm.

    Args:
        motor_weight: Weight of actuator motor in kg (loads the base at the elbow joint).
        base_link_weight: Weight of the base link in kg.
        fore_link_weight: Weight of the fore link in kg.
        payload_weight: Weight of the payload at the end of the fore link in kg.
        base_link_length: Center-to-center length of the base link in meters.
        fore_link_length: Center-to-center length of the fore link in meters.
        base_angular_accel: Angular acceleration of base joint in rad/s^2 (default 0.0).
        elbow_angular_accel: Angular acceleration of elbow joint in rad/s^2 (default 0.0).
        gravity: Acceleration due to gravity in m/s^2 (default 9.81).
        theta1: Base joint angle in degrees (default 0.0).
        theta2: Elbow joint angle in degrees (default 0.0).

    Returns:
        TwoLinkTorqueResult with base and elbow results, reach, moving mass, and parameters.
    """
    params = ArmParameters(
        motor_weight=motor_weight,
        base_link_weight=base_link_weight,
        fore_link_weight=fore_link_weight,
        payload_weight=payload_weight,
        base_link_length=base_link_length,
        fore_link_length=fore_link_length,
        base_angular_accel=base_angular_accel,
        elbow_angular_accel=elbow_angular_accel,
        gravity=gravity,
        theta1=theta1,
        theta2=theta2,
    )
    return TwoLinkTorqueCalculator.calculate(params)


class TwoLinkTorqueCalculator:
    """
    Torque calculator class for a 2-link robotic arm.
    """

    @staticmethod
    def calculate(params: ArmParameters) -> TwoLinkTorqueResult:
        """
        Calculate continuous and peak torques using an ArmParameters instance.

        Args:
            params: Validated ArmParameters object.

        Returns:
            TwoLinkTorqueResult with base and elbow torques, total reach, and moving mass.
        """
        elbow_result = calculate_elbow_torque(
            fore_link_weight=params.fore_link_weight,
            fore_link_length=params.fore_link_length,
            payload_weight=params.payload_weight,
            elbow_angular_accel=params.elbow_angular_accel,
            gravity=params.gravity,
            theta1=params.theta1,
            theta2=params.theta2,
        )

        base_result = calculate_base_torque(
            motor_weight=params.motor_weight,
            base_link_weight=params.base_link_weight,
            fore_link_weight=params.fore_link_weight,
            payload_weight=params.payload_weight,
            base_link_length=params.base_link_length,
            fore_link_length=params.fore_link_length,
            base_angular_accel=params.base_angular_accel,
            gravity=params.gravity,
            theta1=params.theta1,
            theta2=params.theta2,
        )

        total_reach = params.base_link_length + params.fore_link_length
        # Moving mass loaded onto the base joint: base link + elbow motor + fore link + payload
        total_moving_mass = (
            params.base_link_weight
            + params.motor_weight
            + params.fore_link_weight
            + params.payload_weight
        )

        return TwoLinkTorqueResult(
            base=base_result,
            elbow=elbow_result,
            total_reach=total_reach,
            total_moving_mass=total_moving_mass,
            parameters=params,
        )

    @classmethod
    def calculate_from_dict(cls, data: Dict[str, Any]) -> TwoLinkTorqueResult:
        """
        Calculate torques from a dictionary of parameters.

        Args:
            data: Dictionary containing parameter keys corresponding to ArmParameters fields.

        Returns:
            TwoLinkTorqueResult instance.
        """
        params = ArmParameters(
            motor_weight=float(data["motor_weight"]),
            base_link_weight=float(data["base_link_weight"]),
            fore_link_weight=float(data["fore_link_weight"]),
            payload_weight=float(data["payload_weight"]),
            base_link_length=float(data["base_link_length"]),
            fore_link_length=float(data["fore_link_length"]),
            base_angular_accel=float(
                data.get("base_angular_accel", DEFAULT_BASE_ANGULAR_ACCEL)
            ),
            elbow_angular_accel=float(
                data.get("elbow_angular_accel", DEFAULT_ELBOW_ANGULAR_ACCEL)
            ),
            gravity=float(data.get("gravity", DEFAULT_GRAVITY)),
            theta1=float(data.get("theta1", DEFAULT_THETA1)),
            theta2=float(data.get("theta2", DEFAULT_THETA2)),
        )
        return cls.calculate(params)


if __name__ == "__main__":
    # Self-test demonstration with multiple configurations
    print("=" * 70)
    print("2-Link Robotic Arm Torque Calculation (Positional & Dynamic)")
    print("=" * 70)

    # 1. Default Vertical Down Pose (theta1=0, theta2=0 -> zero gravitational holding torque)
    params_down = ArmParameters(
        motor_weight=0.5,
        base_link_weight=0.4,
        fore_link_weight=0.3,
        payload_weight=0.5,
        base_link_length=0.25,
        fore_link_length=0.25,
        base_angular_accel=10.0,
        elbow_angular_accel=10.0,
        gravity=9.81,
        theta1=0.0,
        theta2=0.0,
    )
    res_down = TwoLinkTorqueCalculator.calculate(params_down)
    print("POSE 1: Vertical Down (theta1=0 deg, theta2=0 deg)")
    print(f"  Elbow: Cont = {res_down.elbow.continuous_torque:.4f} Nm, Peak = {res_down.elbow.peak_torque:.4f} Nm")
    print(f"  Base:  Cont = {res_down.base.continuous_torque:.4f} Nm, Peak = {res_down.base.peak_torque:.4f} Nm")
    print("-" * 70)

    # 2. Horizontal Fully Extended Pose (theta1=90, theta2=0 -> worst-case horizontal extension)
    params_horiz = ArmParameters(
        motor_weight=0.5,
        base_link_weight=0.4,
        fore_link_weight=0.3,
        payload_weight=0.5,
        base_link_length=0.25,
        fore_link_length=0.25,
        base_angular_accel=10.0,
        elbow_angular_accel=10.0,
        gravity=9.81,
        theta1=90.0,
        theta2=0.0,
    )
    res_horiz = TwoLinkTorqueCalculator.calculate(params_horiz)
    print("POSE 2: Horizontal Fully Extended (theta1=90 deg, theta2=0 deg)")
    print(f"  Elbow: Cont = {res_horiz.elbow.continuous_torque:.4f} Nm, Peak = {res_horiz.elbow.peak_torque:.4f} Nm")
    print(f"  Base:  Cont = {res_horiz.base.continuous_torque:.4f} Nm, Peak = {res_horiz.base.peak_torque:.4f} Nm")
    print("-" * 70)

    # 3. Intermediate Pose (theta1=45, theta2=30)
    params_inter = ArmParameters(
        motor_weight=0.5,
        base_link_weight=0.4,
        fore_link_weight=0.3,
        payload_weight=0.5,
        base_link_length=0.25,
        fore_link_length=0.25,
        base_angular_accel=10.0,
        elbow_angular_accel=10.0,
        gravity=9.81,
        theta1=45.0,
        theta2=30.0,
    )
    res_inter = TwoLinkTorqueCalculator.calculate(params_inter)
    print("POSE 3: Intermediate Pose (theta1=45 deg, theta2=30 deg)")
    print(f"  Elbow: Cont = {res_inter.elbow.continuous_torque:.4f} Nm, Peak = {res_inter.elbow.peak_torque:.4f} Nm")
    print(f"  Base:  Cont = {res_inter.base.continuous_torque:.4f} Nm, Peak = {res_inter.base.peak_torque:.4f} Nm")
    print("=" * 70)
