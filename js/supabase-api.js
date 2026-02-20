// ===========================
// Supabase API通信レイヤー
// ===========================
// 
// このファイルは、現在のTable APIをSupabase APIに置き換えるためのアダプターです。
// 既存のコード（app.js）を最小限の変更で動作させることができます。

const SupabaseAPI = {
    // ===========================
    // 収集依頼 (collections)
    // ===========================
    
    async getCollections() {
        try {
            const { data, error } = await supabase
                .from('collections')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1000);
            
            if (error) throw error;
            return { data: data || [] };
        } catch (error) {
            console.error('収集依頼取得エラー:', error);
            return { data: [], error };
        }
    },
    
    async getCollection(id) {
        try {
            const { data, error } = await supabase
                .from('collections')
                .select('*')
                .eq('id', id)
                .single();
            
            if (error) throw error;
            return { data };
        } catch (error) {
            console.error('収集依頼取得エラー:', error);
            return { error };
        }
    },
    
    async createCollection(collectionData) {
        try {
            const { data, error } = await supabase
                .from('collections')
                .insert([collectionData])
                .select()
                .single();
            
            if (error) throw error;
            return { data };
        } catch (error) {
            console.error('収集依頼作成エラー:', error);
            return { error };
        }
    },
    
    async updateCollection(id, collectionData) {
        try {
            const { data, error } = await supabase
                .from('collections')
                .update(collectionData)
                .eq('id', id)
                .select()
                .single();
            
            if (error) throw error;
            return { data };
        } catch (error) {
            console.error('収集依頼更新エラー:', error);
            return { error };
        }
    },
    
    async deleteCollection(id) {
        try {
            const { error } = await supabase
                .from('collections')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('収集依頼削除エラー:', error);
            return { error };
        }
    },
    
    // ===========================
    // 号車 (vehicles)
    // ===========================
    
    async getVehicles() {
        try {
            const { data, error } = await supabase
                .from('vehicles')
                .select('*')
                .order('created_at', { ascending: true })
                .limit(100);
            
            if (error) throw error;
            return { data: data || [] };
        } catch (error) {
            console.error('号車取得エラー:', error);
            return { data: [], error };
        }
    },
    
    async createVehicle(vehicleData) {
        try {
            const { data, error } = await supabase
                .from('vehicles')
                .insert([vehicleData])
                .select()
                .single();
            
            if (error) throw error;
            return { data };
        } catch (error) {
            console.error('号車作成エラー:', error);
            return { error };
        }
    },
    
    async updateVehicle(id, vehicleData) {
        try {
            const { data, error } = await supabase
                .from('vehicles')
                .update(vehicleData)
                .eq('id', id)
                .select()
                .single();
            
            if (error) throw error;
            return { data };
        } catch (error) {
            console.error('号車更新エラー:', error);
            return { error };
        }
    },
    
    async deleteVehicle(id) {
        try {
            const { error } = await supabase
                .from('vehicles')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('号車削除エラー:', error);
            return { error };
        }
    },
    
    // ===========================
    // 地域ルール (area_rules)
    // ===========================
    
    async getAreaRules() {
        try {
            const { data, error } = await supabase
                .from('area_rules')
                .select('*')
                .order('priority', { ascending: true })
                .limit(100);
            
            if (error) throw error;
            return { data: data || [] };
        } catch (error) {
            console.error('地域ルール取得エラー:', error);
            return { data: [], error };
        }
    },
    
    async createAreaRule(ruleData) {
        try {
            const { data, error } = await supabase
                .from('area_rules')
                .insert([ruleData])
                .select()
                .single();
            
            if (error) throw error;
            return { data };
        } catch (error) {
            console.error('地域ルール作成エラー:', error);
            return { error };
        }
    },
    
    async updateAreaRule(id, ruleData) {
        try {
            const { data, error } = await supabase
                .from('area_rules')
                .update(ruleData)
                .eq('id', id)
                .select()
                .single();
            
            if (error) throw error;
            return { data };
        } catch (error) {
            console.error('地域ルール更新エラー:', error);
            return { error };
        }
    },
    
    async deleteAreaRule(id) {
        try {
            const { error } = await supabase
                .from('area_rules')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('地域ルール削除エラー:', error);
            return { error };
        }
    },
    
    // ===========================
    // ゴミ種類 (waste_types)
    // ===========================
    
    async getWasteTypes() {
        try {
            const { data, error } = await supabase
                .from('waste_types')
                .select('*')
                .order('display_order', { ascending: true })
                .limit(100);
            
            if (error) throw error;
            return { data: data || [] };
        } catch (error) {
            console.error('ゴミ種類取得エラー:', error);
            return { data: [], error };
        }
    },
    
    async createWasteType(wasteTypeData) {
        try {
            const { data, error } = await supabase
                .from('waste_types')
                .insert([wasteTypeData])
                .select()
                .single();
            
            if (error) throw error;
            return { data };
        } catch (error) {
            console.error('ゴミ種類作成エラー:', error);
            return { error };
        }
    },
    
    async updateWasteType(id, wasteTypeData) {
        try {
            const { data, error } = await supabase
                .from('waste_types')
                .update(wasteTypeData)
                .eq('id', id)
                .select()
                .single();
            
            if (error) throw error;
            return { data };
        } catch (error) {
            console.error('ゴミ種類更新エラー:', error);
            return { error };
        }
    },
    
    async deleteWasteType(id) {
        try {
            const { error } = await supabase
                .from('waste_types')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('ゴミ種類削除エラー:', error);
            return { error };
        }
    }
};

console.log('✅ Supabase APIレイヤー読み込み完了');
