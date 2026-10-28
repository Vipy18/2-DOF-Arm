"""
main.py
Robstride Backend Process - JSON IPC over standard I/O (stdin/stdout)

Reads JSON command lines from stdin, executes actions on CanBridge and Kinematics,
and writes JSON telemetry / command responses to stdout in real-time.

Supports both:
1. Cartesian control (move_l / moveL) with safety limit & reachability checks
2. Joint-space control (move_j / moveJ) with joint limit safety enforcement
"""

import sys
import json
import time
import signal
import threading
from typing import Any, Dict
from can_bridge import CanBridge, list_serial_ports
from kinematics import forward_kinematics, inverse_kinematics, within_joint_limits

# Ensure unbuffered text I/O with line buffering
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(line_buffering=True, encoding='utf-8')
except Exception:
    pass

stdout_lock = threading.Lock()


def emit_json(obj: Dict[str, Any]):
    """Thread-safe JSON line emitter to standard output."""
    try:
        line = json.dumps(obj) + "\n"
        with stdout_lock:
            sys.stdout.write(line)
            sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"[PythonBackend] Error emitting JSON: {e}\n")
        sys.stderr.flush()


def on_bridge_event(event_type: str, data: Any):
    """Callback receiving asynchronous events from CanBridge."""
    emit_json({
        "type": event_type,
        "data": data
    })


bridge = CanBridge(emit_callback=on_bridge_event)


def handle_shutdown(signum=None, frame=None):
    """Graceful shutdown: trigger E-STOP and close serial port."""
    try:
        if bridge.is_connected():
            bridge.e_stop()
            time.sleep(0.05)
            bridge.close()
    except Exception:
        pass
    sys.exit(0)


