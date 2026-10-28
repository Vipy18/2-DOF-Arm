import serial
import struct
import time

COM_PORT = 'COM20'  # Updated to COM20
BAUD_RATE = 921600
MOTOR_ID = 0x01
HOST_ID = 0xFD

def make_packet(can_id, data_bytes):
    """Wraps the CAN frame into RobStride's specific serial protocol."""
    serial_id = (can_id << 3) | 0x04
    
    packet = bytearray([0x41, 0x54])               # Frame Header
    packet.extend(struct.pack('>I', serial_id))    # 4-byte Serial ID (Big Endian)
    packet.append(len(data_bytes))                 # DLC (Data Length)
    packet.extend(data_bytes)                      # Payload
    packet.extend(bytearray(8 - len(data_bytes)))  # Pad to 8 bytes if needed
    packet.extend([0x0D, 0x0A])                    # Frame Tail
    return packet

def write_param(ser, index, value_format, value):
    """Communication Type 18: Single parameter write"""
    can_id = (0x12 << 24) | (HOST_ID << 8) | MOTOR_ID
    
    data = bytearray(8)
    data[0:2] = struct.pack('<H', index)  # Parameter Index (Little Endian)
    data[4:4+struct.calcsize(value_format)] = struct.pack(value_format, value)
    
    ser.write(make_packet(can_id, data))
    time.sleep(0.05)

def enable_motor(ser):
    """Communication Type 3: Enable Motor"""
    can_id = (0x03 << 24) | (HOST_ID << 8) | MOTOR_ID
    ser.write(make_packet(can_id, bytearray(8)))
    time.sleep(0.1)

def disable_motor(ser):
    """Communication Type 4: Stop Motor"""
    can_id = (0x04 << 24) | (HOST_ID << 8) | MOTOR_ID
    ser.write(make_packet(can_id, bytearray(8)))
    time.sleep(0.1)

def main():
    print(f"Opening {COM_PORT}...")
    try:
        ser = serial.Serial(COM_PORT, BAUD_RATE, timeout=1)
    except Exception as e:
        print(f"Error opening port: {e}")
        return

    print("Disabling CAN Timeout protection (so it doesn't auto-stop)...")
    write_param(ser, 0x200C, '<I', 0)  # CAN_TIMEOUT = 0
    
    print("Enabling Motor 1...")
    enable_motor(ser)
    
    print("Setting to Velocity Mode...")
    write_param(ser, 0x7005, '<B', 2)  # run_mode = 2 (Velocity Mode)
    
    print("Commanding 2.0 rad/s...")
    write_param(ser, 0x700A, '<f', 2.0)  # spd_ref = 2.0
    
    try:
        print("\n>>> Motor should be spinning! Keeping script alive for 10 seconds to test... <<<")
        for i in range(10):
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping motor...")
    finally:
        write_param(ser, 0x700A, '<f', 0.0)  # Set speed back to 0
        disable_motor(ser)
        ser.close()
        print("Done. Motor stopped.")

if __name__ == '__main__':
    main()
