# 🚀 Supabase移行マニュアル

「にこやか収集管理システム」をSupabase + GitHub Pagesに移行する完全ガイドです。

---

## ✅ 前提条件

- [x] Supabaseアカウント作成済み
- [x] プロジェクトURL取得済み
- [x] API Key（anon public）取得済み

---

## 📋 移行手順の概要

1. **Supabaseにテーブル作成**（5分）
2. **既存データのエクスポート**（2分）
3. **Supabaseにデータインポート**（5分）
4. **コード修正**（3分）
5. **GitHub Pagesにデプロイ**（5分）

**合計所要時間**: 約20分

---

## ステップ1: Supabaseにテーブル作成

### 1-1. Supabaseにログイン
https://supabase.com → あなたのプロジェクトを開く

### 1-2. SQL Editorを開く
左サイドバー → **SQL Editor** → **New query**

### 1-3. 以下のSQLをコピー＆実行

```sql
-- ========================================
-- にこやか収集管理システム
-- Supabase用テーブル定義
-- ========================================

-- 1. 号車マスタテーブル
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_number TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  schedule JSONB,
  color TEXT DEFAULT '#3388ff',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. ゴミ種類マスタテーブル
CREATE TABLE waste_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  valid_from DATE,
  valid_until DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 地域ルールテーブル
CREATE TABLE area_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_pattern TEXT NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 収集依頼テーブル
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  start_date DATE NOT NULL,
  waste_type TEXT,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  status TEXT DEFAULT '未収集',
  manual_assignment BOOLEAN DEFAULT false,
  notes TEXT,
  combustible_days JSONB,
  non_combustible_enabled BOOLEAN DEFAULT false,
  non_combustible_days JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX idx_collections_name ON collections(name);
CREATE INDEX idx_collections_address ON collections(address);
CREATE INDEX idx_collections_status ON collections(status);
CREATE INDEX idx_collections_vehicle_id ON collections(vehicle_id);

-- RLS（Row Level Security）有効化
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

-- 全員アクセス可能ポリシー
CREATE POLICY "Enable all for vehicles" ON vehicles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for waste_types" ON waste_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for area_rules" ON area_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for collections" ON collections FOR ALL USING (true) WITH CHECK (true);

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vehicles_updated_at BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_waste_types_updated_at BEFORE UPDATE ON waste_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_area_rules_updated_at BEFORE UPDATE ON area_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_collections_updated_at BEFORE UPDATE ON collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 1-4. 実行確認
「Run」ボタンをクリック → 「Success」と表示されればOK

---

## ステップ2: 既存データのエクスポート

### 2-1. 現在のアプリを開く
ブラウザで現在のアプリにアクセス

### 2-2. コンソールを開く
- **Windows/Linux**: `F12` キー
- **Mac**: `Command + Option + I`

### 2-3. 以下のコードを実行

コンソールに以下をコピー＆貼り付けて Enter:

```javascript
// データエクスポート
(async function() {
  const tables = ['vehicles', 'waste_types', 'area_rules', 'collections'];
  const data = {};
  
  for (const table of tables) {
    const response = await fetch(`/tables/${table}?limit=10000`);
    const result = await response.json();
    data[table] = result.data || [];
  }
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nikoyaka_export.json';
  a.click();
  console.log('✅ エクスポート完了:', data);
})();
```

### 2-4. ダウンロード確認
`nikoyaka_export.json` がダウンロードされます

---

## ステップ3: Supabaseにデータインポート

### 3-1. エクスポートファイルを開く
`nikoyaka_export.json` をテキストエディタで開く

### 3-2. Table Editorでインポート

**Supabase Dashboard** → 左サイドバー **Table Editor**

各テーブルに対して以下を実行：

#### A. vehicles（号車）
1. `vehicles` テーブルをクリック
2. 右上の **Insert** → **Insert row** をクリック
3. JSONから各号車のデータを1つずつ入力：
   - `vehicle_number`: 例「33号車」
   - `is_active`: true
   - `schedule`: JSONをそのままコピー
   - `color`: 例「#FF6B6B」
4. **Save** をクリック
5. すべての号車で繰り返し

#### B. waste_types（ゴミ種類）
1. `waste_types` テーブルをクリック
2. 各ゴミ種類を追加：
   - `type_name`: 例「可燃ごみ」
   - `is_active`: true
   - `display_order`: 0, 1, 2...
   - `valid_from`, `valid_until`: 必要に応じて

#### C. area_rules（地域ルール）
1. `area_rules` テーブルをクリック
2. 各ルールを追加：
   - `area_pattern`: 例「中央町」
   - `vehicle_id`: Vehiclesテーブルで作成したIDをコピー
   - `priority`: 0, 1, 2...

#### D. collections（収集依頼）
1. `collections` テーブルをクリック
2. 各収集依頼を追加（同様の手順）

**💡 ヒント**: データが多い場合は、SQL Editorで一括INSERT文を実行する方が早いです

---

## ステップ4: コード修正

### 4-1. Supabase設定ファイルを編集

`js/supabase-config.js` を開いて、以下を編集：

```javascript
const SUPABASE_URL = 'あなたのSupabase Project URL';
const SUPABASE_ANON_KEY = 'あなたのSupabase Anon Key';
```

**取得方法**:
1. Supabase Dashboard
2. **Project Settings**（左下の歯車アイコン）
3. **API**
4. Project URL と anon public key をコピー

### 4-2. index.htmlを編集

`index.html` の `<head>` セクションに以下を**追加**：

```html
<!-- Supabase SDK -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- Supabase設定とAPIレイヤー -->
<script src="js/supabase-config.js"></script>
<script src="js/supabase-api.js"></script>
```

**追加位置**: `<script src="js/app.js"></script>` の**前**に追加

### 4-3. app.jsのAPI関数を置き換え

`js/app.js` の **API関数セクション**（450行目あたり）を以下に置き換え：

```javascript
// ===========================
// API関数（Supabase版）
// ===========================

