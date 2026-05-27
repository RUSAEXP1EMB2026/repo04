# 設定・運用仕様書

## 1. 設定値の保存場所

このシステムの設定値は Google Apps Script の Script Properties に保存します。`ConfigRepository.load()` が設定値を読み込み、UseCase や Gateway に設定オブジェクトとして渡します。

Script Properties には、設定値に加えて予定ごとの状態も保存します。状態キーには `EVENT_STATE_` 接頭辞を使い、設定キーと区別します。

## 2. 必須 Script Properties

### `NATURE_API_TOKEN`

Nature Remo Cloud API のアクセストークンです。`NatureGateway.listDevices()` が `Authorization: Bearer <token>` ヘッダーに設定します。

未設定の場合、`ConfigRepository.load()` が例外を投げます。

### `LINE_CHANNEL_ACCESS_TOKEN`

LINE Messaging API のチャネルアクセストークンです。`LineGateway.pushText()` と `LineGateway.replyText()` が `Authorization: Bearer <token>` ヘッダーに設定します。

未設定の場合、`ConfigRepository.load()` が例外を投げます。

### `LINE_TO_USER_ID`

LINE プッシュ通知の送信先ユーザー ID です。外出催促通知、外出確認通知、正常稼働通知の送信先として使います。

未設定の場合、`ConfigRepository.load()` が例外を投げます。

## 3. 任意 Script Properties

### `LINE_WEBHOOK_TOKEN`

LINE Webhook URL の簡易認可に使うトークンです。設定した場合、Webhook リクエストの URL パラメータ `webhook_token` と一致する必要があります。

未設定または空文字の場合、Webhook トークン検証は行われません。実運用では設定を推奨します。

### `NATURE_DEVICE_ID`

外出判定に使う Nature Remo デバイス ID です。複数デバイスがある場合に対象を固定できます。

`NATURE_DEVICE_ID` が設定されている場合、`NATURE_DEVICE_NAME` より優先されます。

### `NATURE_DEVICE_NAME`

外出判定に使う Nature Remo デバイス名です。`NATURE_DEVICE_ID` が未設定の場合のみ使われます。

### `GOOGLE_CALENDAR_ID`

外出予定を取得する Google Calendar の ID です。既定値は `primary` です。

`primary` の場合は `CalendarApp.getDefaultCalendar()` を使います。それ以外の場合は `CalendarApp.getCalendarById(calendarId)` を使います。

### `OUTING_KEYWORDS`

場所が設定されていない予定を外出予定と判定するためのキーワード CSV です。既定値は `外出,出発,通院,会議` です。

予定タイトルまたは説明文にいずれかのキーワードが含まれる場合、その予定を外出予定として扱います。

### `INCLUDE_ALL_DAY_EVENT`

終日予定を通知対象に含めるかを指定します。既定値は `false` です。

文字列を小文字化した結果が `true` の場合のみ `true` として扱います。

### `SENSOR_FRESHNESS_MINUTES`

Nature Remo の最新人感検知を外出判定に使える鮮度分数です。既定値は `15` です。

0 より大きい数値である必要があります。0 以下または数値でない場合は設定読み込み時に例外になります。

### `NOTICE_STAGE1_MIN_BEFORE`

第1段階の準備リマインドを開始する、予定開始前の分数です。既定値は `30` です。

この値は監視開始時刻にも使われます。

### `NOTICE_STAGE2_MIN_BEFORE`

第2段階の出発催促を開始する、予定開始前の分数です。既定値は `10` です。

### `NOTICE_REPEAT_MINUTES`

予定開始後の繰り返し警告間隔です。既定値は `5` です。

監視終了時刻の計算にも使われます。監視終了時刻は `予定開始 + NOTICE_REPEAT_MINUTES * NOTICE_MAX_COUNT` 分です。

### `NOTICE_MAX_COUNT`

予定ごとの最大通知回数です。既定値は `6` です。

状態の `noticeCount` がこの値以上になると、通知判断は `stop` になり、状態は `stopped` になります。

### `SNOOZE_MINUTES`

LINE で `OK` または `スヌーズ` を受け取った場合のスヌーズ分数です。既定値は `15` です。

### `QUIET_HOURS_START`

静穏時間の開始時刻です。既定値は `22:00` です。

### `QUIET_HOURS_END`

静穏時間の終了時刻です。既定値は `07:00` です。

静穏時間は日付またぎに対応します。開始時刻と終了時刻が同じ場合、静穏時間なしとして扱います。

