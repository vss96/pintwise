/**
 * Database layer for PostgreSQL integration via Supabase
 */

// Import Supabase client
import { createClient } from '@supabase/supabase-js';

class PintDatabase {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_ANON_KEY;
    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('Supabase URL and anon key are required');
    }
    this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
  }

  async addPintEntry(debtor, creditor, description = '', amount = 1.0) {
    console.log('Adding pint entry:', { debtor, creditor, description, amount });
    const { data, error } = await this.supabase
      .from('pint_entries')
      .insert([{
        debtor,
        creditor,
        description,
        amount,
        status: 'pending'
      }])
      .select();

    if (error) {
      console.error('Insert error:', error);
      throw error;
    }

    console.log('Insert successful:', data);
    return data[0]?.id;
  }

  async getPendingPints() {
    const { data, error } = await this.supabase
      .from('pint_entries')
      .select('*')
      .eq('status', 'pending')
      .order('date_created', { ascending: false });
    if (error) throw error;
    return data;
  }

  async getAllPints() {
    const { data, error } = await this.supabase
      .from('pint_entries')
      .select('*')
      .order('date_created', { ascending: false });
    if (error) throw error;
    return data;
  }

  async markPintAsPaid(id) {
    const { error } = await this.supabase
      .from('pint_entries')
      .update({ status: 'paid', date_paid: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return true;
  }

  async deletePintEntry(id) {
    const { error } = await this.supabase
      .from('pint_entries')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  }

  calculateNetBalances(entries) {
    const balances = {};

    entries.forEach(entry => {
      if (entry.status === 'pending') {
        const { debtor, creditor, amount } = entry;

        if (!balances[debtor]) balances[debtor] = {};
        if (!balances[creditor]) balances[creditor] = {};

        if (!balances[debtor][creditor]) balances[debtor][creditor] = 0;
        if (!balances[creditor][debtor]) balances[creditor][debtor] = 0;

        balances[debtor][creditor] += amount;
      }
    });

    // Calculate net balances
    const netBalances = [];
    const processed = new Set();

    Object.keys(balances).forEach(person1 => {
      Object.keys(balances[person1]).forEach(person2 => {
        const key = [person1, person2].sort().join('-');
        if (processed.has(key)) return;
        processed.add(key);

        const debt1to2 = balances[person1][person2] || 0;
        const debt2to1 = balances[person2][person1] || 0;
        const netDebt = debt1to2 - debt2to1;

        if (Math.abs(netDebt) > 0.01) { // Avoid floating point precision issues
          netBalances.push({
            debtor: netDebt > 0 ? person1 : person2,
            creditor: netDebt > 0 ? person2 : person1,
            amount: Math.abs(netDebt)
          });
        }
      });
    });

    return netBalances;
  }
}

// Export for use in other modules
window.PintDatabase = PintDatabase;
