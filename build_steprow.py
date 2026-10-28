import re

with open(r'd:\PRJ\Robstride\ArmControlApp\src\renderer\src\components\StepRow.tsx', 'r', encoding='utf-8') as f:
    orig = f.read()

match = re.search(r'(.*?)return \(\s*<div.*?>(.*)', orig, re.DOTALL)
if match:
    logic = match.group(1)

jsx = '''
    <div
      onClick={onEdit}
      className={`glass-panel p-3 flex items-center gap-4 cursor-pointer relative group transition-all duration-150 ${
        isActive
          ? 'bg-white/10 border-secondary/50 shadow-[inset_4px_0_0_0_#7bd0ff]'
          : isEditing
            ? 'bg-white/10 shadow-[inset_4px_0_0_0_#ffffff]'
            : 'glass-panel-hover'
      }`}
    >
      <div className={`font-data-point text-lg w-8 text-right ${isActive ? 'text-secondary' : 'text-on-surface-variant opacity-50'}`}>
        {stepNumber.replace('#', '')}
      </div>
      <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1">
        <div className="flex justify-between items-center text-xs">
          <span className={`font-label-caps ${isActive ? 'text-secondary' : 'text-on-surface-variant'}`}>X</span>
          <span className="font-data-point text-primary">{xFormatted}</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className={`font-label-caps ${isActive ? 'text-secondary' : 'text-on-surface-variant'}`}>Y</span>
          <span className="font-data-point text-primary">{yFormatted}</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="font-label-caps text-on-surface-variant">SPD</span>
          <span className="font-data-point text-primary text-[10px]">{speedPct}%</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="font-label-caps text-on-surface-variant">DWL</span>
          <span className="font-data-point text-primary text-[10px]">{step.dwellMs / 1000}s</span>
        </div>
      </div>
      <div className="absolute right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-surface-dim/80 backdrop-blur rounded p-1">
        <button onClick={handleSimulate} className="text-on-surface-variant hover:text-white p-1" title="Simulate">
          <Eye className="w-4 h-4" />
        </button>
        <button onClick={handleRun} className="text-secondary hover:text-white p-1" title="Run">
          <Play className="w-4 h-4 fill-current" />
        </button>
        <button onClick={handleDelete} className="text-danger hover:text-white p-1" title="Delete">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
'''

final_code = logic + "  return (\n" + jsx

with open(r'd:\PRJ\Robstride\ArmControlApp\src\renderer\src\components\StepRow.tsx', 'w', encoding='utf-8') as f:
    f.write(final_code)