### `HEALTH_CHECK_ENABLED`

日次正常稼働通知を送るかどうかを指定します。既定値は `true` です。

文字列を小文字化した結果が `true` の場合のみ有効です。

## 4. 状態保存キー

### `EVENT_STATE_<eventId>`

予定ごとの通知状態を JSON 文字列として保存します。`eventId` は Google Calendar のイベント ID と開始時刻を組み合わせた値です。

主な保存項目は次の通りです。

- `eventId`: 状態保存用 ID。
- `eventTitle`: 予定タイトル。
- `eventStartIso`: 予定開始時刻。
- `status`: `not_departed`、`notifying`、`snoozing`、`departed`、`cancelled`、`stopped` のいずれか。
- `currentStage`: 通知段階。
- `noticeCount`: 通知回数。
- `lastNoticeAtIso`: 最終通知時刻。
- `snoozeUntilIso`: スヌーズ期限。
- `cancelled`: キャンセルフラグ。
- `departedConfirmedAtIso`: 外出確認時刻。
- `updatedAtIso`: 状態更新時刻。

### `LATEST_NOTIFIED_EVENT_ID`

直近に LINE 通知を送った予定 ID を保存します。Webhook でユーザーから `OK`、`スヌーズ`、`キャンセル` を受け取ったとき、この値を使って対象予定の状態を読み込みます。

## 5. 初期セットアップ手順

1. Google Apps Script プロジェクトにコードを配置します。
2. Script Properties に必須キーを設定します。
3. 必要に応じて任意キーを設定します。
4. `setupTriggers()` を手動実行します。
5. 初回実行時に OAuth 権限を承認します。
6. Apps Script を Web アプリとしてデプロイします。
7. LINE Developers の Webhook URL に Web アプリ URL を設定します。
8. `LINE_WEBHOOK_TOKEN` を使う場合は、Webhook URL の末尾に `?webhook_token=<token>` を付けます。
9. LINE Developers で Webhook の利用を有効化します。
10. `testNatureModule()`、`testCalendarModule()`、`sendHealthCheck()` などで疎通を確認します。

## 6. トリガー仕様

### `runScheduler`

作成元は `setupTriggers()` です。`ScriptApp.newTrigger('runScheduler').timeBased().everyMinutes(5).create()` により、5 分ごとに実行されます。

役割は、外出予定の取得、Nature Remo センサー情報の取得、外出判定、LINE 通知です。

### `sendHealthCheck`

作成元は `setupTriggers()` です。`ScriptApp.newTrigger('sendHealthCheck').timeBased().atHour(8).everyDays(1).create()` により、毎日 8 時台に実行されます。

役割は、正常稼働通知を LINE に送ることです。

### トリガー再作成時の仕様

`setupTriggers()` は、同じ関数名の既存トリガーを削除してから新規作成します。これにより、セットアップを複数回実行しても同じトリガーが重複しません。

## 7. Web アプリ仕様

### エンドポイント

Apps Script の Web アプリ URL が LINE Webhook の送信先になります。POST リクエストは `doPost(e)` で受けます。

### レスポンス

レスポンス本文は次のいずれかです。

- `ok`: 正常処理。
- `forbidden`: `LINE_WEBHOOK_TOKEN` の検証に失敗。
- `error`: JSON 解析や処理中に例外が発生。

### 認可

`LINE_WEBHOOK_TOKEN` が設定されている場合のみ、URL パラメータ `webhook_token` を検証します。この仕組みは LINE 署名検証ではなく簡易トークン検証です。

## 8. 通知本文仕様

### 段階通知

段階通知は次の形式です。

```text
【外出催促 <段階ラベル>】
予定: <予定タイトル>
開始: <HH:mm>
現在: <HH:mm>
玄関前の外出動作がまだ確認できていません。
```

段階ラベルは次のいずれかです。

- `第1段階 準備リマインド`
- `第2段階 出発催促`
- `第3段階 警告`
- `第4段階 繰り返し警告`
- `通知`

### 外出確認通知

外出が確認された場合の本文は次の形式です。

```text
外出を確認しました。いってらっしゃい！
予定: <予定タイトル>
開始: <HH:mm>
```

### 正常稼働通知

正常稼働通知は次の形式です。

```text
システム正常稼働中
確認時刻: <yyyy/MM/dd HH:mm>
```

## 9. 手動確認関数

### `testCalendarModule()`

カレンダー設定と外出予定抽出を確認します。本日の外出予定数と予定名をログに出します。

