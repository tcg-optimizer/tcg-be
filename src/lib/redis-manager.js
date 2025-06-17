const Redis = require('ioredis');

class RedisManager {
  constructor() {
    this.publisher = null;
    this.subscriber = null;
  }

  // Publisher 클라이언트 (에러 발생 시 사용)
  getPublisher() {
    if (!this.publisher) {
      this.publisher = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.publisher.on('error', err => {
        console.error('Redis Publisher error:', err);
      });
    }
    return this.publisher;
  }

  // Subscriber 클라이언트 (Discord bot에서 사용)
  getSubscriber() {
    if (!this.subscriber) {
      this.subscriber = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.subscriber.on('error', err => {
        console.error('Redis Subscriber error:', err);
      });
    }
    return this.subscriber;
  }

  // 에러를 Redis에 publish
  async publishError(errorData) {
    try {
      const publisher = this.getPublisher();
      await publisher.publish('error-logs', JSON.stringify(errorData));
      console.log('Error published to Redis successfully');
      return true;
    } catch (err) {
      console.error('Failed to publish error:', err);
      return false;
    }
  }

  // 연결 종료
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
    } catch (err) {
      console.error('Error disconnecting Redis:', err);
    }
  }
}

module.exports = new RedisManager();
