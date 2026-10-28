"""
can_bridge.py
Robstride 2-DOF CAN-over-Serial Protocol Handler

Implements:
- 921600 Baud USB-CAN adapter framing ([0x41, 0x54] Header, [0x0D, 0x0A] Tail)
- Big-Endian Serial ID framing: (can_id << 3) | 0x04
- Comm Types: 0x02 (Feedback req/resp), 0x03 (Enable), 0x04 (Disable/Stop),
              0x11 (Read Param), 0x12 (Write Param)
- 50Hz feedback polling thread and unbuffered feedback dispatch
- Atomic E-STOP to both motors
"""

import struct
import time
import threading
from typing import Callable, Dict, List, Optional, Any
import serial
import serial.tools.list_ports

HOST_ID = 0xFD
BAUD = 921600
PACKET_HEADER = bytes([0x41, 0x54])  # 'A', 'T'
PACKET_TAIL = bytes([0x0D, 0x0A])    # '\r', '\n'
PACKET_LEN = 17

# Scaling limits per Robstride / CyberGear protocol specifications
P_MIN = -12.56637  # -4 * pi
P_MAX = 12.56637   # +4 * pi
V_MIN = -30.0      # rad/s
V_MAX = 30.0
T_MIN = -12.0      # Nm
T_MAX = 12.0
KM_RS02 = 0.28     # Nm/A torque constant for Robstride 02

def uint16_to_float(val: int, min_val: float, max_val: float) -> float:
    norm = max(0.0, min(65535.0, float(val))) / 65535.0
    return norm * (max_val - min_val) + min_val

def float_to_uint16(val: float, min_val: float, max_val: float) -> int:
    clamped = max(min_val, min(max_val, float(val)))
    norm = (clamped - min_val) / (max_val - min_val)
    return int(round(norm * 65535.0))

def format_to_struct(fmt: str) -> str:
    fmt_map = {
        'uint8': '<B', 'B': '<B', '<B': '<B',
        'uint16': '<H', 'H': '<H', '<H': '<H',
        'uint32': '<I', 'I': '<I', '<I': '<I',
        'int32': '<i', 'i': '<i', '<i': '<i',
        'float': '<f', 'f': '<f', '<f': '<f',
    }
    return fmt_map.get(fmt, '<f')

def pack_param_value(fmt: str, value: float) -> bytes:
    struct_fmt = format_to_struct(fmt)
    if struct_fmt == '<B':
        val = max(0, min(255, int(value)))
        return struct.pack('<B', val)
    elif struct_fmt == '<H':
        val = max(0, min(65535, int(value)))
        return struct.pack('<H', val)
    elif struct_fmt == '<I':
        val = max(0, min(4294967295, int(value)))
        return struct.pack('<I', val)
    elif struct_fmt == '<i':
        val = int(value)
        return struct.pack('<i', val)
    else:  # '<f'
        return struct.pack('<f', float(value))

def make_packet(can_id: int, data_bytes: Optional[bytes] = None) -> bytes:
    """Wraps CAN frame into RobStride's specific serial protocol."""
    if data_bytes is None:
        data_bytes = bytes(8)
    serial_id = ((can_id << 3) | 0x04) & 0xFFFFFFFF
    
    packet = bytearray(PACKET_HEADER)
    packet.extend(struct.pack('>I', serial_id))
    dlc = min(len(data_bytes), 8)
    packet.append(dlc)
    packet.extend(data_bytes[:dlc])
    if dlc < 8:
        packet.extend(bytes(8 - dlc))
    packet.extend(PACKET_TAIL)
    return bytes(packet)


def list_serial_ports() -> List[Dict[str, str]]:
    """Lists all available serial COM ports."""
    try:
        ports = serial.tools.list_ports.comports()
        result = []
        for p in ports:
            result.append({
                "path": p.device,
                "manufacturer": p.manufacturer or "",
                "pnpId": p.hwid or "",
                "serialNumber": p.serial_number or ""
            })
        return result
    except Exception as e:
        return []


