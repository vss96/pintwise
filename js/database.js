/**
 * Database layer for Pintwise.
 * Talks to same-origin Cloudflare Pages Functions backed by Cloudflare D1.
 * No credentials in the client.
 */
class PintDatabase {
  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  async _request(path, options = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'content-type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json()).error || '';
      } catch {
        /* non-JSON error body */
      }
      throw new Error(`Request failed (${res.status}) ${detail}`.trim());
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async addPintEntry(debtor, creditor, description = '', amount = 1.0) {
    const data = await this._request('/pints', {
      method: 'POST',
      body: JSON.stringify({ debtor, creditor, description, amount }),
    });
    return data?.id;
  }

  async getPendingPints() {
    return this._request('/pints?status=pending');
  }

  async getAllPints() {
    return this._request('/pints');
  }

  async markPintAsPaid(id) {
    await this._request(`/pints/${id}`, { method: 'PATCH' });
    return true;
  }

  async deletePintEntry(id) {
    await this._request(`/pints/${id}`, { method: 'DELETE' });
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
