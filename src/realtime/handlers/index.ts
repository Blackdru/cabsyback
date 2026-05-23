import type { Socket } from 'socket.io';
import { registerBidHandlers } from './bid.handlers';
import { registerDriverHandlers } from './driver.handlers';
import { registerRideHandlers } from './ride.handlers';

export function registerHandlers(socket: Socket): void {
  registerDriverHandlers(socket);
  registerBidHandlers(socket);
  registerRideHandlers(socket);
}