class CanBridge:
    def __init__(self, emit_callback: Optional[Callable[[str, Any], None]] = None):
        self._ser: Optional[serial.Serial] = None
        self._current_port: str = ""
        self._running: bool = False
        self._write_lock = threading.Lock()
        self._cache_lock = threading.Lock()
        self._pending_reads_lock = threading.Lock()
        self._pending_reads: Dict[tuple, Dict[str, Any]] = {}
        self._emit_callback = emit_callback

        self._rx_thread: Optional[threading.Thread] = None
        self._poll_thread: Optional[threading.Thread] = None

        self._feedback_cache: Dict[int, Dict[str, Any]] = {
            1: {
                "motorId": 1,
                "position": 0.0,
                "velocity": 0.0,
                "current": 0.0,
                "torque": 0.0,
                "temperature": 25,
                "faultCode": 0,
                "timestamp": int(time.time() * 1000)
            },
            2: {
                "motorId": 2,
                "position": 0.0,
                "velocity": 0.0,
                "current": 0.0,
                "torque": 0.0,
                "temperature": 25,
                "faultCode": 0,
                "timestamp": int(time.time() * 1000)
            }
        }

    def set_emit_callback(self, callback: Callable[[str, Any], None]):
        self._emit_callback = callback

    def _emit_event(self, event_type: str, data: Any):
        if self._emit_callback:
            try:
                self._emit_callback(event_type, data)
            except Exception:
                pass

    def _emit_log(self, level: str, message: str):
        self._emit_event("log", {"level": level, "message": message})

    def is_connected(self) -> bool:
        return self._ser is not None and self._ser.is_open

    def open(self, port_path: str):
        """Opens serial port and starts RX + 50Hz polling loop."""
        if not port_path:
            raise ValueError("Port path is required")

        if self.is_connected():
            if self._current_port == port_path:
                return
            self.close()

        try:
            self._ser = serial.Serial(
                port=port_path,
                baudrate=BAUD,
                timeout=0.05,
                write_timeout=0.2
            )
            self._current_port = port_path
            self._running = True

            # Start background RX thread
            self._rx_thread = threading.Thread(target=self._rx_loop, name="CanBridge-RX", daemon=True)
            self._rx_thread.start()

            # Initialize CAN timeout protection = 0 (disable timeout)
            try:
                self.write_param(0x01, 0x200C, '<I', 0)
                time.sleep(0.02)
                self.write_param(0x02, 0x200C, '<I', 0)
            except Exception as e:
                self._emit_log("warn", f"Failed initializing CAN timeout parameter: {e}")

            # Start background 50Hz feedback polling thread
            self._poll_thread = threading.Thread(target=self._poll_loop, name="CanBridge-Poll", daemon=True)
            self._poll_thread.start()

            self._emit_event("connectionChange", {
                "connected": True,
                "port": port_path
            })
        except Exception as e:
            self._handle_disconnect(str(e))
            raise e

    def close(self):
        """Stops threads and safely closes serial port."""
        self._running = False
        
        # Abort any pending parameter reads
        with self._pending_reads_lock:
            for req in self._pending_reads.values():
                req["event"].set()
            self._pending_reads.clear()

        # Wait for threads if needed
        if self._poll_thread and self._poll_thread.is_alive():
            self._poll_thread.join(timeout=0.2)
        if self._rx_thread and self._rx_thread.is_alive():
            self._rx_thread.join(timeout=0.2)

        with self._write_lock:
            if self._ser and self._ser.is_open:
                try:
                    self._ser.close()
                except Exception:
                    pass
            self._ser = None
            self._current_port = ""

        self._emit_event("connectionChange", {
            "connected": False
        })

    def _handle_disconnect(self, error_msg: Optional[str] = None):
        self._running = False
        with self._write_lock:
            if self._ser and self._ser.is_open:
                try:
                    self._ser.close()
                except Exception:
                    pass
            self._ser = None
            self._current_port = ""

        self._emit_event("connectionChange", {
            "connected": False,
            "error": error_msg
        })

    def send_raw(self, packet: bytes):
        """Sends raw bytes to the serial port under write lock."""
        with self._write_lock:
            if not self._ser or not self._ser.is_open:
                raise ConnectionError("Serial port is not connected")
            self._ser.write(packet)

    def enable_motor(self, motor_id: int):
        """Communication Type 3: Enable Motor."""
        can_id = (0x03 << 24) | (HOST_ID << 8) | (motor_id & 0xFF)
        self.send_raw(make_packet(can_id, bytes(8)))

    def disable_motor(self, motor_id: int):
        """Communication Type 4: Stop/Disable Motor."""
        can_id = (0x04 << 24) | (HOST_ID << 8) | (motor_id & 0xFF)
        self.send_raw(make_packet(can_id, bytes(8)))

    def e_stop(self):
        """E-STOP: Disables both Motor 1 and Motor 2 atomically."""
        can_id1 = (0x04 << 24) | (HOST_ID << 8) | 0x01
        can_id2 = (0x04 << 24) | (HOST_ID << 8) | 0x02
        p1 = make_packet(can_id1, bytes(8))
        p2 = make_packet(can_id2, bytes(8))
        self.send_raw(p1 + p2)

    def set_mode(self, motor_id: int, mode: int):
        """Writes index 0x7005 (RUN_MODE)."""
        self.write_param(motor_id, 0x7005, '<B', mode)

    def home(self):
        """Commands pos_ref = 0.0 to both motors."""
        self.write_param(0x01, 0x7016, '<f', 0.0)
        self.write_param(0x02, 0x7016, '<f', 0.0)

    def write_param(self, motor_id: int, index: int, value_format: str, value: float):
        """Communication Type 18 (0x12): Single parameter write."""
        can_id = (0x12 << 24) | (HOST_ID << 8) | (motor_id & 0xFF)
        data = bytearray(8)
        data[0:2] = struct.pack('<H', index)
        packed_val = pack_param_value(value_format, value)
        data[4:4+len(packed_val)] = packed_val
        self.send_raw(make_packet(can_id, bytes(data)))

    def read_param(self, motor_id: int, index: int, timeout_s: float = 0.6) -> float:
        """Communication Type 17 (0x11): Single parameter read with timeout."""
        can_id = (0x11 << 24) | (HOST_ID << 8) | (motor_id & 0xFF)
        data = bytearray(8)
        data[0:2] = struct.pack('<H', index)

        event = threading.Event()
        req_key = (motor_id, index)

        with self._pending_reads_lock:
            self._pending_reads[req_key] = {"event": event, "value": None}

        try:
            self.send_raw(make_packet(can_id, bytes(data)))
            if not event.wait(timeout=timeout_s):
                raise TimeoutError(f"Read param timeout for motor 0x{motor_id:02X} index 0x{index:04X}")

            with self._pending_reads_lock:
                req = self._pending_reads.pop(req_key, None)
            if req and req["value"] is not None:
                return req["value"]
            raise RuntimeError(f"Failed to receive value for motor {motor_id} index 0x{index:04X}")
        finally:
            with self._pending_reads_lock:
                self._pending_reads.pop(req_key, None)

    def _rx_loop(self):
        """Continuous serial read loop with 17-byte frame parsing."""
        rx_buf = bytearray()
        while self._running:
            try:
                if not self._ser or not self._ser.is_open:
                    break
                waiting = max(1, self._ser.in_waiting)
                chunk = self._ser.read(waiting)
                if not chunk:
                    continue
                rx_buf.extend(chunk)

                while len(rx_buf) >= PACKET_LEN:
                    header_idx = rx_buf.find(PACKET_HEADER)
                    if header_idx == -1:
                        rx_buf = rx_buf[-1:] if len(rx_buf) > 0 else bytearray()
                        break
                    if header_idx > 0:
                        rx_buf = rx_buf[header_idx:]

                    if len(rx_buf) < PACKET_LEN:
                        break

                    if rx_buf[15] == PACKET_TAIL[0] and rx_buf[16] == PACKET_TAIL[1]:
                        frame = rx_buf[:PACKET_LEN]
                        rx_buf = rx_buf[PACKET_LEN:]
                        self._parse_frame(frame)
                    else:
                        rx_buf = rx_buf[1:]
            except Exception as e:
                if self._running:
                    self._emit_log("error", f"RX loop exception: {e}")
                    self._handle_disconnect(str(e))
                break

    def _parse_frame(self, frame: bytearray):
        """Decodes 17-byte Robstride serial frame."""
        try:
            serial_id = struct.unpack('>I', frame[2:6])[0]
            can_id = (serial_id >> 3) & 0xFFFFFFFF
            dlc = frame[6]
            payload = frame[7:7 + min(dlc, 8)]

            comm_type = (can_id >> 24) & 0xFF
            motor_id = can_id & 0xFF
            if motor_id not in (1, 2):
                alt_motor_id = (can_id >> 8) & 0xFF
                if alt_motor_id in (1, 2):
                    motor_id = alt_motor_id

            # Comm Type 2 (0x02) - Motor Feedback Frame
            if comm_type == 0x02 and len(payload) >= 8:
                raw_pos = struct.unpack('>H', payload[0:2])[0]
                raw_vel = struct.unpack('>H', payload[2:4])[0]
                raw_torque = struct.unpack('>H', payload[4:6])[0]
                raw_temp = payload[6]
                fault_code = payload[7]

                pos = uint16_to_float(raw_pos, P_MIN, P_MAX)
                vel = uint16_to_float(raw_vel, V_MIN, V_MAX)
                torque = uint16_to_float(raw_torque, T_MIN, T_MAX)
                current = abs(torque) / KM_RS02
                temp = float(raw_temp)
                ts = int(time.time() * 1000)

                feedback = {
                    "motorId": motor_id,
                    "position": round(pos, 5),
                    "velocity": round(vel, 5),
                    "current": round(current, 4),
                    "torque": round(torque, 4),
                    "temperature": temp,
                    "faultCode": fault_code,
                    "timestamp": ts
                }

                with self._cache_lock:
                    self._feedback_cache[motor_id] = feedback

                # In Robstride / Cybergear protocol, Byte 7 contains run mode bits and status flags
                # (such as 0x2C, 0x18) that are normal status/mode bytes, not critical hardware faults.
                # Automatic "fault" event emission is disabled here so normal status bytes do not trigger fault banners.
                # if fault_code != 0:
                #     self._emit_event("fault", {
                #         "motorId": motor_id,
                #         "faultCode": fault_code,
                #         "message": f"Motor {motor_id} fault code: 0x{fault_code:02X}",
                #         "timestamp": ts
                #     })

            # Comm Type 17 / 18 - Parameter Read/Write Response
            elif comm_type in (0x11, 0x12) and len(payload) >= 8:
                idx = struct.unpack('<H', payload[0:2])[0]
                raw_val = struct.unpack('<f', payload[4:8])[0]
                req_key = (motor_id, idx)

                with self._pending_reads_lock:
                    if req_key in self._pending_reads:
                        self._pending_reads[req_key]["value"] = raw_val
                        self._pending_reads[req_key]["event"].set()

        except Exception as e:
            self._emit_log("error", f"Frame decode error: {e}")

    def _poll_loop(self):
        """50Hz polling loop requesting feedback from Motor 1 and Motor 2."""
        p1 = make_packet((0x02 << 24) | (HOST_ID << 8) | 0x01, bytes(8))
        p2 = make_packet((0x02 << 24) | (HOST_ID << 8) | 0x02, bytes(8))

        while self._running:
            start_t = time.perf_counter()
            try:
                if self.is_connected():
                    self.send_raw(p1)
                    self.send_raw(p2)

                    with self._cache_lock:
                        feedbacks = list(self._feedback_cache.values())
                    self._emit_event("feedback", feedbacks)
            except Exception as e:
                if self._running:
                    self._emit_log("warn", f"Poll cycle warning: {e}")

            elapsed = time.perf_counter() - start_t
            sleep_t = max(0.002, 0.020 - elapsed)
            time.sleep(sleep_t)
