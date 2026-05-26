/**
 * Google Calendar Gateway。
 */
const CalendarGateway = {
  listTodayOutingEvents: function(config, now) {
    const base = now || new Date();
    const startTime = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0);
    const endTime = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59);
    const calendar = config.calendarId === 'primary'
      ? CalendarApp.getDefaultCalendar()
      : CalendarApp.getCalendarById(config.calendarId);

    if (!calendar) {
      throw new Error('Google Calendarが見つかりません: ' + config.calendarId);
    }

    return calendar.getEvents(startTime, endTime)
      .filter(function(event) {
        return CalendarGateway.isOutingEvent_(event, config);
      })
      .map(function(event) {
        return CalendarGateway.toOutingEvent_(event);
      });
  },

  isOutingEvent_: function(event, config) {
    if (event.isAllDayEvent() && !config.includeAllDayEvent) {
      return false;
    }

    const location = event.getLocation();
    if (location && location.trim().length > 0) {
      return true;
    }

    const title = event.getTitle() || '';
    const description = event.getDescription() || '';
    return config.outingKeywords.some(function(keyword) {
      return title.indexOf(keyword) >= 0 || description.indexOf(keyword) >= 0;
    });
  },

  toOutingEvent_: function(event) {
    return {
      id: CalendarGateway.buildEventStateId_(event),
      calendarEventId: event.getId(),
      title: event.getTitle(),
      description: event.getDescription() || '',
      location: event.getLocation() || '',
      start: event.getStartTime(),
      end: event.getEndTime(),
      isAllDay: event.isAllDayEvent()
    };
  },

  buildEventStateId_: function(event) {
    return event.getId() + '_' + event.getStartTime().toISOString();
  }
};

function testCalendarModule() {
  const config = ConfigRepository.load();
  const outingEvents = CalendarGateway.listTodayOutingEvents(config, new Date());
  console.log('本日の外出予定数: ' + outingEvents.length);
  outingEvents.forEach(function(event) {
    console.log('- ' + event.title + ' (' + (event.location || '場所指定なし') + ')');
  });
}
