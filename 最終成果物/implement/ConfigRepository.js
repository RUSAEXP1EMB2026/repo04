/**
 * Script Propertiesからアプリ設定を読み書きするGateway。
 * UseCase層より内側ではPropertiesServiceを直接触らない。
 */
const ConfigRepository = {
  defaults: {
    GOOGLE_CALENDAR_ID: 'primary',
    OUTING_KEYWORDS: '外出,出発,通院,会議',
    INCLUDE_ALL_DAY_EVENT: 'false',
    SENSOR_FRESHNESS_MINUTES: '15',
    NOTICE_STAGE1_MIN_BEFORE: '30',
    NOTICE_STAGE2_MIN_BEFORE: '10',
    NOTICE_REPEAT_MINUTES: '5',
    NOTICE_MAX_COUNT: '6',
    SNOOZE_MINUTES: '15',
    QUIET_HOURS_START: '22:00',
    QUIET_HOURS_END: '07:00',
    HEALTH_CHECK_ENABLED: 'true'
  },

  load: function() {
    const props = PropertiesService.getScriptProperties();

    return {
      natureApiToken: ConfigRepository.getRequired_(props, 'NATURE_API_TOKEN'),
      lineChannelAccessToken: ConfigRepository.getRequired_(props, 'LINE_CHANNEL_ACCESS_TOKEN'),
      lineToUserId: ConfigRepository.getRequired_(props, 'LINE_TO_USER_ID'),
      lineWebhookToken: ConfigRepository.getOptional_(props, 'LINE_WEBHOOK_TOKEN', ''),
      natureDeviceId: ConfigRepository.getOptional_(props, 'NATURE_DEVICE_ID', ''),
      natureDeviceName: ConfigRepository.getOptional_(props, 'NATURE_DEVICE_NAME', ''),
      calendarId: ConfigRepository.getOptional_(props, 'GOOGLE_CALENDAR_ID', ConfigRepository.defaults.GOOGLE_CALENDAR_ID),
      outingKeywords: ConfigRepository.parseCsv_(
        ConfigRepository.getOptional_(props, 'OUTING_KEYWORDS', ConfigRepository.defaults.OUTING_KEYWORDS)
      ),
      includeAllDayEvent: ConfigRepository.parseBoolean_(
        ConfigRepository.getOptional_(props, 'INCLUDE_ALL_DAY_EVENT', ConfigRepository.defaults.INCLUDE_ALL_DAY_EVENT)
      ),
      sensorFreshnessMinutes: ConfigRepository.getPositiveNumber_(props, 'SENSOR_FRESHNESS_MINUTES'),
      noticeStage1MinBefore: ConfigRepository.getNumber_(props, 'NOTICE_STAGE1_MIN_BEFORE'),
      noticeStage2MinBefore: ConfigRepository.getNumber_(props, 'NOTICE_STAGE2_MIN_BEFORE'),
      noticeRepeatMinutes: ConfigRepository.getNumber_(props, 'NOTICE_REPEAT_MINUTES'),
      noticeMaxCount: ConfigRepository.getNumber_(props, 'NOTICE_MAX_COUNT'),
      snoozeMinutes: ConfigRepository.getNumber_(props, 'SNOOZE_MINUTES'),
      quietHoursStart: ConfigRepository.getOptional_(props, 'QUIET_HOURS_START', ConfigRepository.defaults.QUIET_HOURS_START),
      quietHoursEnd: ConfigRepository.getOptional_(props, 'QUIET_HOURS_END', ConfigRepository.defaults.QUIET_HOURS_END),
      healthCheckEnabled: ConfigRepository.parseBoolean_(
        ConfigRepository.getOptional_(props, 'HEALTH_CHECK_ENABLED', ConfigRepository.defaults.HEALTH_CHECK_ENABLED)
      )
    };
  },

  bootstrapDefaults: function() {
    const props = PropertiesService.getScriptProperties();
    Object.keys(ConfigRepository.defaults).forEach(function(key) {
      if (!props.getProperty(key)) {
        props.setProperty(key, ConfigRepository.defaults[key]);
      }
    });
  },

  getRequired_: function(props, key) {
    const value = props.getProperty(key);
    if (!value) {
      throw new Error('Script Properties: ' + key + ' が未設定です。');
    }
    return value;
  },

  getOptional_: function(props, key, defaultValue) {
    const value = props.getProperty(key);
    return value === null || value === '' ? defaultValue : value;
  },

  getNumber_: function(props, key) {
    const raw = ConfigRepository.getOptional_(props, key, ConfigRepository.defaults[key]);
    const parsed = Number(raw);
    if (!isFinite(parsed)) {
      throw new Error('Script Properties: ' + key + ' は数値で設定してください。');
    }
    return parsed;
  },

  getPositiveNumber_: function(props, key) {
    const parsed = ConfigRepository.getNumber_(props, key);
    if (parsed <= 0) {
      throw new Error('Script Properties: ' + key + ' は0より大きい数値で設定してください。');
    }
    return parsed;
  },

  parseCsv_: function(value) {
    return String(value || '')
      .split(',')
      .map(function(item) {
        return item.trim();
      })
      .filter(function(item) {
        return item.length > 0;
      });
  },

  parseBoolean_: function(value) {
    return String(value).toLowerCase() === 'true';
  }
};
