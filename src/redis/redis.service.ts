import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;

  getPublisher(): Redis {
    if (!this.publisher) {
      this.publisher = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT as string) || 6379,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.publisher.on('error', err => {
        console.error('Redis Publisher error:', err);
      });
    }
    return this.publisher;
  }

  getSubscriber(): Redis {
    if (!this.subscriber) {
      this.subscriber = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT as string) || 6379,
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

  async publishError(errorData: any): Promise<boolean> {
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

  async disconnect(): Promise<void> {
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

  async onApplicationShutdown(): Promise<void> {
    await this.disconnect();
  }
}
