import { DeviceTypes, logEndpoint, IlluminanceMeasurement, OccupancySensing } from 'matterbridge';

import { Matterbridge, MatterbridgeDevice, MatterbridgeAccessoryPlatform, MatterHistory } from 'matterbridge';
import { AnsiLogger } from 'node-ansi-logger';

export class EveMotionPlatform extends MatterbridgeAccessoryPlatform {
  constructor(matterbridge: Matterbridge, log: AnsiLogger) {
    super(matterbridge, log);
  }

  override async onStart(reason?: string) {
    this.log.info('onStart called with reason:', reason ?? 'none');

    const history = new MatterHistory(this.log, 'Eve motion', { filePath: this.matterbridge.matterbridgeDirectory });

    const motion = new MatterbridgeDevice(DeviceTypes.OCCUPANCY_SENSOR);
    motion.createDefaultIdentifyClusterServer();
    motion.createDefaultBasicInformationClusterServer('Eve motion', '0x85483499', 4874, 'Eve Systems', 89, 'Eve Motion 20EBY9901', 6650, '3.2.1');
    motion.createDefaultOccupancySensingClusterServer();

    motion.addDeviceType(DeviceTypes.LIGHT_SENSOR);
    motion.createDefaultIlluminanceMeasurementClusterServer();

    motion.createDefaultPowerSourceReplaceableBatteryClusterServer();
    motion.createDefaultPowerSourceConfigurationClusterServer(1);

    // Add the EveHistory cluster to the device as last cluster!
    motion.createMotionEveHistoryClusterServer(history, this.log);
    history.autoPilot(motion);

    await this.registerDevice(motion);

    motion.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.warn(`Command identify called identifyTime:${identifyTime}`);
      logEndpoint(motion);
      history.logHistory(false);
    });

    setInterval(
      () => {
        const occupancy = motion.getClusterServerById(OccupancySensing.Cluster.id)?.getOccupancyAttribute();
        if (!occupancy) return;
        occupancy.occupied = !occupancy.occupied;
        const lux = history.getFakeLevel(0, 1000, 0);
        motion.getClusterServerById(OccupancySensing.Cluster.id)?.setOccupancyAttribute(occupancy);
        motion.getClusterServerById(IlluminanceMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.round(Math.max(Math.min(10000 * Math.log10(lux) + 1, 0xfffe), 0)));

        history.setLastEvent();
        history.addEntry({ time: history.now(), motion: occupancy.occupied === true ? 0 : 1, lux });
        this.log.info(`Set motion to ${occupancy.occupied} and lux to ${lux}`);
      },
      60 * 1000 - 400,
    );
  }

  override async onShutdown(reason?: string) {
    this.log.info('onShutdown called with reason:', reason ?? 'none');
  }
}
