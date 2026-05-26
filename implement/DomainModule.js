const EventStatus = {
  NOT_DEPARTED: 'not_departed',
  NOTIFYING: 'notifying',
  SNOOZING: 'snoozing',
  DEPARTED: 'departed',
  CANCELLED: 'cancelled',
  STOPPED: 'stopped'
};

const NotificationStage = {
  NONE: 0,
  PREPARE: 1,
  DEPARTURE: 2,
  WARNING: 3,
  REPEAT_WARNING: 4
};

/**
 * 予定単位の初期状態を作るDomain factory。
 */
const EventStateFactory = {
  create: function(event) {
    const nowIso = new Date().toISOString();
    return {
      eventId: event.id,
      eventTitle: event.title,
      eventStartIso: event.start.toISOString(),
      status: EventStatus.NOT_DEPARTED,
      currentStage: NotificationStage.NONE,
      noticeCount: 0,
      lastNoticeAtIso: null,
      snoozeUntilIso: null,
      cancelled: false,
      departedConfirmedAtIso: null,
      updatedAtIso: nowIso
    };
  },

  mergeEvent: function(state, event) {
    state.eventTitle = event.title;
    state.eventStartIso = event.start.toISOString();
    return state;
  }
};

/**
 * Nature Remoの最終検知時刻から、予定の監視ウィンドウ内に外出動作があったか判定する。
 */
const DeparturePolicy = {
  isDepartedConfirmed: function(event, sensorContext, config) {
    if (!sensorContext || !sensorContext.lastDetectedAt) {
      return false;
    }

    const monitorStart = DeparturePolicy.getMonitorStart(event, config);
    const lastDetectedAt = sensorContext.lastDetectedAt.getTime();
    const now = sensorContext.fetchedAt || new Date();

    return lastDetectedAt >= monitorStart.getTime() &&
      lastDetectedAt <= now.getTime() &&
      DeparturePolicy.isSensorFresh_(sensorContext, config, now);
  },

  getMonitorStart: function(event, config) {
    return new Date(event.start.getTime() - config.noticeStage1MinBefore * 60 * 1000);
  },

  isInMonitoringWindow: function(now, event, config) {
    const monitorStart = DeparturePolicy.getMonitorStart(event, config);
    const endBoundary = new Date(
      event.start.getTime() + config.noticeRepeatMinutes * config.noticeMaxCount * 60 * 1000
    );
    return now.getTime() >= monitorStart.getTime() && now.getTime() <= endBoundary.getTime();
  },

  isSensorFresh_: function(sensorContext, config, now) {
    const freshnessMinutes = Number(config.sensorFreshnessMinutes);
    const freshnessMillis = freshnessMinutes * 60 * 1000;

    return now.getTime() - sensorContext.lastDetectedAt.getTime() <= freshnessMillis;
  }
};

/**
 * 通知段階・抑制条件を判定する純粋ロジック。
 */
const NotificationPolicy = {
  decide: function(now, event, state, config) {
    if (state.cancelled || state.status === EventStatus.CANCELLED || state.status === EventStatus.DEPARTED) {
      return NotificationDecision.skip('finished');
    }

    if (NotificationPolicy.isQuietHours(now, config.quietHoursStart, config.quietHoursEnd)) {
      return NotificationDecision.skip('quiet_hours');
    }

    if (state.snoozeUntilIso && now.getTime() < new Date(state.snoozeUntilIso).getTime()) {
      return NotificationDecision.skip('snoozing');
    }

    if ((state.noticeCount || 0) >= config.noticeMaxCount) {
      return NotificationDecision.stop('max_notice_count');
    }

    const minutesUntilStart = Math.floor((event.start.getTime() - now.getTime()) / 60000);
    const stage = NotificationPolicy.getDueStage_(minutesUntilStart, state, config);
    if (stage === NotificationStage.NONE) {
      return NotificationDecision.skip('not_due');
    }

    if (!NotificationPolicy.canSendForStage_(now, state, stage, config)) {
      return NotificationDecision.skip('cooldown');
    }

    return NotificationDecision.send(stage);
  },

  getDueStage_: function(minutesUntilStart, state, config) {
    if (minutesUntilStart <= -config.noticeRepeatMinutes) {
      return NotificationStage.REPEAT_WARNING;
    }
    if (minutesUntilStart <= 0) {
      return NotificationStage.WARNING;
    }
    if (minutesUntilStart <= config.noticeStage2MinBefore) {
      return NotificationStage.DEPARTURE;
    }
    if (minutesUntilStart <= config.noticeStage1MinBefore) {
      return NotificationStage.PREPARE;
    }
    return NotificationStage.NONE;
  },

  canSendForStage_: function(now, state, stage, config) {
    if (!state.lastNoticeAtIso) {
      return stage > (state.currentStage || NotificationStage.NONE);
    }

    if (stage < NotificationStage.REPEAT_WARNING) {
      return stage > (state.currentStage || NotificationStage.NONE);
    }

    const lastNoticeAt = new Date(state.lastNoticeAtIso).getTime();
    return now.getTime() - lastNoticeAt >= config.noticeRepeatMinutes * 60 * 1000;
  },

  isQuietHours: function(now, startText, endText) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = NotificationPolicy.parseTimeMinutes_(startText);
    const endMinutes = NotificationPolicy.parseTimeMinutes_(endText);

    if (startMinutes === endMinutes) {
      return false;
    }
    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  },

  parseTimeMinutes_: function(text) {
    const parts = String(text || '00:00').split(':');
    return Number(parts[0]) * 60 + Number(parts[1] || 0);
  }
};

const NotificationDecision = {
  send: function(stage) {
    return { action: 'send', stage: stage, reason: 'due' };
  },

  skip: function(reason) {
    return { action: 'skip', stage: NotificationStage.NONE, reason: reason };
  },

  stop: function(reason) {
    return { action: 'stop', stage: NotificationStage.NONE, reason: reason };
  }
};
