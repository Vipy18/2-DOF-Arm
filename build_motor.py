import re

with open(r'd:\PRJ\Robstride\ArmControlApp\src\renderer\src\pages\MotorStudio.tsx', 'r', encoding='utf-8') as f:
    orig = f.read()

match = re.search(r'(.*?)return \(\s*<div.*', orig, re.DOTALL)
if match:
    logic = match.group(1)
    
with open(r'C:\Users\vipul\.gemini\antigravity\brain\09f83aec-ca40-41a4-aadf-41bf3f1707db\scratch\motor_jsx.txt', 'r', encoding='utf-8') as f:
    jsx = f.read()

jsx = jsx.replace('value="pos"', 'value="Position"')
jsx = jsx.replace('value="vel"', 'value="Velocity"')
jsx = jsx.replace('value="cur"', 'value="Current"')
jsx = jsx.replace('value="mit"', 'value="MIT"')

jsx = jsx.replace(
    '<select className="w-full glass-input rounded-DEFAULT px-4 py-3 font-label-caps text-label-caps text-primary appearance-none cursor-pointer">',
    '<select value={currentForm.runMode} onChange={(e) => handleRunModeChange(e.target.value as any)} className="w-full glass-input rounded-DEFAULT px-4 py-3 font-label-caps text-label-caps text-primary appearance-none cursor-pointer">'
)

jsx = re.sub(r'<label[^>]*>Max Speed</label>\s*<div[^>]*>\s*<input[^>]*value="50.0"\s*/>',
    '''<label className="font-label-caps text-label-caps text-on-surface-variant">Max Speed</label>
<div className="relative flex items-center">
<input className="glass-input rounded-DEFAULT w-24 text-right pr-10 py-2 font-data-point text-[14px] text-primary" step="0.1" type="number" value={currentForm.maxSpeed} onChange={(e) => updateFormField('maxSpeed', parseFloat(e.target.value) || 0)} onBlur={() => handleSingleParamWrite(0x7017, '<f', currentForm.maxSpeed, 'Max Speed')} />''', jsx)

jsx = re.sub(r'<label[^>]*>Max Current</label>\s*<div[^>]*>\s*<input[^>]*value="12.5"\s*/>',
    '''<label className="font-label-caps text-label-caps text-on-surface-variant">Max Current</label>
<div className="relative flex items-center">
<input className="glass-input rounded-DEFAULT w-24 text-right pr-8 py-2 font-data-point text-[14px] text-primary" step="0.1" type="number" value={currentForm.maxCurrent} onChange={(e) => updateFormField('maxCurrent', parseFloat(e.target.value) || 0)} onBlur={() => handleSingleParamWrite(0x7018, '<f', currentForm.maxCurrent, 'Max Current')} />''', jsx)

jsx = re.sub(r'<label[^>]*>Joint Min Lim</label>\s*<div[^>]*>\s*<input[^>]*value="-3.14"\s*/>',
    '''<label className="font-label-caps text-label-caps text-on-surface-variant">Joint Min Lim</label>
<div className="relative flex items-center">
<input className="glass-input rounded-DEFAULT w-24 text-right pr-10 py-2 font-data-point text-[14px] text-primary" step="0.01" type="number" value={currentForm.jointLimitMin} onChange={(e) => handleLimitChange('jointLimitMin', parseFloat(e.target.value) || 0)} />''', jsx)

jsx = re.sub(r'<label[^>]*>Joint Max Lim</label>\s*<div[^>]*>\s*<input[^>]*value="3.14"\s*/>',
    '''<label className="font-label-caps text-label-caps text-on-surface-variant">Joint Max Lim</label>
<div className="relative flex items-center">
<input className="glass-input rounded-DEFAULT w-24 text-right pr-10 py-2 font-data-point text-[14px] text-primary" step="0.01" type="number" value={currentForm.jointLimitMax} onChange={(e) => handleLimitChange('jointLimitMax', parseFloat(e.target.value) || 0)} />''', jsx)

