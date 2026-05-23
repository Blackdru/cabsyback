import { logger } from '../config/logger';
import { startBidWindowJob, stopBidWindowJob } from './bidWindow';
import { startStaleDriverJob, stopStaleDriverJob } from './staleDrivers';
import { startRadiusExpansionJob, stopRadiusExpansionJob } from './radiusExpansion';
import { startOtpCleanupJob, stopOtpCleanupJob } from './otpCleanup';

export interface JobHandles {
  bidWindow: NodeJS.Timeout;
  staleDrivers: NodeJS.Timeout;
  radiusExpansion: NodeJS.Timeout;
  otpCleanup: NodeJS.Timeout;
}

export function startAllJobs(): JobHandles {
  const handles: JobHandles = {
    bidWindow: startBidWindowJob(),
    staleDrivers: startStaleDriverJob(),
    radiusExpansion: startRadiusExpansionJob(),
    otpCleanup: startOtpCleanupJob(),
  };
  logger.info('background jobs started');
  return handles;
}

export function stopAllJobs(handles: JobHandles): void {
  stopBidWindowJob(handles.bidWindow);
  stopStaleDriverJob(handles.staleDrivers);
  stopRadiusExpansionJob(handles.radiusExpansion);
  stopOtpCleanupJob(handles.otpCleanup);
  logger.info('background jobs stopped');
}
