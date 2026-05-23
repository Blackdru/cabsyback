"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHandlers = registerHandlers;
const bid_handlers_1 = require("./bid.handlers");
const driver_handlers_1 = require("./driver.handlers");
const ride_handlers_1 = require("./ride.handlers");
function registerHandlers(socket) {
    (0, driver_handlers_1.registerDriverHandlers)(socket);
    (0, bid_handlers_1.registerBidHandlers)(socket);
    (0, ride_handlers_1.registerRideHandlers)(socket);
}
//# sourceMappingURL=index.js.map