import '@project-chip/matter-node.js';

import { Matterbridge } from 'matterbridge';
import { AnsiLogger } from 'node-ansi-logger';
import { EveDoorPlatform } from './platform.js';

/**
 * This is the standard interface for MatterBridge plugins.
 * Each plugin should export a default function that follows this signature.
 *
 * @param matterbridge - An instance of MatterBridge
 */
export default function initializePlugin(matterbridge: Matterbridge, log: AnsiLogger) {
  log.info('Matterbridge eve door with history plugin is loading...');

  const platform = new EveDoorPlatform(matterbridge, log);

  log.info('Matterbridge eve door with history plugin initialized successfully!');
  return platform;
}
