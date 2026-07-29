"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugController = void 0;
const common_1 = require("@nestjs/common");
const client_ip_1 = require("../common/utils/client-ip");
let DebugController = class DebugController {
    getClientIpInfo(req, res) {
        res.status(200).json({
            success: true,
            data: {
                method: req.method,
                path: req.originalUrl,
                trustProxy: req.app.get('trust proxy'),
                clientIp: (0, client_ip_1.getClientIp)(req),
                forwardedIp: (0, client_ip_1.getForwardedIp)(req),
                forwardedIpList: (0, client_ip_1.getForwardedIpList)(req),
                expressIp: req.ip || null,
                expressIps: Array.isArray(req.ips) ? req.ips : [],
                cfConnectingIp: req.get('CF-Connecting-IP') || null,
                trueClientIp: req.get('True-Client-IP') || null,
                xRealIp: req.get('X-Real-IP') || null,
                xForwardedFor: req.get('X-Forwarded-For') || null,
                remoteAddress: req.socket?.remoteAddress ||
                    req.connection
                        ?.remoteAddress ||
                    null,
                userAgent: req.get('User-Agent') || null,
            },
        });
    }
};
exports.DebugController = DebugController;
__decorate([
    (0, common_1.Get)('client-ip'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], DebugController.prototype, "getClientIpInfo", null);
exports.DebugController = DebugController = __decorate([
    (0, common_1.Controller)('api/debug')
], DebugController);
//# sourceMappingURL=debug.controller.js.map