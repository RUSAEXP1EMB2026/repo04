# システム設計書
## Nature Remo 3 × Google カレンダー × LINE 外出催促通知システム

| 項目 | 内容 |
|------|------|
| 文書種別 | システム設計書 |
| 実行環境 | Google Apps Script |
| 対象デバイス | Nature Remo 3（玄関ドア付近設置の人感センサー） |

---

## 目次

1. [システム概要](#1-システム概要)
2. [アーキテクチャ設計](#2-アーキテクチャ設計)
3. [モジュール設計](#3-モジュール設計)
4. [データ設計](#4-データ設計)
5. [処理フロー設計](#5-処理フロー設計)
6. [通知・状態遷移設計](#6-通知状態遷移設計)
7. [外部インタフェース設計](#7-外部インタフェース設計)
8. [運用・エラーハンドリング・セキュリティ設計](#8-運用エラーハンドリングセキュリティ設計)

---

## 1. システム概要

### 1.1 目的

Nature Remo 3 の人感センサー最終検知時刻と Google カレンダーの予定情報を照合し、予定前に外出動作が確認できない場合に LINE で段階的な催促通知を送信する。  
ユーザーは Google カレンダーに予定を登録するだけで、出発遅れを防止できる。

### 1.2 対象業務と前提

- 監視対象は「当日の外出予定」
- 外出判定は「玄関ドア前センサーの検知有無」に限定
- 5 分間隔の時間主導トリガーで判定処理を実行
- ユーザーの応答（`OK` / `スヌーズ` / `キャンセル`）は LINE Webhook で受信して制御に反映

### 1.3 システム構成

```
[Nature Remo 3 (玄関ドア前の人感センサー)]
        |
        | Nature API (HTTPS)
        v
[Google Apps Script]
   |    |    |
   |    |    +-- Script Properties（設定値・状態保持）
   |    |
   |    +------ Google Calendar API（予定取得）
   |
   +----------- LINE Messaging API（通知送信 / 返信受信）
        |
        v
      [ユーザー]
```

---

## 2. アーキテクチャ設計

### 2.1 実行モデル

Google Apps Script で 3 種類の実行経路を持つ。

| 実行種別 | タイミング | 呼び出し関数 | 役割 |
|---------|------------|--------------|------|
| 時間主導型（分ベース） | 5 分ごと | `runScheduler()` | センサー確認・予定照合・通知判定 |
| 時間主導型（日次） | 毎日 8:00 | `sendHealthCheck()` | 正常稼働通知（ON/OFF可） |
| Web アプリ（Webhook） | 随時 | `doPost(e)` | LINE 返信受信による通知制御 |

### 2.2 スクリプト構成

| ファイル名 | 役割 |
|-----------|------|
| `Main.gs` | エントリーポイント。定期処理の統括 |
| `NatureModule.gs` | Nature API 呼び出しと最終検知時刻取得 |
| `CalendarModule.gs` | Google カレンダー予定取得・外出予定抽出 |
| `NotificationModule.gs` | 通知段階判定・LINE メッセージ送信 |
| `StateModule.gs` | 予定単位の状態遷移と Script Properties 永続化 |
| `WebhookModule.gs` | LINE Webhook（`OK` / `スヌーズ` / `キャンセル`）処理 |
| `HealthCheckModule.gs` | 日次稼働通知送信 |
| `Config.gs` | 設定キー、デフォルト値、定数 |
| `LogModule.gs` | Cloud Logging 出力（JSON 構造化ログ） |
| `Utils.gs` | 時刻変換、文字列整形、共通処理 |

### 2.3 設計方針

- 外部サービス依存処理（Nature/Calendar/LINE）をモジュール分離
- 状態は Script Properties に集約し、処理間で共有
- 判定ロジックは純粋関数化し、テスト可能性を確保
- すべての主要イベントを Cloud Logging に構造化出力

---

## 3. モジュール設計

### 3.1 NatureModule（人感センサー取得）

#### 責務

- Nature API（`GET /1/devices`）から対象デバイスを取得
- 人感センサーの最終検知時刻を抽出

#### 主要関数

```javascript
/**
 * 対象デバイスの人感センサー最終検知時刻を取得する
 * @returns {{ sensorLastDetectedAtIso: string, fetchedAtIso: string }}
 */
function fetchLastMotionDetectedAt()
```

### 3.2 CalendarModule（予定抽出）

#### 責務

- 当日の予定一覧を取得
- 外出予定判定条件に基づくフィルタリング

#### 判定条件

- `location` が設定されている
- または、タイトル/説明にキーワードを含む
- 終日イベントは設定値で対象化を切替

#### 主要関数

```javascript
/**
 * 当日の外出予定候補を返す
 * @returns {Array<OutingEvent>}
 */
function listTodayOutingEvents()
```

### 3.3 NotificationModule（通知判定・送信）

#### 責務

- 予定ごとの通知段階を判定
- LINE 通知文面の生成と送信
- 送信回数上限、深夜帯抑制、スヌーズを考慮

#### 主要関数

```javascript
/**
 * 予定ごとに通知要否を判定して必要な通知を送信する
 * @param {Array<OutingEvent>} events
 * @param {SensorContext} sensor
 */
function evaluateAndNotify(events, sensor)

/**
 * LINE Push API でメッセージ送信
 * @param {string} toUserId
 * @param {string} message
 */
function sendLineMessage(toUserId, message)
```

### 3.4 StateModule（状態管理）

#### 責務

- 予定単位の通知状態管理
- `未外出` / `通知中` / `スヌーズ中` / `完了` / `キャンセル` を保持
- 通知送信履歴（段階・送信時刻・回数）を保持

#### 主要関数

```javascript
/**
 * 予定IDをキーに状態を取得する
 * @param {string} eventId
 * @returns {EventState}
 */
function loadEventState(eventId)

/**
 * 予定IDをキーに状態を保存する
 * @param {string} eventId
 * @param {EventState} state
 */
function saveEventState(eventId, state)
```

### 3.5 WebhookModule（ユーザー応答処理）

#### 責務

- LINE 返信イベント受信
- `OK` / `スヌーズ` / `キャンセル` のコマンド解釈
- 該当予定の状態を更新

#### 主要関数

```javascript
/**
 * LINE Webhook のPOSTイベントを処理
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e)
```

### 3.6 HealthCheckModule（正常稼働通知）

#### 責務

- 日次 8:00 の定期通知を送信
- 設定でON/OFF可能

#### 主要関数

```javascript
/**
 * 正常稼働通知を送信する
 */
function sendHealthCheck()
```

---

## 4. データ設計

### 4.1 Script Properties 設定項目

| キー | 説明 | デフォルト |
|------|------|-----------|
| `NATURE_API_TOKEN` | Nature API トークン | 必須 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API トークン | 必須 |
| `LINE_TO_USER_ID` | 通知先ユーザーID | 必須 |
| `GOOGLE_CALENDAR_ID` | 対象カレンダーID | primary |
| `OUTING_KEYWORDS` | 外出予定判定キーワード（カンマ区切り） | `外出,出発,通院,会議` |
| `INCLUDE_ALL_DAY_EVENT` | 終日イベント対象化 | `false` |
| `SENSOR_FRESHNESS_MINUTES` | 外出確認しきい値（分） | `15` |
| `NOTICE_STAGE1_MIN_BEFORE` | 第1通知の開始前分 | `30` |
| `NOTICE_STAGE2_MIN_BEFORE` | 第2通知の開始前分 | `10` |
| `NOTICE_REPEAT_MINUTES` | 第3以降の繰り返し間隔（分） | `5` |
| `NOTICE_MAX_COUNT` | 同一予定最大通知回数 | `6` |
| `SNOOZE_MINUTES` | スヌーズ時間（分） | `15` |
| `QUIET_HOURS_START` | 通知抑制開始時刻 | `22:00` |
| `QUIET_HOURS_END` | 通知抑制終了時刻 | `07:00` |
| `HEALTH_CHECK_ENABLED` | 日次稼働通知有効/無効 | `true` |

### 4.2 状態保存モデル（Script Properties）

予定単位で `EVENT_STATE_{eventId}` キーに JSON 文字列で保持する。

```json
{
  "eventId": "calendar-event-id",
  "eventTitle": "病院",
  "eventStartIso": "2026-04-15T10:00:00+09:00",
  "status": "not_departed",
  "currentStage": 2,
  "noticeCount": 2,
  "lastNoticeAtIso": "2026-04-15T09:50:00+09:00",
  "snoozeUntilIso": null,
  "cancelled": false,
  "departedConfirmedAtIso": null,
  "updatedAtIso": "2026-04-15T09:50:10+09:00"
}
```

### 4.3 ログ設計（Cloud Logging）

ログ種別ごとに以下の共通キーを持つ。

| キー | 説明 |
|------|------|
| `timestamp` | 記録時刻 |
| `traceId` | 実行単位ID |
| `eventId` | 対象予定ID（該当時） |
| `category` | `schedule` / `sensor` / `notify` / `state` / `error` |
| `payload` | 詳細データ |

---

## 5. 処理フロー設計

### 5.1 スケジューラメインフロー（5分ごと）

```
START runScheduler()
  |
  |- 1. 設定読込（Config）
  |
  |- 2. Nature API から最終検知時刻を取得（NatureModule）
  |     |- [失敗] ログ記録して継続可能範囲で終了
  |
  |- 3. 当日の外出予定取得（CalendarModule）
  |
  |- 4. 予定ごとに状態を復元（StateModule）
  |
  |- 5. 外出判定（しきい値内検知有無）
  |     |- 確認済みなら通知停止 + いってらっしゃい通知
  |
  |- 6. 未確認予定に対して通知段階判定（NotificationModule）
  |     |- 深夜帯・スヌーズ・最大回数を評価
  |     |- 要送信ならLINE送信 + 状態更新
  |
  |- 7. 状態保存・ログ出力
  |
END
```

### 5.2 Webhookフロー（返信コマンド）

```
START doPost(e)
  |
  |- 1. 署名検証（必要に応じて）
  |- 2. イベント種別判定（message 以外は無視）
  |- 3. テキスト正規化（全角半角・前後空白除去）
  |- 4. コマンド振り分け
  |     |- "OK"       -> 当該通知を一時停止
  |     |- "スヌーズ" -> snoozeUntil を現在+設定分に更新
  |     |- "キャンセル" -> 当該予定をキャンセル状態に更新
  |- 5. 結果をLINE返信 or Pushで通知
  |- 6. Cloud Logging 出力
END
```

### 5.3 日次正常稼働通知フロー（8:00）

```
START sendHealthCheck()
  |
  |- HEALTH_CHECK_ENABLED を確認
  |- 有効なら "システム正常稼働中" を送信
  |- 送信結果をCloud Loggingへ記録
END
```

---

## 6. 通知・状態遷移設計

### 6.1 通知段階設計

| 段階 | 送信条件 | 既定メッセージ意図 |
|------|----------|--------------------|
| 第1（準備） | 開始30分前で未外出 | 準備開始を促す |
| 第2（出発催促） | 開始10分前で未外出 | 出発行動を促す |
| 第3（警告） | 開始時刻超過で未外出 | 遅延リスクを強調 |
| 第4（繰り返し） | 開始後5分ごと未外出、最大回数まで | 継続催促 |

### 6.2 外出判定式

要件に合わせ、外出未確認判定は以下の条件で評価する。

```
外出未確認 = (現在時刻 - 最終検知時刻) < しきい値 かつ 監視対象時間内
```

監視対象時間内は `eventStart - NOTICE_STAGE1_MIN_BEFORE` から `通知終了条件成立` までとする。

### 6.3 状態遷移

```
[予定あり(未外出)]
    |-- 通知送信 --> [通知中]
    |-- スヌーズ --> [スヌーズ中] --(snoozeUntil経過)--> [予定あり(未外出)]
    |-- キャンセル --> [キャンセル]
    |-- 外出検知 --> [外出完了]

[通知中]
    |-- 外出検知 --> [外出完了]
    |-- 最大通知回数到達 --> [通知終了]
```

### 6.4 メッセージテンプレート

各段階メッセージには少なくとも以下を含める。

- 予定タイトル
- 予定開始時刻
- 現在時刻
- 段階（第1〜第4）

外出確認時は固定文言を送信する。

- `外出を確認しました。いってらっしゃい！`

---

## 7. 外部インタフェース設計

### 7.1 Nature API

| 項目 | 詳細 |
|------|------|
| 用途 | 人感センサー最終検知時刻取得 |
| エンドポイント | `GET https://api.nature.global/1/devices` |
| 認証 | Bearer トークン |
| 主利用フィールド | `newest_events.mo.created_at`（想定） |

### 7.2 Google Calendar API（Apps Script）

| 項目 | 詳細 |
|------|------|
| 用途 | 当日予定取得 |
| 利用サービス | `CalendarApp` または Advanced Calendar Service |
| 取得項目 | `id`, `title`, `start`, `end`, `location`, `description`, `isAllDayEvent` |

### 7.3 LINE Messaging API

| 項目 | 詳細 |
|------|------|
| 用途 | Push通知送信、返信受信 |
| 送信エンドポイント | `POST https://api.line.me/v2/bot/message/push` |
| Webhook受信 | GAS Webアプリ `doPost` |
| 認証 | チャネルアクセストークン / 署名検証 |

---

## 8. 運用・エラーハンドリング・セキュリティ設計

### 8.1 非機能設計反映

- 5分実行の判定処理は 1 分以内で完了することを目標にする
- 通知条件成立から 1 分以内送信を目標にする
- Nature API レート制限（5回/分）を超えない実装とする
- Calendar API クォータ、LINE無料枠を考慮し、同一予定の送信上限で制御する

### 8.2 エラーハンドリング方針

| エラー種別 | 動作 |
|-----------|------|
| Nature API失敗 | 当該実行は通知判定をスキップし、`error` ログ記録 |
| Calendar取得失敗 | 当該実行は終了し、次回トリガーで再試行 |
| LINE送信失敗 | 状態は送信失敗として保持し、次回判定で再評価 |
| Script Properties読書失敗 | フェイルセーフで通知送信停止、管理者ログ出力 |

### 8.3 セキュリティ設計

- 機密情報は Script Properties に保存し、ソースコードへ直書きしない
- Webhook は `X-Line-Signature` 検証を実施
- ログにはトークンや署名情報を出力しない
- 最小権限の OAuth スコープで運用する

### 8.4 運用設計

- 初期設定時に必須プロパティの存在チェックを実行
- 日次ヘルスチェック通知で稼働確認
- Cloud Logging の `error` 件数を閾値監視し、異常時に手動調査
