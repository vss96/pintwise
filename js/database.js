/**
 * Database layer for SQLite Cloud integration
 */

// Import SQLite Cloud driver
import { Database } from '@sqlitecloud/drivers';

class PintDatabase {
  constructor() {
    this.connectionString = process.env.SQLITE_CONNECTION_STRING;

    if (!this.connectionString) {
      throw new Error('SQLITE_CONNECTION_STRING environment variable is required');
    }

    // Initialize SQLite Cloud database connection
    this.db = new Database(this.connectionString);
  }





  async executeQuery(sql, params = []) {
    try {
      let result;

      // Use the official SQLite Cloud driver syntax from documentation
      if (params && params.length > 0) {
        // For parameterized queries, pass SQL and parameters separately
        result = await this.db.sql(sql, ...params);
      } else {
        // For simple queries without parameters
        result = await this.db.sql(sql);
      }

      return result;
    } catch (error) {
      console.error('Database query failed:', error);
      throw error;
    }
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

      // Handle different possible return formats from SQLite Cloud driver
      if (typeof result === 'object' && result !== null) {
        // Check for various possible properties that indicate success
        if (result.changes !== undefined) {
          return result.changes > 0;
        } else if (result.rowsAffected !== undefined) {
          return result.rowsAffected > 0;
        } else if (result.affectedRows !== undefined) {
          return result.affectedRows > 0;
        } else if (result.success !== undefined) {
          return result.success;
        }
      }

      // If we can't determine success from the result, assume it worked
      // since the operation completed without throwing an error
      return true;
    } catch (error) {
      console.error('Failed to mark pint as paid:', error);
      throw error;
    }
  }

  async deletePintEntry(id) {
    const sql = `DELETE FROM pint_entries WHERE id = ?`;

    try {
      const result = await this.executeQuery(sql, [id]);

      // Handle different possible return formats from SQLite Cloud driver
      if (typeof result === 'object' && result !== null) {
        // Check for various possible properties that indicate success
        if (result.changes !== undefined) {
          return result.changes > 0;
        } else if (result.rowsAffected !== undefined) {
          return result.rowsAffected > 0;
        } else if (result.affectedRows !== undefined) {
          return result.affectedRows > 0;
        } else if (result.success !== undefined) {
          return result.success;
        }
      }

      // If we can't determine success from the result, assume it worked
      // since the operation completed without throwing an error
      return true;
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
