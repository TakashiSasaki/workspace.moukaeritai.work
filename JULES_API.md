# Jules API Integration Guide

This document summarizes the findings and implementation details for integrating with the Jules (Antigravity) API within this application.

## Overview

The Jules API is a high-level orchestration layer provided by Google DeepMind, accessible via the `@google/genai` TypeScript SDK. It allows for rich interactions with agentic systems (like the Antigravity agent).

## SDK Implementation

The integration uses the `@google/genai` library specifically utilizing the **Interactions API**.

```typescript
import { GoogleGenAI } from "@google/genai";

const aiClient = new GoogleGenAI({ apiKey: "YOUR_GEMINI_API_KEY" });

const interaction = await aiClient.interactions.create({
  agent: "antigravity-preview-05-2026",
  input: "Your request text",
  environment: "remote"
});
```

## Critical Setup Requirements

To use the Jules API successfully, the following conditions must be met:

1. **Paid Gemini API Key**: While some standard Gemini features work with free tier keys, Jules interactions typically require a Paid Gemini API key configured in the application settings.
2. **API Activation**: The `Generative Language API` must be explicitly enabled in the Google Cloud Project associated with the API key.
   - If you encounter a `PERMISSION_DENIED` or `SERVICE_DISABLED` (403) error, visit the [Google Cloud Console](https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview) to enable it.

## Error Handling

The application has been configured to intercept common Jules/Gemini API errors:

- **403 Permission Denied**: Usually indicates the API is disabled or the key is invalid. The server code now attempts to extract the specific activation URL from the error details if provided by the SDK.
- **Client Initialization**: In the debug endpoints, a new `GoogleGenAI` client is created per request to ensure that any updates to the API key in the environment are picked up immediately without requiring a server restart.

## Debugging

An ad-hoc Jules Debugging interface is available in the application (under the `jules-debug` view). This allows testing raw payloads and inspecting the exact response format returned by the Interactions API.

## Jules API セッションステータス仕様

Jules APIで非同期タスクを実行すると、セッションは定義されたライフサイクルに沿って状態（status）を遷移させます。各ステータス文字列と、それが表す具体的な状態は以下の通りです。

### 1. 各ステータス文字列の定義
1. **QUEUED** : キュー待機中。Julesが実行リソースの割り当てを待っている初期状態。
2. **PLANNING** : 計画中。対象のコードベースを分析し、タスクの実行プランを作成している状態。
3. **AWAITING_PLAN_APPROVAL** : プラン承認待ち。プラン作成が完了し、ユーザーによる内容の確認・承認を待っている状態。
4. **IN_PROGRESS** : 実行中。承認されたプランに基づき、Julesが実際のコーディングタスクやファイル編集を実行している状態。
5. **USER_FEEDBACK** : フィードバック待ち。ユーザーからの手動入力や、追加の指示を待機している状態。
6. **PAUSED** : 一時停止中。セッションが手動、またはシステムによって自動的に一時停止された状態。
7. **COMPLETED** : 完了。タスクが正常に終了し、通常はプルリクエスト（PR）の作成など全ての作業が完了した状態。
8. **FAILED** : 失敗。処理中に致命的なエラーなどが発生し、タスクを継続できなくなった状態。

### 2. 標準的なステータス遷移のフロー
タスクは通常、以下のような流れで進行します。

```text
[QUEUED] (タスク受付)
   ↓
[PLANNING] (プラン分析・策定)
   ↓
[AWAITING_PLAN_APPROVAL] (人間によるチェック：requirePlanApproval=trueの場合)
   ↓ (承認)
[IN_PROGRESS] (実際のコーディング作業)
  ↓↑ (必要に応じて [USER_FEEDBACK] などを経由)
[COMPLETED] または [FAILED] (タスク終了)
```

## API Endpoint: sessions.create

新しいJulesセッションを作成（タスク開始）するためのエンドポイントです。

### タスク開始時のプラン承認制御の仕様

Jules APIでタスク（セッション）を開始する際、人間が介入して対話的に進めるか（Human-in-the-loop）、あるいは完全自動で進めるかを、リクエストペイロード内のパラメータで明示的に制御できます。

#### 1. 制御パラメータの定義
* `requirePlanApproval` (Boolean型 / 主要パラメータ)
  * `true` （推奨・インタラクティブモード）:
    Julesはコードベースを分析してタスクの実行プラン（PLANNING）を作成した時点で処理を一時停止し、ステータスを `AWAITING_PLAN_APPROVAL` に移行させます。ユーザーがプランを検証・承認・あるいはフィードバックを与えるまで、実際のファイル書き換え（IN_PROGRESS）へ進みません。
  * `false` （フルオートモード）:
    人間の確認を挟まず、プラン作成後すぐに自律的なコーディング作業（IN_PROGRESS）へ移行します。

