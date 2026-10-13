'use strict';

const os = require('node:os');
const { config } = require('./config');
const { logger } = require('./logger');
const { runMigrations } = require('./db/migrate');
const { seedReferenceData, ensureDefaultProfile } = require('./db/seed');
const { closeDb } = require('./db');
const { createApp } = require('./app');

/**
 * 列出本机局域网 IPv4 地址。
 * 仅当服务监听在 0.0.0.0（允许外部访问）时才有意义，用于提示手机访问地址。
 */
function listLanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

/**
 * 启动顺序：配置校验（config 模块已完成） → 迁移 → 参考数据 → 默认档案 → 监听 → 优雅停机
 */
function bootstrap() {
  const applied = runMigrations();
  if (applied.length > 0) logger.info('数据库迁移完成', { applied });

  seedReferenceData();
  const profile = ensureDefaultProfile();

  // 首次启动时按默认档案推算一次目标，避免前端拿到空目标
  if (profile.target_kcal === null || profile.target_kcal === undefined) {
    const { recomputeTargets } = require('./services/profileService');
    recomputeTargets();
  }

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    logger.info('服务已启动', { url: `http://${config.host}:${config.port}`, env: config.nodeEnv });
    // eslint-disable-next-line no-console
    console.log(`\n  ${config.appName} v${config.appVersion}`);
    console.log(`  本机访问： http://127.0.0.1:${config.port}`);
    if (config.host === '0.0.0.0') {
      const lans = listLanAddresses();
      console.log('  绑定地址： 0.0.0.0（所有网卡，含局域网/云端访问）');
      if (lans.length > 0) {
        console.log('  手机访问（需与电脑连同一个 WiFi）：');
        for (const ip of lans) console.log(`    http://${ip}:${config.port}`);
        console.log('  提示：连不上多半是 Windows 防火墙拦了，见 README「手机访问」一节');
      } else {
        console.log('  手机访问：未检测到局域网 IP，请确认已连接 WiFi/网线');
      }
      if (!process.env.HOST) {
        console.log('  安全提示：当前监听所有网卡，同一网络内的设备都能访问；仅本机使用请设 HOST=127.0.0.1');
      }
    } else {
      console.log(`  绑定地址： ${config.host}（仅本机）`);
      console.log('  手机访问：未开启（HOST=127.0.0.1）。改 .env 里 HOST=0.0.0.0 后重启即可');
    }
    console.log(`  数据文件： ${config.dbPath}`);
    console.log('  停止服务： Ctrl + C\n');
  });

  function shutdown(signal) {
    logger.info('收到停止信号，开始优雅停机', { signal });
    server.close(() => {
      closeDb();
      logger.info('服务已停止');
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { app, server };
}

if (require.main === module) {
  bootstrap();
}

module.exports = { bootstrap };
