/**
 * Cloud Logging向けの構造化ログ出力。
 */
const LogModule = {
  info: function(category, payload, traceId) {
    console.log(JSON.stringify(LogModule.buildEntry_(category, payload, traceId)));
  },

  error: function(category, payload, traceId) {
    console.error(JSON.stringify(LogModule.buildEntry_(category, payload, traceId)));
  },

  buildEntry_: function(category, payload, traceId) {
    return {
      timestamp: new Date().toISOString(),
      traceId: traceId || LogModule.createTraceId(),
      category: category,
      payload: payload || {}
    };
  },

  createTraceId: function() {
    return Utilities.getUuid();
  }
};
