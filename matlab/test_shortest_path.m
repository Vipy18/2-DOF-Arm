function test_shortest_path()
    disp('Starting shortest path routing test...');

    % 1. Create offline ArmControl instance
    arm = ArmControl('COM_TEST_OFFLINE');

    % 2. Telemetry initial position at pi (+180 deg)
    arm.Telemetry.m1.position = pi;

    % 3. Target -pi/2 (-90 deg) -> cmd = arm.calculate_shortest_path(1, -pi/2);
    % Assert abs(cmd - (1.5*pi)) < 1e-4 (+270 deg, +90 deg CW displacement)
    cmd = arm.calculate_shortest_path(1, -pi/2);
    assert(abs(cmd - (1.5*pi)) < 1e-4, ...
        sprintf('Shortest path failed: expected %.4f, got %.4f', 1.5*pi, cmd));
    disp('Test 3 passed: pi -> -pi/2 unwrapped to 1.5*pi');

    % 4. Telemetry position at 0
    arm.Telemetry.m1.position = 0;

    % Target pi/2 (+90 deg) -> cmd = arm.calculate_shortest_path(1, pi/2);
    % Assert abs(cmd - (pi/2)) < 1e-4
    cmd = arm.calculate_shortest_path(1, pi/2);
    assert(abs(cmd - (pi/2)) < 1e-4, ...
        sprintf('Shortest path failed: expected %.4f, got %.4f', pi/2, cmd));
    disp('Test 4 passed: 0 -> pi/2 stayed pi/2');

    % 5. Command 270 deg directly: arm.set_target_position(1, 1.5*pi) does NOT throw limit error
    arm.set_target_position(1, 1.5*pi);
    disp('Test 5 passed: arm.set_target_position(1, 1.5*pi) executed without limit error');

    % 6. Delete arm, output success message
    delete(arm);
    disp('ALL SHORTEST PATH TESTS PASSED SUCCESSFULLY!');
end
