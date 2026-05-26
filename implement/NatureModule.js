/**
 * Nature Remo Cloud API Gateway。
 */
const NatureGateway = {
  listDevices: function(config) {
    const response = UrlFetchApp.fetch('https://api.nature.global/1/devices', {
      method: 'get',
      headers: {
        Authorization: 'Bearer ' + config.natureApiToken
      },
      muteHttpExceptions: true
    });

    const statusCode = response.getResponseCode();
    if (statusCode !== 200) {
      throw new Error('Nature Remo API エラー(' + statusCode + '): ' + response.getContentText());
    }

    return JSON.parse(response.getContentText() || '[]');
  },

  fetchLastMotionDetectedAt: function(config) {
    const devices = NatureGateway.listDevices(config);
    const targetDevices = NatureGateway.filterTargetDevices_(devices, config);
    let latest = null;

    targetDevices.forEach(function(device) {
      const motionEvent = device && device.newest_events && device.newest_events.mo;
      if (!motionEvent || !motionEvent.created_at) {
        return;
      }

      const detectedAt = new Date(motionEvent.created_at);
      if (!latest || detectedAt.getTime() > latest.lastDetectedAt.getTime()) {
        latest = {
          deviceId: device.id,
          deviceName: device.name,
          lastDetectedAt: detectedAt,
          lastDetectedAtIso: detectedAt.toISOString(),
          value: motionEvent.val
        };
      }
    });

    return {
      fetchedAt: new Date(),
      fetchedAtIso: new Date().toISOString(),
      lastDetectedAt: latest ? latest.lastDetectedAt : null,
      lastDetectedAtIso: latest ? latest.lastDetectedAtIso : null,
      deviceId: latest ? latest.deviceId : null,
      deviceName: latest ? latest.deviceName : null,
      value: latest ? latest.value : null
    };
  },

  filterTargetDevices_: function(devices, config) {
    if (config.natureDeviceId) {
      return devices.filter(function(device) {
        return device.id === config.natureDeviceId;
      });
    }

    if (config.natureDeviceName) {
      return devices.filter(function(device) {
        return device.name === config.natureDeviceName;
      });
    }

    return devices;
  }
};

function testNatureModule() {
  const config = ConfigRepository.load();
  const sensor = NatureGateway.fetchLastMotionDetectedAt(config);
  console.log(JSON.stringify(sensor));
}