/**
 * This file contains the class EveMotionPlatform.
 *
 * @file module.ts
 * @author Luca Liguori
 * @version 2.0.0
 * @license Apache-2.0
 *
 * Copyright 2023, 2024, 2025, 2026 Luca Liguori.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { MatterHistory } from 'matter-history';
import { PlatformConfig, Matterbridge, MatterbridgeAccessoryPlatform, powerSource, MatterbridgeEndpoint, occupancySensor, lightSensor } from 'matterbridge';
import { IlluminanceMeasurement, OccupancySensing } from 'matterbridge/matter/clusters';
import { AnsiLogger } from 'matterbridge/logger';

/**
 * This is the standard interface for MatterBridge plugins.
 * Each plugin should export a default function that follows this signature.
 *
 *  @param {Matterbridge} matterbridge - The Matterbridge instance.
 *  @param {AnsiLogger} log - The logger instance for logging messages.
 *  @param {PlatformConfig} config - The configuration for the platform.
 *  @returns {EveMotionPlatform} - An instance of the EveMotionPlatform.
 */
export default function initializePlugin(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig): EveMotionPlatform {
  return new EveMotionPlatform(matterbridge, log, config);
}

export class EveMotionPlatform extends MatterbridgeAccessoryPlatform {
  motion: MatterbridgeEndpoint | undefined;
  history: MatterHistory | undefined;
  interval: NodeJS.Timeout | undefined;
  occupied = false;

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

    // Verify that Matterbridge is the correct version
    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('3.3.0')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "3.3.0". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend."`,
      );
    }

    this.log.info('Initializing platform:', this.config.name);
  }

  override async onStart(reason?: string) {
    this.log.info('onStart called with reason:', reason ?? 'none');

    this.history = new MatterHistory(this.log, 'Eve motion', { filePath: this.matterbridge.matterbridgeDirectory, enableDebug: this.config.debug as boolean });

    this.motion = new MatterbridgeEndpoint(
      [occupancySensor, lightSensor, powerSource],
      { uniqueStorageKey: 'Eve motion', mode: this.matterbridge.bridgeMode === 'bridge' ? 'server' : undefined },
      this.config.debug as boolean,
    );
    this.motion.createDefaultIdentifyClusterServer();
    this.motion.createDefaultBasicInformationClusterServer('Eve motion', '0x85483499', 4874, 'Eve Systems', 89, 'Eve Motion 20EBY9901', 6650, '3.2.1');
    this.motion.createDefaultOccupancySensingClusterServer(false);
    this.motion.createDefaultIlluminanceMeasurementClusterServer(250);
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

    await this.motion?.setAttribute(OccupancySensing.Cluster.id, 'occupancy', { occupied: false }, this.log);
    await this.motion?.setAttribute(IlluminanceMeasurement.Cluster.id, 'measuredValue', Math.round(Math.max(Math.min(10000 * Math.log10(500) + 1, 0xfffe), 0)), this.log);

    this.interval = setInterval(
      async () => {
        if (!this.motion || !this.history) return;
        this.occupied = !this.occupied;
        const lux = this.history.getFakeLevel(0, 1000, 0);
        await this.motion.setAttribute(OccupancySensing.Cluster.id, 'occupancy', { occupied: this.occupied }, this.log);
        await this.motion.setAttribute(IlluminanceMeasurement.Cluster.id, 'measuredValue', Math.round(Math.max(Math.min(10000 * Math.log10(lux) + 1, 0xfffe), 0)), this.log);

        this.history.setLastEvent();
        this.history.addEntry({ time: this.history.now(), motion: this.occupied === true ? 0 : 1, lux });
        this.log.info(`Set motion to ${this.occupied} and lux to ${lux}`);
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
