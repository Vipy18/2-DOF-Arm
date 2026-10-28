/**
 * Robstride Motor Fault Code Decoder
 * Decodes Robstride 02 motor fault codes into human-readable descriptions.
 */

export const FAULT_DESCRIPTIONS: Record<number, string> = {
  0x00: 'No fault',
  0x01: 'Overcurrent',
  0x02: 'Overvoltage',
  0x03: 'Undervoltage',
  0x04: 'Overtemperature',
  0x05: 'Magnetic encoder error',
  0x06: 'HALL sensor error',
  0x07: 'Motor overload',
  0x08: 'Encoder error',
  0x09: 'Phase loss',
  0x0A: 'CAN communication timeout',
  0x0B: 'Driver hardware fault',
  0x0C: 'Phase current sample error',
  0x0D: 'Calibration data invalid',
  0x0E: 'Motor stalled',
  0x0F: 'Software limit exceeded'
}

/**
 * Normal status / run mode codes that are NOT critical hardware faults.
 * In Robstride / Cybergear protocol, Byte 7 contains mode / status flags (e.g. 0x2C, 0x18).
 */
export const NORMAL_STATUS_CODES = new Set<number>([0x00, 0x18, 0x2C, 0x30, 0x32, 0x36])

/**
 * Known critical hardware fault codes.
 */
export const CRITICAL_FAULT_CODES = new Set<number>([
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
  0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F
])

/**
 * Check if the given code indicates an active critical hardware fault.
 * Returns false for normal status/mode bytes such as 0x00, 0x18, 0x2C and non-critical flags.
 * @param code Numeric fault code / status byte from motor telemetry
 */
export function isFault(code: number): boolean {
  if (typeof code !== 'number' || isNaN(code) || code === 0) {
    return false
  }
  if (NORMAL_STATUS_CODES.has(code)) {
    return false
  }
  return CRITICAL_FAULT_CODES.has(code)
}

/**
 * Decodes a raw integer/hex fault code to a human-readable string.
 * @param code Numeric fault code from motor telemetry
 * @returns Human-readable description
 */
export function decodeFault(code: number): string {
  try {
    if (code === undefined || code === null || isNaN(code) || !isFault(code)) {
      return 'No fault'
    }

    // Exact match in dictionary
    if (FAULT_DESCRIPTIONS[code]) {
      return FAULT_DESCRIPTIONS[code]
    }

    const hex = code.toString(16).toUpperCase().padStart(2, '0')
    return `Unknown fault (0x${hex})`
  } catch (err) {
    console.error('Error decoding fault code:', err)
    return `Fault code error (${code})`
  }
}
