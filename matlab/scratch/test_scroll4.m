try
    f = uifigure;
    g = uigridlayout(f, [1,1]);
    g.Scrollable = 'on';
    disp('Supported');
catch e
    disp(e.message);
end
