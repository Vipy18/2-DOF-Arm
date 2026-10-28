import re

# We will read the Program.tsx and replace its render block
with open(r'd:\PRJ\Robstride\ArmControlApp\src\renderer\src\pages\Program.tsx', 'r', encoding='utf-8') as f:
    orig = f.read()

match = re.search(r'(.*?)return \(\s*<div.*', orig, re.DOTALL)
if match:
    logic = match.group(1)

# Now we construct the JSX string for Program.tsx manually to ensure it uses the new styling
jsx = '''
    <div className="h-full w-full flex flex-col overflow-hidden bg-background text-on-background select-none">
      <input type="file" ref={fileInputRef} onChange={handleFileInputChange} accept=".json" className="hidden" />
      
      {/* Top Navbar / Toolbar */}
      <header className="h-[64px] min-h-[64px] bg-white/5 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-6 z-10 shrink-0">
        <div className="flex items-center gap-4">
            <h2 className="font-headline-md text-headline-md text-primary">Sequence Editor</h2>
            <span className="glass-panel px-2 py-1 rounded text-xs font-label-caps text-secondary bg-white/5 border border-white/10">{steps.length} STEPS</span>
        </div>
        
        <div className="flex gap-2 flex-wrap items-center">
            <button onClick={handleRecordPoint} disabled={isPlaying} className="btn-primary bg-white/80 hover:bg-white text-black font-label-caps text-label-caps px-4 py-2 rounded transition-colors duration-200 flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Record
            </button>
            <div className="flex gap-2 w-full sm:w-auto ml-4">
                <button onClick={startPlayback} disabled={steps.length === 0 || safety.eStopActive || isPlaying} className="btn-icon text-secondary border border-secondary/30 bg-secondary/10 hover:bg-secondary/20 rounded w-10 h-10 flex items-center justify-center transition-all duration-200">
                    <Play className="w-4 h-4 fill-current" />
                </button>
                <button onClick={stopPlayback} disabled={!isPlaying} className="btn-icon bg-white/5 border border-white/10 text-on-surface-variant hover:text-primary hover:bg-white/10 rounded w-10 h-10 flex items-center justify-center transition-all duration-200">
                    <Square className="w-4 h-4 fill-current text-danger" />
                </button>
                <div className="w-px h-10 bg-white/10 mx-1"></div>
                <button onClick={handleClearAll} disabled={steps.length === 0 || isPlaying} className="btn-icon bg-white/5 border border-white/10 text-on-surface-variant hover:text-primary hover:bg-white/10 rounded w-10 h-10 flex items-center justify-center transition-all duration-200">
                    <RotateCcw className="w-4 h-4" />
                </button>
                
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Program Name" className="bg-black/40 border border-white/5 shadow-inner rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary text-primary font-data-point text-sm px-3 py-2 w-40 ml-2" />
                
                <button onClick={handleSaveProgram} disabled={steps.length === 0} className="btn-icon bg-white/5 border border-white/10 text-on-surface-variant hover:text-primary hover:bg-white/10 rounded w-10 h-10 flex items-center justify-center transition-all duration-200">
                    <Save className="w-4 h-4" />
                </button>
                <button onClick={handleLoadProgram} disabled={isPlaying} className="btn-icon bg-white/5 border border-white/10 text-on-surface-variant hover:text-primary hover:bg-white/10 rounded w-10 h-10 flex items-center justify-center transition-all duration-200">
                    <FolderOpen className="w-4 h-4" />
                </button>
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row p-gutter gap-gutter overflow-hidden relative z-10 h-full">
        {/* Left Pane: Sequence List */}
        <section className="w-full md:w-[400px] flex flex-col gap-4 h-full shrink-0">
          <div className="flex-1 overflow-y-auto pr-2 space-y-2 pb-20 custom-scrollbar">
            {steps.length === 0 ? (
                <div className="p-4 text-center text-on-surface-variant font-label-caps">No steps recorded.</div>
            ) : (
                steps.map((step, idx) => (
                    <StepRow
                      key={step.id || `step-${idx}`}
                      step={step}
                      isActive={isPlaying && currentStepIndex === idx}
                      isEditing={editingStepId === step.id}
                      onEdit={() => setEditingStep(step.id)}
                      onDelete={() => deleteStep(step.id)}
                      onSimulate={() => triggerSimulationPreview(step.targetAngles)}
                      onRun={() => handleRunSingleStep(step)}
                    />
                ))
            )}
          </div>
        </section>

        {/* Right Pane */}
        <section className="flex-1 flex flex-col gap-4 h-full min-w-0">
          {editingStepId !== null ? (
            <StepEditor stepId={editingStepId} onClose={() => setEditingStep(null)} onSimulate={triggerSimulationPreview} />
          ) : (
            <div className="flex-1 glass-panel rounded-xl relative overflow-hidden flex flex-col group min-h-[300px] bg-white/5 border border-white/10">
              <div className="absolute top-4 left-4 z-10 flex flex-col gap-1">
                <div className="font-label-caps text-on-surface-variant text-xs">WORKSPACE SCHEMATIC</div>
                <div className="font-data-point text-xl text-primary">SCARA_01</div>
              </div>
              <MiniArmCanvas currentAngles={currentArmAngles} previewAngles={simulationAngles} l1={l1} l2={l2} height={400} />
              
              {/* Real-time Angles readout */}
              <div className="absolute bottom-4 left-4 flex gap-4">
                  <div className="bg-black/40 border border-white/10 rounded-xl p-3">
                    <div className="text-[10px] font-label-caps text-white/50">J1 (θ1)</div>
                    <div className="text-base font-data-point text-white mt-1">
                      {radToDeg(currentArmAngles.theta1).toFixed(1)}°
                    </div>
                  </div>
                  <div className="bg-black/40 border border-white/10 rounded-xl p-3">
                    <div className="text-[10px] font-label-caps text-white/50">J2 (θ2)</div>
                    <div className="text-base font-data-point text-white mt-1">
                      {radToDeg(currentArmAngles.theta2).toFixed(1)}°
                    </div>
                  </div>
              </div>
            </div>
          )}
        </section>
      </main>
      
      <footer className="h-[38px] min-h-[38px] bg-white/5 backdrop-blur-glass border-t border-white/10 flex items-center justify-between px-6 text-xs font-mono text-white/70 z-10">
        <div className="flex items-center gap-3 truncate max-w-sm">
          <Layers className="w-3.5 h-3.5 text-accent" />
          <span className="truncate text-white/90 font-semibold">{name || 'Untitled Program'}</span>
          <span className="text-white/30">|</span>
          <span>{steps.length} {steps.length === 1 ? 'step' : 'steps'}</span>
        </div>
        <div className="flex items-center gap-2 text-white/80">
          <span className="text-white/50 uppercase text-[10px] tracking-wider font-label-caps">Estimated Duration:</span>
          <span className="text-secondary font-bold font-data-point">{totalDurationSec}s</span>
        </div>
      </footer>
    </div>
  )
}

export default Program;
'''

final_code = logic + "\n  return (\n" + jsx

with open(r'd:\PRJ\Robstride\ArmControlApp\src\renderer\src\pages\Program.tsx', 'w', encoding='utf-8') as f:
    f.write(final_code)
