/**
 * 日次正常稼働通知UseCase。
 */
const HealthCheckUseCase = {
  send: function() {
    const traceId = LogModule.createTraceId();

    try {
      const config = ConfigRepository.load();
      if (!config.healthCheckEnabled) {
        LogModule.info('health', { sent: false, reason: 'disabled' }, traceId);
        return;
      }

      const now = new Date();
      const message = MessageTemplate.buildHealthCheckMessage(now);
      LineGateway.pushText(config, message);
      LogModule.info('health', { sent: true, message: message }, traceId);
    } catch (e) {
      LogModule.error('error', {
        category: 'health',
        message: e.message,
        stack: e.stack
      }, traceId);
    }
  }
};
