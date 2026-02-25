// ===========================
// 設定
// ===========================

// Google Maps Geocoding API キー
const GOOGLE_MAPS_API_KEY = 'AIzaSyDYHljyKvkoKIGmnkQnpZ8WX81IX40vCbs';

// Geocoding プロバイダー ('google' または 'nominatim')
const GEOCODING_PROVIDER = 'google';

// ===========================
// グローバル変数と初期化
// ===========================
let collections = [];
let vehicles = [];
let areaRules = [];
let wasteTypes = [];
let currentView = 'collection';
let currentEditId = null;
let currentVehicleId = null;
let currentAreaRuleId = null;
let currentWasteTypeId = null;

// 地図関連
let map = null;
let markers = [];
let userLocationMarker = null;

// 号車ごとの色設定
const vehicleColors = [
    '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea',
    '#0891b2', '#db2777', '#f97316', '#65a30d', '#7c3aed'
];

// ===========================
// ユーティリティ関数
// ===========================

// トーストメッセージ表示
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show';
    
    if (type === 'success') {
        toast.classList.add('success');
    } else if (type === 'error') {
        toast.classList.add('error');
    }
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 日付フォーマット
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}

// 住所から号車を自動割り当て
function autoAssignVehicle(address) {
    if (!address || areaRules.length === 0) return null;
    
    // 優先順位でソート
    const sortedRules = [...areaRules].sort((a, b) => a.priority - b.priority);
    
    // 住所にマッチするルールを探す
    for (const rule of sortedRules) {
        if (address.includes(rule.area_pattern)) {
            return rule.vehicle_id;
        }
    }
    
    return null;
}

// 号車名を取得
function getVehicleName(vehicleId) {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? vehicle.vehicle_number : '未設定';
}

// 号車の色を取得
function getVehicleColor(vehicleId) {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    // 号車に設定された色を使用、なければグレー
    return vehicle && vehicle.color ? vehicle.color : '#64748b';
}

// 曜日選択UIを生成
function generateDayScheduleUI(containerId, selectedDays = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const days = [
        { key: 'monday', label: '月' },
        { key: 'tuesday', label: '火' },
        { key: 'wednesday', label: '水' },
        { key: 'thursday', label: '木' },
        { key: 'friday', label: '金' }
    ];
    
    container.innerHTML = '';
    days.forEach(day => {
        const isChecked = selectedDays[day.key] === true;
        const checkbox = document.createElement('label');
        checkbox.className = 'checkbox-label';
        checkbox.innerHTML = `
            <input type="checkbox" name="${containerId}_${day.key}" ${isChecked ? 'checked' : ''}>
            <span>${day.label}</span>
        `;
        container.appendChild(checkbox);
    });
}

// 曜日選択結果を取得
function getScheduleFromUI(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return {};
    
    const schedule = {};
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    
    days.forEach(day => {
        const checkbox = container.querySelector(`input[name="${containerId}_${day}"]`);
        schedule[day] = checkbox ? checkbox.checked : false;
    });
    
    return schedule;
}

// ===========================
// ジオコーディング関数
// ===========================

// Google Maps Geocoding API
async function geocodeAddressGoogle(address) {
    try {
        console.log(`\n🗺️ ========== Google Maps Geocoding ==========`);
        console.log(`   入力住所: "${address}"`);
        
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}&language=ja&region=jp`;
        
        console.log(`   📡 APIリクエスト送信中...`);
        
        const response = await fetch(url);
        
        console.log(`   📥 API応答ステータス: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`   📦 API応答データ:`, data);
        
        if (data.status === 'OK' && data.results && data.results.length > 0) {
            const result = data.results[0];
            const location = result.geometry.location;
            
            const geocodeResult = {
                lat: location.lat,
                lng: location.lng,
                display_name: result.formatted_address
            };
            
            console.log(`   ✅ 座標取得成功！`);
            console.log(`   📍 緯度: ${geocodeResult.lat}`);
            console.log(`   📍 経度: ${geocodeResult.lng}`);
            console.log(`   📝 表示名: ${geocodeResult.display_name}`);
            console.log(`======================================\n`);
            
            return geocodeResult;
        } else {
            console.warn(`   ⚠️ 住所が見つかりませんでした`);
            console.warn(`   ステータス: ${data.status}`);
            if (data.error_message) {
                console.error(`   エラーメッセージ: ${data.error_message}`);
            }
            console.log(`======================================\n`);
            return null;
        }
    } catch (error) {
        console.error(`   ❌ エラー発生: ${error.message}`);
        console.error(`   ❌ スタックトレース:`, error);
        console.log(`======================================\n`);
        return null;
    }
}

