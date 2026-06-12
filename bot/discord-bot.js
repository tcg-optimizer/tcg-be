const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const redisManager = require('./redis-manager');
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
    if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_CHANNEL_ID) {
      console.error('❌ DISCORD_BOT_TOKEN 또는 DISCORD_CHANNEL_ID가 환경변수에 설정되지 않았습니다.');
      return;
    }

    try {
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
    }
  }

  async startListening() {
    try {
      this.subscriber = redisManager.getSubscriber();

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
      critical: 0xff0000,
      warning: 0xff9900,
      info: 0x0099ff,
    };
    return colors[severity] || 0x808080;
  }
}

if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID) {
  const bot = new DiscordBot();
  bot.initialize().catch(console.error);

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
