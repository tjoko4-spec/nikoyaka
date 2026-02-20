# Supabase移行 - クイックスタート

## 🎯 やることリスト（3ステップ）

### ステップ1: Supabaseの準備（5分）

1. **テーブル作成**
   - Supabase Dashboard → SQL Editor
   - `SUPABASE_MIGRATION_GUIDE.md` のSQLを実行

2. **データ移行**
   - 現在のアプリでF12キーを押してコンソールを開く
   - `SUPABASE_MIGRATION_GUIDE.md` のエクスポートコードを実行
   - ダウンロードされたJSONをSupabaseにインポート

---

### ステップ2: コード修正（3分）

#### A. `js/supabase-config.js` を編集

```javascript
const SUPABASE_URL = 'あなたのURL'; // ← ここを変更
const SUPABASE_ANON_KEY = 'あなたのキー'; // ← ここを変更
```

#### B. `index.html` の `<head>` に追加

`</head>` の**直前**に以下を追加：

```html
<!-- Supabase SDK -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/supabase-config.js"></script>
<script src="js/supabase-api.js"></script>
```

#### C. `js/app.js` のAPI関数部分を置き換え

**置き換え箇所**: 450行目〜785行目（API関数セクション）

詳細は `SUPABASE_MIGRATION_GUIDE.md` のステップ4-3を参照

---

### ステップ3: GitHub Pagesにアップロード（5分）

1. GitHubで新しいリポジトリを作成
2. 全ファイルをアップロード
3. Settings → Pages → main branch を選択
4. 完了！

---

## ✅ 確認方法

ブラウザでF12キーを押して、コンソールに以下が表示されればOK：

```
✅ Supabase初期化完了
✅ Supabase APIレイヤー読み込み完了
```

---

## 📁 修正が必要なファイル

- `js/supabase-config.js` ← **新規作成済み**（あなたの設定を入力）
- `js/supabase-api.js` ← **新規作成済み**（そのまま使用）
- `index.html` ← **3行追加**
- `js/app.js` ← **API関数部分を置き換え**

---

## 💡 詳細は

`SUPABASE_MIGRATION_GUIDE.md` を参照してください。