def process_command(msg: Dict[str, Any]):
    """Processes a single JSON command dictionary received from stdin."""
    req_id = msg.get("id")
    cmd = msg.get("cmd")

    if not cmd:
        if req_id:
            emit_json({"id": req_id, "success": False, "error": "Missing 'cmd' in request"})
        return

    try:
        if cmd == "ping":
            emit_json({"id": req_id, "success": True, "data": "pong"})

        elif cmd == "listPorts":
            ports = list_serial_ports()
            emit_json({"id": req_id, "success": True, "data": ports})

        elif cmd == "open":
            port = msg.get("port")
            if not port:
                raise ValueError("Missing 'port' parameter")
            bridge.open(port)
            emit_json({"id": req_id, "success": True})

        elif cmd == "close":
            bridge.close()
            emit_json({"id": req_id, "success": True})

        elif cmd == "enable":
            motor_id = int(msg.get("motorId", 1))
            bridge.enable_motor(motor_id)
            emit_json({"id": req_id, "success": True})

        elif cmd == "disable":
            motor_id = int(msg.get("motorId", 1))
            bridge.disable_motor(motor_id)
            emit_json({"id": req_id, "success": True})

        elif cmd == "eStop":
            bridge.e_stop()
            emit_json({"id": req_id, "success": True})

        elif cmd == "setMode":
            motor_id = int(msg.get("motorId", 1))
            mode = int(msg.get("mode", 0))
            bridge.set_mode(motor_id, mode)
            emit_json({"id": req_id, "success": True})

        elif cmd == "home":
            bridge.home()
            emit_json({"id": req_id, "success": True})

        elif cmd == "writeParam":
            motor_id = int(msg.get("motorId", 1))
            index = int(msg.get("index", 0))
            fmt = str(msg.get("format", "<f"))
            value = float(msg.get("value", 0.0))
            bridge.write_param(motor_id, index, fmt, value)
            emit_json({"id": req_id, "success": True})

        elif cmd == "readParam":
            motor_id = int(msg.get("motorId", 1))
            index = int(msg.get("index", 0))
            timeout_s = float(msg.get("timeout", 0.6))
            val = bridge.read_param(motor_id, index, timeout_s)
            emit_json({"id": req_id, "success": True, "value": val})

        # Kinematics calculations
        elif cmd == "ik":
            x = float(msg.get("x", 0.0))
            y = float(msg.get("y", 0.0))
            elbow = str(msg.get("elbow", "down"))
            l1 = float(msg.get("l1", 0.4))
            l2 = float(msg.get("l2", 0.3))
            ik_res = inverse_kinematics(x, y, elbow_config=elbow, l1=l1, l2=l2)
            response = {"id": req_id, "success": True, "type": "ik_result"}
            response.update(ik_res)
            emit_json(response)

        elif cmd == "fk":
            theta1 = float(msg.get("theta1", 0.0))
            theta2 = float(msg.get("theta2", 0.0))
            l1 = float(msg.get("l1", 0.4))
            l2 = float(msg.get("l2", 0.3))
            fk_res = forward_kinematics(theta1, theta2, l1=l1, l2=l2)
            response = {"id": req_id, "success": True, "type": "fk_result"}
            response.update(fk_res)
            emit_json(response)

        # Control paradigms: Joint-space (move_j) & Cartesian (move_l)
        elif cmd in ("move_j", "moveJ"):
            theta1 = float(msg.get("theta1", 0.0))
            theta2 = float(msg.get("theta2", 0.0))
            if not within_joint_limits(theta1, theta2):
                emit_json({
                    "id": req_id,
                    "success": False,
                    "error": f"Joint limits violated: theta1={theta1:.3f}, theta2={theta2:.3f}"
                })
            else:
                bridge.write_param(0x01, 0x7016, '<f', theta1)
                bridge.write_param(0x02, 0x7016, '<f', theta2)
                fk = forward_kinematics(theta1, theta2)
                emit_json({
                    "id": req_id,
                    "success": True,
                    "type": "move_j_result",
                    "theta1": theta1,
                    "theta2": theta2,
                    "fk": fk
                })

        elif cmd in ("move_l", "moveL"):
            x = float(msg.get("x", 0.0))
            y = float(msg.get("y", 0.0))
            elbow = str(msg.get("elbow", "down"))
            l1 = float(msg.get("l1", 0.4))
            l2 = float(msg.get("l2", 0.3))
            ik_res = inverse_kinematics(x, y, elbow_config=elbow, l1=l1, l2=l2)
            if not ik_res.get("isReachable"):
                emit_json({
                    "id": req_id,
                    "success": False,
                    "error": f"Target ({x:.3f}, {y:.3f}) is unreachable"
                })
            elif not ik_res.get("withinLimits"):
                emit_json({
                    "id": req_id,
                    "success": False,
                    "error": f"IK solution violates joint limits: theta1={ik_res.get('theta1')}, theta2={ik_res.get('theta2')}"
                })
            else:
                t1 = float(ik_res["theta1"])
                t2 = float(ik_res["theta2"])
                bridge.write_param(0x01, 0x7016, '<f', t1)
                bridge.write_param(0x02, 0x7016, '<f', t2)
                emit_json({
                    "id": req_id,
                    "success": True,
                    "type": "move_l_result",
                    "x": x,
                    "y": y,
                    "theta1": t1,
                    "theta2": t2,
                    "ik": ik_res
                })

        else:
            emit_json({
                "id": req_id,
                "success": False,
                "error": f"Unknown command: '{cmd}'"
            })

    except Exception as err:
        emit_json({
            "id": req_id,
            "success": False,
            "error": str(err)
        })


def main():
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    # Notify Node.js that the backend is ready
    emit_json({"type": "ready", "version": "1.0.0"})

    # Main line-by-line reading loop from stdin
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                # EOF reached (parent closed stdin)
                break
            trimmed = line.strip()
            if not trimmed:
                continue

            try:
                msg = json.loads(trimmed)
            except json.JSONDecodeError as json_err:
                emit_json({"success": False, "error": f"Invalid JSON: {json_err}"})
                continue

            # Process command in worker thread if it might block, or inline
            if msg.get("cmd") in ("readParam", "open"):
                threading.Thread(target=process_command, args=(msg,), daemon=True).start()
            else:
                process_command(msg)

        except (KeyboardInterrupt, SystemExit):
            break
        except Exception as e:
            sys.stderr.write(f"[PythonBackend] Stdin loop error: {e}\n")
            sys.stderr.flush()

    handle_shutdown()


if __name__ == "__main__":
    main()
