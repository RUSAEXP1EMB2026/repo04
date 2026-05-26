/**
 * LINE Messaging API Gateway + メッセージ生成。
 */
const LineGateway = {
  pushText: function(config, text) {
    return LineGateway.post_('https://api.line.me/v2/bot/message/push', config, {
      to: config.lineToUserId,
      messages: [{ type: 'text', text: text }]
    });
  },

  replyText: function(config, replyToken, text) {
    return LineGateway.post_('https://api.line.me/v2/bot/message/reply', config, {
      replyToken: replyToken,
      messages: [{ type: 'text', text: text }]
    });
  },

  post_: function(url, config, body) {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.lineChannelAccessToken
      },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });

    const statusCode = response.getResponseCode();
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error('LINE API エラー(' + statusCode + '): ' + response.getContentText());
    }

    return {
      statusCode: statusCode,
      body: response.getContentText()
    };
  }
};

const MessageTemplate = {
  buildStageMessage: function(stage, event, now) {
    const label = MessageTemplate.stageLabel_(stage);
    return [
      '【外出催促 ' + label + '】',
      '予定: ' + event.title,
      '開始: ' + MessageTemplate.formatDate_(event.start, 'HH:mm'),
      '現在: ' + MessageTemplate.formatDate_(now, 'HH:mm'),
      '玄関前の外出動作がまだ確認できていません。'
    ].join('\n');
  },

  buildDepartedMessage: function(event) {
    return [
      '外出を確認しました。いってらっしゃい！',
      '予定: ' + event.title,
      '開始: ' + MessageTemplate.formatDate_(event.start, 'HH:mm')
    ].join('\n');
  },

  buildHealthCheckMessage: function(now) {
    return 'システム正常稼働中\n確認時刻: ' + MessageTemplate.formatDate_(now, 'yyyy/MM/dd HH:mm');
  },

  stageLabel_: function(stage) {
    if (stage === NotificationStage.PREPARE) return '第1段階 準備リマインド';
    if (stage === NotificationStage.DEPARTURE) return '第2段階 出発催促';
    if (stage === NotificationStage.WARNING) return '第3段階 警告';
    if (stage === NotificationStage.REPEAT_WARNING) return '第4段階 繰り返し警告';
    return '通知';
  },

  formatDate_: function(date, pattern) {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), pattern);
  }
};