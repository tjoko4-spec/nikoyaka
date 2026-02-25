// ===========================
// Supabase設定
// ===========================

const SUPABASE_URL = 'https://nuzzcimbqzzbhjvoewwn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51enpjaW1icXp6Ymhqdm9ld3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzM0MjgsImV4cCI6MjA4NjkwOTQyOH0.JDhQP42JUD2Za_vJq3_9Bv3Bz81VELcrYRTofkiUlTQ';

// Supabaseクライアントの初期化
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Supabase初期化完了');
