'use strict';

/**
 * 集中配置：全部来自环境变量，启动时校验，失败即快速退出（fail fast）。
 *
 * ============ API Key 安全原则（重要）============
 * 1. 密钥绝不硬编码进代码，绝不打印到日志，绝不返回给前端，绝不提交到 git
 * 2. 支持三种提供方式（按优先级从高到低）：
 *    - AI_API_KEY           直接写密钥（最方便，但容易误提交，不推荐）
 *    - AI_API_KEY_FILE      密钥文件路径（推荐）
 *    - AI_API_KEY_FILE_ENV  一个"环境变量的名字"，该环境变量的值才是密钥文件路径
 *                           ← 如果你已经把密钥文件路径存进了系统环境变量，用这个
 * 3. 密钥本体不进入 config 对象（避免 console.log(config) 意外泄露），
 *    只能通过模块导出的 getApiKey() 获取，且只在服务端使用
 * 4. 对外接口只暴露"是否已配置"和脱敏后的前 2 后 2 位，方便你确认加载的是哪把钥匙
 */

const path = require('node:path');
const fs = require('node:fs');

const rootDir = path.resolve(__dirname, '..');

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function resolveDir(value, fallbackRelative) {
  const target = value && value.trim() ? path.resolve(rootDir, value.trim()) : path.join(rootDir, fallbackRelative);
  return target;
}

const port = toInt(process.env.PORT, 3100);
// 默认绑定所有网卡：本地 .env 会显式指定；云端部署平台只注入 PORT，
// 若默认 127.0.0.1 会让部署平台无法访问到服务。安全提示见启动横幅。
const host = process.env.HOST || '0.0.0.0';
const nodeEnv = process.env.NODE_ENV || 'development';
const dataDir = resolveDir(process.env.DATA_DIR, 'data');
const logLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();

/**
 * 从文件读取密钥。
 * @param {string} filePath 密钥文件路径（支持绝对路径或相对项目根目录）
 * @param {string} source 来源说明（用于排查配置问题，不含密钥）
 */
function readKeyFile(filePath, source) {
  try {
    // path.resolve 对绝对路径会直接采用，对相对路径则基于项目根目录解析
    const resolved = path.resolve(rootDir, filePath);
    if (!fs.existsSync(resolved)) {
      return { value: null, source, error: `密钥文件不存在：${resolved}` };
    }
    const content = fs.readFileSync(resolved, 'utf8').trim();
    if (!content) {
      return { value: null, source, error: `密钥文件是空的：${resolved}` };
    }
    return { value: content, source, file: resolved };
  } catch (err) {
    // 注意：错误信息里只放路径和原因，绝不放文件内容
    return { value: null, source, error: `读取密钥文件失败：${err.message}` };
  }
}

/**
 * 解析 API Key：三种方式任选其一，返回体里绝不包含密钥原文（由调用方决定如何使用）。
 */
function resolveApiKey() {
  // 方式 1：直接给密钥
  const direct = process.env.AI_API_KEY;
  if (direct && direct.trim()) {
    return { value: direct.trim(), source: 'AI_API_KEY（直接写在 .env 里）' };
  }

  // 方式 2：密钥文件路径（直接配置）
  const filePath = process.env.AI_API_KEY_FILE;
  if (filePath && filePath.trim()) {
    return readKeyFile(filePath.trim(), 'AI_API_KEY_FILE（密钥文件）');
  }

  // 方式 3：环境变量名 → 该变量的值是密钥文件路径
  // 适合"已经把密钥文件路径存进系统环境变量"的情况
  const envName = process.env.AI_API_KEY_FILE_ENV;
  if (envName && envName.trim()) {
    const name = envName.trim();
    const pathFromEnv = process.env[name];
    if (!pathFromEnv || !pathFromEnv.trim()) {
      return { value: null, source: null, error: `环境变量 ${name} 不存在或为空` };
    }
    return readKeyFile(pathFromEnv.trim(), `环境变量 ${name} 指向的密钥文件`);
  }

  return { value: null, source: null, error: null };
}

const apiKeyResult = resolveApiKey();

/** 密钥只存在模块闭包里，不进 config 对象，避免被整体打印泄露 */
function getApiKey() {
  return apiKeyResult.value;
}

/** 脱敏展示：只留前 2 后 2 位，方便确认"加载的是哪把钥匙"而不泄露密钥 */
function maskKey(key) {
  if (!key) return null;
  const k = String(key);
  if (k.length <= 6) return '*'.repeat(k.length);
  return `${k.slice(0, 2)}${'*'.repeat(Math.min(k.length - 4, 12))}${k.slice(-2)}`;
}

const errors = [];
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  errors.push(`PORT 必须是 1-65535 之间的整数，当前值：${process.env.PORT}`);
}
if (!['development', 'test', 'production'].includes(nodeEnv)) {
  errors.push(`NODE_ENV 只能是 development/test/production，当前值：${nodeEnv}`);
}
if (!['debug', 'info', 'warn', 'error', 'silent'].includes(logLevel)) {
  errors.push(`LOG_LEVEL 只能是 debug/info/warn/error/silent，当前值：${logLevel}`);
}

if (errors.length > 0) {
  // 配置错误直接抛出，避免带着错误配置运行产生更难排查的问题
  throw new Error(`配置校验失败：\n- ${errors.join('\n- ')}`);
}

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const config = Object.freeze({
  rootDir,
  port,
  host,
  nodeEnv,
  isTest: nodeEnv === 'test',
  logLevel,
  dataDir,
  dbPath: path.join(dataDir, 'fitness.db'),
  publicDir: path.join(rootDir, 'public'),
  appName: 'Personal Fitness Management System',
  appVersion: '0.1.0',
  // AI 配置：只放"元信息"，绝不放密钥本体
  ai: Object.freeze({
    provider: (process.env.AI_PROVIDER || 'glm').toLowerCase(),
    model: process.env.AI_MODEL || 'glm-4.7-flash',
    baseUrl: process.env.AI_BASE_URL || '',
    configured: Boolean(apiKeyResult.value),
    source: apiKeyResult.source || null,
    error: apiKeyResult.error || null,
    maskedKey: maskKey(apiKeyResult.value),
  }),
});

module.exports = { config, getApiKey };