async function fetchCollections() {
    try {
        const result = await SupabaseAPI.getCollections();
        collections = result.data || [];
        return collections;
    } catch (error) {
        console.error('収集データ取得エラー:', error);
        showToast('データの取得に失敗しました', 'error');
        return [];
    }
}

async function fetchVehicles() {
    try {
        const result = await SupabaseAPI.getVehicles();
        vehicles = result.data || [];
        return vehicles;
    } catch (error) {
        console.error('号車データ取得エラー:', error);
        showToast('号車データの取得に失敗しました', 'error');
        return [];
    }
}

async function fetchAreaRules() {
    try {
        const result = await SupabaseAPI.getAreaRules();
        areaRules = result.data || [];
        return areaRules;
    } catch (error) {
        console.error('地域ルールデータ取得エラー:', error);
        showToast('地域ルールの取得に失敗しました', 'error');
        return [];
    }
}

async function fetchWasteTypes() {
    try {
        const result = await SupabaseAPI.getWasteTypes();
        wasteTypes = result.data || [];
        return wasteTypes;
    } catch (error) {
        console.error('ゴミ種類データ取得エラー:', error);
        showToast('ゴミ種類の取得に失敗しました', 'error');
        return [];
    }
}

async function fetchAllData() {
    await Promise.all([
        fetchCollections(),
        fetchVehicles(),
        fetchAreaRules(),
        fetchWasteTypes()
    ]);
    updateVehicleSelects();
    updateWasteTypeSelects();
}

async function createCollection(data) {
    try {
        const result = await SupabaseAPI.createCollection(data);
        if (result.error) throw result.error;
        showToast('登録しました', 'success');
        return result;
    } catch (error) {
        console.error('収集データ作成エラー:', error);
        showToast('登録に失敗しました', 'error');
        throw error;
    }
}

async function updateCollection(id, data) {
    try {
        const result = await SupabaseAPI.updateCollection(id, data);
        if (result.error) throw result.error;
        showToast('更新しました', 'success');
        return result;
    } catch (error) {
        console.error('収集データ更新エラー:', error);
        showToast('更新に失敗しました', 'error');
        throw error;
    }
}

async function deleteCollection(id) {
    try {
        const result = await SupabaseAPI.deleteCollection(id);
        if (result.error) throw result.error;
        showToast('削除しました', 'success');
    } catch (error) {
        console.error('収集データ削除エラー:', error);
        showToast('削除に失敗しました', 'error');
        throw error;
    }
}

async function createVehicle(data) {
    try {
        const result = await SupabaseAPI.createVehicle(data);
        if (result.error) throw result.error;
        showToast('号車を追加しました', 'success');
        return result;
    } catch (error) {
        console.error('号車作成エラー:', error);
        showToast('号車の追加に失敗しました', 'error');
        throw error;
    }
}

async function updateVehicle(id, data) {
    try {
        const result = await SupabaseAPI.updateVehicle(id, data);
        if (result.error) throw result.error;
        showToast('号車を更新しました', 'success');
        return result;
    } catch (error) {
        console.error('号車更新エラー:', error);
        showToast('号車の更新に失敗しました', 'error');
        throw error;
    }
}

async function deleteVehicle(id) {
    try {
        const usedInCollections = collections.some(c => c.vehicle_id === id);
        if (usedInCollections) {
            if (!confirm('この号車は収集依頼で使用されています。本当に削除しますか?')) {
                return;
            }
        }
        
        const result = await SupabaseAPI.deleteVehicle(id);
        if (result.error) throw result.error;
        showToast('号車を削除しました', 'success');
    } catch (error) {
        console.error('号車削除エラー:', error);
        showToast('号車の削除に失敗しました', 'error');
        throw error;
    }
}

async function createAreaRule(data) {
    try {
        const result = await SupabaseAPI.createAreaRule(data);
        if (result.error) throw result.error;
        showToast('ルールを追加しました', 'success');
        return result;
    } catch (error) {
        console.error('地域ルール作成エラー:', error);
        showToast('ルールの追加に失敗しました', 'error');
        throw error;
    }
}

