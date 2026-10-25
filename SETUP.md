# Nexus セットアップ手順（管理者が最初に1回だけ）

利用者は **公開URLを開いて「新規登録」するだけ** で使えます。以下は管理者の初期設定です（約10分・無料）。

---

## 1. Firebase プロジェクトを作成
1. https://console.firebase.google.com/ を開き、Googleアカウントでログイン
2. 「プロジェクトを作成」→ 名前（例：`nexus-sns`）を入力 → Googleアナリティクスは **オフ** でOK → 作成

## 2. ログイン機能（Authentication）を有効化
1. 左メニュー「構築」→「Authentication」→「始める」
2. 「Sign-in method」タブ →「メール / パスワード」→ **有効にする** → 保存
   - ※ 利用者はメール不要です。アプリ内部で `ユーザーID@nexus.app` に変換して使います。

## 3. データベース（Firestore）を作成
1. 左メニュー「構築」→「Firestore Database」→「データベースを作成」
2. ロケーション：`asia-northeast1（東京）` → **本番環境モード** で作成
3. 「ルール」タブを開き、本フォルダの [firestore.rules](firestore.rules) の中身を**全部コピーして貼り付け** →「公開」

## 4. 設定値をアプリに貼り付け
1. プロジェクトの概要（⚙）→「プロジェクトの設定」→ 下部「マイアプリ」→ `</>`（ウェブ）をクリック
2. アプリ名を入力して登録（Hostingのチェックは不要）
3. 表示された `firebaseConfig = { ... }` の値を [firebase-config.js](firebase-config.js) に貼り付けて保存

---

## 5. インターネットに公開（どちらか一方）

### 方法A：Netlify Drop（インストール不要・おすすめ）
1. https://app.netlify.com/drop を開く（無料アカウント作成）
2. 以下のファイルを1つのフォルダにまとめて**ドラッグ＆ドロップ**
   - `index.html` `style.css` `app.js` `firebase-config.js` `service-worker.js` `manifest.json` `icon.svg`
3. 発行された URL（例：`https://xxxx.netlify.app`）を利用者に共有
4. **重要**：Firebase コンソール →「Authentication」→「設定」→「承認済みドメイン」→ **ドメインを追加** で `xxxx.netlify.app` を登録

### 方法B：Firebase Hosting（Node.js が必要）
1. https://nodejs.org/ から Node.js（LTS）をインストール
2. このフォルダで以下を実行
   ```powershell
   npx firebase-tools login
   npx firebase-tools deploy --project あなたのプロジェクトID
   ```
3. `https://あなたのプロジェクトID.web.app` を共有（ルールも同時に反映されます）

---

## 動作について
- **初回アクセス・新規登録・ログイン時はネット接続が必要**です。
- 一度開けば、以降はオフラインでも閲覧・投稿・いいね・返信が可能。オフライン中の投稿は時計マーク付きで表示され、接続時に自動送信されます。
- ブラウザを閉じてもログイン状態とデータは保持されます。
- 無料枠（読み取り5万回/日・書き込み2万回/日）で数十人程度まで利用できます。

## ローカルで試す場合
`index.html` をダブルクリック（file://）では動きません。VS Code の拡張機能 **Live Server** で `index.html` を開いてください（`localhost` は承認済みドメインに最初から含まれています）。
