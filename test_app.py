"""
Unit test for Flask app routes and calculations.
"""

import json
from app import app

def test_app():
    client = app.test_client()

    # 1. Test GET /
    res = client.get("/")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    html_content = res.get_data(as_text=True)
    assert "<!DOCTYPE html>" in html_content
    assert "KINETIQ // TORQUE LAB" in html_content
    assert 'id="val_cont_torque_j1"' in html_content
    assert 'id="val_cont_torque_j2"' in html_content
    print("GET / passed!")

    # 2. Test POST /api/calculate with sample inputs
    payload = {
        "m1": 4.80,
        "m2": 2.90,
        "mmotor": 1.45,
        "mload": 3.50,
        "l1": 0.65,
        "l2": 0.45,
        "a1": 12.5,
        "a2": 18.0,
        "gravity": 9.81
    }
    res_calc = client.post(
        "/api/calculate",
        data=json.dumps(payload),
        content_type="application/json"
    )
    assert res_calc.status_code == 200, f"Expected 200, got {res_calc.status_code}"
    data = res_calc.get_json()
    print("Calculation response:", json.dumps(data, indent=2))

    assert "base" in data
    assert "elbow" in data
    assert "continuous_torque" in data["base"]
    assert "peak_torque" in data["base"]
    assert "inertia" in data["base"]
    assert "continuous_torque" in data["elbow"]
    assert "peak_torque" in data["elbow"]
    assert "inertia" in data["elbow"]
    assert data["total_reach_m"] == 1.1
    assert data["total_moving_mass_kg"] == 12.65
    # Default angles are 0.0 (vertical down) -> zero continuous torque
    assert data["base"]["continuous_torque"] == 0.0
    assert data["elbow"]["continuous_torque"] == 0.0

    # 3. Test POST /api/calculate with horizontal worst-case angles (t1=90, t2=0)
    payload_horizontal = dict(payload, t1=90.0, t2=0.0)
    res_horiz = client.post(
        "/api/calculate",
        data=json.dumps(payload_horizontal),
        content_type="application/json"
    )
    assert res_horiz.status_code == 200
    data_h = res_horiz.get_json()
    assert abs(data_h["base"]["continuous_torque"] - 87.2109) < 1e-4
    assert abs(data_h["elbow"]["continuous_torque"] - 21.851775) < 1e-4
    assert abs(data_h["base"]["peak_torque"] - 184.6218375) < 1e-4
    assert abs(data_h["elbow"]["peak_torque"] - 38.132775) < 1e-4
    print("Horizontal worst-case calculation passed!")

    # 3b. Test POST /api/calculate with explicit theta1 and theta2 keys
    payload_theta = dict(payload, theta1=90.0, theta2=0.0)
    res_theta = client.post(
        "/api/calculate",
        data=json.dumps(payload_theta),
        content_type="application/json"
    )
    assert res_theta.status_code == 200
    data_t = res_theta.get_json()
    assert abs(data_t["base"]["continuous_torque"] - 87.2109) < 1e-4
    assert data_t["parameters"]["theta1"] == 90.0
    assert data_t["parameters"]["theta2"] == 0.0
    print("Theta1/Theta2 parameter calculation passed!")

    # 4. Test validation / error handling
    invalid_payload = {
        "m1": -5.0
    }
    res_err = client.post(
        "/api/calculate",
        data=json.dumps(invalid_payload),
        content_type="application/json"
    )
    assert res_err.status_code == 400
    print("Validation error handling passed!")

    print("All automated test client tests passed successfully!")

if __name__ == "__main__":
    test_app()