async function updateAreaRule(id, data) {
    try {
        const result = await SupabaseAPI.updateAreaRule(id, data);
        if (result.error) throw result.error;
        showToast('ルールを更新しました', 'success');
        return result;
    } catch (error) {
        console.error('地域ルール更新エラー:', error);
        showToast('ルールの更新に失敗しました', 'error');
        throw error;
    }
}

async function deleteAreaRule(id) {
    try {
        const result = await SupabaseAPI.deleteAreaRule(id);
        if (result.error) throw result.error;
        showToast('ルールを削除しました', 'success');
    } catch (error) {
        console.error('地域ルール削除エラー:', error);
        showToast('ルールの削除に失敗しました', 'error');
        throw error;
    }
}

async function createWasteType(data) {
    try {
        const result = await SupabaseAPI.createWasteType(data);
        if (result.error) throw result.error;
        showToast('ゴミ種類を追加しました', 'success');
        return result;
    } catch (error) {
        console.error('ゴミ種類作成エラー:', error);
        showToast('ゴミ種類の追加に失敗しました', 'error');
        throw error;
    }
}

async function updateWasteType(id, data) {
    try {
        const result = await SupabaseAPI.updateWasteType(id, data);
        if (result.error) throw result.error;
        showToast('ゴミ種類を更新しました', 'success');
        return result;
    } catch (error) {
        console.error('ゴミ種類更新エラー:', error);
        showToast('ゴミ種類の更新に失敗しました', 'error');
        throw error;
    }
}

async function deleteWasteType(id) {
    try {
        const result = await SupabaseAPI.deleteWasteType(id);
        if (result.error) throw result.error;
        showToast('ゴミ種類を削除しました', 'success');
    } catch (error) {
        console.error('ゴミ種類削除エラー:', error);
        showToast('ゴミ種類の削除に失敗しました', 'error');
        throw error;
    }
}
```

---

## ステップ5: ローカルでテスト

### 5-1. HTMLファイルを開く
ブラウザで `index.html` を開く

### 5-2. コンソールを確認
F12キーでコンソールを開き、以下が表示されるか確認：
```
✅ Supabase初期化完了
✅ Supabase APIレイヤー読み込み完了
```

### 5-3. 動作確認
- [ ] 収集一覧が表示される
- [ ] 新規登録ができる
- [ ] 編集・削除ができる
- [ ] 号車管理ができる

エラーが出た場合は、コンソールでエラーメッセージを確認

---

## ステップ6: GitHub Pagesにデプロイ

### 6-1. GitHubリポジトリ作成
1. https://github.com にアクセス
2. 右上の「+」→「New repository」
3. Repository name: `nikoyaka-collection`（任意）
4. Public を選択
5. 「Create repository」をクリック

### 6-2. ファイルをアップロード
1. 「uploading an existing file」をクリック
2. **全ファイル**をドラッグ＆ドロップ
   - index.html
   - css/
   - js/
   - README.md
   - など全て
3. Commit message: 「Initial commit」
4. 「Commit changes」をクリック

### 6-3. GitHub Pagesを有効化
1. リポジトリの「Settings」タブをクリック
2. 左サイドバー「Pages」をクリック
3. **Source**: `Deploy from a branch` を選択
4. **Branch**: `main` を選択、`/(root)` を選択
5. 「Save」をクリック

### 6-4. 公開URLを確認
数分後、以下のURLでアクセス可能：
```
https://あなたのGitHubユーザー名.github.io/nikoyaka-collection/
```

---

## ✅ 最終確認チェックリスト

本番環境（GitHub Pages）で以下を確認：

- [ ] ページが正常に表示される
- [ ] 収集依頼の一覧が表示される
- [ ] 新規登録ができる
- [ ] 編集ができる
- [ ] 削除ができる
- [ ] 号車管理ができる
- [ ] 地域設定ができる
- [ ] ゴミ種類管理ができる
- [ ] 地図表示が動作する
- [ ] OCR機能が動作する

---

## 💰 料金確認

### Supabase無料枠
- データベース: 500MB
- API リクエスト: **月40,000件**
- ストレージ: 1GB

### 使用量の確認方法
Supabase Dashboard → 左下の **Project Settings** → **Usage**

---

## 🆘 トラブルシューティング

### エラー1: "Failed to fetch"
**原因**: Supabase設定が間違っている  
**解決策**: `js/supabase-config.js` のURL・APIキーを再確認

### エラー2: データが表示されない
**原因**: データがインポートされていない  
**解決策**: Supabase Table Editorでデータを確認

### エラー3: "Policy violation"
**原因**: RLSポリシーが設定されていない  
**解決策**: ステップ1のSQLを再実行

### エラー4: GitHub Pagesで404エラー
**原因**: デプロイが完了していない  
**解決策**: 5-10分待ってから再度アクセス

---

## 📞 サポートリソース

- **Supabase公式ドキュメント**: https://supabase.com/docs
- **GitHub Pages公式ドキュメント**: https://docs.github.com/ja/pages

---

**🎉 移行完了！おつかれさまでした！**

これで、サブスク解除後も**完全無料**でアプリが使用できます。
