"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
let RedisService = class RedisService {
    publisher = null;
    subscriber = null;
    getPublisher() {
        if (!this.publisher) {
            this.publisher = new ioredis_1.default({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT) || 6379,
                maxRetriesPerRequest: 3,
                lazyConnect: true,
            });
            this.publisher.on('error', err => {
                console.error('Redis Publisher error:', err);
            });
        }
        return this.publisher;
    }
    getSubscriber() {
        if (!this.subscriber) {
            this.subscriber = new ioredis_1.default({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT) || 6379,
                password: process.env.REDIS_PASSWORD,
                maxRetriesPerRequest: 3,
                lazyConnect: true,
            });
            this.subscriber.on('error', err => {
                console.error('Redis Subscriber error:', err);
            });
        }
        return this.subscriber;
    }
    async publishError(errorData) {
        try {
            const publisher = this.getPublisher();
            await publisher.publish('error-logs', JSON.stringify(errorData));
            console.log('Error published to Redis successfully');
            return true;
        }
        catch (err) {
            console.error('Failed to publish error:', err);
            return false;
        }
    }
    async disconnect() {
        try {
            if (this.publisher) {
                await this.publisher.quit();
                this.publisher = null;
            }
            if (this.subscriber) {
                await this.subscriber.quit();
                this.subscriber = null;
            }
        }
        catch (err) {
            console.error('Error disconnecting Redis:', err);
        }
    }
    async onApplicationShutdown() {
        await this.disconnect();
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = __decorate([
    (0, common_1.Injectable)()
], RedisService);
//# sourceMappingURL=redis.service.js.map