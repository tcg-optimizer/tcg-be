// discord-bot.js
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const redisManager = require('./lib/redis-manager');
require('dotenv').config();

class DiscordBot {
  constructor() {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });
    this.subscriber = null;
    this.isReady = false;
  }

  async initialize() {
    // Discord 토큰 확인
    if (!process.env.DISCORD_BOT_TOKEN) {
      console.error('❌ DISCORD_BOT_TOKEN이 환경변수에 설정되지 않았습니다.');
      return;
    }

    if (!process.env.DISCORD_CHANNEL_ID) {
      console.error('❌ DISCORD_CHANNEL_ID가 환경변수에 설정되지 않았습니다.');
      return;
    }

    try {
      // Discord bot 로그인
      console.log('🤖 Discord bot 로그인 시도 중...');
      await this.client.login(process.env.DISCORD_BOT_TOKEN);

      this.client.once('ready', () => {
        console.log(`✅ Discord bot logged in as ${this.client.user.tag}`);
        this.isReady = true;
        this.startListening();
      });

      this.client.on('error', error => {
        console.error('❌ Discord Client Error:', error);
      });
    } catch (error) {
      console.error('❌ Discord bot 로그인 실패:', error.message);

      if (error.message.includes('An invalid token was provided')) {
        console.log('💡 해결 방법:');
        console.log(
          '1. Discord Developer Portal (https://discord.com/developers/applications)에서 봇 토큰을 확인하세요.'
        );
        console.log('2. .env 파일의 DISCORD_BOT_TOKEN이 올바른지 확인하세요.');
        console.log('3. 토큰이 재생성된 경우 새 토큰으로 업데이트하세요.');
      }
    }
  }

  async startListening() {
    try {
      // Subscriber 클라이언트 가져오기 (Publisher와 완전히 분리)
      this.subscriber = redisManager.getSubscriber();

      // 에러 로그 채널 구독
      await this.subscriber.subscribe('error-logs');
      console.log('✅ Subscribed to error-logs channel');

      // 메시지 수신 처리 (진짜 pub/sub)
      this.subscriber.on('message', async (channel, message) => {
        if (channel === 'error-logs') {
          try {
            const errorData = JSON.parse(message);
            await this.sendErrorToDiscord(errorData);
          } catch (err) {
            console.error('Failed to process error message:', err);
          }
        }
      });
    } catch (err) {
      console.error('Failed to start Redis subscription:', err);
      // 재연결 시도
      setTimeout(() => this.startListening(), 5000);
    }
  }

  async sendErrorToDiscord(errorData) {
    if (!this.isReady) {
      console.log('Discord bot is not ready yet');
      return;
    }

    try {
      const channel = this.client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
      if (!channel) {
        console.error('Discord channel not found. Channel ID:', process.env.DISCORD_CHANNEL_ID);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(this.getErrorTitle(errorData))
        .setColor(this.getErrorColor(errorData.severity))
        .setDescription(`\`\`\`${errorData.error.message}\`\`\``)
        .addFields([
          { name: '🕐 Time', value: errorData.context.timestamp, inline: true },
          { name: '⚠️ Severity', value: errorData.severity.toUpperCase(), inline: true },
          {
            name: '📊 Status',
            value: errorData.error.statusCode?.toString() || 'N/A',
            inline: true,
          },
        ])
        .setTimestamp();

      if (errorData.context.url) {
        embed.addFields([
          { name: '🌐 URL', value: `${errorData.context.method} ${errorData.context.url}` },
        ]);
      }

      if (errorData.error.stack && errorData.severity === 'critical') {
        embed.addFields([
          {
            name: '📋 Stack Trace',
            value: `\`\`\`${errorData.error.stack.substring(0, 1000)}\`\`\``,
          },
        ]);
      }

      await channel.send({ embeds: [embed] });
      console.log('✅ Error message sent to Discord');
    } catch (err) {
      console.error('Failed to send Discord message:', err);
    }
  }

  getErrorTitle(errorData) {
    const icons = {
      'server-error': '🚨 Server Error',
      'uncaught-exception': '💥 Uncaught Exception',
      'unhandled-rejection': '⚡ Unhandled Promise Rejection',
      'frontend-error': '🖥️ Frontend Error',
      'test-message': '🧪 Test Message',
    };
    return icons[errorData.type] || '❌ Application Error';
  }

  getErrorColor(severity) {
    const colors = {
      critical: 0xff0000, // 빨간색
      warning: 0xff9900, // 주황색
      info: 0x0099ff, // 파란색
    };
    return colors[severity] || 0x808080;
  }
}

// Discord bot 시작 (환경변수가 설정된 경우에만)
if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID) {
  const bot = new DiscordBot();
  bot.initialize().catch(console.error);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Shutting down Discord bot...');
    if (bot.subscriber) {
      bot.subscriber.disconnect();
    }
    bot.client.destroy();
    process.exit(0);
  });
} else {
  console.log('⚠️ Discord bot 비활성화: 환경변수가 설정되지 않았습니다.');
  console.log('필요한 환경변수: DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID');
}

module.exports = DiscordBot;
