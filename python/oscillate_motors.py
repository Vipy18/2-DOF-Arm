import serial
import struct
import time
import signal

COM_PORT = 'COM20'
BAUD_RATE = 921600
HOST_ID = 0xFD
MOTOR_IDS = [1, 2]

# Target positions in radians (+/- 60 degrees)
POS_POS = 1.0472   # +60 degrees in radians
POS_NEG = -1.0472  # -60 degrees in radians

running = True

def sig_handler(signum, frame):
    global running
    print(f"\nSignal {signum} received. Initiating graceful shutdown...")
    running = False

def make_packet(can_id, data_bytes=None):
    """Wraps CAN frame into RobStride serial protocol frame."""
    if data_bytes is None:
        data_bytes = bytearray(8)
    serial_id = (can_id << 3) | 0x04
    
    packet = bytearray([0x41, 0x54])               # Frame Header 'AT' (0x41, 0x54)
    packet.extend(struct.pack('>I', serial_id))    # 4-byte Serial ID (Big Endian)
    packet.append(len(data_bytes))                 # DLC (Data Length)
    packet.extend(data_bytes)                      # Payload
    if len(data_bytes) < 8:
        packet.extend(bytearray(8 - len(data_bytes)))  # Pad to 8 bytes if needed
    packet.extend([0x0D, 0x0A])                    # Frame Tail CRLF (0x0D, 0x0A)
    return packet

def write_param(ser, motor_id, index, value_format, value):
    """Communication Type 18 (0x12): Single parameter write."""
    can_id = (0x12 << 24) | (HOST_ID << 8) | motor_id
    
    data = bytearray(8)
    data[0:2] = struct.pack('<H', index)  # Parameter Index (Little Endian uint16)
    packed_val = struct.pack(value_format, value)
    data[4:4+len(packed_val)] = packed_val
    
    ser.write(make_packet(can_id, data))
    time.sleep(0.02)

def enable_motor(ser, motor_id):
    """Communication Type 3 (0x03): Enable Motor."""
    can_id = (0x03 << 24) | (HOST_ID << 8) | motor_id
    ser.write(make_packet(can_id, bytearray(8)))
    time.sleep(0.05)

def disable_motor(ser, motor_id):
    """Communication Type 4 (0x04): Disable Motor."""
    can_id = (0x04 << 24) | (HOST_ID << 8) | motor_id
    ser.write(make_packet(can_id, bytearray(8)))
    time.sleep(0.05)

def set_position(ser, motor_id, position_rad):
    """Set target position loc_ref (0x7016) in radians."""
    write_param(ser, motor_id, 0x7016, '<f', float(position_rad))

def hold_position(ser, target, duration):
    """Sends position reference (loc_ref 0x7016) to both motors in a while loop every 0.1s as a heartbeat."""
    start_time = time.time()
    while (time.time() - start_time < duration) and running:
        for m_id in MOTOR_IDS:
            set_position(ser, m_id, target)
        time.sleep(0.1)

def main():
    signal.signal(signal.SIGINT, sig_handler)
    signal.signal(signal.SIGTERM, sig_handler)

    print(f"Opening {COM_PORT} at {BAUD_RATE} baud...")
    try:
        ser = serial.Serial(COM_PORT, BAUD_RATE, timeout=1)
    except Exception as e:
        print(f"Failed to open {COM_PORT}: {e}")
        return

    try:
        # Step 1: Configure parameters for both motors
        for m_id in MOTOR_IDS:
            print(f"Configuring Motor ID {m_id}...")
            # Enable CAN timeout (CAN_TIMEOUT = 10000 -> 500ms timeout)
            write_param(ser, m_id, 0x200C, '<I', 10000)
            # Set current limit to 5.0A (limit_cur = 5.0)
            write_param(ser, m_id, 0x7018, '<f', 5.0)
            # Set max velocity to 2.0 rad/s (vel_max = 2.0)
            write_param(ser, m_id, 0x7024, '<f', 2.0)
            # Set mode to Position Mode (PP) (run_mode = 1)
            write_param(ser, m_id, 0x7005, '<B', 1)

        # Step 2: Enable both motors
        for m_id in MOTOR_IDS:
            print(f"Enabling Motor ID {m_id}...")
            enable_motor(ser, m_id)

        print("\nStarting oscillation loop between +60 deg and -60 deg with 100ms heartbeat...")
        print("Press Ctrl+C to stop.\n")

        cycle = 0
        while running:
            cycle += 1
            # Move to +60 degrees (1.0472 rad) and hold with heartbeat
            print(f"[Cycle {cycle}] Commanding +60 deg ({POS_POS} rad) to Motors {MOTOR_IDS}...")
            hold_position(ser, POS_POS, 3.0)
            if not running:
                break

            # Move to -60 degrees (-1.0472 rad) and hold with heartbeat
            print(f"[Cycle {cycle}] Commanding -60 deg ({POS_NEG} rad) to Motors {MOTOR_IDS}...")
            hold_position(ser, POS_NEG, 3.0)
            if not running:
                break

    except KeyboardInterrupt:
        print("\nKeyboardInterrupt detected. Initiating safe shutdown...")
    except Exception as e:
        print(f"\nError occurred: {e}")
    finally:
        print("\nPerforming cleanup...")
        # Disable both motors (Communication Type 0x04)
        for m_id in MOTOR_IDS:
            try:
                print(f"Disabling Motor ID {m_id}...")
                disable_motor(ser, m_id)
            except Exception as e:
                print(f"Error disabling Motor ID {m_id}: {e}")

        # Close serial port
        if 'ser' in locals() and ser.is_open:
            ser.close()
            print(f"Closed {COM_PORT}.")
        print("Shutdown complete.")

if __name__ == '__main__':
    main()