// Nominatim Geocoding API (無料・バックアップ用)
async function geocodeAddressNominatim(address) {
    try {
        console.log(`\n🔍 ========== ジオコーディング ==========`);
        console.log(`   入力住所: "${address}"`);
        
        // 住所を正規化（全角数字を半角に、ハイフンを統一）
        let normalizedAddress = address
            .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
            .replace(/[－−‐]/g, '-')
            .trim();
        
        console.log(`   📝 正規化後の住所: "${normalizedAddress}"`);
        
        // 複数のクエリパターンを試す
        const queries = [
            normalizedAddress + ', 日本',
            normalizedAddress,
            normalizedAddress.replace(/-/g, '番') + ', 日本'
        ];
        
        for (let i = 0; i < queries.length; i++) {
            const query = encodeURIComponent(queries[i]);
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&accept-language=ja`;
            
            console.log(`   📡 API URL (試行${i + 1}/${queries.length}): ${url}`);
            console.log(`   ⏳ APIリクエスト送信中...`);
            
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'NikoyakaCollectionApp/1.0'
                }
            });
            
            console.log(`   📥 API応答ステータス: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                console.error(`   ❌ APIエラー: HTTPステータス ${response.status}`);
                if (response.status === 403) {
                    console.error(`   🚫 Nominatim API のレート制限に達した可能性があります`);
                    console.error(`   💡 1秒に1リクエストまで許可されています`);
                }
                if (i < queries.length - 1) {
                    console.log(`   🔄 次のパターンを試します...`);
                    await new Promise(resolve => setTimeout(resolve, 300));
                    continue;
                }
                throw new Error(`Geocoding failed: ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`   📦 API応答データ:`, data);
            console.log(`   📊 検索結果件数: ${data.length}件`);
            
            // デバッグ: API応答を詳細表示
            if (data.length === 0) {
                console.warn(`   ⚠️ Nominatim APIが住所を認識できませんでした`);
                console.warn(`   📝 クエリ: ${queries[i]}`);
            }
            
            if (data && data.length > 0) {
                const result = {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon),
                    display_name: data[0].display_name
                };
                console.log(`   ✅ 座標取得成功！`);
                console.log(`   📍 緯度: ${result.lat}`);
                console.log(`   📍 経度: ${result.lng}`);
                console.log(`   📝 表示名: ${result.display_name}`);
                console.log(`======================================\n`);
                return result;
            }
            
            // 結果が見つからない場合、次のパターンを試す
            if (i < queries.length - 1) {
                console.log(`   ⚠️ 結果が見つかりませんでした。次のパターンを試します...`);
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        
        console.warn(`   ⚠️ すべてのパターンで座標が見つかりませんでした`);
        console.warn(`   💡 住所が不完全な可能性があります`);
        console.warn(`   💡 推奨フォーマット: 兵庫県西宮市〇〇町1-2-3`);
        
        // フォールバック: 西宮市の住所の場合、おおよその中心座標を返す
        if (normalizedAddress.includes('西宮市')) {
            console.warn(`   🔄 フォールバック: 西宮市の中心座標を使用します`);
            
            // 同じ座標に複数のピンが重ならないよう、わずかにランダムオフセットを追加
            const randomOffset = () => (Math.random() - 0.5) * 0.005; // 約500m以内のランダムオフセット
            
            const fallbackResult = {
                lat: 34.7377 + randomOffset(),
                lng: 135.3416 + randomOffset(),
                display_name: '西宮市中心部（推定位置）'
            };
            console.log(`   ⚠️ フォールバック座標: ${fallbackResult.lat}, ${fallbackResult.lng}`);
            console.log(`======================================\n`);
            return fallbackResult;
        }
        
        console.log(`======================================\n`);
        return null;
    } catch (error) {
        console.error(`   ❌ エラー発生: ${error.message}`);
        console.error(`   ❌ スタックトレース:`, error);
        console.log(`======================================\n`);
        return null;
    }
}

// メインのジオコーディング関数（プロバイダーを切り替え）
async function geocodeAddress(address) {
    if (GEOCODING_PROVIDER === 'google') {
        return await geocodeAddressGoogle(address);
    } else {
        return await geocodeAddressNominatim(address);
    }
}

// スケジュールグリッドを生成
function generateScheduleGrid(containerId, schedule = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const days = [
        { name: 'monday', label: '月曜日' },
        { name: 'tuesday', label: '火曜日' },
        { name: 'wednesday', label: '水曜日' },
        { name: 'thursday', label: '木曜日' },
        { name: 'friday', label: '金曜日' }
    ];
    
    const weeks = [
        { value: 'every', label: '毎週' },
        { value: 'first', label: '第1' },
        { value: 'second', label: '第2' },
        { value: 'third', label: '第3' },
        { value: 'fourth', label: '第4' },
        { value: 'fifth', label: '第5' }
    ];
    
    container.innerHTML = days.map(day => {
        const daySchedule = schedule && schedule[day.name] ? schedule[day.name] : {};
        const enabled = daySchedule.enabled || false;
        const selectedWeeks = daySchedule.weeks || [];
        
        return `
            <div class="schedule-day ${enabled ? 'active' : ''}">
                <div class="schedule-day-header">
                    <input type="checkbox" 
                           id="${containerId}_${day.name}" 
                           data-day="${day.name}"
                           ${enabled ? 'checked' : ''}>
                    <label for="${containerId}_${day.name}">${day.label}</label>
                </div>
                <div class="schedule-options" id="${containerId}_${day.name}_options">
                    ${weeks.map(week => `
                        <label class="schedule-option">
                            <input type="checkbox" 
                                   name="${containerId}_${day.name}_weeks"
                                   value="${week.value}"
                                   ${selectedWeeks.includes(week.value) ? 'checked' : ''}
                                   ${!enabled ? 'disabled' : ''}>
                            <span>${week.label}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
    
    // イベントリスナーを追加
    days.forEach(day => {
        const checkbox = document.getElementById(`${containerId}_${day.name}`);
        if (checkbox) {
            checkbox.addEventListener('change', function() {
                const parent = this.closest('.schedule-day');
                const options = document.querySelectorAll(`input[name="${containerId}_${day.name}_weeks"]`);
                
                if (this.checked) {
                    parent.classList.add('active');
                    options.forEach(opt => opt.disabled = false);
                } else {
                    parent.classList.remove('active');
                    options.forEach(opt => {
                        opt.disabled = true;
                        opt.checked = false;
                    });
                }
            });
        }
    });
}

// スケジュールデータを取得
function getScheduleData(containerId) {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const schedule = {};
    
    days.forEach(day => {
        const checkbox = document.getElementById(`${containerId}_${day}`);
        if (checkbox && checkbox.checked) {
            const weeks = [];
            const weekCheckboxes = document.querySelectorAll(`input[name="${containerId}_${day}_weeks"]:checked`);
            weekCheckboxes.forEach(cb => weeks.push(cb.value));
            
            schedule[day] = {
                enabled: true,
                weeks: weeks
            };
        }
    });
    
    return schedule;
}

// スケジュールを読みやすい文字列に変換
function formatSchedule(schedule) {
    if (!schedule || Object.keys(schedule).length === 0) {
        return 'なし';
    }
    
    const dayNames = {
        monday: '月', tuesday: '火', wednesday: '水', 
        thursday: '木', friday: '金'
    };
    
    const weekNames = {
        every: '毎週', first: '第1', second: '第2', 
        third: '第3', fourth: '第4', fifth: '第5'
    };
    
    const parts = [];
    Object.keys(schedule).forEach(day => {
        const daySchedule = schedule[day];
        
        // 新フォーマット: {enabled: true, weeks: ['every']}
        if (typeof daySchedule === 'object' && daySchedule.enabled && daySchedule.weeks && daySchedule.weeks.length > 0) {
            const weekParts = daySchedule.weeks.map(w => weekNames[w] || w);
            parts.push(`${weekParts.join('・')}${dayNames[day]}`);
        }
        // 旧フォーマット: {monday: true} → 毎週として扱う
        else if (daySchedule === true) {
            parts.push(`毎週${dayNames[day]}`);
        }
    });
    
    return parts.join(', ') || 'なし';
}

// ===========================
// API関数（Supabase版）
// ===========================

// 収集データ取得
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

// 号車データ取得
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

// 地域ルールデータ取得
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

// ゴミ種類データ取得
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

// すべてのデータを取得
async function fetchAllData() {
    await Promise.all([
        fetchCollections(),
        fetchVehicles(),
        fetchAreaRules(),
        fetchWasteTypes()
    ]);
    updateVehicleSelects();
    updateWasteTypeSelects();
    
    // 収集確認の号車選択肢も更新
    if (document.getElementById('confirmVehicle')) {
        updateConfirmVehicleSelect();
    }
}

// 収集データ作成
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

// 収集データ更新
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

// 収集データ削除
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

// 号車作成
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

// 号車更新
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

// 号車削除
async function deleteVehicle(id) {
    try {
        // この号車を使用している収集依頼があるかチェック
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

// 地域ルール作成
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

// 地域ルール更新
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

// 地域ルール削除
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

// ゴミ種類作成
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

// ゴミ種類更新
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

// ゴミ種類削除
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

// ===========================
// UI更新関数
// ===========================

// 統計情報更新
function updateStats() {
    const totalCount = collections.length;
    const pendingCount = collections.filter(c => c.status === '未収集').length;
    const completedCount = collections.filter(c => c.status === '収集済み').length;
    
    document.getElementById('totalCount').textContent = totalCount;
    document.getElementById('pendingCount').textContent = pendingCount;
    document.getElementById('completedCount').textContent = completedCount;
}

// 収集リスト描画
function renderCollections() {
    const listElement = document.getElementById('collectionList');
    
    // フィルター適用
    const filterVehicle = document.getElementById('filterVehicle').value;
    const filterStatus = document.getElementById('filterStatus').value;
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();
    
    let filtered = collections.filter(c => {
        if (filterVehicle && c.vehicle_id !== filterVehicle) return false;
        if (filterStatus && c.status !== filterStatus) return false;
        if (searchQuery) {
            const searchText = `${c.name} ${c.address}`.toLowerCase();
            if (!searchText.includes(searchQuery)) return false;
        }
        return true;
    });
    
    // 収集開始日でソート（新しい順）
    filtered.sort((a, b) => {
        if (!a.start_date) return 1;
        if (!b.start_date) return -1;
        return new Date(b.start_date) - new Date(a.start_date);
    });
    
    if (filtered.length === 0) {
        listElement.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>データがありません</p>
            </div>
        `;
        return;
    }
    
    listElement.innerHTML = filtered.map(item => `
        <div class="collection-card status-${item.status}">
            <div class="collection-header">
                <div class="collection-name">${item.name || '未設定'}</div>
                <button class="collection-status status-${item.status}" onclick="toggleStatus('${item.id}', '${item.status}')" title="クリックでステータス変更">
                    <i class="fas fa-circle"></i>
                    ${item.status}
                    <i class="fas fa-sync-alt status-change-icon"></i>
                </button>
            </div>
            <div class="collection-info">
                <div class="info-row">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${item.address || '未設定'}</span>
                </div>
                ${item.phone ? `
                <div class="info-row">
                    <i class="fas fa-phone"></i>
                    <span>${item.phone}</span>
                </div>
                ` : ''}
                <div class="info-row">
                    <i class="fas fa-calendar"></i>
                    <span>${formatDate(item.start_date)}</span>
                </div>
                <div class="info-row">
                    <i class="fas fa-trash-alt"></i>
                    <span>${item.waste_type || '未設定'}</span>
                </div>
                <div class="info-row">
                    <i class="fas fa-fire"></i>
                    <span>可燃収集: ${formatSchedule(item.combustible_days ? JSON.parse(item.combustible_days) : {})}</span>
                </div>
                ${item.non_combustible_enabled ? `
                <div class="info-row">
                    <i class="fas fa-recycle"></i>
                    <span>不燃収集: ${formatSchedule(item.non_combustible_days ? JSON.parse(item.non_combustible_days) : {})}</span>
                </div>
                ` : ''}
                <div class="info-row">
                    <i class="fas fa-truck"></i>
                    <span class="collection-vehicle">
                        <i class="fas fa-truck-moving"></i>
                        ${getVehicleName(item.vehicle_id)}
                        ${item.manual_assignment ? '<small>(手動)</small>' : '<small>(自動)</small>'}
                    </span>
                </div>
                ${item.notes ? `
                <div class="info-row">
                    <i class="fas fa-sticky-note"></i>
                    <span>${item.notes}</span>
                </div>
                ` : ''}
            </div>
            <div class="collection-actions">
                <button class="btn btn-sm btn-primary" onclick="openEditModal('${item.id}')">
                    <i class="fas fa-edit"></i> 編集
                </button>
                <button class="btn btn-sm btn-secondary" onclick="togglePauseStatus('${item.id}', '${item.status}')">
                    <i class="fas fa-pause-circle"></i> ${item.status === '一時中断' ? '再開' : '一時中断'}
                </button>
                <button class="btn btn-sm btn-danger" onclick="handleDeleteCollection('${item.id}')">
                    <i class="fas fa-trash"></i> 削除
                </button>
            </div>
        </div>
    `).join('');
    
    updateStats();
}

// ステータスをワンクリック変更（未収集 ⇔ 収集済み）
async function toggleStatus(collectionId, currentStatus) {
    const nextStatus = currentStatus === '未収集' ? '収集済み' : '未収集';
    
    try {
        // Supabaseに保存
        await updateCollection(collectionId, { status: nextStatus });
        
        // ローカルデータを更新
        const collection = collections.find(c => c.id === collectionId);
        if (collection) {
            collection.status = nextStatus;
        }
        
        // UI再描画
        renderCollections();
        
        // 収集確認ビューが表示されている場合は再検索
        if (currentView === 'confirmation') {
            searchConfirmations();
        }
        
        showToast(`ステータスを「${nextStatus}」に変更しました`, 'success');
    } catch (error) {
        console.error('ステータス変更エラー:', error);
        showToast('ステータスの変更に失敗しました', 'error');
    }
}

// 一時中断/再開をワンクリック変更
async function togglePauseStatus(collectionId, currentStatus) {
    console.log('🔄 一時中断/再開処理開始:', collectionId, currentStatus);
    const nextStatus = currentStatus === '一時中断' ? '未収集' : '一時中断';
    
    try {
        // Supabaseに保存
        console.log('💾 Supabaseに保存中...', { collectionId, status: nextStatus });
        const result = await SupabaseAPI.updateCollection(collectionId, { status: nextStatus });
        console.log('✅ Supabase保存結果:', result);
        
        if (result.error) {
            console.error('❌ Supabaseエラー:', result.error);
            throw result.error;
        }
        
        // ローカルデータを更新
        const collection = collections.find(c => c.id === collectionId);
        if (collection) {
            collection.status = nextStatus;
        }
        
        // UI再描画
        renderCollections();
        
        // 地図のマーカーも更新
        if (currentView === 'map') {
            updateMapMarkers();
        }
        
        // 収集確認ビューが表示されている場合は再検索
        if (currentView === 'confirmation') {
            searchConfirmations();
        }
        
        showToast(`ステータスを「${nextStatus}」に変更しました`, 'success');
    } catch (error) {
        console.error('❌ ステータス変更エラー:', error);
        console.error('❌ エラー詳細:', JSON.stringify(error, null, 2));
        showToast('ステータスの変更に失敗しました', 'error');
    }
}

// 号車リスト描画
function renderVehicles() {
    const listElement = document.getElementById('vehicleList');
    
    if (vehicles.length === 0) {
        listElement.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-truck"></i>
                <p>号車が登録されていません</p>
            </div>
        `;
        return;
    }
    
    listElement.innerHTML = vehicles.map(vehicle => {
        const schedule = vehicle.schedule ? JSON.parse(vehicle.schedule) : {};
        const scheduleText = formatSchedule(schedule);
        
        const color = getVehicleColor(vehicle.id);
        
        return `
            <div class="vehicle-card">
                <div class="vehicle-info">
                    <div class="vehicle-name">
                        <span class="vehicle-color-badge" style="background: ${color};"></span>
                        ${vehicle.vehicle_number}
                    </div>
                    <div class="vehicle-schedule">
                        稼働: ${scheduleText}
                    </div>
                </div>
                <div class="vehicle-actions">
                    <button class="btn btn-sm btn-primary" onclick="openVehicleModal('${vehicle.id}')">
                        <i class="fas fa-edit"></i> 編集
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="handleDeleteVehicle('${vehicle.id}')">
                        <i class="fas fa-trash"></i> 削除
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// 地域ルールリスト描画
function renderAreaRules() {
    const listElement = document.getElementById('areaRuleList');
    
    if (areaRules.length === 0) {
        listElement.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-map"></i>
                <p>地域ルールが登録されていません</p>
            </div>
        `;
        return;
    }
    
    // 優先順位でソート
    const sorted = [...areaRules].sort((a, b) => a.priority - b.priority);
    
    listElement.innerHTML = sorted.map(rule => `
        <div class="area-rule-card">
            <div class="area-rule-info">
                <div class="area-rule-name">
                    <span class="badge">優先度 ${rule.priority}</span>
                    ${rule.area_pattern}
                </div>
                <div class="area-rule-detail">
                    担当: ${getVehicleName(rule.vehicle_id)}
                </div>
            </div>
            <div class="area-rule-actions">
                <button class="btn btn-sm btn-primary" onclick="openAreaRuleModal('${rule.id}')">
                    <i class="fas fa-edit"></i> 編集
                </button>
                <button class="btn btn-sm btn-danger" onclick="handleDeleteAreaRule('${rule.id}')">
                    <i class="fas fa-trash"></i> 削除
                </button>
            </div>
        </div>
    `).join('');
}

// 号車セレクトボックス更新
function updateVehicleSelects() {
    const selects = [
        document.getElementById('filterVehicle'),
        document.getElementById('addVehicle'),
        document.getElementById('ocrVehicle'),
        document.getElementById('editVehicle'),
        document.getElementById('areaVehicle')
    ];
    
    selects.forEach(select => {
        if (!select) return;
        
        const currentValue = select.value;
        const isFilter = select.id === 'filterVehicle';
        
        // 既存のオプションをクリア(最初のオプションは残す)
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // 号車オプションを追加
        vehicles.forEach(vehicle => {
            const option = document.createElement('option');
            option.value = vehicle.id;
            option.textContent = vehicle.vehicle_number;
            select.appendChild(option);
        });
        
        // 値を復元
        if (currentValue) {
            select.value = currentValue;
        }
    });
}

// ゴミ種類セレクトボックス更新
function updateWasteTypeSelects() {
    const selects = [
        document.getElementById('addWasteType'),
        document.getElementById('ocrWasteType'),
        document.getElementById('editWasteType')
    ];
    
    // 現在有効なゴミ種類のみを取得
    const today = new Date().toISOString().split('T')[0];
    const activeWasteTypes = wasteTypes.filter(wt => {
        if (!wt.is_active) return false;
        if (wt.valid_from && wt.valid_from > today) return false;
        if (wt.valid_until && wt.valid_until < today) return false;
        return true;
    }).sort((a, b) => a.display_order - b.display_order);
    
    selects.forEach(select => {
        if (!select) return;
        
        const currentValue = select.value;
        
        // 既存のオプションをクリア(最初のオプションは残す)
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // ゴミ種類オプションを追加
        activeWasteTypes.forEach(wasteType => {
            const option = document.createElement('option');
            option.value = wasteType.type_name;
            option.textContent = wasteType.type_name;
            select.appendChild(option);
        });
        
        // 値を復元
        if (currentValue) {
            select.value = currentValue;
        }
    });
}

// ゴミ種類リスト描画
function renderWasteTypes() {
    const listElement = document.getElementById('wasteTypeList');
    
    if (wasteTypes.length === 0) {
        listElement.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-recycle"></i>
                <p>ゴミ種類が登録されていません</p>
            </div>
        `;
        return;
    }
    
    // 表示順序でソート
    const sorted = [...wasteTypes].sort((a, b) => a.display_order - b.display_order);
    
    const today = new Date().toISOString().split('T')[0];
    
    listElement.innerHTML = sorted.map(wasteType => {
        let statusText = '';
        let statusClass = '';
        
        if (!wasteType.is_active) {
            statusText = '無効';
            statusClass = 'status-保留';
        } else if (wasteType.valid_from && wasteType.valid_from > today) {
            statusText = `${wasteType.valid_from}から有効`;
            statusClass = 'status-未収集';
        } else if (wasteType.valid_until && wasteType.valid_until < today) {
            statusText = '期限切れ';
            statusClass = 'status-保留';
        } else if (wasteType.valid_until) {
            statusText = `${wasteType.valid_until}まで有効`;
            statusClass = 'status-収集済み';
        } else {
            statusText = '有効';
            statusClass = 'status-収集済み';
        }
        
        return `
            <div class="area-rule-card">
                <div class="area-rule-info">
                    <div class="area-rule-name">
                        <span class="badge">順序 ${wasteType.display_order}</span>
                        ${wasteType.type_name}
                    </div>
                    <div class="area-rule-detail">
                        <span class="collection-status ${statusClass}">${statusText}</span>
                        ${wasteType.valid_from ? `<span style="margin-left: 10px;">開始: ${formatDate(wasteType.valid_from)}</span>` : ''}
                        ${wasteType.valid_until ? `<span style="margin-left: 10px;">終了: ${formatDate(wasteType.valid_until)}</span>` : ''}
                    </div>
                </div>
                <div class="area-rule-actions">
                    <button class="btn btn-sm btn-primary" onclick="openWasteTypeModal('${wasteType.id}')">
                        <i class="fas fa-edit"></i> 編集
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="handleDeleteWasteType('${wasteType.id}')">
                        <i class="fas fa-trash"></i> 削除
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ===========================
// ビュー切り替え
// ===========================

function switchView(viewName) {
    console.log('🔄 ビュー切り替え:', viewName);
    currentView = viewName;
    
    // すべてのビューを非表示
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    
    // ナビゲーションアイテムのアクティブ状態を更新
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // 指定されたビューを表示
    const viewElement = document.getElementById(`${viewName}View`);
    if (viewElement) {
        viewElement.classList.add('active');
        console.log('✅ ビュー表示成功:', viewName);
    } else {
        console.error('❌ ビューが見つかりません:', `${viewName}View`);
    }
    
    // 対応するナビゲーションアイテムをアクティブに
    const navItem = document.querySelector(`[data-view="${viewName}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }
    
    // ビューごとの初期化処理
    if (viewName === 'collection') {
        renderCollections();
    } else if (viewName === 'vehicles') {
        renderVehicles();
    } else if (viewName === 'areas') {
        renderAreaRules();
    } else if (viewName === 'wastetypes') {
        renderWasteTypes();
    } else if (viewName === 'map') {
        console.log('🗺️ 地図ビューに切り替え - initMap()を呼び出し');
        initMap();
    }
}

// ===========================
// モーダル操作
// ===========================

// 編集モーダルを開く
function openEditModal(collectionId) {
    const collection = collections.find(c => c.id === collectionId);
    if (!collection) return;
    
    currentEditId = collectionId;
    
    document.getElementById('editId').value = collection.id;
    document.getElementById('editName').value = collection.name || '';
    document.getElementById('editAddress').value = collection.address || '';
    document.getElementById('editStartDate').value = collection.start_date || '';
    document.getElementById('editVehicle').value = collection.vehicle_id || '';
    document.getElementById('editStatus').value = collection.status || '未収集';
    document.getElementById('editNotes').value = collection.notes || '';
    
    // 可燃収集スケジュールを復元
    const combustibleDays = collection.combustible_days ? JSON.parse(collection.combustible_days) : {};
    generateScheduleGrid('editBurnableSchedule', combustibleDays);
    
    // 不燃収集スケジュールを復元
    const nonCombustibleEnabled = collection.non_combustible_enabled || false;
    document.getElementById('editNonBurnable').checked = nonCombustibleEnabled;
    const nonBurnableContainer = document.getElementById('editNonBurnableScheduleContainer');
    nonBurnableContainer.style.display = nonCombustibleEnabled ? 'block' : 'none';
    
    const nonCombustibleDays = collection.non_combustible_days ? JSON.parse(collection.non_combustible_days) : {};
    generateScheduleGrid('editNonBurnableSchedule', nonCombustibleDays);
    
    document.getElementById('editModal').classList.add('active');
}

// 編集モーダルを閉じる
function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    currentEditId = null;
}

// 号車モーダルを開く(新規または編集)
function openVehicleModal(vehicleId = null) {
    const modal = document.getElementById('vehicleModal');
    const title = document.getElementById('vehicleModalTitle');
    
    if (vehicleId) {
        // 編集モード
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (!vehicle) return;
        
        currentVehicleId = vehicleId;
        title.textContent = '号車編集';
        
        document.getElementById('vehicleId').value = vehicle.id;
        document.getElementById('vehicleNumber').value = vehicle.vehicle_number || '';
        
        // 詳細スケジュールを復元
        const schedule = vehicle.schedule ? JSON.parse(vehicle.schedule) : {};
        generateScheduleGrid('vehicleSchedule', schedule);
        
        // 色を設定
        const color = vehicle.color || vehicleColors[vehicles.indexOf(vehicle) % vehicleColors.length];
        document.getElementById('vehicleColor').value = color;
        document.getElementById('vehicleColorText').value = color;
    } else {
        // 新規モード
        currentVehicleId = null;
        title.textContent = '号車追加';
        
        document.getElementById('vehicleId').value = '';
        document.getElementById('vehicleNumber').value = '';
        
        // デフォルトスケジュール（毎週月〜金）
        const defaultSchedule = {
            monday: { enabled: true, weeks: ['every'] },
            tuesday: { enabled: true, weeks: ['every'] },
            wednesday: { enabled: true, weeks: ['every'] },
            thursday: { enabled: true, weeks: ['every'] },
            friday: { enabled: true, weeks: ['every'] }
        };
        generateScheduleGrid('vehicleSchedule', defaultSchedule);
        
        // デフォルトの色を設定
        const defaultColor = vehicleColors[vehicles.length % vehicleColors.length];
        document.getElementById('vehicleColor').value = defaultColor;
        document.getElementById('vehicleColorText').value = defaultColor;
    }
    
    modal.classList.add('active');
}

// 号車モーダルを閉じる
function closeVehicleModal() {
    document.getElementById('vehicleModal').classList.remove('active');
    currentVehicleId = null;
}

// 地域ルールモーダルを開く(新規または編集)
function openAreaRuleModal(ruleId = null) {
    const modal = document.getElementById('areaRuleModal');
    const title = document.getElementById('areaRuleModalTitle');
    
    if (ruleId) {
        // 編集モード
        const rule = areaRules.find(r => r.id === ruleId);
        if (!rule) return;
        
        currentAreaRuleId = ruleId;
        title.textContent = '地域ルール編集';
        
        document.getElementById('areaRuleId').value = rule.id;
        document.getElementById('areaPattern').value = rule.area_pattern || '';
        document.getElementById('areaVehicle').value = rule.vehicle_id || '';
        document.getElementById('areaPriority').value = rule.priority || 1;
    } else {
        // 新規モード
        currentAreaRuleId = null;
        title.textContent = '地域ルール追加';
        
        document.getElementById('areaRuleId').value = '';
        document.getElementById('areaPattern').value = '';
        document.getElementById('areaVehicle').value = '';
        document.getElementById('areaPriority').value = 1;
    }
    
    modal.classList.add('active');
}

// 地域ルールモーダルを閉じる
function closeAreaRuleModal() {
    document.getElementById('areaRuleModal').classList.remove('active');
    currentAreaRuleId = null;
}

// ゴミ種類モーダルを開く(新規または編集)
function openWasteTypeModal(wasteTypeId = null) {
    const modal = document.getElementById('wasteTypeModal');
    const title = document.getElementById('wasteTypeModalTitle');
    
    if (wasteTypeId) {
        // 編集モード
        const wasteType = wasteTypes.find(wt => wt.id === wasteTypeId);
        if (!wasteType) return;
        
        currentWasteTypeId = wasteTypeId;
        title.textContent = 'ゴミ種類編集';
        
        document.getElementById('wasteTypeId').value = wasteType.id;
        document.getElementById('wasteTypeName').value = wasteType.type_name || '';
        document.getElementById('wasteDisplayOrder').value = wasteType.display_order || 1;
        document.getElementById('wasteValidFrom').value = wasteType.valid_from || '';
        document.getElementById('wasteValidUntil').value = wasteType.valid_until || '';
    } else {
        // 新規モード
        currentWasteTypeId = null;
        title.textContent = 'ゴミ種類追加';
        
        document.getElementById('wasteTypeId').value = '';
        document.getElementById('wasteTypeName').value = '';
        document.getElementById('wasteDisplayOrder').value = wasteTypes.length + 1;
        document.getElementById('wasteValidFrom').value = '';
        document.getElementById('wasteValidUntil').value = '';
    }
    
    modal.classList.add('active');
}

// ゴミ種類モーダルを閉じる
function closeWasteTypeModal() {
    document.getElementById('wasteTypeModal').classList.remove('active');
    currentWasteTypeId = null;
}

// ===========================
// フォーム送信ハンドラー
// ===========================

// 新規収集依頼登録
async function handleAddForm(e) {
    e.preventDefault();
    
    console.log('📝 新規登録フォーム送信開始');
    
    const name = document.getElementById('addName').value;
    const address = document.getElementById('addAddress').value;
    const startDate = document.getElementById('addStartDate').value;
    let vehicleId = document.getElementById('addVehicle').value;
    const notes = document.getElementById('addNotes').value;
    
    console.log('📊 登録データ:', { name, address, startDate, notes });
    
    // 可燃収集スケジュールを取得
    const burnableSchedule = getScheduleData('addBurnableSchedule');
    
    // 不燃収集の情報を取得
    const nonBurnable = document.getElementById('addNonBurnable').checked;
    const nonBurnableSchedule = nonBurnable ? getScheduleData('addNonBurnableSchedule') : {};
    
    // 号車が未選択の場合は自動割り当て
    let manualAssignment = false;
    if (!vehicleId) {
        vehicleId = autoAssignVehicle(address);
        if (!vehicleId && vehicles.length > 0) {
            vehicleId = vehicles[0].id;
        }
    } else {
        manualAssignment = true;
    }
    
    const data = {
        name,
        address,
        start_date: startDate,
        waste_type: '収集依頼', // デフォルト値
        combustible_days: JSON.stringify(burnableSchedule),
        non_combustible_enabled: nonBurnable,
        non_combustible_days: JSON.stringify(nonBurnableSchedule),
        vehicle_id: vehicleId,
        status: '未収集',
        manual_assignment: manualAssignment,
        notes
    };
    
    try {
        console.log('🔄 登録リクエスト送信中...');
        await createCollection(data);
        console.log('✅ 登録成功');
        
        await fetchCollections();
        renderCollections();
        
        // フォームをリセット
        e.target.reset();
        
        // 住所欄に「兵庫県西宮市」をデフォルトで再設定
        document.getElementById('addAddress').value = '兵庫県西宮市';
        
        generateScheduleGrid('addBurnableSchedule');
        generateScheduleGrid('addNonBurnableSchedule');
        document.getElementById('addNonBurnableScheduleContainer').style.display = 'none';
        
        showToast('登録しました', 'success');
        
        // 収集一覧ビューに切り替え
        switchView('collection');
    } catch (error) {
        console.error('❌ 登録エラー:', error);
        showToast('登録に失敗しました: ' + error.message, 'error');
    }
}

// 収集依頼編集
async function handleEditForm(e) {
    e.preventDefault();
    
    console.log('📝 編集フォーム送信開始');
    
    if (!currentEditId) {
        console.error('❌ currentEditIdが設定されていません');
        return;
    }
    
    const collection = collections.find(c => c.id === currentEditId);
    if (!collection) {
        console.error('❌ 収集依頼が見つかりません:', currentEditId);
        return;
    }
    
    const name = document.getElementById('editName').value;
    const address = document.getElementById('editAddress').value;
    const startDate = document.getElementById('editStartDate').value;
    const vehicleId = document.getElementById('editVehicle').value;
    const status = document.getElementById('editStatus').value;
    const notes = document.getElementById('editNotes').value;
    
    console.log('📊 編集データ:', { name, address, startDate, vehicleId, status });
    
    // 可燃収集スケジュールを取得
    const burnableSchedule = getScheduleData('editBurnableSchedule');
    
    // 不燃収集の情報を取得
    const nonBurnable = document.getElementById('editNonBurnable').checked;
    const nonBurnableSchedule = nonBurnable ? getScheduleData('editNonBurnableSchedule') : {};
    
    const data = {
        ...collection,
        name,
        address,
        start_date: startDate,
        waste_type: collection.waste_type || '収集依頼',
        combustible_days: JSON.stringify(burnableSchedule),
        non_combustible_enabled: nonBurnable,
        non_combustible_days: JSON.stringify(nonBurnableSchedule),
        vehicle_id: vehicleId,
        status,
        notes,
        manual_assignment: true,
        // 既存の座標を保持（ピン修正機能で変更される）
        latitude: collection.latitude,
        longitude: collection.longitude
    };
    
    try {
        console.log('🔄 更新リクエスト送信中...');
        await updateCollection(currentEditId, data);
        console.log('✅ 更新成功');
        
        await fetchCollections();
        renderCollections();
        closeEditModal();
        showToast('更新しました', 'success');
    } catch (error) {
        console.error('❌ 更新エラー:', error);
        showToast('更新に失敗しました: ' + error.message, 'error');
    }
}

// 収集依頼削除
async function handleDeleteCollection(id) {
    if (!confirm('本当に削除しますか?')) return;
    
    try {
        await deleteCollection(id);
        await fetchCollections();
        renderCollections();
    } catch (error) {
        console.error('削除エラー:', error);
    }
}

// 号車フォーム送信
async function handleVehicleForm(e) {
    e.preventDefault();
    
    const vehicleNumber = document.getElementById('vehicleNumber').value;
    const color = document.getElementById('vehicleColor').value;
    
    // 詳細スケジュールを取得
    const schedule = getScheduleData('vehicleSchedule');
    
    const data = {
        vehicle_number: vehicleNumber,
        is_active: true,
        color: color,
        schedule: JSON.stringify(schedule)
    };
    
    try {
        if (currentVehicleId) {
            // 編集
            const vehicle = vehicles.find(v => v.id === currentVehicleId);
            await updateVehicle(currentVehicleId, { ...vehicle, ...data });
        } else {
            // 新規
            await createVehicle(data);
        }
        
        await fetchVehicles();
        updateVehicleSelects();
        renderVehicles();
        renderMapLegend(); // 凡例を更新
        updateMapMarkers(); // 地図のマーカーを更新
        closeVehicleModal();
    } catch (error) {
        console.error('号車保存エラー:', error);
    }
}

// 号車削除
async function handleDeleteVehicle(id) {
    if (!confirm('本当に削除しますか?')) return;
    
    try {
        await deleteVehicle(id);
        await fetchVehicles();
        updateVehicleSelects();
        renderVehicles();
    } catch (error) {
        console.error('号車削除エラー:', error);
    }
}

// 地域ルールフォーム送信
async function handleAreaRuleForm(e) {
    e.preventDefault();
    
    const areaPattern = document.getElementById('areaPattern').value;
    const vehicleId = document.getElementById('areaVehicle').value;
    const priority = parseInt(document.getElementById('areaPriority').value);
    
    const data = {
        area_pattern: areaPattern,
        vehicle_id: vehicleId,
        priority: priority
    };
    
    try {
        if (currentAreaRuleId) {
            // 編集
            const rule = areaRules.find(r => r.id === currentAreaRuleId);
            await updateAreaRule(currentAreaRuleId, { ...rule, ...data });
        } else {
            // 新規
            await createAreaRule(data);
        }
        
        await fetchAreaRules();
        renderAreaRules();
        closeAreaRuleModal();
    } catch (error) {
        console.error('地域ルール保存エラー:', error);
    }
}

// 地域ルール削除
async function handleDeleteAreaRule(id) {
    if (!confirm('本当に削除しますか?')) return;
    
    try {
        await deleteAreaRule(id);
        await fetchAreaRules();
        renderAreaRules();
    } catch (error) {
        console.error('地域ルール削除エラー:', error);
    }
}

// ゴミ種類フォーム送信
async function handleWasteTypeForm(e) {
    e.preventDefault();
    
    const typeName = document.getElementById('wasteTypeName').value;
    const displayOrder = parseInt(document.getElementById('wasteDisplayOrder').value);
    const validFrom = document.getElementById('wasteValidFrom').value;
    const validUntil = document.getElementById('wasteValidUntil').value;
    
    const data = {
        type_name: typeName,
        is_active: true,
        display_order: displayOrder,
        valid_from: validFrom,
        valid_until: validUntil
    };
    
    try {
        if (currentWasteTypeId) {
            // 編集
            const wasteType = wasteTypes.find(wt => wt.id === currentWasteTypeId);
            await updateWasteType(currentWasteTypeId, { ...wasteType, ...data });
        } else {
            // 新規
            await createWasteType(data);
        }
        
        await fetchWasteTypes();
        updateWasteTypeSelects();
        renderWasteTypes();
        closeWasteTypeModal();
    } catch (error) {
        console.error('ゴミ種類保存エラー:', error);
    }
}

// ゴミ種類削除
async function handleDeleteWasteType(id) {
    if (!confirm('本当に削除しますか?')) return;
    
    try {
        await deleteWasteType(id);
        await fetchWasteTypes();
        updateWasteTypeSelects();
        renderWasteTypes();
    } catch (error) {
        console.error('ゴミ種類削除エラー:', error);
    }
}

// ===========================
// OCR機能
// ===========================

let currentImageFile = null;

// 画像前処理（適応的二値化 - v1.2.6 改良版）
async function preprocessImage(file) {
    return new Promise((resolve, reject) => {
        // タイムアウト設定（45秒）
        const timeout = setTimeout(() => {
            console.error('❌ 画像処理タイムアウト（45秒）');
            reject(new Error('画像処理がタイムアウトしました。画像サイズを小さくしてください。'));
        }, 45000);
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                try {
                    console.log('🖼️ 画像処理開始:', {
                        元サイズ: `${img.width}x${img.height}`
                    });
                    
                    // Canvasで画像を処理
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // 解像度を上げる（最大3倍、最大3000px）- 精度重視
                    const maxDimension = Math.max(img.width, img.height);
                    const scale = Math.min(3.0, 3000 / maxDimension);
                    canvas.width = Math.floor(img.width * scale);
                    canvas.height = Math.floor(img.height * scale);
                    
                    console.log('📊 スケール:', `${scale.toFixed(2)}倍`, `処理後: ${canvas.width}x${canvas.height}`);
                    
                    // 画像を描画
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    
                    // ピクセルデータを取得
                    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    let data = imageData.data;
                    
                    // ステップ1: グレースケール化
                    console.log('📊 ステップ1: グレースケール化');
                    for (let i = 0; i < data.length; i += 4) {
                        const gray = Math.floor(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
                        data[i] = gray;
                        data[i + 1] = gray;
                        data[i + 2] = gray;
                    }
                    
                    // ステップ2: 平均輝度を計算
                    console.log('📊 ステップ2: 輝度計算');
                    let sum = 0;
                    const pixelCount = data.length / 4;
                    for (let i = 0; i < data.length; i += 4) {
                        sum += data[i];
                    }
                    const avgBrightness = sum / pixelCount;
                    
                    // ステップ3: 適応的二値化（平均の90%を閾値に）
                    const threshold = avgBrightness * 0.9;
                    console.log('📊 ステップ3: 適応的二値化（閾値:', Math.round(threshold), ')');
                    
                    for (let i = 0; i < data.length; i += 4) {
                        const value = data[i] > threshold ? 255 : 0;
                        data[i] = value;
                        data[i + 1] = value;
                        data[i + 2] = value;
                    }
                    
                    ctx.putImageData(imageData, 0, 0);
                    console.log('✅ 画像前処理完了');
                    
                    // CanvasをBlobに変換
                    canvas.toBlob(blob => {
                        clearTimeout(timeout);
                        if (blob) {
                            console.log('✅ Blob変換成功:', (blob.size / 1024).toFixed(2), 'KB');
                            resolve(blob);
                        } else {
                            console.error('❌ Blob変換失敗');
                            reject(new Error('Blob変換に失敗しました'));
                        }
                    }, 'image/png', 0.95);
                } catch (error) {
                    clearTimeout(timeout);
                    console.error('❌ 画像処理エラー:', error);
                    reject(error);
                }
            };
            img.onerror = () => {
                clearTimeout(timeout);
                console.error('❌ 画像読み込みエラー');
                reject(new Error('画像の読み込みに失敗しました'));
            };
            img.src = e.target.result;
        };
        reader.onerror = () => {
            clearTimeout(timeout);
            console.error('❌ ファイル読み込みエラー');
            reject(new Error('ファイルの読み込みに失敗しました'));
        };
        reader.readAsDataURL(file);
    });
}

// OCRファイル選択
function handleOCRFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    currentImageFile = file;
    
    // プレビュー表示
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('ocrImage').src = e.target.result;
        document.getElementById('uploadArea').style.display = 'none';
        document.getElementById('ocrPreview').style.display = 'block';
        document.getElementById('ocrResult').style.display = 'none';
        document.getElementById('ocrProgress').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

// OCR処理開始
async function processOCR() {
    if (!currentImageFile) return;
    
    // UI更新
    document.getElementById('ocrPreview').style.display = 'none';
    document.getElementById('ocrProgress').style.display = 'block';
    document.getElementById('ocrProgressText').textContent = 'OCRライブラリを初期化中...';
    
    let worker = null;
    
    try {
        // 画像の前処理（コントラスト強化）
        document.getElementById('ocrProgressText').textContent = '画像を最適化中... (1/3)';
        console.log('🔧 画像最適化開始');
        const processedImage = await preprocessImage(currentImageFile);
        console.log('✅ 画像最適化完了');
        
        // Tesseract.jsで日本語+英語OCR（数字認識精度向上）
        document.getElementById('ocrProgressText').textContent = '日本語・英語認識エンジンを読み込み中... (2/3)';
        console.log('📚 OCRエンジン読み込み開始');
        worker = await Tesseract.createWorker(['jpn', 'eng'], 1, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    const progress = Math.round(m.progress * 100);
                    document.getElementById('ocrProgressText').textContent = `テキストを認識中... (3/3) ${progress}%`;
                }
            }
        });
        console.log('✅ OCRエンジン読み込み完了');
        
        // Tesseract.jsのパラメータ設定（精度最大化）
        await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.AUTO, // 自動レイアウト検出
            preserve_interword_spaces: '1', // 単語間スペース保持
            tessedit_char_whitelist: '', // ホワイトリストなし（全文字許可）
            // 日本語認識を優先
            language_model_penalty_non_dict_word: '0.5',
            language_model_penalty_non_freq_dict_word: '0.5',
        });
        
        document.getElementById('ocrProgressText').textContent = '画像を解析中...';
        
        // 画像を認識（前処理済み画像を使用）
        const { data: { text, confidence } } = await worker.recognize(processedImage);
        
        console.log('===== OCR認識結果 =====');
        console.log('全テキスト:');
        console.log(text);
        console.log('認識精度:', confidence + '%');
        console.log('====================');
        
        await worker.terminate();
        worker = null;
        
        // 空のテキストチェック
        if (!text || text.trim().length === 0) {
            throw new Error('テキストが検出されませんでした。画像の品質を確認してください。');
        }
        
        // テキストから情報を抽出
        const extractedData = extractDataFromText(text);
        
        // フォームに設定
        document.getElementById('ocrName').value = extractedData.name || '';
        
        // 信頼度表示
        const confidenceText = `認識精度: ${Math.round(confidence)}%`;
        const confidenceColor = confidence > 80 ? 'var(--success-color)' : confidence > 60 ? 'var(--warning-color)' : 'var(--danger-color)';
        
        if (extractedData.name) {
            document.getElementById('ocrNameConfidence').textContent = `✓ ${confidenceText}`;
            document.getElementById('ocrNameConfidence').style.color = confidenceColor;
        } else {
            document.getElementById('ocrNameConfidence').textContent = '⚠ 名前が検出されませんでした';
            document.getElementById('ocrNameConfidence').style.color = 'var(--danger-color)';
        }
        
        // 住所の処理：OCRで読み取った住所に「兵庫県西宮市」を自動追加
        let fullAddress = '';
        if (extractedData.address) {
            const address = extractedData.address.trim();
            // すでに「兵庫県」または「西宮市」が含まれていない場合のみ追加
            if (!address.includes('兵庫県') && !address.includes('西宮市')) {
                fullAddress = '兵庫県西宮市' + address;
                console.log(`📍 住所に「兵庫県西宮市」を追加: ${address} → ${fullAddress}`);
            } else {
                fullAddress = address;
            }
        } else {
            // 住所が空の場合はデフォルト値を設定
            fullAddress = '兵庫県西宮市';
        }
        document.getElementById('ocrAddress').value = fullAddress;
        
        if (extractedData.address) {
            document.getElementById('ocrAddressConfidence').textContent = `✓ ${confidenceText}`;
            document.getElementById('ocrAddressConfidence').style.color = confidenceColor;
        } else {
            document.getElementById('ocrAddressConfidence').textContent = '⚠ 住所が検出されませんでした';
            document.getElementById('ocrAddressConfidence').style.color = 'var(--danger-color)';
        }
        
        document.getElementById('ocrStartDate').value = extractedData.startDate || '';
        
        if (extractedData.startDate) {
            document.getElementById('ocrDateConfidence').textContent = `✓ ${confidenceText}`;
            document.getElementById('ocrDateConfidence').style.color = confidenceColor;
        } else {
            document.getElementById('ocrDateConfidence').textContent = '⚠ 日付が検出されませんでした';
            document.getElementById('ocrDateConfidence').style.color = 'var(--danger-color)';
        }
        
        // ゴミ種類に応じてチェックボックスとスケジュールコンテナを設定
        if (extractedData.wasteType) {
            const wasteType = extractedData.wasteType;
            if (wasteType.includes('もやす') || wasteType.includes('可燃')) {
                document.getElementById('ocrCombustible').checked = true;
                document.getElementById('ocrCombustibleScheduleContainer').style.display = 'block';
            }
            if (wasteType.includes('もやさない') || wasteType.includes('不燃')) {
                document.getElementById('ocrNonCombustible').checked = true;
                document.getElementById('ocrNonCombustibleScheduleContainer').style.display = 'block';
            }
        }
        
        // 住所から号車を自動割り当て（完全な住所を使用）
        if (fullAddress) {
            const vehicleId = autoAssignVehicle(fullAddress);
            if (vehicleId) {
                document.getElementById('ocrVehicle').value = vehicleId;
            }
        }
        
        // 結果表示
        document.getElementById('ocrProgress').style.display = 'none';
        document.getElementById('ocrResult').style.display = 'block';
        
        // 認識精度の警告
        if (confidence < 70) {
            showToast('読み取りが完了しましたが、精度が低い可能性があります。内容を確認してください。', 'error');
        } else {
            showToast('読み取りが完了しました。内容を確認してください。', 'success');
        }
    } catch (error) {
        console.error('OCRエラー:', error);
        
        // エラーメッセージを詳細化
        let errorMessage = '読み取りに失敗しました';
        if (error.message) {
            errorMessage += ': ' + error.message;
        }
        
        showToast(errorMessage, 'error');
        
        // Workerをクリーンアップ
        if (worker) {
            try {
                await worker.terminate();
            } catch (e) {
                console.error('Worker終了エラー:', e);
            }
        }
        
        // エラー時はプレビューに戻す
        document.getElementById('ocrProgress').style.display = 'none';
        document.getElementById('ocrPreview').style.display = 'block';
    }
}

// テキストからデータを抽出
function extractDataFromText(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const data = {
        name: '',
        address: '',
        startDate: '',
        wasteType: ''
    };
    
    // 全テキストを結合(複数行にまたがる場合の対応)
    const fullText = text.replace(/\n/g, ' ');
    
    console.log('=== OCRテキスト解析開始 ===');
    console.log('全テキスト:', text);
    console.log('全テキスト（生データ）:', JSON.stringify(text));
    console.log('行数:', lines.length);
    console.log('--- 全行の内容（詳細）---');
    
    // デバッグ情報を画面に表示
    let debugInfo = '=== OCR認識テキスト ===\n\n';
    debugInfo += '【全体】\n' + text + '\n\n';
    debugInfo += '【行ごと】\n';
    
    lines.forEach((line, idx) => {
        console.log(`行${idx}: "${line}" (長さ:${line.length}, 文字コード:${line.split('').map(c => c.charCodeAt(0)).join(',')})`);
        debugInfo += `行${idx}: "${line}"\n`;
    });
    
    // 画面に表示
    const debugElement = document.getElementById('ocrDebugText');
    if (debugElement) {
        debugElement.textContent = debugInfo;
    }
    
    console.log('--- 名前抽出開始 ---');
    
    // 名前を抽出（にこやか収集フォーマット対応 - 超厳格版v3）
    // 除外するキーワード（絶対に名前として認識してはいけないもの）
    const excludeNames = [
        'にこやか', 'ニコヤカ', '収集', '依頼', 'お願い', 'よろしく', 'ありがとう',
        '管理', 'システム', '番号', '記入', '記載', '確認', 'チェック', '提出',
        '受付', '担当', '処理', '登録', '申込', '申請', 'フォーム',
        '上記', '以外', '上記以外', '該当', '選択', '指定', '記号', '印',
        '以下', '下記', '別紙', '添付', '参照', '詳細', '備考', '注意'
    ];
    
    // 「にこやか収集」の行位置を記録（その直後の行は名前候補から除外）
    let nikoyakaLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('にこやか') || lines[i].includes('ニコヤカ')) {
            nikoyakaLineIndex = i;
            console.log('⚠️ にこやか収集の行を検出:', i, '行目 -', lines[i]);
            break;
        }
    }
    
    // まず「氏名」キーワードの位置を特定（より柔軟に）
    // 「にこやか収集」の行より後ろから探す
    let nameKeywordIndex = -1;
    const startSearchIndex = nikoyakaLineIndex >= 0 ? nikoyakaLineIndex + 1 : 0;
    
    for (let i = startSearchIndex; i < lines.length; i++) {
        const line = lines[i];
        // パターン1: 「氏名」が完全一致（スペースあり・なし）
        if (line.match(/^氏\s*名\s*$/)) {
            nameKeywordIndex = i;
            console.log('📌 氏名キーワード位置（完全一致）:', i, '行目');
            break;
        }
        // パターン2: 「氏名」を含む行（例: 「氏　名　　樋野 園子」）
        if (line.match(/氏\s*名/)) {
            nameKeywordIndex = i;
            console.log('📌 氏名キーワード位置（含む）:', i, '行目');
            break;
        }
    }
    
    // 「氏名」が見つからない、または同一行に名前がない場合
    // 「名」と「住所」の間の行を名前として扱う（OCR誤認識対応）
    if (!data.name && nameKeywordIndex < 0) {
        console.log('⚠️ 氏名キーワードが見つかりません。名・住所の間を探索します');
        let meiIndex = -1;  // 「名」の位置
        let addressIndex = -1;
        
        for (let i = startSearchIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // 「名」単独、または「名」を含む行（「氏名」「名前」以外）
            if (line.includes('名') && !line.includes('氏名') && meiIndex < 0) {
                meiIndex = i;
                console.log('📌 「名」を検出:', i, '行目 -', line);
            }
            // 「住所」を検出
            if ((line.match(/住\s*所/) || line.includes('住所')) && addressIndex < 0) {
                addressIndex = i;
                console.log('📌 「住所」を検出:', i, '行目 -', line);
                break;
            }
        }
        
        // 「名」が同一行に名前を含んでいるかチェック
        if (meiIndex >= 0) {
            const nameLine = lines[meiIndex].trim();
            console.log('🔍 「名」を含む行を解析:', nameLine);
            
            // 「名」を削除して残った部分を取得
            let afterMei = nameLine.replace(/名\s*/g, '');
            // 先頭のスペースや記号を削除
            afterMei = afterMei.replace(/^[\s　:：]+/, '');
            console.log('  「名」削除後:', afterMei);
            
            // アルファベットや数字以外の日本語部分を抽出
            // OCR誤認識（EEなど）も含めて抽出
            if (afterMei.length >= 2) {
                // まずスペースで分割して、各部分をチェック（OCR誤認識対応を優先）
                const parts = afterMei.split(/\s+/).filter(p => p.length > 0);
                let nameParts = [];
                
                console.log('  スペース分割後:', parts);
                
                for (const part of parts) {
                    // 日本語を含む、または2文字以上のアルファベット（OCR誤認識の可能性）
                    if (part.match(/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/) || 
                        part.match(/^[A-Za-z]{2,}$/)) {
                        nameParts.push(part);
                        console.log('    追加:', part);
                    } else {
                        console.log('    スキップ:', part);
                    }
                }
                
                if (nameParts.length > 0) {
                    const combined = nameParts.join(' ');
                    console.log('  結合結果:', combined);
                    
                    // 除外ワードチェック
                    let hasExclude = false;
                    for (const exclude of excludeNames) {
                        if (combined.includes(exclude)) {
                            hasExclude = true;
                            break;
                        }
                    }
                    
                    if (!hasExclude && combined.length >= 2) {
                        data.name = combined;
                        
                        // アルファベットが含まれている場合は警告
                        if (combined.match(/[A-Za-z]/)) {
                            console.log('✅ 名前検出（OCR誤認識含む）:', data.name);
                            console.log('⚠️ 注意: アルファベットが含まれています。手動で確認してください');
                        } else {
                            console.log('✅ 名前検出（名を含む行）:', data.name);
                        }
                        console.log('✅✅✅ 名前検出成功:', data.name, '✅✅✅');
                    }
                } else {
                    // 分割できない場合は全体を使用
                    console.log('  分割結果なし、全体を使用:', afterMei);
                    
                    // 除外ワードチェック
                    let hasExclude = false;
                    for (const exclude of excludeNames) {
                        if (afterMei.includes(exclude)) {
                            hasExclude = true;
                            break;
                        }
                    }
                    
                    if (!hasExclude && afterMei.length >= 2) {
                        data.name = afterMei;
                        console.log('✅ 名前検出（名を含む行・全体）:', data.name);
                        console.log('✅✅✅ 名前検出成功:', data.name, '✅✅✅');
                    }
                }
            }
        }
        
        // 「名」と「住所」の間にある全ての行をチェック
        if (!data.name && meiIndex >= 0 && addressIndex >= 0) {
            console.log(`🔍 名(${meiIndex}行目)と住所(${addressIndex}行目)の間をチェック`);
            
            for (let i = meiIndex + 1; i < addressIndex; i++) {
                const candidateLine = lines[i].trim();
                console.log(`  行${i}をチェック: "${candidateLine}"`);
                
                if (candidateLine.length === 0) {
                    console.log('    ❌ 空行');
                    continue;
                }
                
                // にこやか収集の直後をスキップ
                if (nikoyakaLineIndex >= 0 && i === nikoyakaLineIndex + 1) {
                    console.log('    ❌ にこやか収集の直後');
                    continue;
                }
                
                // 除外ワードチェック
                let hasExclude = false;
                for (const exclude of excludeNames) {
                    if (candidateLine.includes(exclude)) {
                        hasExclude = true;
                        console.log(`    ❌ 除外ワード: ${exclude}`);
                        break;
                    }
                }
                if (hasExclude) continue;
                
                // 「氏名」「名前」などのラベルではないか
                if (candidateLine.match(/^[氏名前]+\s*$/)) {
                    console.log('    ❌ ラベル行');
                    continue;
                }
                
                // 何らかの文字を含むか（日本語またはアルファベット）
                if (candidateLine.length >= 2) {
                    const cleaned = candidateLine.replace(/様|さん|殿/g, '').trim();
                    if (cleaned.length >= 2) {
                        data.name = cleaned;
                        console.log('✅ 名前検出（名と住所の間）:', data.name);
                        console.log('✅✅✅ 名前検出成功:', data.name, '✅✅✅');
                        break;
                    } else {
                        console.log(`    ❌ 長さ不足: ${cleaned.length}文字`);
                    }
                } else {
                    console.log('    ❌ 文字数不足');
                }
            }
        } else {
            console.log('⚠️ 名または住所が見つかりませんでした');
            if (meiIndex >= 0) console.log('  名の位置:', meiIndex);
            if (addressIndex >= 0) console.log('  住所の位置:', addressIndex);
        }
    }
    
    // パターン0: 「氏名」と名前が同じ行にある場合（最優先）
    // 例: 「氏　名　　樋野 園子」
    if (nameKeywordIndex >= 0 && !data.name) {
        const line = lines[nameKeywordIndex];
        console.log('🔍 パターン0開始: 氏名と名前が同一行か確認');
        console.log('  対象行:', line);
        console.log('  対象行（生データ）:', JSON.stringify(line));
        
        // より柔軟なマッチング - 「氏名」の後にある日本語文字を全て抽出
        // まず「氏名」以降の部分を取得
        let afterShimei = line;
        
        // 「氏名」を削除（スペースがあってもなくても対応）
        afterShimei = afterShimei.replace(/氏\s*名\s*/g, '');
        console.log('  「氏名」削除後:', afterShimei);
        
        // 先頭のスペースや記号を削除
        afterShimei = afterShimei.replace(/^[\s　:：]+/, '');
        console.log('  先頭スペース削除後:', afterShimei);
        
        // 残った文字列から日本語部分のみを抽出
        const japaneseMatch = afterShimei.match(/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\s　]+/);
        if (japaneseMatch) {
            const extracted = japaneseMatch[0].trim();
            console.log('  抽出された日本語部分:', extracted);
            
            // 除外キーワードチェック
            let hasExclude = false;
            for (const exclude of excludeNames) {
                if (extracted.includes(exclude)) {
                    hasExclude = true;
                    console.log(`  ❌ 除外ワード検出: "${exclude}"`);
                    break;
                }
            }
            
            if (!hasExclude && extracted.length >= 2) {
                const cleaned = extracted.replace(/様|さん|殿/g, '').trim();
                if (cleaned.length >= 2) {
                    data.name = cleaned;
                    console.log('✅ 名前検出（氏名同一行）:', data.name);
                    console.log('✅✅✅ 名前検出成功:', data.name, '✅✅✅');
                } else {
                    console.log('  ❌ 敬称削除後の長さが不足:', cleaned);
                }
            } else {
                console.log('  ❌ 除外ワードまたは長さ不足');
            }
        } else {
            console.log('  ❌ 日本語部分が見つかりません');
        }
    }
    
    // パターン1: 「氏名」キーワードの直後の行から名前を取得（最優先・最厳格）
    if (nameKeywordIndex >= 0 && !data.name) {
        // 「氏名」の1〜3行後を探索（空行をスキップ）
        for (let offset = 1; offset <= 3; offset++) {
            const idx = nameKeywordIndex + offset;
            if (idx >= lines.length) break;
            
            const candidateLine = lines[idx].trim();
            console.log(`🔍 氏名+${offset}行後をチェック:`, candidateLine);
            
            // 空行はスキップ
            if (candidateLine.length === 0) continue;
            
            // 「にこやか収集」の直後の行はスキップ
            if (nikoyakaLineIndex >= 0 && idx === nikoyakaLineIndex + 1) {
                console.log(`❌ にこやか収集の直後の行をスキップ: "${candidateLine}"`);
                continue;
            }
            
            // 除外キーワードを含む行はスキップ
            let hasExcludeWord = false;
            for (const exclude of excludeNames) {
                if (candidateLine.includes(exclude)) {
                    console.log(`❌ 除外ワード検出: "${exclude}" in "${candidateLine}"`);
                    hasExcludeWord = true;
                    break;
                }
            }
            if (hasExcludeWord) continue;
            
            // 他のフィールドキーワードを含む行はスキップ
            if (candidateLine.match(/住所|電話|開始|場所|曜日|ゴミ|もやす|もやさない|可燃|不燃|令和|平成|年|月|日|番号/)) {
                console.log(`❌ フィールドキーワード検出 in "${candidateLine}"`);
                continue;
            }
            
            // 敬称を除去
            const cleaned = candidateLine.replace(/様|さん|殿/g, '').trim();
            
            // 人名として妥当な長さか（2〜15文字に緩和）
            if (cleaned.length >= 2 && cleaned.length <= 15) {
                // 日本語文字（漢字・ひらがな・カタカナ・スペース）のみで構成されているか
                if (cleaned.match(/^[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\s　]+$/)) {
                    data.name = cleaned;
                    console.log('✅ 名前検出(氏名キーワードの直後):', data.name);
                    console.log('✅✅✅ 名前検出成功:', data.name, '✅✅✅');
                    break;
                } else {
                    console.log(`❌ 日本語文字のみではない: "${cleaned}"`);
                }
            } else {
                console.log(`❌ 長さが不適切: "${cleaned}" (${cleaned.length}文字、必要: 2-15文字)`);
            }
        }
        
        if (!data.name) {
            console.log('⚠️ パターン1: 氏名キーワードの直後では名前を検出できませんでした');
        }
    } else if (!data.name) {
        console.log('⚠️ パターン0と1をスキップ: 氏名キーワードが見つかりませんでした');
    }
    
    // パターン2: 「氏」「名」の部分マッチ（認識が不完全な場合）
    if (!data.name) {
        console.log('🔍 パターン2開始: 氏・名の部分マッチを探索');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // 「氏」または「名」を含む行
            if (line.match(/氏|名/) && !line.match(/住所|電話|開始|場所|曜日/)) {
                console.log('🔍 部分マッチ検出（氏・名）:', line);
                // 次の行をチェック
                for (let offset = 1; offset <= 2; offset++) {
                    const idx = i + offset;
                    if (idx >= lines.length) break;
                    
                    const candidateLine = lines[idx].trim();
                    if (candidateLine.length === 0) continue;
                    
                    // 「にこやか収集」の直後の行はスキップ
                    if (nikoyakaLineIndex >= 0 && idx === nikoyakaLineIndex + 1) {
                        console.log(`❌ にこやか収集の直後の行をスキップ: "${candidateLine}"`);
                        continue;
                    }
                    
                    // 除外キーワードチェック
                    let hasExcludeWord = false;
                    for (const exclude of excludeNames) {
                        if (candidateLine.includes(exclude)) {
                            hasExcludeWord = true;
                            break;
                        }
                    }
                    if (hasExcludeWord) continue;
                    
                    // フィールドキーワードチェック
                    if (candidateLine.match(/住所|電話|開始|場所|曜日|ゴミ|もやす|もやさない|可燃|不燃|令和|平成|年|月|日|番号/)) {
                        continue;
                    }
                    
                    const cleaned = candidateLine.replace(/様|さん|殿/g, '').trim();
                    
                    if (cleaned.length >= 2 && cleaned.length <= 15 &&
                        cleaned.match(/^[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\s　]+$/)) {
                        data.name = cleaned;
                        console.log('✅ 名前検出(部分マッチ後):', data.name);
                        console.log('✅✅✅ 名前検出成功:', data.name, '✅✅✅');
                        break;
                    }
                }
                if (data.name) break;
            }
        }
        
        if (!data.name) {
            console.log('⚠️ パターン2: 部分マッチでは名前を検出できませんでした');
        }
    }
    
    // パターン3: フォームの最初の方にある人名らしき行を探す（最も緩い条件）
    if (!data.name) {
        console.log('🔍 パターン3開始: 人名らしき行を探索（最初の10行）');
        // 最初の10行以内を優先的に検索
        const searchLimit = Math.min(10, lines.length);
        
        for (let i = 0; i < searchLimit; i++) {
            const trimmed = lines[i].trim();
            
            // 「にこやか収集」の直後の行はスキップ
            if (nikoyakaLineIndex >= 0 && i === nikoyakaLineIndex + 1) {
                console.log(`❌ にこやか収集の直後の行をスキップ: "${trimmed}"`);
                continue;
            }
            
            // 2〜15文字の日本語のみで構成
            if (trimmed.match(/^[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\s　]{2,15}$/)) {
                // 除外キーワードチェック
                let hasExcludeWord = false;
                for (const exclude of excludeNames) {
                    if (trimmed.includes(exclude)) {
                        hasExcludeWord = true;
                        break;
                    }
                }
                if (hasExcludeWord) {
                    console.log('❌ 除外ワード検出:', trimmed);
                    continue;
                }
                
                // フィールドキーワードチェック
                if (trimmed.match(/住所|電話|開始|場所|曜日|ゴミ|もやす|もやさない|可燃|不燃|令和|平成|年|月|日|番号|記入|記載|確認|提出|受付|担当|処理|登録|申込|申請|依頼|お願い|市|区|町|村/)) {
                    console.log('❌ フィールドキーワード検出:', trimmed);
                    continue;
                }
                
                // 数字を含まない（住所や日付を除外）
                if (trimmed.match(/[0-9０-９]/)) {
                    console.log('❌ 数字を含む:', trimmed);
                    continue;
                }
                
                // 敬称を除去
                const cleaned = trimmed.replace(/様|さん|殿/g, '').trim();
                
                if (cleaned.length >= 2 && cleaned.length <= 15) {
                    data.name = cleaned;
                    console.log('✅ 名前検出(推測・最初の10行):', data.name);
                    console.log('✅✅✅ 名前検出成功:', data.name, '✅✅✅');
                    break;
                }
            }
        }
        
        if (!data.name) {
            console.log('⚠️ パターン3: 推測検索でも名前を検出できませんでした');
        }
    }
    
    // 名前が見つからなかった場合の詳細ログ
    if (!data.name) {
        console.error('❌❌❌ 名前を検出できませんでした ❌❌❌');
        console.log('');
        console.log('=== デバッグ情報 ===');
        console.log('1. にこやか収集の行:', nikoyakaLineIndex >= 0 ? `${nikoyakaLineIndex}行目` : '検出されず');
        console.log('2. 氏名キーワードの行:', nameKeywordIndex >= 0 ? `${nameKeywordIndex}行目` : '検出されず');
        console.log('');
        console.log('3. 全行をスキャン:');
        lines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (trimmed.length === 0) {
                console.log(`  行${idx}: [空行]`);
                return;
            }
            
            // 日本語文字のみか
            const isJapanese = trimmed.match(/^[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\s　]+$/);
            // 除外ワード含むか
            let hasExclude = false;
            for (const exclude of excludeNames) {
                if (trimmed.includes(exclude)) {
                    hasExclude = exclude;
                    break;
                }
            }
            // 数字含むか
            const hasNumber = trimmed.match(/[0-9０-９]/);
            // 長さ
            const len = trimmed.length;
            
            console.log(`  行${idx}: "${trimmed}" | 長さ:${len} | 日本語のみ:${isJapanese?'○':'×'} | 数字:${hasNumber?'あり':'なし'} | 除外ワード:${hasExclude || 'なし'}`);
        });
        console.log('');
        console.log('💡 解決方法:');
        console.log('  - 上記のログを確認し、どの行が名前に該当するか特定してください');
        console.log('  - 名前の行が除外ワードに引っかかっている可能性があります');
        console.log('  - 名前が特殊な文字（括弧、記号など）を含んでいる可能性があります');
        console.log('==================');
        
        // デバッグ情報に追加
        const debugElement = document.getElementById('ocrDebugText');
        if (debugElement) {
            let debugInfo = debugElement.textContent;
            debugInfo += '\n\n=== 名前抽出結果 ===\n';
            debugInfo += '❌ 名前を検出できませんでした\n\n';
            debugInfo += '【全行スキャン】\n';
            lines.forEach((line, idx) => {
                const trimmed = line.trim();
                if (trimmed.length === 0) {
                    debugInfo += `  行${idx}: [空行]\n`;
                    return;
                }
                
                const isJapanese = trimmed.match(/^[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\s　]+$/);
                let hasExclude = false;
                for (const exclude of excludeNames) {
                    if (trimmed.includes(exclude)) {
                        hasExclude = exclude;
                        break;
                    }
                }
                const hasNumber = trimmed.match(/[0-9０-９]/);
                
                debugInfo += `  行${idx}: "${trimmed}"\n`;
                debugInfo += `    日本語のみ:${isJapanese?'○':'×'} 数字:${hasNumber?'あり':'なし'} 除外ワード:${hasExclude || 'なし'}\n`;
            });
            debugElement.textContent = debugInfo;
        }
    } else {
        console.log('✅✅✅ 名前検出成功:', data.name, '✅✅✅');
        
        // デバッグ情報に追加
        const debugElement = document.getElementById('ocrDebugText');
        if (debugElement) {
            let debugInfo = debugElement.textContent;
            debugInfo += '\n\n=== 名前抽出結果 ===\n';
            debugInfo += '✅ 名前検出成功: ' + data.name + '\n';
            debugElement.textContent = debugInfo;
        }
    }
    
    console.log('--- 住所抽出開始 ---');
    
    // 住所を抽出（にこやか収集フォーマット対応 - 超厳格版v2）
    // 「住所」キーワードの位置を最優先で探す
    let addressKeywordIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^住\s*所\s*$/)) {
            addressKeywordIndex = i;
            console.log('📌 住所キーワード位置:', i, '行目');
            break;
        }
    }
    
    // パターン1: 「住所」キーワードの直後の行から住所を取得（最優先・最厳格）
    if (addressKeywordIndex >= 0) {
        // 「住所」の1〜3行後を探索（空行をスキップ）
        for (let offset = 1; offset <= 3; offset++) {
            const idx = addressKeywordIndex + offset;
            if (idx >= lines.length) break;
            
            const candidateLine = lines[idx].trim();
            console.log(`🔍 住所+${offset}行後をチェック:`, candidateLine);
            
            // 空行はスキップ
            if (candidateLine.length === 0) continue;
            
            // 他のフィールドキーワードを含む行は絶対にスキップ
            if (candidateLine.match(/氏名|名前|依頼者|電話|開始|場所|曜日|ゴミ|もやす|もやさない|可燃|不燃|令和|平成|年|月|日|番号|にこやか|収集/)) {
                console.log(`❌ 住所候補をスキップ(キーワード検出): "${candidateLine}"`);
                continue;
            }
            
            // 住所として妥当な文字が含まれているか
            // - 数字を含む（番地情報）
            // - 地名らしい漢字を含む
            // - 長さが3文字以上
            if (candidateLine.length >= 3) {
                // 数字やハイフンを含む = 番地情報がある可能性が高い
                if (candidateLine.match(/[0-9０-９]/) || candidateLine.match(/[-−‐ー]/)) {
                    data.address = candidateLine;
                    console.log('✅ 住所検出(住所キーワードの直後・番地あり):', data.address);
                    break;
                }
                // 市区町村を含む = 完全住所の可能性
                else if (candidateLine.match(/[都道府県市区町村]/)) {
                    data.address = candidateLine;
                    console.log('✅ 住所検出(住所キーワードの直後・行政区分あり):', data.address);
                    break;
                }
                // どちらでもない場合は、それでも採用（キーワード直後なので信頼度高い）
                else {
                    data.address = candidateLine;
                    console.log('✅ 住所検出(住所キーワードの直後):', data.address);
                    break;
                }
            }
        }
    }
    
    // パターン2: 「住所」と同じ行に住所がある場合（例: 住所: 神原15-15-104）
    if (!data.address) {
        for (const line of lines) {
            const addressInLine = line.match(/住\s*所\s*[:\s　]+(.*)/);
            if (addressInLine && addressInLine[1]) {
                const addr = addressInLine[1].trim();
                // フィールドキーワードを含まないかチェック
                if (!addr.match(/氏名|名前|電話|開始|収集|ゴミ|令和|平成|年|月|日/)) {
                    data.address = addr;
                    console.log('✅ 住所検出(住所キーワード同一行):', data.address);
                    break;
                }
            }
        }
    }
    
    // パターン3: 数字+ハイフンのパターン（例: 神原15-15-104）
    // ただし、日付形式（令和8年など）は除外
    if (!data.address) {
        for (const line of lines) {
            // 数字-数字 または 数字-数字-数字 のパターン
            if (line.match(/[0-9０-９]+[-−‐ー][0-9０-９]+/)) {
                // 日付キーワードや他のフィールドキーワードを含む行は除外
                if (!line.match(/氏名|名前|電話|令和|平成|年|月|日|曜日|収集|ゴミ|もやす|もやさない|にこやか/)) {
                    // 地名（漢字・ひらがな）+ 数字ハイフン のパターンなら採用
                    if (line.match(/[\u4E00-\u9FFF\u3040-\u309F]+[0-9０-９]+[-−‐ー]/)) {
                        data.address = line.trim();
                        console.log('✅ 住所検出(地名+番地パターン):', data.address);
                        break;
                    }
                }
            }
        }
    }
    
    // 住所が見つからなかった場合の詳細ログ
    if (!data.address) {
        console.warn('⚠️ 住所を検出できませんでした');
    }
    
    console.log('--- 日付抽出開始 ---');
    
    // 日付を抽出（にこやか収集フォーマット対応 - 令和8年対応強化）
    const datePatterns = [
        // 令和・平成形式（にこやか収集で使用）
        /令和\s*([0-9０-９]{1,2})\s*年\s*([0-9０-９]{1,2})\s*月\s*([0-9０-９]{1,2})\s*日/,
        /平成\s*([0-9０-９]{1,2})\s*年\s*([0-9０-９]{1,2})\s*月\s*([0-9０-９]{1,2})\s*日/,
        // 西暦形式
        /([0-9０-９]{4})\s*[年\-\/]\s*([0-9０-９]{1,2})\s*[月\-\/]\s*([0-9０-９]{1,2})/,
        // 「収集開始日」の後の日付
        /収集開始日[^\d]*([0-9０-９]{4})[年\-\/]([0-9０-９]{1,2})[月\-\/]([0-9０-９]{1,2})/,
        /収集開始日[^\d]*令和\s*([0-9０-９]{1,2})\s*年\s*([0-9０-９]{1,2})\s*月\s*([0-9０-９]{1,2})\s*日/
    ];
    
    for (const line of lines) {
        // 令和形式の特別処理
        if (line.includes('令和')) {
            const reiwaMatch = line.match(/令和\s*([0-9０-９]{1,2})\s*年\s*([0-9０-９]{1,2})\s*月\s*([0-9０-９]{1,2})\s*日/);
            if (reiwaMatch) {
                // 全角数字を半角に変換
                const reiwaYear = parseInt(reiwaMatch[1].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
                const month = reiwaMatch[2].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).padStart(2, '0');
                const day = reiwaMatch[3].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).padStart(2, '0');
                
                // 令和を西暦に変換（令和元年=2019年）
                const year = 2018 + reiwaYear;
                data.startDate = `${year}-${month}-${day}`;
                console.log('収集開始日検出(令和):', data.startDate, `(令和${reiwaYear}年)`);
                break;
            }
        }
        
        // 平成形式の処理
        if (line.includes('平成')) {
            const heiseiMatch = line.match(/平成\s*([0-9０-９]{1,2})\s*年\s*([0-9０-９]{1,2})\s*月\s*([0-9０-９]{1,2})\s*日/);
            if (heiseiMatch) {
                const heiseiYear = parseInt(heiseiMatch[1].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
                const month = heiseiMatch[2].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).padStart(2, '0');
                const day = heiseiMatch[3].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).padStart(2, '0');
                
                // 平成を西暦に変換（平成元年=1989年）
                const year = 1988 + heiseiYear;
                data.startDate = `${year}-${month}-${day}`;
                console.log('収集開始日検出(平成):', data.startDate, `(平成${heiseiYear}年)`);
                break;
            }
        }
        
        // 西暦形式
        for (const pattern of datePatterns) {
            const match = line.match(pattern);
            if (match && !line.includes('令和') && !line.includes('平成')) {
                // 全角数字を半角に変換
                const year = match[1].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
                const month = match[2].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).padStart(2, '0');
                const day = match[3].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).padStart(2, '0');
                
                data.startDate = `${year}-${month}-${day}`;
                console.log('収集開始日検出(西暦):', data.startDate);
                break;
            }
        }
        if (data.startDate) break;
    }
    
    // ゴミの種類を抽出（にこやか収集フォーマット対応 - 可燃・不燃のみ）
    const wasteTypeKeywords = [
        'もやすごみ', 'もやすゴミ', '燃やすごみ', '燃やすゴミ',
        '可燃ごみ', '可燃ゴミ', '可燃',
        'もやさないごみ', 'もやさないゴミ', '燃やさないごみ', '燃やさないゴミ',
        '不燃ごみ', '不燃ゴミ', '不燃'
    ];
    
    // 登録済みの種類も追加
    const registeredTypes = wasteTypes.map(wt => wt.type_name);
    const allTypes = [...new Set([...wasteTypeKeywords, ...registeredTypes])];
    
    for (const line of lines) {
        for (const type of allTypes) {
            if (line.includes(type)) {
                data.wasteType = type;
                console.log('ゴミ種類検出:', data.wasteType);
                break;
            }
        }
        if (data.wasteType) break;
    }
    
    // 全テキストからも検索
    if (!data.wasteType) {
        for (const type of allTypes) {
            if (fullText.includes(type)) {
                data.wasteType = type;
                console.log('ゴミ種類検出(全体検索):', data.wasteType);
                break;
            }
        }
    }
    
    console.log('=== OCR抽出結果 ===');
    console.log('氏名:', data.name);
    console.log('住所:', data.address);
    console.log('収集開始日:', data.startDate);
    console.log('ゴミ種類:', data.wasteType);
    
    return data;
}