jsx = re.sub(r'<span[^>]*>25.00</span>\s*</div>\s*<div[^>]*>.*?</div>\s*</div>\s*<input[^>]*value="25"\s*/>',
    '''<span className="font-data-point text-[16px] text-primary">{currentForm.posKp}</span>
</div>
<input className="w-full h-4 mt-2 cursor-pointer" max="100" min="0" step="0.1" type="range" value={currentForm.posKp} onChange={(e) => updateFormField('posKp', parseFloat(e.target.value) || 0)} onBlur={() => handleSingleParamWrite(0x7015, '<f', currentForm.posKp, 'Pos Kp')} />''', jsx, flags=re.DOTALL)

jsx = re.sub(r'<label[^>]*>Velocity Kp</label>\s*<span[^>]*>0.15</span>\s*</div>\s*<div[^>]*>.*?</div>\s*</div>',
    '''<label className="font-label-caps text-label-caps text-on-surface-variant">Velocity Kp</label>
<span className="font-data-point text-[16px] text-primary">{currentForm.velKp}</span>
</div>
<input className="w-full h-4 mt-2 cursor-pointer" max="1" min="0" step="0.01" type="range" value={currentForm.velKp} onChange={(e) => updateFormField('velKp', parseFloat(e.target.value) || 0)} onBlur={() => handleSingleParamWrite(0x700B, '<f', currentForm.velKp, 'Vel Kp')} />
</div>''', jsx, flags=re.DOTALL)

jsx = re.sub(r'<label[^>]*>Velocity Ki</label>\s*<span[^>]*>0.05</span>\s*</div>\s*<div[^>]*>.*?</div>\s*</div>',
    '''<label className="font-label-caps text-label-caps text-on-surface-variant">Velocity Ki</label>
<span className="font-data-point text-[16px] text-primary">{currentForm.velKi}</span>
</div>
<input className="w-full h-4 mt-2 cursor-pointer" max="1" min="0" step="0.001" type="range" value={currentForm.velKi} onChange={(e) => updateFormField('velKi', parseFloat(e.target.value) || 0)} onBlur={() => handleSingleParamWrite(0x700C, '<f', currentForm.velKi, 'Vel Ki')} />
</div>''', jsx, flags=re.DOTALL)

jsx = re.sub(r'<label[^>]*>Velocity Kd</label>\s*<span[^>]*>0.01</span>\s*</div>\s*<div[^>]*>.*?</div>\s*</div>',
    '''<label className="font-label-caps text-label-caps text-on-surface-variant">Velocity Kd</label>
<span className="font-data-point text-[16px] text-primary">{currentForm.velKd}</span>
</div>
<input className="w-full h-4 mt-2 cursor-pointer" max="1" min="0" step="0.001" type="range" value={currentForm.velKd} onChange={(e) => updateFormField('velKd', parseFloat(e.target.value) || 0)} onBlur={() => handleSingleParamWrite(0x700D, '<f', currentForm.velKd, 'Vel Kd')} />
</div>''', jsx, flags=re.DOTALL)

jsx = jsx.replace('>RESET<', ' onClick={handleReadAll} disabled={isReading || !isConnected}>READ ALL<')
jsx = jsx.replace('>WRITE TO FLASH<', ' onClick={() => setShowWriteConfirm(true)} disabled={isWriting || !isConnected}>WRITE ALL<')
jsx = jsx.replace('>APPLY LIMITS<', ' onClick={handleSaveToFlash} disabled={isSavingFlash || !isConnected}>SAVE TO FLASH<')

jsx = re.sub(r'<div[^>]*>POSITION \(RAD\)</div>\s*<div[^>]*>0.000</div>',
    '''<div className="font-label-caps text-[10px] text-on-surface-variant mb-1">POSITION (DEG)</div>
<div className="font-data-point text-[24px] text-primary">{(activeMotorState?.position ?? 0).toFixed(2)}</div>''', jsx)

