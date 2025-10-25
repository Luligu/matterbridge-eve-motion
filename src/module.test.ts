const MATTER_PORT = 6000;
const NAME = 'Platform';
const HOMEDIR = path.join('jest', NAME);

import path from 'node:path/win32';

import { Matterbridge, MatterbridgeEndpoint, PlatformConfig } from 'matterbridge';
import { Identify } from 'matterbridge/matter/clusters';
import { AnsiLogger, LogLevel, TimestampFormat } from 'matterbridge/logger';
import { jest } from '@jest/globals';
import { AggregatorEndpoint } from 'matterbridge/matter/endpoints';
import { Endpoint, ServerNode } from 'matterbridge/matter';

import {
  createMatterbridgeEnvironment,
  destroyMatterbridgeEnvironment,
  loggerLogSpy,
  setDebug,
  setupTest,
  startMatterbridgeEnvironment,
  stopMatterbridgeEnvironment,
} from './jestHelpers.js';
import initializePlugin, { EveMotionPlatform } from './module.js';

// Setup the test environment
setupTest(NAME, false);

describe('TestPlatform', () => {
  let matterbridge: Matterbridge;
  let server: ServerNode<ServerNode.RootEndpoint>;
  let aggregator: Endpoint<AggregatorEndpoint>;
  let testPlatform: EveMotionPlatform;
  let log: AnsiLogger;

  const config: PlatformConfig = {
    name: 'matterbridge-eve-motion',
    type: 'AccessoryPlatform',
    version: '1.0.0',
    unregisterOnShutdown: false,
    debug: false,
  };

  beforeAll(async () => {
    matterbridge = await createMatterbridgeEnvironment(NAME);
    [server, aggregator] = await startMatterbridgeEnvironment(matterbridge, MATTER_PORT);
    log = new AnsiLogger({ logName: NAME, logTimestampFormat: TimestampFormat.TIME_MILLIS, logLevel: LogLevel.DEBUG });
  });

  beforeEach(() => {
    // Reset the mock calls before each test
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await stopMatterbridgeEnvironment(matterbridge, server, aggregator);
    await destroyMatterbridgeEnvironment(matterbridge);
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
    matterbridge.matterbridgeVersion = '3.3.0';
  });

  it('should initialize platform with config name', () => {
    // @ts-expect-error accessing private member for testing
    matterbridge.plugins._plugins.set('matterbridge-jest', {});
    testPlatform = new EveMotionPlatform(matterbridge, log, config);
    testPlatform['name'] = 'matterbridge-jest';
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

    for (let i = 0; i < 20; i++) {
      await jest.advanceTimersByTimeAsync(61 * 1000);
    }

    jest.useRealTimers();

    expect(loggerLogSpy).toHaveBeenCalled();
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.ERROR, expect.anything());
  });

  it('should execute the commandHandlers', async () => {
    expect(testPlatform.motion).toBeDefined();
    if (!testPlatform.motion) return;
    await testPlatform.motion.executeCommandHandler('identify', { identifyTime: 5 });
    await testPlatform.motion.executeCommandHandler('triggerEffect', { effectIdentifier: Identify.EffectIdentifier.Blink, effectVariant: Identify.EffectVariant.Default });
  });

  it('should call onShutdown with reason', async () => {
    await testPlatform.onShutdown('Test reason');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'onShutdown called with reason:', 'Test reason');
  });
});
