/**
 * Database layer for SQLite Cloud integration
 */

class PintDatabase {
  constructor() {
    this.connectionString = process.env.SQLITE_CONNECTION_STRING;
    this.baseUrl = this.extractBaseUrl();
    this.apiKey = this.extractApiKey();
    this.database = this.extractDatabase();
    
    if (!this.connectionString) {
      console.warn('SQLite connection string not found. Using demo mode.');
      this.demoMode = true;
      this.demoData = this.loadDemoData();
    }
  }

  extractBaseUrl() {
    if (!this.connectionString) return null;
    const match = this.connectionString.match(/sqlitecloud:\/\/([^\/]+)/);
    return match ? `https://${match[1]}` : null;
  }

  extractApiKey() {
    if (!this.connectionString) return null;
    const match = this.connectionString.match(/apikey=([^&]+)/);
    return match ? match[1] : null;
  }

  extractDatabase() {
    if (!this.connectionString) return null;
    const match = this.connectionString.match(/\/([^?]+)/);
    return match ? match[1] : null;
  }

  loadDemoData() {
    const stored = localStorage.getItem('pintwise_demo_data');
    if (stored) {
      return JSON.parse(stored);
    }
    return [];
  }

  saveDemoData() {
    if (this.demoMode) {
      localStorage.setItem('pintwise_demo_data', JSON.stringify(this.demoData));
    }
  }

  async executeQuery(sql, params = []) {
    if (this.demoMode) {
      return this.executeDemoQuery(sql, params);
    }

    try {
      const response = await fetch(`${this.baseUrl}/v2/weblite/${this.database}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          sql: sql,
          params: params
        })
      });

      if (!response.ok) {
        throw new Error(`Database error: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Database query failed:', error);
      throw error;
    }
  }

  executeDemoQuery(sql, params = []) {
    // Simple demo mode implementation
    const sqlLower = sql.toLowerCase().trim();
    
    if (sqlLower.includes('create table')) {
      return { success: true };
    }
    
    if (sqlLower.startsWith('insert')) {
      const id = Date.now();
      const entry = {
        id: id,
        debtor: params[0] || 'Demo User',
        creditor: params[1] || 'Demo Friend',
        description: params[2] || 'Demo pint',
        amount: params[3] || 1.0,
        date_created: new Date().toISOString(),
        date_paid: null,
        status: 'pending'
      };
      this.demoData.push(entry);
      this.saveDemoData();
      return { lastInsertRowid: id };
    }
    
    if (sqlLower.startsWith('select')) {
      if (sqlLower.includes('where status = ?') && params[0] === 'pending') {
        return this.demoData.filter(entry => entry.status === 'pending');
      }
      return this.demoData;
    }
    
    if (sqlLower.startsWith('update')) {
      const id = params[params.length - 1];
      const entry = this.demoData.find(e => e.id == id);
      if (entry) {
        entry.status = 'paid';
        entry.date_paid = new Date().toISOString();
        this.saveDemoData();
      }
      return { changes: 1 };
    }
    
    if (sqlLower.startsWith('delete')) {
      const id = params[0];
      const index = this.demoData.findIndex(e => e.id == id);
      if (index !== -1) {
        this.demoData.splice(index, 1);
        this.saveDemoData();
      }
      return { changes: 1 };
    }
    
    return [];
  }

  async initializeDatabase() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS pint_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        debtor TEXT NOT NULL,
        creditor TEXT NOT NULL,
        description TEXT,
        amount REAL DEFAULT 1.0,
        date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
        date_paid DATETIME,
        status TEXT DEFAULT 'pending'
      )
    `;

    try {
      await this.executeQuery(createTableSQL);
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  async addPintEntry(debtor, creditor, description = '', amount = 1.0) {
    const sql = `
      INSERT INTO pint_entries (debtor, creditor, description, amount)
      VALUES (?, ?, ?, ?)
    `;
    
    try {
      const result = await this.executeQuery(sql, [debtor, creditor, description, amount]);
      return result.lastInsertRowid;
    } catch (error) {
      console.error('Failed to add pint entry:', error);
      throw error;
    }
  }

  async getPendingPints() {
    const sql = `
      SELECT * FROM pint_entries 
      WHERE status = 'pending' 
      ORDER BY date_created DESC
    `;
    
    try {
      return await this.executeQuery(sql);
    } catch (error) {
      console.error('Failed to get pending pints:', error);
      throw error;
    }
  }

  async getAllPints() {
    const sql = `
      SELECT * FROM pint_entries 
      ORDER BY date_created DESC
    `;
    
    try {
      return await this.executeQuery(sql);
    } catch (error) {
      console.error('Failed to get all pints:', error);
      throw error;
    }
  }

  async markPintAsPaid(id) {
    const sql = `
      UPDATE pint_entries 
      SET status = 'paid', date_paid = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    
    try {
      const result = await this.executeQuery(sql, [id]);
      return result.changes > 0;
    } catch (error) {
      console.error('Failed to mark pint as paid:', error);
      throw error;
    }
  }

  async deletePintEntry(id) {
    const sql = `DELETE FROM pint_entries WHERE id = ?`;
    
    try {
      const result = await this.executeQuery(sql, [id]);
      return result.changes > 0;
    } catch (error) {
      console.error('Failed to delete pint entry:', error);
      throw error;
    }
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
