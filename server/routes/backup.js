'use strict';

const express = require('express');
const backupService = require('../services/backupService');
const { ensureDefaultProfile } = require('../db/seed');
const { Validator } = require('../lib/validate');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/** 导出：返回完整 JSON，浏览器端可直接下载为文件 */
router.get('/api/backup/export', asyncHandler((req, res) => {
  const payload = backupService.exportData();
  res.setHeader('Content-Disposition', `attachment; filename="fitness-backup-${payload.exportedAt.slice(0, 10)}.json"`);
  res.json(payload);
}));

/** 恢复：必须显式 confirm=true，否则拒绝执行（避免误操作覆盖数据） */
router.post('/api/backup/import', asyncHandler((req, res) => {
  const { mode, confirm } = new Validator(req.body)
    .string('mode', { allowed: ['replace', 'merge'], default: 'replace' })
    .boolean('confirm', { default: false })
    .done();
  const payload = req.body.payload || req.body.data ? (req.body.payload || { format: 'fitness-backup', version: 1, data: req.body.data }) : null;
  if (!payload) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '缺少备份内容 payload' } });

  const result = backupService.importData(payload, { mode, confirm });
  ensureDefaultProfile();
  res.json(result);
}));

module.exports = router;