* `automationMode` (String型)
  * `AUTO_CREATE_PR`: タスク完了後、Julesが自動的に対象のリポジトリ（GitHubなど）にプルリクエスト（PR）を作成します。
  * **省略（未指定）**: 自動でPRは作成されず、ユーザーが手動で最終確認を行ってからPRを作成する手動モードとなります。

#### 2. セッション作成時のリクエストJSON構成例
Jules APIにタスク開始を指示する際の標準的なJSONペイロードの構造は以下の通りです。対話的な承認フローを必須とする場合は、必ず `requirePlanApproval: true` を含めてください。

```json
{
  "title": "タスクの識別タイトル（例: 認証ロジックの修正）",
  "prompt": "Julesに指示する具体的なタスク内容のテキスト",
  "sourceContext": {
    // 対象となるリポジトリやソースコードのコンテキスト情報
  },
  "requirePlanApproval": true
}
```

## API Endpoint: `sessions.sendMessage`

Jules API（アルファ版）において、すでに作成・実行されている特定のセッションに対して、追加の指示（プロンプト）やフィードバックを送信するには、`sessions.sendMessage` メソッドを使用します。

### 1. エンドポイントと認証方法

特定のセッションにメッセージを送るためのリクエストは、対象のセッションIDを含む以下のURLに対して、**POST** メソッドで送信します。

* **エンドポイント:** `POST https://jules.googleapis.com/v1alpha/sessions/{sessionId}:sendMessage`
* **認証ヘッダー:** `X-Goog-Api-Key` にAPIキーを設定します。
* **Content-Type:** `application/json`

### 2. リクエストボディの構造

リクエストのボディには、Julesへの追加指示となる文字列を `prompt` フィールドに格納したJSONデータを指定します。

```json
{
  "prompt": "修正したコードに対してインテグレーションテストも追加してください。"
}
```

* **`prompt` (string / 必須):** Julesエージェントへ対して、次に実行してほしい具体的な指示や、Julesからの質問に対する回答を入力します。

### 3. レスポンスの特徴（非同期処理）

このAPIリクエストが成功した場合、**レスポンスボディは空（Empty）** で返却されます。

Julesは非同期AIコーディングエージェントであるため、送信されたメッセージ（プロンプト）を受け取ると、バックグラウンドでタスクの再評価やコードの修正作業を開始します。Julesからの返答や作業の進捗を確認したい場合は、該当セッションの `activities` エンドポイント（`GET /v1alpha/sessions/{sessionId}/activities`）をポーリング（定期取得）して監視する必要があります。

### 4. 具体的な実装例

#### ① cURL コマンドによる送信例

```bash
curl -X POST "https://jules.googleapis.com/v1alpha/sessions/YOUR_SESSION_ID:sendMessage" \
  -H "X-Goog-Api-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Can you make the app corgi themed?"
  }'
```

#### ② Python による送信例

```python
import requests

def send_message_to_jules(api_key, session_id, user_prompt):
    # エンドポイントURLの構築
    url = f"https://jules.googleapis.com/v1alpha/sessions/{session_id}:sendMessage"
    
    headers = {
        "X-Goog-Api-Key": api_key,
        "Content-Type": "application/json"
    }
    
    payload = {
        "prompt": user_prompt
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        
        # 成功時はステータスコード200が返り、ボディは空
        if response.status_code == 200:
            print("メッセージの送信に成功しました。Julesが処理を開始します。")
        else:
            print(f"エラーが発生しました。ステータスコード: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"リクエストエラー: {e}")

# 使用例
API_KEY = "YOUR_API_KEY"
SESSION_ID = "abc123xyz-4567-89ab-cdef" # 対象のセッションID
PROMPT = "追加で、ログイン画面のバリデーションチェックも強化してください。"

send_message_to_jules(API_KEY, SESSION_ID, PROMPT)
```

### 5. 関連公式リファレンス

詳細なAPIの挙動や仕様の確認については、以下の公式ドキュメント（Google for Developers）をご参照ください。