jsx = re.sub(r'<div[^>]*>VELOCITY \(RAD/S\)</div>\s*<div[^>]*>0.00</div>',
    '''<div className="font-label-caps text-[10px] text-on-surface-variant mb-1">VELOCITY (RAD/S)</div>
<div className="font-data-point text-[24px] text-primary">{(activeMotorState?.velocity ?? 0).toFixed(2)}</div>''', jsx)

jsx = re.sub(r'<div[^>]*>CURRENT \(A\)</div>\s*<div[^>]*>0.42</div>',
    '''<div className="font-label-caps text-[10px] text-secondary mb-1">CURRENT (A)</div>
<div className="font-data-point text-[24px] text-secondary">{(activeMotorState?.current ?? 0).toFixed(2)}</div>''', jsx)

jsx = re.sub(r'<div[^>]*>TEMP \(°C\)</div>\s*<div[^>]*>34.5</div>',
    '''<div className="font-label-caps text-[10px] text-on-surface-variant mb-1">TEMP (°C)</div>
<div className="font-data-point text-[24px] text-primary">{activeMotorState?.temperature ?? 0}</div>''', jsx)

jsx = jsx.replace('placeholder="Target" type="number"',
    '''placeholder="Target" type="number" value={currentForm.posRef} onChange={(e) => updateFormField('posRef', parseFloat(e.target.value) || 0)}''')
jsx = jsx.replace('>SEND COMMAND<', ' onClick={() => handleSendCommand(\'posRef\', 0x7016, currentForm.posRef)} disabled={!isConnected}>SEND COMMAND<')

jsx = jsx.replace('Motor 1 [J1]', '{activeMotor === 1 ? "Motor 1 [J1] ACTIVE" : "Motor 1 [J1]"}')
jsx = jsx.replace('Motor 2 [J2]', '{activeMotor === 2 ? "Motor 2 [J2] ACTIVE" : "Motor 2 [J2]"}')

jsx = jsx.replace('<button className="h-10 px-6 rounded-t-DEFAULT bg-white/10 border-b-2 border-secondary font-label-caps text-label-caps text-secondary flex items-center gap-2">',
    '<button onClick={() => setActiveMotor(1)} className={`h-10 px-6 rounded-t-DEFAULT ${activeMotor === 1 ? "bg-white/10 border-b-2 border-secondary text-secondary" : "bg-transparent border-transparent text-on-surface-variant hover:bg-white/5"} font-label-caps text-label-caps flex items-center gap-2 transition-all`}>'
)

jsx = jsx.replace('<button className="h-10 px-6 rounded-t-DEFAULT bg-transparent hover:bg-white/5 border-b-2 border-transparent hover:border-white/20 text-on-surface-variant font-label-caps text-label-caps transition-all flex items-center gap-2">',
    '<button onClick={() => setActiveMotor(2)} className={`h-10 px-6 rounded-t-DEFAULT ${activeMotor === 2 ? "bg-white/10 border-b-2 border-secondary text-secondary" : "bg-transparent border-transparent text-on-surface-variant hover:bg-white/5"} font-label-caps text-label-caps flex items-center gap-2 transition-all`}>'
)

# Toast addition to the top
toast_jsx = '''
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-mono border backdrop-blur-glass shadow-2xl transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
              : toast.type === 'error'
                ? 'bg-red-950/80 border-danger/40 text-red-300'
                : 'bg-[#131318]/90 border-glass-border text-accent'
          }`}
        >
          <span>{toast.message}</span>
        </div>
      )}
'''

final_code = logic + "\n  return (\n    <div className=\"flex flex-col h-full w-full overflow-hidden bg-background text-on-background\">\n" + toast_jsx + "\n" + jsx + "\n    </div>\n  );\n}\n\nexport default MotorStudio;\n"

with open(r'd:\PRJ\Robstride\ArmControlApp\src\renderer\src\pages\MotorStudio.tsx', 'w', encoding='utf-8') as f:
    f.write(final_code)
