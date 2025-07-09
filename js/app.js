/**
 * Pintwise - Main Application Logic
 */

// Import database module
import './database.js';

class PintApp {
  constructor() {
    this.db = new PintDatabase();
    this.currentView = 'pending';
    this.allEntries = [];
    this.init();
  }

  async init() {
    try {
      // Setup event listeners first (before database operations)
      this.setupEventListeners();

      // Initialize database
      await this.db.initializeDatabase();

      // Load initial data
      await this.loadData();

      // Show initial view
      this.showView('pending');
    } catch (error) {
      console.error('Failed to initialize app:', error);

      // Even if database fails, set up event listeners so navigation works
      try {
        this.setupEventListeners();
        this.showView('pending');
      } catch (fallbackError) {
        console.error('Critical error - even fallback failed:', fallbackError);
      }

      this.showError('Failed to initialize app. Running in limited mode.');
    }
  }

  setupEventListeners() {
    // Navigation
    const navButtons = document.querySelectorAll('.nav-btn');

    navButtons.forEach((btn, index) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const view = e.target.dataset.view;
        this.showView(view);
      });
    });

    // Add pint form
    const addForm = document.getElementById('add-pint-form');
    if (addForm) {
      addForm.addEventListener('submit', (e) => this.handleAddPint(e));
    }

    // Search functionality
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadData());
    }
  }

  async loadData() {
    try {
      this.showLoading(true);
      // Always load all entries for stats and balances calculation
      this.allEntries = await this.db.getAllPints();
      this.updateCurrentView();
      this.updateStats();
    } catch (error) {
      console.error('Failed to load data:', error);
      this.showError('Failed to load data from database.');
    } finally {
      this.showLoading(false);
    }
  }

  showView(viewName) {
    // Update navigation
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update view content
    const views = document.querySelectorAll('.view');
    views.forEach(view => {
      const shouldShow = view.classList.contains(`${viewName}-view`);
      view.classList.toggle('hidden', !shouldShow);
    });

    this.currentView = viewName;
    this.updateCurrentView();
  }

  updateCurrentView() {
    switch (this.currentView) {
      case 'pending':
        this.renderPendingPints();
        break;
      case 'all':
        this.renderAllPints();
        break;
      case 'balances':
        this.renderNetBalances();
        break;
      case 'add':
        // Add form is already rendered in HTML
        break;
    }
  }

  renderPendingPints() {
    const container = document.getElementById('pending-list');
    if (!container) return;

    const pendingEntries = this.allEntries.filter(entry => entry.status === 'pending');

    if (pendingEntries.length === 0) {
      container.innerHTML = '<div class="empty-state">No pending pints! 🍺</div>';
      return;
    }

    container.innerHTML = pendingEntries.map(entry => `
      <div class="pint-entry" data-id="${entry.id}">
        <div class="pint-info">
          <div class="pint-people">
            <strong>${this.escapeHtml(entry.debtor)}</strong> owes
            <strong>${this.escapeHtml(entry.creditor)}</strong>
          </div>
          <div class="pint-details">
            ${entry.amount} pint${entry.amount !== 1 ? 's' : ''}
            ${entry.description ? ` - ${this.escapeHtml(entry.description)}` : ''}
          </div>
          <div class="pint-date">${this.formatDate(entry.date_created)}</div>
        </div>
        <div class="pint-actions">
          <button class="btn btn-success" onclick="app.markAsPaid(${entry.id})">
            Mark Paid
          </button>
          <button class="btn btn-danger" onclick="app.deletePint(${entry.id})">
            Delete
          </button>
        </div>
      </div>
    `).join('');
  }

  renderAllPints() {
    const container = document.getElementById('all-list');
    if (!container) return;

    if (this.allEntries.length === 0) {
      container.innerHTML = '<div class="empty-state">No pint entries yet! Add some above. 🍺</div>';
      return;
    }

    container.innerHTML = this.allEntries.map(entry => `
      <div class="pint-entry ${entry.status}" data-id="${entry.id}">
        <div class="pint-info">
          <div class="pint-people">
            <strong>${this.escapeHtml(entry.debtor)}</strong> owes
            <strong>${this.escapeHtml(entry.creditor)}</strong>
          </div>
          <div class="pint-details">
            ${entry.amount} pint${entry.amount !== 1 ? 's' : ''}
            ${entry.description ? ` - ${this.escapeHtml(entry.description)}` : ''}
          </div>
          <div class="pint-date">
            Created: ${this.formatDate(entry.date_created)}
            ${entry.date_paid ? ` | Paid: ${this.formatDate(entry.date_paid)}` : ''}
          </div>
        </div>
        <div class="pint-status">
          <span class="status-badge ${entry.status}">${entry.status}</span>
        </div>
      </div>
    `).join('');
  }

  renderNetBalances() {
    const container = document.getElementById('balances-list');
    if (!container) return;

    const netBalances = this.db.calculateNetBalances(this.allEntries);

    if (netBalances.length === 0) {
      container.innerHTML = '<div class="empty-state">All debts are settled! 🎉</div>';
      return;
    }

    container.innerHTML = netBalances.map(balance => `
      <div class="balance-entry">
        <div class="balance-info">
          <strong>${this.escapeHtml(balance.debtor)}</strong> owes
          <strong>${this.escapeHtml(balance.creditor)}</strong>
        </div>
        <div class="balance-amount">
          ${balance.amount.toFixed(1)} pint${balance.amount !== 1 ? 's' : ''}
        </div>
      </div>
    `).join('');
  }

  async handleAddPint(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const debtor = formData.get('debtor').trim();
    const creditor = formData.get('creditor').trim();
    const description = formData.get('description').trim();
    const amount = parseFloat(formData.get('amount')) || 1.0;

    if (!debtor || !creditor) {
      this.showError('Please enter both debtor and creditor names.');
      return;
    }

    if (debtor === creditor) {
      this.showError('Debtor and creditor cannot be the same person.');
      return;
    }

    try {
      this.showLoading(true);
      await this.db.addPintEntry(debtor, creditor, description, amount);

      // Reset form
      e.target.reset();

      // Reload data and show pending view
      await this.loadData();
      this.showView('pending');

      this.showSuccess('Pint entry added successfully!');
    } catch (error) {
      console.error('Failed to add pint:', error);
      this.showError('Failed to add pint entry.');
    } finally {
      this.showLoading(false);
    }
  }

  async markAsPaid(id) {
    if (!confirm('Mark this pint as paid?')) return;

    try {
      this.showLoading(true);
      const success = await this.db.markPintAsPaid(id);

      if (success) {
        await this.loadData();
        this.showSuccess('Pint marked as paid!');
      } else {
        this.showError('Failed to mark pint as paid.');
      }
    } catch (error) {
      console.error('Failed to mark as paid:', error);
      this.showError('Failed to mark pint as paid.');
    } finally {
      this.showLoading(false);
    }
  }

  async deletePint(id) {
    if (!confirm('Delete this pint entry? This cannot be undone.')) return;

    try {
      this.showLoading(true);
      const success = await this.db.deletePintEntry(id);

      if (success) {
        await this.loadData();
        this.showSuccess('Pint entry deleted!');
      } else {
        this.showError('Failed to delete pint entry.');
      }
    } catch (error) {
      console.error('Failed to delete pint:', error);
      this.showError('Failed to delete pint entry.');
    } finally {
      this.showLoading(false);
    }
  }

  handleSearch(query) {
    const searchTerm = query.toLowerCase().trim();

    if (!searchTerm) {
      this.updateCurrentView();
      return;
    }

    const filteredEntries = this.allEntries.filter(entry =>
      entry.debtor.toLowerCase().includes(searchTerm) ||
      entry.creditor.toLowerCase().includes(searchTerm) ||
      (entry.description && entry.description.toLowerCase().includes(searchTerm))
    );

    // Update the current view with filtered results
    this.renderFilteredResults(filteredEntries);
  }

  renderFilteredResults(entries) {
    const container = this.getCurrentViewContainer();
    if (!container) return;

    if (entries.length === 0) {
      container.innerHTML = '<div class="empty-state">No matching entries found.</div>';
      return;
    }

    // Render based on current view
    if (this.currentView === 'pending') {
      const pendingEntries = entries.filter(entry => entry.status === 'pending');
      this.renderEntriesInContainer(container, pendingEntries, 'pending');
    } else if (this.currentView === 'all') {
      this.renderEntriesInContainer(container, entries, 'all');
    }
  }

  getCurrentViewContainer() {
    switch (this.currentView) {
      case 'pending': return document.getElementById('pending-list');
      case 'all': return document.getElementById('all-list');
      case 'balances': return document.getElementById('balances-list');
      default: return null;
    }
  }

  renderEntriesInContainer(container, entries, type) {
    if (type === 'pending') {
      container.innerHTML = entries.map(entry => `
        <div class="pint-entry" data-id="${entry.id}">
          <div class="pint-info">
            <div class="pint-people">
              <strong>${this.escapeHtml(entry.debtor)}</strong> owes
              <strong>${this.escapeHtml(entry.creditor)}</strong>
            </div>
            <div class="pint-details">
              ${entry.amount} pint${entry.amount !== 1 ? 's' : ''}
              ${entry.description ? ` - ${this.escapeHtml(entry.description)}` : ''}
            </div>
            <div class="pint-date">${this.formatDate(entry.date_created)}</div>
          </div>
          <div class="pint-actions">
            <button class="btn btn-success" onclick="app.markAsPaid(${entry.id})">
              Mark Paid
            </button>
            <button class="btn btn-danger" onclick="app.deletePint(${entry.id})">
              Delete
            </button>
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = entries.map(entry => `
        <div class="pint-entry ${entry.status}" data-id="${entry.id}">
          <div class="pint-info">
            <div class="pint-people">
              <strong>${this.escapeHtml(entry.debtor)}</strong> owes
              <strong>${this.escapeHtml(entry.creditor)}</strong>
            </div>
            <div class="pint-details">
              ${entry.amount} pint${entry.amount !== 1 ? 's' : ''}
              ${entry.description ? ` - ${this.escapeHtml(entry.description)}` : ''}
            </div>
            <div class="pint-date">
              Created: ${this.formatDate(entry.date_created)}
              ${entry.date_paid ? ` | Paid: ${this.formatDate(entry.date_paid)}` : ''}
            </div>
          </div>
          <div class="pint-status">
            <span class="status-badge ${entry.status}">${entry.status}</span>
          </div>
        </div>
      `).join('');
    }
  }

  updateStats() {
    const totalPints = this.allEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const pendingPints = this.allEntries
      .filter(entry => entry.status === 'pending')
      .reduce((sum, entry) => sum + entry.amount, 0);
    const paidPints = totalPints - pendingPints;

    // Update stats in header if elements exist
    const totalElement = document.getElementById('total-pints');
    const pendingElement = document.getElementById('pending-pints');
    const paidElement = document.getElementById('paid-pints');

    if (totalElement) totalElement.textContent = totalPints.toFixed(1);
    if (pendingElement) pendingElement.textContent = pendingPints.toFixed(1);
    if (paidElement) paidElement.textContent = paidPints.toFixed(1);
  }

  showLoading(show) {
    const loader = document.getElementById('loading');
    if (loader) {
      loader.classList.toggle('hidden', !show);
    }
  }

  showError(message) {
    this.showMessage(message, 'error');
  }

  showSuccess(message) {
    this.showMessage(message, 'success');
  }

  showMessage(message, type) {
    // Remove existing messages
    document.querySelectorAll('.message').forEach(msg => msg.remove());

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;

    document.body.appendChild(messageDiv);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      messageDiv.remove();
    }, 3000);
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new PintApp();
});
