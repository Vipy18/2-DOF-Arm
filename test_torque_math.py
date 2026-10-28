"""
Unit tests for torque_math.py module.

Verifies:
1. ArmParameters validation (angles can be negative, standard parameters must be non-negative).
2. Vertical down pose (theta1=0, theta2=0) gives 0.0 continuous gravitational torque.
3. Horizontal fully extended pose (theta1=90, theta2=0) reproduces exact worst-case torque.
4. Negative angles (CCW rotation) produce correct absolute magnitude torques.
5. Arbitrary angles and trigonometry (phi1=theta1, phi2=theta1+theta2).
6. Folded back arm configuration (opposing moment arms).
7. Inertia and peak torque calculations (peak = continuous + I * alpha).
8. Dictionary calculation and helper function parity.
"""

import math
import unittest

from torque_math import (
    DEFAULT_BASE_ANGULAR_ACCEL,
    DEFAULT_ELBOW_ANGULAR_ACCEL,
    DEFAULT_GRAVITY,
    DEFAULT_THETA1,
    DEFAULT_THETA2,
    ArmParameters,
    JointTorqueResult,
    TwoLinkTorqueCalculator,
    TwoLinkTorqueResult,
    calculate_2link_torques,
    calculate_base_inertia,
    calculate_base_torque,
    calculate_elbow_inertia,
    calculate_elbow_torque,
)


