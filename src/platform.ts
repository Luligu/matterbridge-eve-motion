import { DeviceTypes, IlluminanceMeasurement, OccupancySensing, PlatformConfig } from 'matterbridge';

import { Matterbridge, MatterbridgeDevice, MatterbridgeAccessoryPlatform, MatterHistory } from 'matterbridge';
import { AnsiLogger } from 'node-ansi-logger';

export class EveMotionPlatform extends MatterbridgeAccessoryPlatform {
  motion: MatterbridgeDevice | undefined;
  history: MatterHistory | undefined;
  interval: NodeJS.Timeout | undefined;

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);
  }

  override async onStart(reason?: string) {
    this.log.info('onStart called with reason:', reason ?? 'none');

    this.history = new MatterHistory(this.log, 'Eve motion', { filePath: this.matterbridge.matterbridgeDirectory });

    this.motion = new MatterbridgeDevice(DeviceTypes.OCCUPANCY_SENSOR);
    this.motion.createDefaultIdentifyClusterServer();
    this.motion.createDefaultBasicInformationClusterServer('Eve motion', '0x85483499', 4874, 'Eve Systems', 89, 'Eve Motion 20EBY9901', 6650, '3.2.1');
    this.motion.createDefaultOccupancySensingClusterServer();

    this.motion.addDeviceType(DeviceTypes.LIGHT_SENSOR);
    this.motion.createDefaultIlluminanceMeasurementClusterServer();

    this.motion.createDefaultPowerSourceReplaceableBatteryClusterServer();
    this.motion.createDefaultPowerSourceConfigurationClusterServer(1);

    // Add the EveHistory cluster to the device as last cluster!
    this.motion.createMotionEveHistoryClusterServer(this.history, this.log);
    this.history.autoPilot(this.motion);

    await this.registerDevice(this.motion);

    this.motion.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.warn(`Command identify called identifyTime:${identifyTime}`);
      this.history?.logHistory(false);
    });
  }

  override async onConfigure() {
    this.log.info('onConfigure called');

    this.interval = setInterval(
      () => {
        if (!this.motion || !this.history) return;
        const occupancy = this.motion.getClusterServerById(OccupancySensing.Cluster.id)?.getOccupancyAttribute();
        if (!occupancy) return;
        occupancy.occupied = !occupancy.occupied;
        const lux = this.history.getFakeLevel(0, 1000, 0);
        this.motion.getClusterServerById(OccupancySensing.Cluster.id)?.setOccupancyAttribute(occupancy);
        this.motion.getClusterServerById(IlluminanceMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.round(Math.max(Math.min(10000 * Math.log10(lux) + 1, 0xfffe), 0)));

        this.history.setLastEvent();
        this.history.addEntry({ time: this.history.now(), motion: occupancy.occupied === true ? 0 : 1, lux });
        this.log.info(`Set motion to ${occupancy.occupied} and lux to ${lux}`);
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
