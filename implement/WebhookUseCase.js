/**
 * LINE Webhook返信制御UseCase。
 */
const WebhookUseCase = {
  handle: function(e) {
    const traceId = LogModule.createTraceId();

    try {
      const config = ConfigRepository.load();
      if (!WebhookUseCase.isAuthorized_(e, config)) {
        LogModule.error('error', { category: 'webhook', message: 'invalid webhook token' }, traceId);
        return WebhookUseCase.textOutput_('forbidden');
      }

      const body = JSON.parse((e.postData && e.postData.contents) || '{}');
      const events = body.events || [];
      events.forEach(function(event) {
        WebhookUseCase.handleEvent_(event, config, traceId);
      });

      return WebhookUseCase.textOutput_('ok');
    } catch (err) {
      LogModule.error('error', {
        category: 'webhook',
        message: err.message,
        stack: err.stack
      }, traceId);
      return WebhookUseCase.textOutput_('error');
    }
  },

  isAuthorized_: function(e, config) {
    if (!config.lineWebhookToken) {
      return true;
    }
    return e && e.parameter && e.parameter.webhook_token === config.lineWebhookToken;
  },

  handleEvent_: function(event, config, traceId) {
    if (!event || event.type !== 'message' || !event.message || event.message.type !== 'text') {
      return;
    }

    const command = WebhookUseCase.normalizeCommand_(event.message.text);
    if (!command) {
      return;
    }

    const latestEventId = StateRepository.getLatestNotifiedEventId();
    const state = latestEventId ? StateRepository.loadById(latestEventId) : null;
    if (!state) {
      WebhookUseCase.replySafe_(config, event.replyToken, '対象の通知予定が見つかりませんでした。', traceId);
      return;
    }

    const now = new Date();
    const replyText = WebhookUseCase.applyCommand_(command, state, config, now);
    StateRepository.save(state);

    LogModule.info('state', {
      eventId: state.eventId,
      command: command,
      status: state.status,
      snoozeUntilIso: state.snoozeUntilIso
    }, traceId);

    WebhookUseCase.replySafe_(config, event.replyToken, replyText, traceId);
  },

  normalizeCommand_: function(text) {
    const normalized = String(text || '').trim().toUpperCase();
    if (normalized === 'OK') return 'OK';
    if (normalized === 'スヌーズ') return 'SNOOZE';
    if (normalized === 'キャンセル') return 'CANCEL';
    return null;
  },

  applyCommand_: function(command, state, config, now) {
    if (command === 'OK') {
      state.snoozeUntilIso = new Date(now.getTime() + config.snoozeMinutes * 60 * 1000).toISOString();
      state.status = EventStatus.SNOOZING;
      return config.snoozeMinutes + '分間、通知を一時停止します。';
    }

    if (command === 'SNOOZE') {
      state.snoozeUntilIso = new Date(now.getTime() + config.snoozeMinutes * 60 * 1000).toISOString();
      state.status = EventStatus.SNOOZING;
      return config.snoozeMinutes + '分スヌーズしました。';
    }

    state.cancelled = true;
    state.status = EventStatus.CANCELLED;
    return 'この予定の通知をキャンセルしました。';
  },

  replySafe_: function(config, replyToken, text, traceId) {
    if (!replyToken) {
      return;
    }
    try {
      LineGateway.replyText(config, replyToken, text);
    } catch (e) {
      LogModule.error('error', {
        category: 'line_reply',
        message: e.message
      }, traceId);
    }
  },

  textOutput_: function(text) {
    return ContentService.createTextOutput(text);
  }
};