class TestTorqueMath(unittest.TestCase):
    """Test suite for 2-Link Robotic Arm torque calculations."""

    def setUp(self) -> None:
        self.params_default = ArmParameters(
            motor_weight=0.5,
            base_link_weight=0.4,
            fore_link_weight=0.3,
            payload_weight=0.5,
            base_link_length=0.25,
            fore_link_length=0.25,
            base_angular_accel=10.0,
            elbow_angular_accel=10.0,
            gravity=9.81,
        )

    def test_default_angles(self) -> None:
        """Verify default angles are 0.0 (pointing straight down)."""
        self.assertEqual(self.params_default.theta1, 0.0)
        self.assertEqual(self.params_default.theta2, 0.0)

    def test_vertical_down_pose_zero_gravity_torque(self) -> None:
        """
        When both links point straight down (theta1=0, theta2=0),
        horizontal moment arms are zero, so continuous torque must be 0.0.
        Peak torque equals inertial torque I * alpha.
        """
        res = TwoLinkTorqueCalculator.calculate(self.params_default)

        self.assertAlmostEqual(res.elbow.continuous_torque, 0.0, places=7)
        self.assertAlmostEqual(res.base.continuous_torque, 0.0, places=7)

        # Peak torque = 0 + I * alpha
        expected_elbow_peak = res.elbow.inertia * self.params_default.elbow_angular_accel
        expected_base_peak = res.base.inertia * self.params_default.base_angular_accel
        self.assertAlmostEqual(res.elbow.peak_torque, expected_elbow_peak, places=7)
        self.assertAlmostEqual(res.base.peak_torque, expected_base_peak, places=7)

    def test_horizontal_worst_case_pose(self) -> None:
        """
        When theta1=90, theta2=0 (fully extended horizontally):
        phi1 = 90 deg (sin=1), phi2 = 90 deg (sin=1).
        Torques must match the classic worst-case static formulas.
        """
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
        res = TwoLinkTorqueCalculator.calculate(params_horiz)

        # Theoretical worst-case elbow continuous torque
        # g * (m2 * L2 / 2 + m_payload * L2)
        expected_elbow_cont = 9.81 * (0.3 * 0.125 + 0.5 * 0.25)  # 9.81 * 0.1625 = 1.594125
        self.assertAlmostEqual(res.elbow.continuous_torque, expected_elbow_cont, places=6)

        # Theoretical worst-case base continuous torque
        # g * (m1 * L1 / 2 + m_motor * L1 + m2 * (L1 + L2 / 2) + m_payload * (L1 + L2))
        expected_base_cont = 9.81 * (
            0.4 * 0.125 + 0.5 * 0.25 + 0.3 * (0.25 + 0.125) + 0.5 * (0.25 + 0.25)
        )  # 9.81 * 0.5375 = 5.272875
        self.assertAlmostEqual(res.base.continuous_torque, expected_base_cont, places=6)

        # Inertia checks
        # I_elbow = (1/3) * 0.3 * 0.25^2 + 0.5 * 0.25^2 = 0.0375
        expected_elbow_i = (1.0 / 3.0) * 0.3 * (0.25**2) + 0.5 * (0.25**2)
        self.assertAlmostEqual(res.elbow.inertia, expected_elbow_i, places=6)
        self.assertAlmostEqual(res.elbow.peak_torque, expected_elbow_cont + expected_elbow_i * 10.0, places=6)

    def test_negative_angles_counter_clockwise(self) -> None:
        """
        Negative angles rotate CCW.
        theta1 = -90, theta2 = 0 extends horizontally in the opposite (+X) direction.
        Because holding torque is absolute magnitude, continuous torque should be identical.
        """
        params_neg = ArmParameters(
            motor_weight=0.5,
            base_link_weight=0.4,
            fore_link_weight=0.3,
            payload_weight=0.5,
            base_link_length=0.25,
            fore_link_length=0.25,
            base_angular_accel=10.0,
            elbow_angular_accel=10.0,
            gravity=9.81,
            theta1=-90.0,
            theta2=0.0,
        )
        res = TwoLinkTorqueCalculator.calculate(params_neg)

        expected_elbow_cont = 9.81 * (0.3 * 0.125 + 0.5 * 0.25)
        expected_base_cont = 9.81 * (
            0.4 * 0.125 + 0.5 * 0.25 + 0.3 * (0.25 + 0.125) + 0.5 * 0.5
        )
        self.assertAlmostEqual(res.elbow.continuous_torque, expected_elbow_cont, places=6)
        self.assertAlmostEqual(res.base.continuous_torque, expected_base_cont, places=6)

    def test_arbitrary_pose(self) -> None:
        """
        Test arbitrary angles: theta1 = 30 deg, theta2 = 45 deg.
        phi1 = 30 deg, phi2 = 75 deg.
        """
        t1 = 30.0
        t2 = 45.0
        g = 9.81
        m1, m2, mm, ml = 0.4, 0.3, 0.5, 0.5
        l1, l2 = 0.25, 0.25

        params = ArmParameters(
            motor_weight=mm,
            base_link_weight=m1,
            fore_link_weight=m2,
            payload_weight=ml,
            base_link_length=l1,
            fore_link_length=l2,
            base_angular_accel=5.0,
            elbow_angular_accel=5.0,
            gravity=g,
            theta1=t1,
            theta2=t2,
        )
        res = TwoLinkTorqueCalculator.calculate(params)

        phi1 = math.radians(t1)
        phi2 = math.radians(t1 + t2)

        # Elbow torque
        dx2 = -l2 * math.sin(phi2)
        dx_com2_rel_elbow = -(l2 / 2.0) * math.sin(phi2)
        expected_elbow_cont = abs(g * (m2 * dx_com2_rel_elbow + ml * dx2))
        self.assertAlmostEqual(res.elbow.continuous_torque, expected_elbow_cont, places=7)

        # Base torque
        dx1 = -l1 * math.sin(phi1)
        dx_com1 = -(l1 / 2.0) * math.sin(phi1)
        dx_motor = dx1
        dx_com2 = dx1 - (l2 / 2.0) * math.sin(phi2)
        dx_payload = dx1 + dx2
        expected_base_cont = abs(
            g * (m1 * dx_com1 + mm * dx_motor + m2 * dx_com2 + ml * dx_payload)
        )
        self.assertAlmostEqual(res.base.continuous_torque, expected_base_cont, places=7)

    def test_forelink_vertical_elbow_zero(self) -> None:
        """
        When phi2 = 0 (e.g. theta1 = 45 deg, theta2 = -45 deg),
        ForeLink points straight down in world coordinates.
        Continuous elbow torque must be 0.0 Nm.
        """
        params = ArmParameters(
            motor_weight=0.5,
            base_link_weight=0.4,
            fore_link_weight=0.3,
            payload_weight=0.5,
            base_link_length=0.25,
            fore_link_length=0.25,
            gravity=9.81,
            theta1=45.0,
            theta2=-45.0,
        )
        res = TwoLinkTorqueCalculator.calculate(params)
        self.assertAlmostEqual(res.elbow.continuous_torque, 0.0, places=7)
        # Base torque is still non-zero because Link 1 is at 45 deg
        self.assertGreater(res.base.continuous_torque, 0.0)

    def test_folded_back_pose_cancelling_torques(self) -> None:
        """
        theta1 = 90 deg (Link 1 reaches left to x = -0.25 m).
        theta2 = 180 deg (Link 2 folds back rightwards to x = 0.0 m for payload).
        ForeLink and payload counteract Link 1 moment about the base.
        """
        params = ArmParameters(
            motor_weight=0.5,
            base_link_weight=0.4,
            fore_link_weight=0.3,
            payload_weight=0.5,
            base_link_length=0.25,
            fore_link_length=0.25,
            gravity=9.81,
            theta1=90.0,
            theta2=180.0,
        )
        res = TwoLinkTorqueCalculator.calculate(params)

        phi1 = math.radians(90.0)
        phi2 = math.radians(270.0)
        dx1 = -0.25 * math.sin(phi1)  # -0.25
        dx2 = -0.25 * math.sin(phi2)  # +0.25
        dx_com1 = -0.125
        dx_motor = -0.25
        dx_com2 = -0.25 + 0.125  # -0.125
        dx_payload = -0.25 + 0.25  # 0.0

        expected_base_cont = abs(
            9.81 * (0.4 * dx_com1 + 0.5 * dx_motor + 0.3 * dx_com2 + 0.5 * dx_payload)
        )
        self.assertAlmostEqual(res.base.continuous_torque, expected_base_cont, places=7)

    def test_input_validation(self) -> None:
        """Verify type checking and value range enforcement."""
        # Non-negative fields must reject negative values
        with self.assertRaises(ValueError):
            ArmParameters(
                motor_weight=-0.1,
                base_link_weight=0.4,
                fore_link_weight=0.3,
                payload_weight=0.5,
                base_link_length=0.25,
                fore_link_length=0.25,
            )

        # Angles CAN be negative without ValueError
        params_neg = ArmParameters(
            motor_weight=0.5,
            base_link_weight=0.4,
            fore_link_weight=0.3,
            payload_weight=0.5,
            base_link_length=0.25,
            fore_link_length=0.25,
            theta1=-45.0,
            theta2=-90.0,
        )
        self.assertEqual(params_neg.theta1, -45.0)
        self.assertEqual(params_neg.theta2, -90.0)

        # Angles must be numeric (not boolean, string, etc.)
        with self.assertRaises(TypeError):
            ArmParameters(
                motor_weight=0.5,
                base_link_weight=0.4,
                fore_link_weight=0.3,
                payload_weight=0.5,
                base_link_length=0.25,
                fore_link_length=0.25,
                theta1="45",  # type: ignore
            )
        with self.assertRaises(TypeError):
            ArmParameters(
                motor_weight=0.5,
                base_link_weight=0.4,
                fore_link_weight=0.3,
                payload_weight=0.5,
                base_link_length=0.25,
                fore_link_length=0.25,
                theta2=True,  # type: ignore
            )

    def test_calculate_from_dict(self) -> None:
        """Verify TwoLinkTorqueCalculator.calculate_from_dict correctly parses angles."""
        data = {
            "motor_weight": 0.5,
            "base_link_weight": 0.4,
            "fore_link_weight": 0.3,
            "payload_weight": 0.5,
            "base_link_length": 0.25,
            "fore_link_length": 0.25,
            "base_angular_accel": 10.0,
            "elbow_angular_accel": 10.0,
            "gravity": 9.81,
            "theta1": 90.0,
            "theta2": 0.0,
        }
        res = TwoLinkTorqueCalculator.calculate_from_dict(data)
        self.assertAlmostEqual(res.elbow.continuous_torque, 1.594125, places=5)
        self.assertAlmostEqual(res.base.continuous_torque, 5.272875, places=5)

    def test_calculate_2link_torques_function(self) -> None:
        """Verify top-level function matches TwoLinkTorqueCalculator."""
        res_calc = TwoLinkTorqueCalculator.calculate(self.params_default)
        res_func = calculate_2link_torques(
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
        self.assertEqual(res_calc.to_dict(), res_func.to_dict())


if __name__ == "__main__":
    unittest.main()
