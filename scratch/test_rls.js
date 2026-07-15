import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env file manually
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach((line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const anonKey = env['VITE_SUPABASE_ANON_KEY'];

async function getOrCreateUser(supabaseClient, email, password) {
  const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });
  if (!signInError && signInData?.user) {
    console.log('User signed in:', email, signInData.user.id);
    return signInData;
  }
  
  const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
    email,
    password,
  });
  if (signUpError) {
    throw new Error(`Failed to get/create ${email}: ${signUpError.message}`);
  }
  console.log('User signed up:', email, signUpData.user.id);
  return signUpData;
}

async function runTest() {
  console.log('URL:', supabaseUrl);
  console.log('Starting RLS test...');
  const supabaseA = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const supabaseB = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  
  // 1. Get/create user A
  const emailA = 'rls_test_user_a@precisfinance.com.br';
  const passwordA = 'TestPass123!';
  const authA = await getOrCreateUser(supabaseA, emailA, passwordA);
  
  // 2. Get/create user B
  const emailB = 'rls_test_user_b@precisfinance.com.br';
  const passwordB = 'TestPass123!';
  const authB = await getOrCreateUser(supabaseB, emailB, passwordB);
  
  // 3. Log in as User B and insert/upsert their state containing spouseId = User A's ID
  const spouseStateB = {
    settings: {
      baseCurrency: 'BRL',
      selectedMonth: '2026-07',
      spouseId: authA.user.id,
      userName: 'User B',
      rates: {},
      autoCategorization: true
    },
    accounts: [],
    cards: [],
    categories: [],
    transactions: [],
    budgets: [],
    goals: [],
    rules: []
  };
  
  const { error: insertErrB } = await supabaseB.from('finance_states').upsert({
    user_id: authB.user.id,
    state: spouseStateB,
    updated_at: new Date().toISOString()
  });
  if (insertErrB) throw new Error('User B failed to insert state: ' + insertErrB.message);
  console.log('User B state upserted successfully with spouseId =', authA.user.id);
  
  // 4. Attempt to select User B's state from User A's client
  const { data: selectedB, error: selectErrA } = await supabaseA
    .from('finance_states')
    .select('state')
    .eq('user_id', authB.user.id)
    .maybeSingle();
    
  if (selectErrA) {
    console.error('User A FAILED to read User B state with error:', selectErrA);
  } else if (!selectedB) {
    console.error('User A got NULL when reading User B state (RLS blocked it silently)');
  } else {
    console.log('User A SUCCESSFULY read User B state! Result settings:', selectedB.state.settings);
  }
}

runTest().catch((e) => {
  console.error('Test script crashed:', e);
});