// OCRフォーム送信
async function handleOCRForm(e) {
    e.preventDefault();
    
    console.log('📝 OCRフォーム送信開始');
    
    const name = document.getElementById('ocrName').value;
    const address = document.getElementById('ocrAddress').value;
    const startDate = document.getElementById('ocrStartDate').value;
    let vehicleId = document.getElementById('ocrVehicle').value;
    const notes = document.getElementById('ocrNotes').value;
    
    console.log('📊 登録データ:', { name, address, startDate, notes });
    
    // 可燃・不燃のチェック状態を取得
    const combustibleChecked = document.getElementById('ocrCombustible').checked;
    const nonCombustibleChecked = document.getElementById('ocrNonCombustible').checked;
    
    // 可燃収集の曜日を取得
    let combustibleDays = {};
    if (combustibleChecked) {
        combustibleDays = getScheduleData('ocrCombustibleSchedule');
    }
    
    // 不燃収集の曜日を取得
    let nonCombustibleDays = {};
    if (nonCombustibleChecked) {
        nonCombustibleDays = getScheduleData('ocrNonCombustibleSchedule');
    }
    
    // 号車が未選択の場合は自動割り当て
    let manualAssignment = false;
    if (!vehicleId) {
        vehicleId = autoAssignVehicle(address);
        if (!vehicleId && vehicles.length > 0) {
            vehicleId = vehicles[0].id;
        }
    } else {
        manualAssignment = true;
    }
    
    // ゴミ種類を設定
    let wasteType = '';
    if (combustibleChecked && nonCombustibleChecked) {
        wasteType = '可燃・不燃';
    } else if (combustibleChecked) {
        wasteType = '可燃ごみ';
    } else if (nonCombustibleChecked) {
        wasteType = '不燃ごみ';
    }
    
    const data = {
        name,
        address,
        start_date: startDate,
        waste_type: wasteType,
        combustible_days: JSON.stringify(combustibleDays),
        non_combustible_enabled: nonCombustibleChecked,
        non_combustible_days: JSON.stringify(nonCombustibleDays),
        vehicle_id: vehicleId,
        status: '未収集',
        manual_assignment: manualAssignment,
        notes
    };
    
    try {
        console.log('🔄 登録リクエスト送信中...');
        await createCollection(data);
        console.log('✅ 登録成功');
        
        await fetchCollections();
        renderCollections();
        
        // OCRをリセット
        resetOCR();
        
        showToast('登録しました', 'success');
        
        // 収集一覧ビューに切り替え
        switchView('collection');
    } catch (error) {
        console.error('❌ 登録エラー:', error);
        showToast('登録に失敗しました: ' + error.message, 'error');
    }
}

