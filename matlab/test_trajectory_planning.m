function test_trajectory_planning()
    disp('Starting Trajectory Planning Verification...');
    
    % 1. Create offline arm instance
    arm = ArmControl('COM_TEST_OFFLINE');
    
    % 2. Linear trajectory test
    traj_lin = arm.plan_trajectory([0, -500], [200, -400], 150, 300, 'linear', 'up');
    assert(traj_lin.valid == true, sprintf('Linear trajectory should be valid, error: %s', traj_lin.error_msg));
    assert(length(traj_lin.t) > 2, 'Linear trajectory should have multiple waypoints');
    % Verify collinearity Y vs X: slope m = (y1 - y0) / (x1 - x0) = 100 / 200 = 0.5
    m_expected = (-400 - (-500)) / (200 - 0);
    y_expected = -500 + m_expected * (traj_lin.x - 0);
    max_dev = max(abs(traj_lin.y - y_expected));
    assert(max_dev < 1e-6, sprintf('Linear path points not collinear, max dev: %e', max_dev));
    disp('Linear trajectory test passed.');
    
    % 3. Joint trajectory test
    traj_joint = arm.plan_trajectory([0, -500], [200, -400], 150, 300, 'joint', 'up');
    assert(traj_joint.valid == true, sprintf('Joint trajectory should be valid, error: %s', traj_joint.error_msg));
    assert(length(traj_joint.t) > 2, 'Joint trajectory should have multiple waypoints');
    disp('Joint trajectory test passed.');
    
    % 4. Arch trajectory test
    traj_arch = arm.plan_trajectory([0, -500], [200, -400], 150, 300, 'arch', 'up');
    assert(traj_arch.valid == true, sprintf('Arch trajectory should be valid, error: %s', traj_arch.error_msg));
    assert(length(traj_arch.t) > 2, 'Arch trajectory should have multiple waypoints');
    % Verify apex is higher than endpoints
    max_y = max(traj_arch.y);
    assert(max_y > max(-500, -400), sprintf('Arch apex (%.1f) should be higher than endpoints (-500, -400)', max_y));
    disp('Arch trajectory test passed.');
    
    % 5. Out-of-reach target rejection
    traj_bad = arm.plan_trajectory([0, -500], [800, 800], 150, 300, 'linear', 'up');
    assert(traj_bad.valid == false, 'Target [800, 800] should be out of reach and marked invalid');
    disp('Out-of-reach rejection test passed.');
    
    % 6. Full extension workspace boundary tests
    % Start at [2.2, -700] to target [0, -700] (distance 2.2 mm >= 1 mm)
    traj_ext1 = arm.plan_trajectory([2.2, -700], [0, -700], 150, 300, 'linear', 'up');
    assert(traj_ext1.valid == true, sprintf('Trajectory from (2.2, -700) to (0, -700) should be valid, error: %s', traj_ext1.error_msg));
    
    % Start at [0, -500] to full extension target [0, -700]
    traj_ext2 = arm.plan_trajectory([0, -500], [0, -700], 150, 300, 'linear', 'up');
    assert(traj_ext2.valid == true, sprintf('Trajectory from (0, -500) to (0, -700) should be valid, error: %s', traj_ext2.error_msg));
    
    % Verify start [0, -700] to target [0, -700] is not rejected as out of reach
    traj_same = arm.plan_trajectory([0, -700], [0, -700], 150, 300, 'linear', 'up');
    assert(~contains(traj_same.error_msg, 'reach'), sprintf('Start=Target (0, -700) must not fail for reach, error: %s', traj_same.error_msg));
    disp('Full extension workspace boundary tests passed.');
    
    % 7. Clean up
    arm.delete();
    disp('ALL TRAJECTORY PLANNING TESTS PASSED SUCCESSFULLY!');
end
