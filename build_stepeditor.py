import re

with open(r'd:\PRJ\Robstride\ArmControlApp\src\renderer\src\components\StepEditor.tsx', 'r', encoding='utf-8') as f:
    orig = f.read()

match = re.search(r'(.*?)return \(\s*<div.*?>(.*)', orig, re.DOTALL)
if match:
    logic = match.group(1)

jsx = '''
    <div className="glass-panel p-6 flex flex-col gap-6 shrink-0 relative overflow-hidden rounded-xl border-t-2 border-t-secondary/50 flex-1">
      <div className="absolute top-0 right-0 p-4 font-data-point text-4xl text-white/5 pointer-events-none select-none">
        STEP_{step.index + 1 < 10 ? `0${step.index + 1}` : step.index + 1}
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-headline-md text-headline-md text-primary m-0">Step Editor</h3>
        </div>
        <button onClick={onClose} className="btn-icon">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Cartesian Coordinates X & Y */}
        <div className="space-y-4 col-span-1 md:col-span-2 lg:col-span-1">
          <div className="font-label-caps text-on-surface-variant flex items-center gap-2 border-b border-white/10 pb-1">
            CARTESIAN
          </div>
          <div className="flex gap-4">
            <div className="flex-1 space-y-1">
              <label className="font-label-caps text-[10px] text-on-surface-variant ml-1">X (m)</label>
              <input type="number" step="0.001" value={targetX} onChange={(e) => setTargetX(parseFloat(e.target.value) || 0)} className="input-inset font-data-point text-lg w-full" />
            </div>
            <div className="flex-1 space-y-1">
              <label className="font-label-caps text-[10px] text-on-surface-variant ml-1">Y (m)</label>
              <input type="number" step="0.001" value={targetY} onChange={(e) => setTargetY(parseFloat(e.target.value) || 0)} className="input-inset font-data-point text-lg w-full" />
            </div>
          </div>
        </div>

        {/* Computed Joint Angles (Read-Only) */}
        <div className="space-y-4 col-span-1 md:col-span-2 lg:col-span-1">
          <div className="font-label-caps text-on-surface-variant flex items-center gap-2 border-b border-white/10 pb-1">
            JOINTS
          </div>
          <div className="flex gap-4">
            <div className="flex-1 space-y-1 relative">
              <label className="font-label-caps text-[10px] text-on-surface-variant ml-1">J1 (deg)</label>
              <input disabled type="text" value={ikResult.solution ? radToDeg(ikResult.solution.theta1).toFixed(1) : '---'} className="input-inset font-data-point text-lg text-outline w-full" />
              {!isWithinLimits && ikResult.solution && <div className="absolute top-0 right-0 w-2 h-2 bg-warning rounded-full"></div>}
            </div>
            <div className="flex-1 space-y-1 relative">
              <label className="font-label-caps text-[10px] text-on-surface-variant ml-1">J2 (deg)</label>
              <input disabled type="text" value={ikResult.solution ? radToDeg(ikResult.solution.theta2).toFixed(1) : '---'} className="input-inset font-data-point text-lg text-outline w-full" />
              {!isWithinLimits && ikResult.solution && <div className="absolute top-0 right-0 w-2 h-2 bg-warning rounded-full"></div>}
            </div>
          </div>
        </div>

        {/* Kinematics */}
        <div className="space-y-4">
          <div className="font-label-caps text-on-surface-variant flex items-center gap-2 border-b border-white/10 pb-1">
            KINEMATICS
          </div>
          <div className="bg-black/40 rounded p-1 flex">
            <button onClick={() => setElbowConfig('up')} className={`flex-1 py-2 text-xs font-label-caps rounded ${elbowConfig === 'up' ? 'bg-secondary text-on-secondary-fixed shadow' : 'text-on-surface-variant hover:text-white transition-colors'}`}>ELBOW UP</button>
            <button onClick={() => setElbowConfig('down')} className={`flex-1 py-2 text-xs font-label-caps rounded ${elbowConfig === 'down' ? 'bg-secondary text-on-secondary-fixed shadow' : 'text-on-surface-variant hover:text-white transition-colors'}`}>ELBOW DOWN</button>
          </div>
        </div>

        {/* Dynamics */}
        <div className="space-y-4">
          <div className="font-label-caps text-on-surface-variant flex items-center gap-2 border-b border-white/10 pb-1">
            DYNAMICS
          </div>
          <div className="flex gap-4">
            <div className="flex-1 space-y-1">
              <label className="font-label-caps text-[10px] text-on-surface-variant ml-1">SPEED (%)</label>
              <input type="number" min="0.05" max="1.0" step="0.05" value={speed * 100} onChange={(e) => setSpeed((parseFloat(e.target.value) || 0) / 100)} className="input-inset font-data-point text-sm w-full" />
            </div>
            <div className="flex-1 space-y-1">
              <label className="font-label-caps text-[10px] text-on-surface-variant ml-1">DWELL (s)</label>
              <input type="number" step="0.1" min="0" value={dwellMs / 1000} onChange={(e) => setDwellMs((parseFloat(e.target.value) || 0) * 1000)} className="input-inset font-data-point text-sm w-full" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Validation Status */}
      <div className="flex gap-2">
          {!isReachable && (
            <div className="text-[11px] text-danger">Target out of reach</div>
          )}
          {isReachable && !isWithinLimits && (
            <div className="text-[11px] text-warning">Target joint angles exceed limits</div>
          )}
      </div>

      <div className="flex justify-end gap-3 mt-auto pt-4 border-t border-white/5">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={handleSimulate} disabled={!isValid} className="btn-secondary text-secondary border-secondary/30"><Eye className="w-4 h-4 mr-1 inline-block" /> Simulate</button>
        <button onClick={handleSave} disabled={!isValid} className="btn-primary shadow-[0_0_15px_rgba(255,255,255,0.2)]"><Check className="w-4 h-4 mr-1 inline-block" /> Update Step</button>
      </div>
    </div>
  )
}
'''

final_code = logic + "  return (\n" + jsx

with open(r'd:\PRJ\Robstride\ArmControlApp\src\renderer\src\components\StepEditor.tsx', 'w', encoding='utf-8') as f:
    f.write(final_code)