// OCRリセット
function resetOCR() {
    currentImageFile = null;
    document.getElementById('ocrFileInput').value = '';
    document.getElementById('ocrCameraInput').value = '';
    document.getElementById('uploadArea').style.display = 'block';
    document.getElementById('ocrPreview').style.display = 'none';
    document.getElementById('ocrResult').style.display = 'none';
    document.getElementById('ocrProgress').style.display = 'none';
    document.getElementById('ocrForm').reset();
    
    // 住所欄に「兵庫県西宮市」をデフォルトで再設定
    document.getElementById('ocrAddress').value = '兵庫県西宮市';
}

// ===========================
// イベントリスナー登録
// ===========================

document.addEventListener('DOMContentLoaded', async function() {
    // 初期データ読み込み
    await fetchAllData();
    renderCollections();
    
    // 住所欄に「兵庫県西宮市」をデフォルトで設定
    document.getElementById('addAddress').value = '兵庫県西宮市';
    document.getElementById('ocrAddress').value = '兵庫県西宮市';
    
    // スケジュールグリッドを初期化
    generateScheduleGrid('addBurnableSchedule');
    generateScheduleGrid('addNonBurnableSchedule');
    generateScheduleGrid('editBurnableSchedule');
    generateScheduleGrid('editNonBurnableSchedule');
    generateScheduleGrid('vehicleSchedule');
    generateScheduleGrid('ocrCombustibleSchedule');
    generateScheduleGrid('ocrNonCombustibleSchedule');
    
    // 不燃収集チェックボックスのイベント
    document.getElementById('addNonBurnable').addEventListener('change', function() {
        const container = document.getElementById('addNonBurnableScheduleContainer');
        container.style.display = this.checked ? 'block' : 'none';
    });
    
    document.getElementById('editNonBurnable').addEventListener('change', function() {
        const container = document.getElementById('editNonBurnableScheduleContainer');
        container.style.display = this.checked ? 'block' : 'none';
    });
    
    // OCRフォームの不燃収集チェックボックス
    document.getElementById('ocrNonCombustible').addEventListener('change', function() {
        const container = document.getElementById('ocrNonCombustibleScheduleContainer');
        container.style.display = this.checked ? 'block' : 'none';
    });
    
    // ナビゲーション
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            const view = this.getAttribute('data-view');
            switchView(view);
        });
    });
    
    // メニュートグル(モバイル用)
    document.getElementById('menuToggle').addEventListener('click', function() {
        const nav = document.getElementById('mainNav');
        nav.style.display = nav.style.display === 'none' ? 'flex' : 'none';
    });
    
    // 更新ボタン
    document.getElementById('refreshBtn').addEventListener('click', async function() {
        await fetchAllData();
        renderCollections();
        showToast('更新しました', 'success');
    });
    
    // フィルター
    document.getElementById('filterVehicle').addEventListener('change', renderCollections);
    document.getElementById('filterStatus').addEventListener('change', renderCollections);
    document.getElementById('searchInput').addEventListener('input', renderCollections);
    
    // 新規登録フォーム
    document.getElementById('addForm').addEventListener('submit', handleAddForm);
    
    // 編集フォーム
    document.getElementById('editForm').addEventListener('submit', handleEditForm);
    document.getElementById('editModalClose').addEventListener('click', closeEditModal);
    document.getElementById('editCancelBtn').addEventListener('click', closeEditModal);
    
    // 号車管理
    document.getElementById('addVehicleBtn').addEventListener('click', () => openVehicleModal());
    document.getElementById('vehicleForm').addEventListener('submit', handleVehicleForm);
    document.getElementById('vehicleModalClose').addEventListener('click', closeVehicleModal);
    document.getElementById('vehicleCancelBtn').addEventListener('click', closeVehicleModal);
    
    // カラーピッカーの同期
    document.getElementById('vehicleColor').addEventListener('input', function(e) {
        document.getElementById('vehicleColorText').value = e.target.value;
    });
    document.getElementById('vehicleColorText').addEventListener('input', function(e) {
        const value = e.target.value;
        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            document.getElementById('vehicleColor').value = value;
        }
    });
    
    // 地域設定
    document.getElementById('addAreaRuleBtn').addEventListener('click', () => openAreaRuleModal());
    document.getElementById('areaRuleForm').addEventListener('submit', handleAreaRuleForm);
    document.getElementById('areaRuleModalClose').addEventListener('click', closeAreaRuleModal);
    document.getElementById('areaRuleCancelBtn').addEventListener('click', closeAreaRuleModal);
    
    // ゴミ種類管理
    document.getElementById('addWasteTypeBtn').addEventListener('click', () => openWasteTypeModal());
    document.getElementById('wasteTypeForm').addEventListener('submit', handleWasteTypeForm);
    document.getElementById('wasteTypeModalClose').addEventListener('click', closeWasteTypeModal);
    document.getElementById('wasteTypeCancelBtn').addEventListener('click', closeWasteTypeModal);
    
    // OCR
    document.getElementById('ocrUploadBtn').addEventListener('click', function() {
        document.getElementById('ocrFileInput').click();
    });
    document.getElementById('ocrCameraBtn').addEventListener('click', function() {
        document.getElementById('ocrCameraInput').click();
    });
    document.getElementById('ocrFileInput').addEventListener('change', handleOCRFileSelect);
    document.getElementById('ocrCameraInput').addEventListener('change', handleOCRFileSelect);
    document.getElementById('ocrProcessBtn').addEventListener('click', processOCR);
    document.getElementById('ocrCancelBtn').addEventListener('click', resetOCR);
    document.getElementById('ocrResetBtn').addEventListener('click', resetOCR);
    document.getElementById('ocrForm').addEventListener('submit', handleOCRForm);
    
    // モーダル背景クリックで閉じる
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('active');
            }
        });
    });
    
    // 地図フィルター
    document.getElementById('mapFilterVehicle').addEventListener('change', updateMapMarkers);
    document.getElementById('mapFilterStatus').addEventListener('change', updateMapMarkers);
    document.getElementById('refreshMapBtn').addEventListener('click', async function() {
        await fetchAllData();
        updateMapMarkers();
        showToast('地図を更新しました', 'success');
    });
    
    const currentLocationBtn = document.getElementById('showCurrentLocation');
    if (currentLocationBtn) {
        currentLocationBtn.addEventListener('click', showUserLocation);
        console.log('✅ 現在地ボタンのイベントリスナーを登録しました');
    } else {
        console.error('❌ 現在地ボタンが見つかりません');
    }
    
    // 地図レイヤー切り替えボタン
    const toggleMapLayerBtn = document.getElementById('toggleMapLayer');
    if (toggleMapLayerBtn) {
        toggleMapLayerBtn.addEventListener('click', toggleMapLayer);
        console.log('✅ 地図切り替えボタンのイベントリスナーを登録しました');
    }
    
    // 保存されたテーマを読み込み
    loadSavedTheme();
    
    // 収集確認の初期化
    initConfirmationView();
    
    // CSV一括登録の初期化
    initBulkImport();
    
    // 設定ビューの初期化
    initSettingsView();
});

