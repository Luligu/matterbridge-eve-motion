const NAME = 'Platform';
const MATTER_PORT = 6000;
const MATTER_CREATE_ONLY = true;

import { jest } from '@jest/globals';
import { PlatformConfig } from 'matterbridge';
import {
  addMatterbridgePlatform,
  createMatterbridgeEnvironment,
  destroyMatterbridgeEnvironment,
  log,
  loggerLogSpy,
  matterbridge,
  setupTest,
  startMatterbridgeEnvironment,
  stopMatterbridgeEnvironment,
} from 'matterbridge/jestutils';
import { LogLevel } from 'matterbridge/logger';
import { Identify } from 'matterbridge/matter/clusters';

import initializePlugin, { EveMotionPlatform } from './module.js';

// Setup the test environment
setupTest(NAME, false);

describe('TestPlatform', () => {
  let testPlatform: EveMotionPlatform;

  const config: PlatformConfig = {
    name: 'matterbridge-eve-motion',
    type: 'AccessoryPlatform',
    version: '1.0.0',
    unregisterOnShutdown: false,
    debug: false,
  };

  beforeAll(async () => {
    // Create Matterbridge environment
    await createMatterbridgeEnvironment();
    await startMatterbridgeEnvironment(MATTER_PORT, MATTER_CREATE_ONLY);
  });

  beforeEach(() => {
    // Reset the mock calls before each test
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Destroy Matterbridge environment
    await stopMatterbridgeEnvironment(MATTER_CREATE_ONLY);
    await destroyMatterbridgeEnvironment(undefined, undefined, true, true);
    // Restore all mocks
    jest.restoreAllMocks();
  });

  it('should return an instance of TestPlatform', async () => {
    const platform = initializePlugin(matterbridge, log, config);
    expect(platform).toBeInstanceOf(EveMotionPlatform);
    await platform.onShutdown();
  });

  it('should not initialize platform with wrong version', () => {
    matterbridge.matterbridgeVersion = '1.5.0';
    expect(() => (testPlatform = new EveMotionPlatform(matterbridge, log, config))).toThrow();
    matterbridge.matterbridgeVersion = '3.5.0';
  });

  it('should initialize platform with config name', () => {
    testPlatform = new EveMotionPlatform(matterbridge, log, config);
    addMatterbridgePlatform(testPlatform);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'Initializing platform:', config.name);
  });

  it('should call onStart with reason', async () => {
    await testPlatform.onStart('Test reason');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'onStart called with reason:', 'Test reason');
    expect(testPlatform.motion).toBeDefined();
    if (!testPlatform.motion) return;
    expect(testPlatform.motion.getAllClusterServerNames()).toEqual([
      'descriptor',
      'matterbridge',
      'identify',
      'occupancySensing',
      'illuminanceMeasurement',
      'powerSource',
      'eveHistory',
    ]);
  });

  it('should call onConfigure', async () => {
    expect(testPlatform.motion).toBeDefined();
    if (!testPlatform.motion) return;

    jest.useFakeTimers();

    await testPlatform.onConfigure();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'onConfigure called');

    // Simulate multiple interval executions
    for (let i = 0; i < 20; i++) {
      await jest.advanceTimersByTimeAsync(61 * 1000);
    }

    jest.useRealTimers();

    expect(loggerLogSpy).toHaveBeenCalled();
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.ERROR, expect.anything());
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining('Set motion to true'));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining('Set motion to false'));
  });

  it('should execute the commandHandlers', async () => {
    expect(testPlatform.motion).toBeDefined();
    if (!testPlatform.motion) return;
    await testPlatform.motion.executeCommandHandler('identify', { identifyTime: 5 }, 'identify', {} as any, testPlatform.motion);
    await testPlatform.motion.executeCommandHandler(
      'triggerEffect',
      { effectIdentifier: Identify.EffectIdentifier.Blink, effectVariant: Identify.EffectVariant.Default },
      'identify',
      {} as any,
      testPlatform.motion,
    );
  });

  it('should call onShutdown with reason', async () => {
    await testPlatform.onShutdown('Test reason');
    testPlatform.config.unregisterOnShutdown = true;
    await testPlatform.onShutdown();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'onShutdown called with reason:', 'Test reason');
  });
});
