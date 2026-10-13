'use strict';

const os = require('node:os');
const express = require('express');
const { getDb } = require('../db');
const { config } = require('../config');
const { logger } = require('../logger');

const router = express.Router();

/** 本机局域网 IPv4 地址列表（给手机访问用） */
function listLanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

router.get('/health', (req, res) => {
  res.json({ status: 'ok', app: config.appName, version: config.appVersion, time: new Date().toISOString() });
});

router.get('/ready', (req, res) => {
  try {
    const row = getDb().prepare('SELECT COUNT(*) AS n FROM profile').get();
    res.json({ status: 'ready', profileRows: row.n });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', reason: err.message });
  }
});

/**
 * AI 配置自检：用来确认"密钥有没有被正确加载"。
 * 安全约定：只返回是否已配置、来源说明和脱敏后的前 2 后 2 位，绝不返回密钥原文。
 */
router.get('/api/settings/ai-status', (req, res) => {
  const { ai } = config;
  if (ai.configured) {
    logger.info('AI 配置状态查询', { provider: ai.provider, source: ai.source });
  }
  res.json({
    provider: ai.provider,
    model: ai.model,
    baseUrl: ai.baseUrl || '(使用服务商默认地址)',
    configured: ai.configured,
    source: ai.source,
    maskedKey: ai.maskedKey,
    error: ai.error,
    hint: ai.configured
      ? '密钥已加载。请核对下方脱敏片段是否为你期望的那把钥匙。'
      : '尚未配置密钥。当前所有功能不依赖 AI，可正常使用；配置方法见 .env.example。',
    safetyNote: '密钥仅保存在服务端内存中，不会写入日志、不返回原文、不会传给浏览器。',
  });
});

/**
 * 访问地址自检：告诉用户本机怎么访问、手机怎么访问。
 * 只在监听 0.0.0.0 时才给出局域网地址。
 */
router.get('/api/settings/network', (req, res) => {
  const lanEnabled = config.host === '0.0.0.0';
  const lanAddresses = lanEnabled ? listLanAddresses() : [];
  res.json({
    port: config.port,
    lanEnabled,
    localUrl: `http://127.0.0.1:${config.port}`,
    lanUrls: lanAddresses.map((ip) => `http://${ip}:${config.port}`),
    hint: lanEnabled
      ? (lanAddresses.length > 0
        ? '手机与电脑连同一个 WiFi，在手机浏览器打开上方任一局域网地址即可。'
        : '未检测到局域网 IP，请确认电脑已连接 WiFi 或网线。')
      : '当前仅允许本机访问。把 .env 里的 HOST 改成 0.0.0.0 并重启服务后，手机才能访问。',
    securityNote: '开启局域网访问后，同一网络内任何人都能打开本应用（当前版本没有登录密码）。在公共场所或公司网络请改回 HOST=127.0.0.1。',
  });
});

module.exports = router;