// ===========================
// CSV一括登録機能
// ===========================

let csvData = [];

function initBulkImport() {
    document.getElementById('bulkImportBtn').addEventListener('click', openBulkImportModal);
    document.getElementById('bulkImportModalClose').addEventListener('click', closeBulkImportModal);
    document.getElementById('bulkImportCancelBtn').addEventListener('click', closeBulkImportModal);
    document.getElementById('csvFile').addEventListener('change', handleCSVFile);
    document.getElementById('bulkImportExecuteBtn').addEventListener('click', executeBulkImport);
}

function openBulkImportModal() {
    document.getElementById('bulkImportModal').classList.add('active');
    csvData = [];
    document.getElementById('csvFile').value = '';
    document.getElementById('csvPreview').style.display = 'none';
    document.getElementById('bulkImportExecuteBtn').disabled = true;
}

function closeBulkImportModal() {
    document.getElementById('bulkImportModal').classList.remove('active');
}

function handleCSVFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const text = event.target.result;
            parseCSV(text);
        } catch (error) {
            console.error('CSVファイル読み込みエラー:', error);
            showToast('CSVファイルの読み込みに失敗しました', 'error');
        }
    };
    reader.readAsText(file, 'UTF-8');
}

function parseCSV(text) {
    const lines = text.trim().split('\n');
    csvData = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // カンマで分割（簡易的な処理）
        const parts = line.split(',').map(p => p.trim());
        
        if (parts.length < 5) {
            showToast(`${i + 1}行目: データが不足しています`, 'error');
            continue;
        }
        
        csvData.push({
            name: parts[0],
            address: parts[1],
            phone: parts[2] || '',
            start_date: parts[3],
            waste_type: parts[4]
        });
    }
    
    if (csvData.length === 0) {
        showToast('有効なデータがありません', 'error');
        return;
    }
    
    displayCSVPreview();
}

