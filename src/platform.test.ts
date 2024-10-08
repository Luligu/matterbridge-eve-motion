import { Matterbridge, PlatformConfig } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { EveMotionPlatform } from './platform';
import { jest } from '@jest/globals';

describe('TestPlatform', () => {
  let mockMatterbridge: Matterbridge;
  let mockLog: AnsiLogger;
  let mockConfig: PlatformConfig;
  let testPlatform: EveMotionPlatform;

  // const log = new AnsiLogger({ logName: 'shellyDeviceTest', logTimestampFormat: TimestampFormat.TIME_MILLIS, logDebug: true });

  beforeEach(() => {
    mockMatterbridge = { addBridgedDevice: jest.fn() } as unknown as Matterbridge;
    mockLog = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } as unknown as AnsiLogger;
    mockConfig = {
      'name': 'matterbridge-test',
      'type': 'DynamicPlatform',
      'noDevices': false,
      'throwLoad': false,
      'throwStart': false,
      'throwConfigure': false,
      'throwShutdown': false,
      'unregisterOnShutdown': false,
      'delayStart': false,
    } as PlatformConfig;

    testPlatform = new EveMotionPlatform(mockMatterbridge, mockLog, mockConfig);
  });

  it('should initialize platform with config name', () => {
    mockConfig.noDevices = true;
    mockConfig.delayStart = true;
    testPlatform = new EveMotionPlatform(mockMatterbridge, mockLog, mockConfig);
    expect(mockLog.info).toHaveBeenCalledWith('Initializing platform:', mockConfig.name);
  });

  it('should call onStart with reason', async () => {
    await testPlatform.onStart('Test reason');
    expect(mockLog.info).toHaveBeenCalledWith('onStart called with reason:', 'Test reason');
  });

  it('should call onConfigure', async () => {
    await testPlatform.onConfigure();
    expect(mockLog.info).toHaveBeenCalledWith('onConfigure called');
  });

  it('should call onShutdown with reason', async () => {
    await testPlatform.onShutdown('Test reason');
    expect(mockLog.info).toHaveBeenCalledWith('onShutdown called with reason:', 'Test reason');
  });
});