* [Method: sessions.sendMessage | Jules API | Google for Developers](https://developers.google.com/jules/api/reference/rest/v1alpha/sessions/sendMessage)
* [REST Resource: sessions | Jules API | Google for Developers](https://developers.google.com/jules/api/reference/rest/v1alpha/sessions)

---

## Jules 成果物 (outputs.changeSet) & PR/差分情報のパース仕様

Jules API のセッションが完了（`state: "COMPLETED"`）した際、あるいはアクティビティログ（`v1alpha/sessions/{id}/activities`）の最終出力から、作成された成果物（作成された変更コード、Git Diff、推奨コミットメッセージなど）を抽出することができます。

Jules の公式 Web UI で表示される **「Ready for review 🎉」** カード（変更ファイル数、追加・削除行数バッジ、PR要約説明文、Gitブランチ、実行時間など）は、APIから得られる以下の生データ（JSON）をパースさせて導出・構築されています。

### 1. RAW JSON 生データ構造（スキーマ）

Julesがコード修正タスクを終えた時、セッションの `outputs` もしくはアクティビティデータの `changeSet` フィールドは以下のようなスキーマで構成されます：

```json
{
  "outputs": [
    {
      "changeSet": {
        "source": "sources/github/TakashiSasaki/scan.moukaeritai.work",
        "gitPatch": {
          "unidiffPatch": "diff --git a/AGENTS.md b/AGENTS.md\nindex a1cd9ad..008ba0a 100644\n--- a/AGENTS.md\n+++ b/AGENTS.md\n@@ -412,6 +412,8 @@ ...\n+    - Runtime contract closure is not a rollout approval.\n..."
        },
        "suggestedCommitMessage": "docs: Add Controlled Scanner Observation Dual-Write Rollout Design Gate\n\nThis change introduces the local-only rollout design gate for the controlled scanner observation dual-write phase. It defines the required safety constraints, monitoring signals, and negative boundaries before any actual feature toggling can be considered. No runtime paths, feature flags, or deploy workflows have been modified."
      }
    }
  ]
}
```

### 2. 追加行（Additions）・削除行（Deletions）の算出アルゴリズム

Jules Web UI 上の **`+562`**・**`-1`** バッジは、`gitPatch.unidiffPatch` に格納されている Git 統一差分（Unidiff）テキスト行を正規表現や文字判定で数え上げることで、非同期的にクライアント側で集計可能です。

#### TypeScript でのパース実装コード例：
```typescript
function calculateUnifiedDiffStats(unidiff: string): { additions: number; deletions: number } {
  if (!unidiff) return { additions: 0, deletions: 0 };
  
  let additions = 0;
  let deletions = 0;
  const lines = unidiff.split('\n');
  
  for (const line of lines) {
    // 1. 追加行の判定 (先頭が '+'、ただしメタヘッダー '+++' 自体は除外)
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } 
    // 2. 削除行の判定 (先頭が '-'、ただしメタヘッダー '---' 自体は除外)
    else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }
  
  return { additions, deletions };
}
```

### 3. コミット要約と詳細説明（Description）の分離ロジック

`suggestedCommitMessage` フィールドは Git 共通コミット規則に従い、**「1行目: 短い変更ヘッダー（要約）」**＋**「2行目: 空行」**＋**「3行目以降: 変更の背景と詳細内容（Description）」** という多行テキスト構造をとっています。
Jules Web UI では、このDescriptionをパース・展開し、レビュー用PRの説明カードとして綺麗にフォーマット表示します。

#### パース手法：
```typescript
interface ParsedCommitInfo {
  title: string;       // PRの短いタイトル/コミット要約
  description: string; // PR作成/差分の詳細説明文
}

function parseSuggestedCommitMessage(commitMsg: string): ParsedCommitInfo {
  if (!commitMsg) {
    return { 
      title: "Ready for review", 
      description: "Jules has completed the refactoring." 
    };
  }

  const lines = commitMsg.split('\n').map(l => l.trim());
  const title = lines[0] || "Ready for review";
  
  // 3行目（インデックス2）以降から空行などをフィルタリングして統合
  const descLines = lines.slice(1).filter(l => l !== "");
  const description = descLines.join('\n\n') || "No secondary detailed description provided.";
  
  return { title, description };
}
```

### 4. Git 開発用ブランチ名の規則

セッションデータで指定されている `sessionDetails.sourceContext.githubRepoContext.startingBranch` などからベースブランチ名が取得できるほか、成果物出力時にJulesエージェント側では自律的に一時作業ブランチを作成して差分をコミットします。
ブランチ名は慣例として `add-scanner-observation-rollout-design-gate-[sessionId]` のように、タスク内容の識別子にセッションIDの英数字（あるいは下数桁）を自動で接続した構造で払い出されます。

* **生成仕様:** `const branchName = `add-${taskSlug}-${sessionId.replace("sessions/", "").substring(0, 4)}`;`