function displayCSVPreview() {
    const preview = document.getElementById('csvPreview');
    const content = document.getElementById('csvPreviewContent');
    const count = document.getElementById('csvCount');
    
    const previewItems = csvData.slice(0, 5);
    content.innerHTML = previewItems.map(item => `
        <div style="padding: 0.5rem; border-bottom: 1px solid var(--border-color);">
            ${item.name} - ${item.address} - ${item.start_date}
        </div>
    `).join('');
    
    if (csvData.length > 5) {
        content.innerHTML += `<div style="padding: 0.5rem; color: var(--text-secondary);">...他${csvData.length - 5}件</div>`;
    }
    
    count.textContent = `合計 ${csvData.length}件のデータ`;
    preview.style.display = 'block';
    document.getElementById('bulkImportExecuteBtn').disabled = false;
}

async function executeBulkImport() {
    if (csvData.length === 0) return;
    
    if (!confirm(`${csvData.length}件のデータを登録しますか？`)) {
        return;
    }
    
    document.getElementById('bulkImportExecuteBtn').disabled = true;
    document.getElementById('bulkImportExecuteBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> 登録中...';
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const item of csvData) {
        try {
            // 号車を自動割り当て
            const vehicleId = autoAssignVehicle(item.address);
            
            const data = {
                name: item.name,
                address: item.address,
                phone: item.phone,
                start_date: item.start_date,
                waste_type: item.waste_type,
                vehicle_id: vehicleId,
                status: '未収集',
                manual_assignment: false,
                combustible_days: JSON.stringify({ monday: true, wednesday: true, friday: true }),
                non_combustible_enabled: false,
                non_combustible_days: JSON.stringify({})
            };
            
            await createCollection(data);
            successCount++;
        } catch (error) {
            console.error('登録エラー:', item.name, error);
            errorCount++;
        }
    }
    
    closeBulkImportModal();
    await fetchAllData();
    renderCollections();
    
    showToast(`${successCount}件登録完了、${errorCount}件エラー`, successCount > 0 ? 'success' : 'error');
}