### `testNatureModule()`

Nature Remo API の疎通と人感センサー情報の取得を確認します。取得結果を JSON でログに出します。

### `testStateModule()`

Script Properties への状態保存、読み込み、削除を確認します。テスト用予定 ID `test_event_999` を使います。

### `sendHealthCheck()`

LINE へのプッシュ通知が可能か確認できます。`HEALTH_CHECK_ENABLED` が `true` の場合のみ送信されます。

## 10. ログ確認仕様

ログは Apps Script の実行ログまたは Google Cloud Logging で確認します。出力は JSON 文字列です。

確認すべき主なログは次の通りです。

- `setup`: トリガー再作成の完了。
- `sensor`: Nature Remo から取得したセンサー情報。
- `schedule`: 外出予定として抽出された予定数と予定情報。
- `state`: 予定ごとの現在状態、外出判定結果、Webhook コマンド適用結果。
- `notify`: 通知送信、通知スキップ、通知停止の結果。
- `health`: 正常稼働通知の送信結果。
- `error`: 例外情報。

同一実行内のログは `traceId` で追跡できます。

## 11. 運用時の代表的な確認ポイント

### 通知が届かない場合

次の順に確認します。

1. `LINE_CHANNEL_ACCESS_TOKEN` と `LINE_TO_USER_ID` が正しいか。
2. `sendHealthCheck()` で LINE へ送信できるか。
3. `runScheduler` トリガーが存在するか。
4. `schedule` ログに外出予定が出ているか。
5. `sensor` ログに最新人感検知情報が出ているか。
6. `notify` ログの `reason` が `quiet_hours`、`snoozing`、`not_due`、`cooldown`、`max_notice_count` などになっていないか。

### 外出予定が検出されない場合

次を確認します。

1. `GOOGLE_CALENDAR_ID` が正しいか。
2. Apps Script に Calendar 読み取り権限が付与されているか。
3. 予定が当日の範囲に入っているか。
4. 終日予定の場合、`INCLUDE_ALL_DAY_EVENT` が `true` になっているか。
5. 場所が空の予定の場合、タイトルまたは説明に `OUTING_KEYWORDS` が含まれているか。

### 外出済みにならない場合

次を確認します。

1. Nature Remo API トークンが正しいか。
2. `NATURE_DEVICE_ID` または `NATURE_DEVICE_NAME` で対象デバイスが絞り込まれすぎていないか。
3. 対象デバイスに `newest_events.mo` が存在するか。
4. 最新検知時刻が `SENSOR_FRESHNESS_MINUTES` 分以内か。
5. 最新検知時刻が予定開始 `NOTICE_STAGE1_MIN_BEFORE` 分前以降か。

### LINE 返信が効かない場合

次を確認します。

1. Apps Script Web アプリがデプロイされているか。
2. LINE Developers の Webhook URL が正しいか。
3. `LINE_WEBHOOK_TOKEN` を設定している場合、URL パラメータ `webhook_token` が一致しているか。
4. 返信テキストが `OK`、`スヌーズ`、`キャンセル` のいずれかになっているか。
5. `LATEST_NOTIFIED_EVENT_ID` に直近通知予定 ID が保存されているか。

## 12. セキュリティ上の注意

- `NATURE_API_TOKEN` と `LINE_CHANNEL_ACCESS_TOKEN` はコードに直接書かず、Script Properties に保存します。
- `.clasp.json` の `scriptId` はプロジェクト識別子であり、公開範囲に注意します。
- `LINE_WEBHOOK_TOKEN` は簡易的な URL トークン検証です。LINE の署名検証を実装しているわけではありません。
- Web アプリの公開範囲は、運用要件に合わせて最小限にします。

## 13. 保守仕様

### 状態の掃除

`SchedulerUseCase.run()` の最後に `StateRepository.cleanupOldStates(now, 7)` が実行されます。これにより、予定開始から 7 日以上経過した状態が削除されます。

### 設定変更

通知タイミングやキーワードは Script Properties を変更することで反映されます。コード変更は不要です。

ただし、トリガー周期やヘルスチェック時刻を変更する場合は `Main.js` の `setupTriggers()` を変更し、再実行する必要があります。

### 予定変更

保存済み状態を読み込むたびに、予定タイトルと開始時刻は Google Calendar の最新情報で上書きされます。ただし、状態 ID は Calendar イベント ID と開始時刻から作られるため、開始時刻が変わると別予定として扱われる可能性があります。
