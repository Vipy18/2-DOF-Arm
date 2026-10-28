f = uifigure('Position', [100 100 400 400]);
p = uipanel(f, 'Scrollable', 'on', 'Position', [1 1 400 400]);
g = uigridlayout(p, [4,1], 'Scrollable', 'on');
g.RowHeight = {200, 200, 200, 200};
disp('Scrollable grid inside panel worked');
