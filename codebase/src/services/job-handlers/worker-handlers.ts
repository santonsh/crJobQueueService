/**
 * Worker Handler Configuration
 *
 * This file defines all job handlers supported by this worker instance.
 * The configuration is type-safe and IDE-validated through hardcoded imports.
 *
 * Handler Format:
 * - Key: '{class}-{type}' (e.g., 'test-delay', 'gpu-inference')
 * - Value: execute function from handler module
 *
 * To add a new handler:
 * 1. Create handler file in handlers/{class}/{type}.handler.ts
 * 2. Export async execute(payload, ...services) function
 * 3. Import here and add to SUPPORTED_HANDLERS map
 */

import * as testDelay from './handlers/test/delay.handler';
import * as gpuInference from './handlers/gpu/inference.handler';

export const SUPPORTED_HANDLERS = {
  'test-delay': testDelay.execute,
  'gpu-inference': gpuInference.execute,
};

export type HandlerKey = keyof typeof SUPPORTED_HANDLERS;
