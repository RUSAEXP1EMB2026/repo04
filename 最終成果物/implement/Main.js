/**
 * GAS EntryPoint層。外部から直接呼ばれる関数だけを置く。
 */
function runScheduler() {
  SchedulerUseCase.run();
}

function doPost(e) {
  return WebhookUseCase.handle(e);
}

function sendHealthCheck() {
  HealthCheckUseCase.send();
}

function setupTriggers() {
  ConfigRepository.bootstrapDefaults();
  MainEntryPoint.recreateTimeTrigger_('runScheduler', function(builder) {
    builder.everyMinutes(5).create();
  });
  MainEntryPoint.recreateTimeTrigger_('sendHealthCheck', function(builder) {
    builder.atHour(8).everyDays(1).create();
  });
  LogModule.info('setup', { message: 'triggers recreated' });
}

const MainEntryPoint = {
  recreateTimeTrigger_: function(functionName, createFn) {
    ScriptApp.getProjectTriggers()
      .filter(function(trigger) {
        return trigger.getHandlerFunction() === functionName;
      })
      .forEach(function(trigger) {
        ScriptApp.deleteTrigger(trigger);
      });

    createFn(ScriptApp.newTrigger(functionName).timeBased());
  }
};
