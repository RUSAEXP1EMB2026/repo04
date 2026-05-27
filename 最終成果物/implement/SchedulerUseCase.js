/**
 * 5分ごとの外出判定UseCase。
 */
const SchedulerUseCase = {
  run: function() {
    const traceId = LogModule.createTraceId();
    const now = new Date();

    try {
      const config = ConfigRepository.load();
      const sensor = SchedulerUseCase.fetchSensor_(config, traceId);
      if (!sensor) {
        return;
      }

      const events = CalendarGateway.listTodayOutingEvents(config, now);
      LogModule.info('schedule', {
        matchedCount: events.length,
        events: events.map(function(event) {
          return {
            eventId: event.id,
            title: event.title,
            startIso: event.start.toISOString(),
            location: event.location
          };
        })
      }, traceId);

      events.forEach(function(event) {
        SchedulerUseCase.processEvent_(event, sensor, config, now, traceId);
      });

      StateRepository.cleanupOldStates(now, 7);
    } catch (e) {
      LogModule.error('error', {
        message: e.message,
        stack: e.stack
      }, traceId);
    }
  },

  fetchSensor_: function(config, traceId) {
    try {
      const sensor = NatureGateway.fetchLastMotionDetectedAt(config);
      LogModule.info('sensor', {
        deviceId: sensor.deviceId,
        deviceName: sensor.deviceName,
        lastDetectedAtIso: sensor.lastDetectedAtIso,
        fetchedAtIso: sensor.fetchedAtIso
      }, traceId);
      return sensor;
    } catch (e) {
      LogModule.error('error', {
        category: 'sensor',
        message: e.message,
        stack: e.stack
      }, traceId);
      return null;
    }
  },

  processEvent_: function(event, sensor, config, now, traceId) {
    if (!DeparturePolicy.isInMonitoringWindow(now, event, config)) {
      return;
    }

    const state = StateRepository.load(event);
    const departedConfirmed = DeparturePolicy.isDepartedConfirmed(event, sensor, config);

    LogModule.info('state', {
      eventId: event.id,
      eventTitle: event.title,
      sensorLastDetectedAtIso: sensor.lastDetectedAtIso,
      departedConfirmed: departedConfirmed,
      currentStatus: state.status,
      currentStage: state.currentStage,
      noticeCount: state.noticeCount
    }, traceId);

    if (departedConfirmed) {
      SchedulerUseCase.markDeparted_(event, state, config, now, traceId);
      return;
    }

    const decision = NotificationPolicy.decide(now, event, state, config);
    if (decision.action === 'stop') {
      state.status = EventStatus.STOPPED;
      StateRepository.save(state);
      LogModule.info('notify', {
        eventId: event.id,
        sent: false,
        reason: decision.reason
      }, traceId);
      return;
    }

    if (decision.action !== 'send') {
      LogModule.info('notify', {
        eventId: event.id,
        sent: false,
        reason: decision.reason
      }, traceId);
      return;
    }

    SchedulerUseCase.sendStageNotification_(event, state, decision.stage, config, now, traceId);
  },

  markDeparted_: function(event, state, config, now, traceId) {
    if (state.status === EventStatus.DEPARTED) {
      return;
    }

    state.status = EventStatus.DEPARTED;
    state.departedConfirmedAtIso = now.toISOString();
    StateRepository.save(state);

    if (NotificationPolicy.isQuietHours(now, config.quietHoursStart, config.quietHoursEnd)) {
      LogModule.info('notify', {
        eventId: event.id,
        sent: false,
        reason: 'departed_quiet_hours'
      }, traceId);
      return;
    }

    try {
      const message = MessageTemplate.buildDepartedMessage(event);
      LineGateway.pushText(config, message);
      LogModule.info('notify', {
        eventId: event.id,
        sent: true,
        stage: 'departed',
        message: message
      }, traceId);
    } catch (e) {
      LogModule.error('error', {
        category: 'line',
        eventId: event.id,
        message: e.message
      }, traceId);
    }
  },

  sendStageNotification_: function(event, state, stage, config, now, traceId) {
    const message = MessageTemplate.buildStageMessage(stage, event, now);

    try {
      LineGateway.pushText(config, message);
      state.status = EventStatus.NOTIFYING;
      state.currentStage = stage;
      state.noticeCount = (state.noticeCount || 0) + 1;
      state.lastNoticeAtIso = now.toISOString();
      StateRepository.save(state);
      StateRepository.setLatestNotifiedEventId(event.id);

      LogModule.info('notify', {
        eventId: event.id,
        sent: true,
        stage: stage,
        noticeCount: state.noticeCount,
        message: message
      }, traceId);
    } catch (e) {
      LogModule.error('error', {
        category: 'line',
        eventId: event.id,
        stage: stage,
        message: e.message
      }, traceId);
    }
  }
};
