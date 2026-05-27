/**
 * 予定状態をScript Propertiesに保存するGateway。
 */
const StateRepository = {
  eventPrefix: 'EVENT_STATE_',
  latestNotifiedKey: 'LATEST_NOTIFIED_EVENT_ID',

  load: function(event) {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty(StateRepository.eventPrefix + event.id);
    const state = raw ? JSON.parse(raw) : EventStateFactory.create(event);
    return EventStateFactory.mergeEvent(state, event);
  },

  loadById: function(eventId) {
    const raw = PropertiesService.getScriptProperties().getProperty(StateRepository.eventPrefix + eventId);
    return raw ? JSON.parse(raw) : null;
  },

  save: function(state) {
    state.updatedAtIso = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty(
      StateRepository.eventPrefix + state.eventId,
      JSON.stringify(state)
    );
  },

  remove: function(eventId) {
    PropertiesService.getScriptProperties().deleteProperty(StateRepository.eventPrefix + eventId);
  },

  setLatestNotifiedEventId: function(eventId) {
    PropertiesService.getScriptProperties().setProperty(StateRepository.latestNotifiedKey, eventId);
  },

  getLatestNotifiedEventId: function() {
    return PropertiesService.getScriptProperties().getProperty(StateRepository.latestNotifiedKey);
  },

  cleanupOldStates: function(now, keepDays) {
    const props = PropertiesService.getScriptProperties();
    const all = props.getProperties();
    const threshold = now.getTime() - keepDays * 24 * 60 * 60 * 1000;

    Object.keys(all).forEach(function(key) {
      if (key.indexOf(StateRepository.eventPrefix) !== 0) {
        return;
      }
      try {
        const state = JSON.parse(all[key]);
        if (state.eventStartIso && new Date(state.eventStartIso).getTime() < threshold) {
          props.deleteProperty(key);
        }
      } catch (e) {
        props.deleteProperty(key);
      }
    });
  }
};

function testStateModule() {
  const event = {
    id: 'test_event_999',
    title: 'テスト予定',
    start: new Date(),
    end: new Date(new Date().getTime() + 60 * 60 * 1000)
  };
  const state = StateRepository.load(event);
  state.currentStage = NotificationStage.PREPARE;
  StateRepository.save(state);
  console.log(JSON.stringify(StateRepository.loadById(event.id)));
  StateRepository.remove(event.id);
}