// ===========================
// 収集確認機能
// ===========================

function initConfirmationView() {
    // 今日の日付をデフォルト設定
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('confirmDate').value = today;
    
    // 号車選択肢を更新
    updateConfirmVehicleSelect();
    
    // 検索ボタン
    document.getElementById('confirmSearchBtn').addEventListener('click', searchConfirmations);
    
    // 一括完了ボタン
    document.getElementById('markAllCompletedBtn').addEventListener('click', markAllCompleted);
}

function updateConfirmVehicleSelect() {
    const select = document.getElementById('confirmVehicle');
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">すべて</option>';
    
    vehicles.forEach(vehicle => {
        const option = document.createElement('option');
        option.value = vehicle.id;
        option.textContent = vehicle.vehicle_number;
        select.appendChild(option);
    });
    
    if (currentValue) {
        select.value = currentValue;
    }
}

function searchConfirmations() {
    const date = document.getElementById('confirmDate').value;
    const vehicleId = document.getElementById('confirmVehicle').value;
    
    if (!date) {
        showToast('収集日を選択してください', 'error');
        return;
    }
    
    // フィルタリング
    let filtered = collections.filter(c => {
        // 日付でフィルタ
        if (c.start_date !== date) return false;
        
        // 号車でフィルタ
        if (vehicleId && c.vehicle_id !== vehicleId) return false;
        
        return true;
    });
    
    renderConfirmationList(filtered);
}

function renderConfirmationList(items) {
    const listElement = document.getElementById('confirmationList');
    
    // 統計を更新
    const total = items.length;
    const pending = items.filter(i => i.status === '未収集').length;
    const completed = items.filter(i => i.status === '収集済み').length;
    
    document.getElementById('confirmTotal').textContent = total;
    document.getElementById('confirmPending').textContent = pending;
    document.getElementById('confirmCompleted').textContent = completed;
    
    if (items.length === 0) {
        listElement.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>該当する収集依頼がありません</p>
            </div>
        `;
        return;
    }
    
    // 名前でソート
    items.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
    
    listElement.innerHTML = items.map(item => `
        <div class="collection-card status-${item.status}">
            <div class="collection-header">
                <div class="collection-name">${item.name || '未設定'}</div>
                <button class="collection-status status-${item.status}" onclick="toggleStatus('${item.id}', '${item.status}')" title="クリックでステータス変更">
                    <i class="fas fa-circle"></i>
                    ${item.status}
                    <i class="fas fa-sync-alt status-change-icon"></i>
                </button>
            </div>
            <div class="collection-info">
                <div class="info-row">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${item.address || '未設定'}</span>
                </div>
                ${item.phone ? `
                <div class="info-row">
                    <i class="fas fa-phone"></i>
                    <span>${item.phone}</span>
                </div>
                ` : ''}
                <div class="info-row">
                    <i class="fas fa-trash-alt"></i>
                    <span>${item.waste_type || '未設定'}</span>
                </div>
                <div class="info-row">
                    <i class="fas fa-truck"></i>
                    <span class="collection-vehicle">
                        <i class="fas fa-truck-moving"></i>
                        ${getVehicleName(item.vehicle_id)}
                    </span>
                </div>
                ${item.notes ? `
                <div class="info-row">
                    <i class="fas fa-sticky-note"></i>
                    <span>${item.notes}</span>
                </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

async function markAllCompleted() {
    const date = document.getElementById('confirmDate').value;
    const vehicleId = document.getElementById('confirmVehicle').value;
    
    if (!date) {
        showToast('収集日を選択してください', 'error');
        return;
    }
    
    // 対象の未収集依頼を取得
    const targets = collections.filter(c => {
        if (c.start_date !== date) return false;
        if (vehicleId && c.vehicle_id !== vehicleId) return false;
        if (c.status !== '未収集') return false;
        return true;
    });
    
    if (targets.length === 0) {
        showToast('対象の未収集依頼がありません', 'info');
        return;
    }
    
    if (!confirm(`${targets.length}件の依頼を「収集済み」にしますか？`)) {
        return;
    }
    
    try {
        // 一括更新
        for (const item of targets) {
            await updateCollection(item.id, { status: '収集済み' });
            item.status = '収集済み';
        }
        
        showToast(`${targets.length}件を収集済みにしました`, 'success');
        searchConfirmations();
    } catch (error) {
        console.error('一括更新エラー:', error);
        showToast('一括更新に失敗しました', 'error');
    }
}

// ===========================
// カラーテーマ機能
// ===========================

const themes = {
    green: {
        name: '爽やかな黄緑',
        primary: '#10b981',
        primaryHover: '#059669',
        background: '#f0fdf4',
        border: '#d1fae5',
        headerGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        vehicleBg: '#d1fae5',
        vehicleColor: '#065f46'
    },
    blue: {
        name: 'クールブルー',
        primary: '#2563eb',
        primaryHover: '#1d4ed8',
        background: '#f0f9ff',
        border: '#dbeafe',
        headerGradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
        vehicleBg: '#dbeafe',
        vehicleColor: '#1e40af'
    },
    orange: {
        name: 'サンセットオレンジ',
        primary: '#f97316',
        primaryHover: '#ea580c',
        background: '#fff7ed',
        border: '#fed7aa',
        headerGradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        vehicleBg: '#fed7aa',
        vehicleColor: '#9a3412'
    },
    purple: {
        name: 'ロイヤルパープル',
        primary: '#9333ea',
        primaryHover: '#7e22ce',
        background: '#faf5ff',
        border: '#e9d5ff',
        headerGradient: 'linear-gradient(135deg, #9333ea 0%, #7e22ce 100%)',
        vehicleBg: '#e9d5ff',
        vehicleColor: '#6b21a8'
    },
    pink: {
        name: 'フレッシュピンク',
        primary: '#ec4899',
        primaryHover: '#db2777',
        background: '#fdf2f8',
        border: '#fbcfe8',
        headerGradient: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
        vehicleBg: '#fbcfe8',
        vehicleColor: '#9f1239'
    },
    gray: {
        name: 'シックグレー',
        primary: '#64748b',
        primaryHover: '#475569',
        background: '#f8fafc',
        border: '#e2e8f0',
        headerGradient: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
        vehicleBg: '#e2e8f0',
        vehicleColor: '#334155'
    }
};

function applyTheme(themeKey) {
    const theme = themes[themeKey];
    if (!theme) {
        console.error('テーマが見つかりません:', themeKey);
        return;
    }
    
    const root = document.documentElement;
    root.style.setProperty('--primary-color', theme.primary);
    root.style.setProperty('--primary-hover', theme.primaryHover);
    root.style.setProperty('--background', theme.background);
    root.style.setProperty('--border-color', theme.border);
    
    // ヘッダーのグラデーション
    const header = document.querySelector('.header');
    if (header) {
        header.style.background = theme.headerGradient;
    }
    
    // 号車バッジの色
    const vehicleBadges = document.querySelectorAll('.collection-vehicle');
    vehicleBadges.forEach(badge => {
        badge.style.background = theme.vehicleBg;
        badge.style.color = theme.vehicleColor;
    });
    
    // テーマカードのアクティブ状態を更新
    document.querySelectorAll('.theme-card').forEach(card => {
        card.classList.remove('active');
    });
    const activeCard = document.querySelector(`.theme-card[data-theme="${themeKey}"]`);
    if (activeCard) {
        activeCard.classList.add('active');
    }
    
    // ローカルストレージに保存
    localStorage.setItem('nikoyaka-theme', themeKey);
    
    showToast(`テーマを「${theme.name}」に変更しました`, 'success');
}

function loadSavedTheme() {
    const savedTheme = localStorage.getItem('nikoyaka-theme') || 'green';
    applyTheme(savedTheme);
}

// ===========================
// 設定ビュー
// ===========================

function initSettingsView() {
    const tabs = {
        areas: document.getElementById('settingsTabAreas'),
        waste: document.getElementById('settingsTabWaste'),
        themes: document.getElementById('settingsTabThemes'),
        backup: document.getElementById('settingsTabBackup')
    };
    
    const contents = {
        areas: document.getElementById('settingsContentAreas'),
        waste: document.getElementById('settingsContentWaste'),
        themes: document.getElementById('settingsContentThemes'),
        backup: document.getElementById('settingsContentBackup')
    };
    
    if (!tabs.areas) return;
    
    function switchTab(name) {
        Object.values(tabs).forEach(t => t.classList.remove('active'));
        Object.values(contents).forEach(c => c.style.display = 'none');
        tabs[name].classList.add('active');
        contents[name].style.display = 'block';
        
        // タブ切り替え時の初期化
        if (name === 'areas') {
            renderAreaRulesSettings();
        } else if (name === 'waste') {
            renderWasteTypesSettings();
        } else if (name === 'themes') {
            renderThemesSettings();
        } else if (name === 'backup') {
            updateBackupInfo();
        }
    }
    
    tabs.areas.onclick = () => switchTab('areas');
    tabs.waste.onclick = () => switchTab('waste');
    tabs.themes.onclick = () => switchTab('themes');
    tabs.backup.onclick = () => switchTab('backup');
    
    switchTab('areas');
    
    // 地域設定のボタン
    const addAreaBtn = document.getElementById('addAreaRuleBtnSettings');
    if (addAreaBtn) {
        addAreaBtn.onclick = () => openAreaRuleModal();
    }
    
    // ゴミ種類のボタン
    const addWasteBtn = document.getElementById('addWasteTypeBtnSettings');
    if (addWasteBtn) {
        addWasteBtn.onclick = () => openWasteTypeModal();
    }
    
    // バックアップボタン
    const backupBtn = document.getElementById('manualBackupBtn');
    if (backupBtn) {
        backupBtn.onclick = manualBackup;
    }
    
    const restoreBtn = document.getElementById('restoreBtn');
    const restoreInput = document.getElementById('restoreFileInput');
    if (restoreBtn && restoreInput) {
        restoreBtn.onclick = () => restoreInput.click();
        restoreInput.onchange = restoreFromFile;
    }
}

function renderAreaRulesSettings() {
    const list = document.getElementById('areaRuleListSettings');
    if (!list) return;
    list.innerHTML = document.getElementById('areaRuleList').innerHTML;
}

function renderWasteTypesSettings() {
    const list = document.getElementById('wasteTypeListSettings');
    if (!list) return;
    list.innerHTML = document.getElementById('wasteTypeList').innerHTML;
}

function renderThemesSettings() {
    const grid = document.getElementById('themesGridSettings');
    if (!grid) return;
    const original = document.querySelector('#themesView .themes-grid');
    if (original) {
        grid.innerHTML = original.innerHTML;
    }
}

function updateBackupInfo() {
    const elem = document.getElementById('lastBackupTime');
    if (!elem) return;
    const lastBackup = localStorage.getItem('lastAutoBackup');
    if (lastBackup) {
        const date = new Date(parseInt(lastBackup));
        elem.textContent = date.toLocaleString('ja-JP');
    } else {
        elem.textContent = 'まだバックアップされていません';
    }
}

function manualBackup() {
    try {
        const data = {
            version: '1.6.0',
            timestamp: Date.now(),
            collections: collections,
            vehicles: vehicles,
            areaRules: areaRules,
            wasteTypes: wasteTypes
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `nikoyaka-backup-${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('バックアップファイルをダウンロードしました', 'success');
    } catch (error) {
        showToast('バックアップに失敗しました', 'error');
    }
}

function restoreFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!confirm('データを復元しますか？\n現在のデータは上書きされます。')) {
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (!data.collections || !data.vehicles) {
                throw new Error('無効なバックアップファイルです');
            }
            
            // データを復元（簡易版）
            collections = data.collections;
            vehicles = data.vehicles;
            areaRules = data.areaRules || [];
            wasteTypes = data.wasteTypes || [];
            
            renderCollections();
            showToast('データを復元しました', 'success');
        } catch (error) {
            showToast('復元に失敗しました: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ===========================
// 地図機能
// ===========================

// 地図の初期化
function initMap() {
    console.log('\n🗺️ ========== 地図の初期化を開始 ==========');
    console.log(`   📊 全収集データ件数: ${collections.length}`);
    
    if (collections.length > 0) {
        console.log('   📝 登録されている住所一覧:');
        collections.forEach((c, idx) => {
            console.log(`      ${idx + 1}. ${c.name}: "${c.address}"`);
        });
    } else {
        console.warn('   ⚠️ 登録データが0件です！');
    }
    
    if (map) {
        // 既に初期化されている場合はマーカーを更新
        console.log('\n   ✅ 地図は既に初期化済み - マーカーを更新');
        updateMapMarkers();
        return;
    }
    
    console.log('\n   🆕 新しい地図を作成中...');
    
    // 地図の作成(西宮市の中心付近)
    map = L.map('map').setView([34.7377, 135.3416], 13);
    
    console.log('   ✅ 地図オブジェクト作成完了 (中心座標: 西宮市)');
    
    // タイルレイヤーを定義（グローバル変数として保存）
    window.streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    });
    
    window.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
        maxZoom: 19
    });
    
    // デフォルトは通常地図
    window.streetLayer.addTo(map);
    window.currentMapLayer = 'street'; // 現在のレイヤーを記録
    
    console.log('   ✅ タイルレイヤー追加完了');
    
    // 号車セレクトボックスを更新
    updateMapVehicleSelect();
    
    // 凡例を作成
    renderMapLegend();
    
    // マーカーを配置
    console.log('   📍 マーカー配置を開始');
    console.log('========================================\n');
    updateMapMarkers();
}

