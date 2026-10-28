"""
Robstride Web Application (Flask).
Serves the 2-DoF Planar Arm Dynamic Sizer web interface and calculation API.
"""

from __future__ import annotations

import os
import sys
from typing import Any, Dict

from flask import Flask, jsonify, render_template, request

# Ensure local modules are importable
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from torque_math import (
    DEFAULT_BASE_ANGULAR_ACCEL,
    DEFAULT_ELBOW_ANGULAR_ACCEL,
    DEFAULT_GRAVITY,
    ArmParameters,
    TwoLinkTorqueCalculator,
)

app = Flask(__name__, template_folder="templates")


@app.route("/")
def index():
    """Render the primary StitchMCP web interface."""
    return render_template("index.html")


@app.route("/api/calculate", methods=["POST"])
def calculate():
    """
    Torque calculation endpoint.

    Expects JSON payload with:
        m1: Base link weight in kg
        m2: Fore link weight in kg
        mmotor: Actuator motor weight in kg (at elbow)
        mload: Payload weight at end-effector in kg
        l1: Base link length in meters
        l2: Fore link length in meters
        a1: Base angular acceleration in rad/s^2
        a2: Elbow angular acceleration in rad/s^2
        theta1: Optional base joint angle in degrees (default: 0.0)
        theta2: Optional elbow joint angle in degrees (default: 0.0)
        gravity: Optional gravity in m/s^2 (default: 9.81)

    Returns:
        JSON response with base & elbow continuous and peak torques, reach, mass.
    """
    try:
        data: Dict[str, Any] = request.get_json(force=True) or {}

        params = ArmParameters(
            base_link_weight=float(data.get("m1", 4.80)),
            fore_link_weight=float(data.get("m2", 2.90)),
            motor_weight=float(data.get("mmotor", 1.45)),
            payload_weight=float(data.get("mload", 3.50)),
            base_link_length=float(data.get("l1", 0.65)),
            fore_link_length=float(data.get("l2", 0.45)),
            base_angular_accel=float(data.get("a1", DEFAULT_BASE_ANGULAR_ACCEL)),
            elbow_angular_accel=float(data.get("a2", DEFAULT_ELBOW_ANGULAR_ACCEL)),
            gravity=float(data.get("gravity", DEFAULT_GRAVITY)),
            theta1=float(data.get("theta1", data.get("t1", 0.0))),
            theta2=float(data.get("theta2", data.get("t2", 0.0))),
        )

        result = TwoLinkTorqueCalculator.calculate(params)
        return jsonify(result.to_dict()), 200

    except (ValueError, TypeError) as e:
        return jsonify({"error": f"Invalid parameter values: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Internal calculation error: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
