import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = 'https://hyedbsaxhebpttkeortm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5ZWRic2F4aGVicHR0a2VvcnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDQ5ODc2MDAsImV4cCI6MjAyMDU2MzYwMH0.GG5UMtP_WGK_CXH7lLw5h5Z_-YZfCfCbbYZnNZ0lw-k';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);