// 地図の号車セレクトボックスを更新
function updateMapVehicleSelect() {
    const select = document.getElementById('mapFilterVehicle');
    if (!select) return;
    
    const currentValue = select.value;
    
    // 既存のオプションをクリア(最初のオプションは残す)
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    // 号車オプションを追加
    vehicles.forEach(vehicle => {
        const option = document.createElement('option');
        option.value = vehicle.id;
        option.textContent = vehicle.vehicle_number;
        select.appendChild(option);
    });
    
    // 値を復元
    if (currentValue) {
        select.value = currentValue;
    }
}

// 凡例を描画
function renderMapLegend() {
    const legendElement = document.getElementById('mapLegend');
    if (!legendElement) return;
    
    legendElement.innerHTML = vehicles.map((vehicle) => {
        const color = getVehicleColor(vehicle.id);
        return `
            <div class="legend-item">
                <div class="legend-marker" style="background: ${color};">
                    <div class="legend-marker-inner"></div>
                </div>
                <span>${vehicle.vehicle_number}</span>
            </div>
        `;
    }).join('');
}

// マーカーを更新
async function updateMapMarkers() {
    console.log('🔄 マーカー更新開始');
    
    if (!map) {
        console.error('❌ 地図が初期化されていません');
        return;
    }
    
    console.log('📊 収集データ件数:', collections.length);
    
    // 既存のマーカーを削除
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    // フィルター適用
    const filterVehicle = document.getElementById('mapFilterVehicle').value;
    const filterStatus = document.getElementById('mapFilterStatus').value;
    
    let filtered = collections.filter(c => {
        if (filterVehicle && c.vehicle_id !== filterVehicle) return false;
        if (filterStatus && c.status !== filterStatus) return false;
        return true;
    });
    
    console.log('📊 フィルター後のデータ件数:', filtered.length);
    
    if (filtered.length === 0) {
        console.warn('⚠️ 表示する収集依頼がありません');
        showToast('表示する収集依頼がありません', 'info');
        return;
    }
    
    // 進捗表示
    showToast(`${filtered.length}件の住所を地図に表示中...`, 'info');
    
    // 地図の境界を設定するための配列
    const bounds = [];
    
    console.log('🌐 ジオコーディング開始...');
    
    let successCount = 0;
    let failCount = 0;
    
    // 各収集依頼のマーカーを配置
    for (let i = 0; i < filtered.length; i++) {
        const collection = filtered[i];
        
        console.log(`\n📍 [${i + 1}/${filtered.length}] 処理中`);
        console.log(`   依頼者: ${collection.name}`);
        console.log(`   住所: ${collection.address}`);
        
        // 手動設定された座標があればそれを優先使用
        let coords = null;
        if (collection.latitude && collection.longitude) {
            coords = {
                lat: parseFloat(collection.latitude),
                lng: parseFloat(collection.longitude)
            };
            console.log(`   ✅ 手動設定された座標を使用: { lat: ${coords.lat}, lng: ${coords.lng} }`);
        } else if (collection.address) {
            // 住所から座標を取得
            console.log(`   🌐 ジオコーディング開始: "${collection.address}"`);
            coords = await geocodeAddress(collection.address);
            console.log(`   📥 API応答:`, coords);
        } else {
            console.warn(`⚠️ 住所が空: ${collection.name}`);
            failCount++;
            continue;
        }
        
        if (coords) {
            console.log(`   ✅ 座標取得成功: { lat: ${coords.lat}, lng: ${coords.lng} }`);
            console.log(`   📍 マーカーを地図に配置します`);
            
            bounds.push([coords.lat, coords.lng]);
            
            // カスタムアイコンを作成
            // 一時中断の場合はピン本体を灰色にする
            let pinColor = getVehicleColor(collection.vehicle_id);
            if (collection.status === '一時中断') {
                pinColor = '#64748b'; // 灰色
            }
            const icon = createCustomIcon(pinColor, collection.status);
            
            // マーカーを作成
            const marker = L.marker([coords.lat, coords.lng], { icon })
                .addTo(map)
                .bindPopup(createPopupContent(collection));
            
            // マーカーにcollectionIdを保存
            marker.collectionId = collection.id;
            
            markers.push(marker);
            successCount++;
            console.log(`   ✅ マーカー配置完了 (合計: ${successCount}件)`);
        } else {
            console.error(`   ❌ 座標取得失敗: ${collection.address}`);
            console.error(`   💡 この住所はジオコーディングできません`);
            failCount++;
        }
        
        // APIのレート制限を回避するため少し待機
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n📊 ========== 最終結果 ==========`);
    console.log(`   ✅ 成功: ${successCount}件`);
    console.log(`   ❌ 失敗: ${failCount}件`);
    console.log(`   📍 配置されたマーカー数: ${markers.length}`);
    console.log(`================================\n`);
    
    // 地図の表示範囲を調整
    if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
        console.log('✅ 地図の表示範囲を調整しました');
    }
    
    // 結果メッセージ
    if (successCount > 0) {
        showToast(`${markers.length}件の場所を表示しました`, 'success');
    } else {
        showToast('住所から座標を取得できませんでした', 'error');
    }
}

// カスタムアイコンを作成
function createCustomIcon(color, status) {
    // ステータスに応じた境界線の色
    let borderColor = '#ffffff';
    if (status === '未収集') borderColor = '#f59e0b';
    if (status === '収集済み') borderColor = '#10b981';
    if (status === '保留') borderColor = '#64748b';
    if (status === '一時中断') borderColor = '#64748b';
    
    const iconHtml = `
        <div style="
            width: 32px;
            height: 32px;
            background: ${color};
            border: 3px solid ${borderColor};
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        "></div>
    `;
    
    return L.divIcon({
        html: iconHtml,
        className: 'custom-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });
}

// ポップアップコンテンツを作成
function createPopupContent(collection) {
    const statusClass = `status-${collection.status}`;
    
    return `
        <div class="map-popup">
            <div class="map-popup-header">
                <div class="map-popup-name">${collection.name || '未設定'}</div>
                <div class="map-popup-status collection-status ${statusClass}">
                    <i class="fas fa-circle"></i>
                    ${collection.status}
                </div>
            </div>
            <div class="map-popup-info">
                <div class="map-popup-row">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${collection.address || '未設定'}</span>
                </div>
                ${collection.phone ? `
                <div class="map-popup-row">
                    <i class="fas fa-phone"></i>
                    <span>${collection.phone}</span>
                </div>
                ` : ''}
                <div class="map-popup-row">
                    <i class="fas fa-calendar"></i>
                    <span>${formatDate(collection.start_date)}</span>
                </div>
                <div class="map-popup-row">
                    <i class="fas fa-trash-alt"></i>
                    <span>${collection.waste_type || '未設定'}</span>
                </div>
                <div class="map-popup-row">
                    <i class="fas fa-truck"></i>
                    <span>${getVehicleName(collection.vehicle_id)}</span>
                </div>
            </div>
            <div class="map-popup-actions">
                <button class="btn btn-sm btn-primary" onclick="openEditModalFromMap('${collection.id}')" style="flex: 1;">
                    <i class="fas fa-edit"></i> 編集
                </button>
                <button class="btn btn-sm btn-secondary" onclick="openPinEditMode('${collection.id}')" style="flex: 1;">
                    <i class="fas fa-map-marker-alt"></i> ピン修正
                </button>
            </div>
        </div>
    `;
}

// 地図から編集モーダルを開く
function openEditModalFromMap(collectionId) {
    map.closePopup();
    switchView('collection');
    setTimeout(() => {
        openEditModal(collectionId);
    }, 300);
}

// ピン位置編集モードを開始
function openPinEditMode(collectionId) {
    const collection = collections.find(c => c.id === collectionId);
    if (!collection) {
        showToast('収集依頼が見つかりません', 'error');
        return;
    }
    
    map.closePopup();
    
    // 現在のマーカーを見つける
    let currentMarker = null;
    for (let marker of markers) {
        if (marker.collectionId === collectionId) {
            currentMarker = marker;
            break;
        }
    }
    
    if (!currentMarker) {
        showToast('マーカーが見つかりません', 'error');
        return;
    }
    
    // マーカーをドラッグ可能にする
    currentMarker.dragging.enable();
    
    // マーカーに一時的なポップアップを表示
    const tempPopup = L.popup({
        closeButton: false,
        autoClose: false,
        closeOnClick: false
    }).setContent(`
        <div style="text-align: center; padding: 0.5rem;">
            <div style="margin-bottom: 0.5rem; font-weight: bold;">${collection.name}</div>
            <div style="font-size: 0.875rem; color: #64748b; margin-bottom: 0.75rem;">マーカーをドラッグして位置を調整</div>
            <button class="btn btn-sm btn-success" onclick="savePinPosition('${collectionId}')">
                <i class="fas fa-check"></i> 保存
            </button>
            <button class="btn btn-sm btn-secondary" onclick="cancelPinEdit('${collectionId}')">
                <i class="fas fa-times"></i> キャンセル
            </button>
        </div>
    `);
    
    currentMarker.bindPopup(tempPopup).openPopup();
    
    // 元の位置を保存
    currentMarker.originalLatLng = currentMarker.getLatLng();
    
    showToast('マーカーをドラッグして位置を調整してください', 'info');
}

// ピン位置を保存
async function savePinPosition(collectionId) {
    const collection = collections.find(c => c.id === collectionId);
    if (!collection) return;
    
    // 現在のマーカーを見つける
    let currentMarker = null;
    for (let marker of markers) {
        if (marker.collectionId === collectionId) {
            currentMarker = marker;
            break;
        }
    }
    
    if (!currentMarker) return;
    
    const newPos = currentMarker.getLatLng();
    
    try {
        // Supabaseに座標を保存
        await SupabaseAPI.updateCollection(collectionId, {
            latitude: newPos.lat,
            longitude: newPos.lng
        });
        
        // ローカルデータを更新
        collection.latitude = newPos.lat;
        collection.longitude = newPos.lng;
        
        // マーカーのドラッグを無効化
        currentMarker.dragging.disable();
        
        // ポップアップを閉じる
        currentMarker.closePopup();
        
        // 通常のポップアップに戻す
        currentMarker.bindPopup(createPopupContent(collection));
        
        showToast('ピン位置を保存しました', 'success');
    } catch (error) {
        console.error('ピン位置の保存エラー:', error);
        showToast('ピン位置の保存に失敗しました', 'error');
    }
}

// ピン編集をキャンセル
function cancelPinEdit(collectionId) {
    const collection = collections.find(c => c.id === collectionId);
    if (!collection) return;
    
    // 現在のマーカーを見つける
    let currentMarker = null;
    for (let marker of markers) {
        if (marker.collectionId === collectionId) {
            currentMarker = marker;
            break;
        }
    }
    
    if (!currentMarker) return;
    
    // 元の位置に戻す
    if (currentMarker.originalLatLng) {
        currentMarker.setLatLng(currentMarker.originalLatLng);
    }
    
    // マーカーのドラッグを無効化
    currentMarker.dragging.disable();
    
    // ポップアップを閉じる
    currentMarker.closePopup();
    
    // 通常のポップアップに戻す
    currentMarker.bindPopup(createPopupContent(collection));
    
    showToast('キャンセルしました', 'info');
}

// 現在地を表示
function showUserLocation() {
    console.log('🗺️ 現在地取得ボタンがクリックされました');
    
    if (!map) {
        console.error('❌ 地図が初期化されていません');
        showToast('地図が初期化されていません', 'error');
        return;
    }
    
    if (!navigator.geolocation) {
        console.error('❌ ブラウザが位置情報に対応していません');
        showToast('お使いのブラウザは位置情報に対応していません', 'error');
        return;
    }
    
    console.log('📍 位置情報を取得中...');
    showToast('現在地を取得中...', 'info');
    
    // タイムアウトタイマーを設定（15秒）
    const timeoutId = setTimeout(() => {
        console.error('⏱️ 位置情報取得がタイムアウトしました（15秒）');
        showToast('位置情報の取得に時間がかかっています。もう一度試してください。', 'error');
    }, 15000);
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            clearTimeout(timeoutId);
            
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            console.log('✅ 現在地取得成功:', { lat, lng, accuracy: position.coords.accuracy });
            
            // 既存の現在地マーカーを削除
            if (userLocationMarker) {
                map.removeLayer(userLocationMarker);
            }
            
            // 現在地マーカーを追加
            userLocationMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                    html: '<div style="width: 20px; height: 20px; background: #3b82f6; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>',
                    className: 'current-location-marker',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                })
            }).addTo(map).bindPopup('現在地');
            
            // 現在地に移動
            map.setView([lat, lng], 15);
            
            console.log('✅ 地図を現在地に移動しました');
            showToast('現在地を表示しました', 'success');
        },
        (error) => {
            clearTimeout(timeoutId);
            
            console.error('❌ 位置情報取得エラー:', error);
            console.error('エラーコード:', error.code);
            console.error('エラーメッセージ:', error.message);
            
            let errorMsg = '現在地の取得に失敗しました。';
            
            switch(error.code) {
                case 1: // PERMISSION_DENIED
                    errorMsg = '位置情報の使用が拒否されました。ブラウザの設定で位置情報を許可してください。';
                    console.error('💡 ユーザーが位置情報の使用を拒否しました');
                    break;
                case 2: // POSITION_UNAVAILABLE
                    errorMsg = '位置情報が利用できません。GPS信号を受信できる場所で試してください。';
                    console.error('💡 位置情報が利用できません');
                    break;
                case 3: // TIMEOUT
                    errorMsg = '位置情報の取得がタイムアウトしました。もう一度試してください。';
                    console.error('💡 位置情報の取得がタイムアウトしました');
                    break;
                default:
                    errorMsg = '不明なエラーが発生しました。';
                    break;
            }
            
            showToast(errorMsg, 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// 地図レイヤーを切り替え
function toggleMapLayer() {
    if (!map || !window.streetLayer || !window.satelliteLayer) {
        showToast('地図が初期化されていません', 'error');
        return;
    }
    
    const label = document.getElementById('mapLayerLabel');
    
    if (window.currentMapLayer === 'street') {
        // 通常地図 → 航空写真
        map.removeLayer(window.streetLayer);
        window.satelliteLayer.addTo(map);
        window.currentMapLayer = 'satellite';
        label.textContent = '通常地図';
        showToast('航空写真に切り替えました', 'success');
    } else {
        // 航空写真 → 通常地図
        map.removeLayer(window.satelliteLayer);
        window.streetLayer.addTo(map);
        window.currentMapLayer = 'street';
        label.textContent = '航空写真';
        showToast('通常地図に切り替えました', 'success');
    }
}
