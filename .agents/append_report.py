with open('D:/PRJ/Robstride/Agents/verification_report.md', 'a', encoding='utf-8') as f:
    f.write('\n### Fault Parser Audit\n')
    f.write('- `can_bridge.py`: Safely parses telemetry. Removed `emit("fault")` correctly does not break `faultCode` propagation.\n')
    f.write('- `faultDecoder.ts`: Safely filters non-critical status bits (0x18, 0x2C) without masking genuine hardware faults.\n')
    f.write('- Codebase compiles successfully (`npm run typecheck` and `npm run build`).\n')
    f.write('- Status: PASSED / CLEARED\n')
