import { PlatformConfig, Matterbridge, MatterbridgeAccessoryPlatform, powerSource, MatterbridgeEndpoint, occupancySensor, lightSensor } from 'matterbridge';
import { IlluminanceMeasurement, OccupancySensing } from 'matterbridge/matter/clusters';
import { MatterHistory } from 'matter-history';
import { AnsiLogger } from 'matterbridge/logger';

export class EveMotionPlatform extends MatterbridgeAccessoryPlatform {
  motion: MatterbridgeEndpoint | undefined;
  history: MatterHistory | undefined;
  interval: NodeJS.Timeout | undefined;

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

    // Verify that Matterbridge is the correct version
    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('2.2.6')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "2.2.6". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend."`,
      );
    }

    this.log.info('Initializing platform:', this.config.name);
  }

  override async onStart(reason?: string) {
    this.log.info('onStart called with reason:', reason ?? 'none');

    this.history = new MatterHistory(this.log, 'Eve motion', { filePath: this.matterbridge.matterbridgeDirectory });

    this.motion = new MatterbridgeEndpoint([occupancySensor, lightSensor, powerSource], { uniqueStorageKey: 'Eve motion' }, this.config.debug as boolean);
    this.motion.createDefaultIdentifyClusterServer();
    this.motion.createDefaultBasicInformationClusterServer('Eve motion', '0x85483499', 4874, 'Eve Systems', 89, 'Eve Motion 20EBY9901', 6650, '3.2.1');
    this.motion.createDefaultOccupancySensingClusterServer();
    this.motion.createDefaultIlluminanceMeasurementClusterServer();
    this.motion.createDefaultPowerSourceReplaceableBatteryClusterServer();

    // Add the EveHistory cluster to the device as last cluster!
    this.history.createMotionEveHistoryClusterServer(this.motion, this.log);
    this.history.autoPilot(this.motion);

    await this.registerDevice(this.motion);

    this.motion.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.info(`Command identify called identifyTime:${identifyTime}`);
      this.history?.logHistory(false);
    });

    this.motion.addCommandHandler('triggerEffect', async ({ request: { effectIdentifier, effectVariant } }) => {
      this.log.info(`Command triggerEffect called effect ${effectIdentifier} variant ${effectVariant}`);
      this.history?.logHistory(false);
    });
  }

  override async onConfigure() {
    this.log.info('onConfigure called');

    this.interval = setInterval(
      async () => {
        if (!this.motion || !this.history) return;
        const occupancyAttribute = this.motion.getAttribute(OccupancySensing.Cluster.id, 'occupancy', this.log) as { occupied: boolean } | undefined;
        if (!occupancyAttribute) return;
        let { occupied } = occupancyAttribute;
        occupied = !occupied;
        const lux = this.history.getFakeLevel(0, 1000, 0);
        await this.motion.setAttribute(OccupancySensing.Cluster.id, 'occupancy', { occupied }, this.log);
        await this.motion.setAttribute(IlluminanceMeasurement.Cluster.id, 'measuredValue', Math.round(Math.max(Math.min(10000 * Math.log10(lux) + 1, 0xfffe), 0)), this.log);

        this.history.setLastEvent();
        this.history.addEntry({ time: this.history.now(), motion: occupied === true ? 0 : 1, lux });
        this.log.info(`Set motion to ${occupied} and lux to ${lux}`);
      },
      60 * 1000 + 200,
    );
  }

  override async onShutdown(reason?: string) {
    this.log.info('onShutdown called with reason:', reason ?? 'none');
    await this.history?.close();
    clearInterval(this.interval);
    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();
  }
}
