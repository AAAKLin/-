'use strict';

const express = require('express');
const path = require('node:path');

const { config } = require('./config');
const { logger } = require('./logger');
const { requestContext, securityHeaders } = require('./middleware/requestContext');
const { asyncHandler, notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const healthRoutes = require('./routes/health');
const profileRoutes = require('./routes/profile');
const todayRoutes = require('./routes/today');
const trainingRoutes = require('./routes/training');
const dietRoutes = require('./routes/diet');
const progressRoutes = require('./routes/progress');
const backupRoutes = require('./routes/backup');
const demoRoutes = require('./routes/demo');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));
  app.use(requestContext);
  app.use(securityHeaders);

  app.use(healthRoutes);
  app.use(profileRoutes);
  app.use(todayRoutes);
  app.use(trainingRoutes);
  app.use(dietRoutes);
  app.use(progressRoutes);
  app.use(backupRoutes);
  app.use(demoRoutes);

  // 前端静态资源（零构建原生 ES 模块）
  app.use(express.static(config.publicDir, { extensions: ['html'] }));

  app.get('/', (req, res) => {
    res.sendFile(path.join(config.publicDir, 'index.html'));
  });

  app.use('/api', notFoundHandler);

  // 其余路径交回前端路由
  app.get('*', (req, res, next) => {
    res.sendFile(path.join(config.publicDir, 'index.html'), (err) => {
      if (err) next(err);
    });
  });

  app.use(errorHandler);

  logger.info('应用路由已注册', { version: config.appVersion });
  return app;
}

module.exports = { createApp, asyncHandler };
