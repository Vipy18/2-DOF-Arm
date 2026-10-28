f = uifigure('Position', [100 100 400 400]);
g = uigridlayout(f, [4,1], 'Scrollable', 'on');
g.RowHeight = {200, 200, 200, 200};
p1 = uipanel(g, 'Title', 'P1', 'BackgroundColor', 'r');
p2 = uipanel(g, 'Title', 'P2', 'BackgroundColor', 'g');
p3 = uipanel(g, 'Title', 'P3', 'BackgroundColor', 'b');
p4 = uipanel(g, 'Title', 'P4', 'BackgroundColor', 'y');
pause(2);
disp('Grid scroll worked');
