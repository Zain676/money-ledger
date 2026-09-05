/**
 * MONEY LEDGER — FINANCIAL CONTROL & OWNERSHIP
 * Full-featured production-ready state store, transaction engine,
 * SPA router, visual analytics, data persistence & export/import engine.
 */

// ============================================================================
// 1. DATA STORE & DEFAULT STATE
// ============================================================================

const DEFAULT_CATEGORIES = [
    // Income Categories
    { id: 'cat_salary', name: 'Salary', icon: '💼', type: 'in', color: '#10b981' },
    { id: 'cat_freelance', name: 'Freelance & Projects', icon: '💻', type: 'in', color: '#06b6d4' },
    { id: 'cat_business', name: 'Business Income', icon: '🏢', type: 'in', color: '#3b82f6' },
    { id: 'cat_invest_in', name: 'Investment Returns', icon: '📈', type: 'in', color: '#8b5cf6' },
    { id: 'cat_gift_in', name: 'Gift / Bonus', icon: '🎁', type: 'in', color: '#ec4899' },
    { id: 'cat_other_in', name: 'Other Income', icon: '💵', type: 'in', color: '#64748b' },

    // Expense Categories
    { id: 'cat_food', name: 'Food & Dining', icon: '🍔', type: 'out', color: '#f97316' },
    { id: 'cat_groceries', name: 'Groceries & Home', icon: '🛒', type: 'out', color: '#eab308' },
    { id: 'cat_bills', name: 'Utilities & Bills', icon: '⚡', type: 'out', color: '#ef4444' },
    { id: 'cat_rent', name: 'Rent & Housing', icon: '🏠', type: 'out', color: '#dc2626' },
    { id: 'cat_shopping', name: 'Shopping & Clothes', icon: '🛍️', type: 'out', color: '#ec4899' },
    { id: 'cat_transport', name: 'Fuel & Transport', icon: '🚗', type: 'out', color: '#06b6d4' },
    { id: 'cat_entertainment', name: 'Entertainment & Subs', icon: '🎬', type: 'out', color: '#8b5cf6' },
    { id: 'cat_healthcare', name: 'Health & Medical', icon: '🏥', type: 'out', color: '#14b8a6' },
    { id: 'cat_education', name: 'Education & Books', icon: '📚', type: 'out', color: '#6366f1' },
    { id: 'cat_personal', name: 'Personal & Family', icon: '👨‍👩‍👦', type: 'out', color: '#f43f5e' },
    { id: 'cat_transfer', name: 'Transfer / Settle', icon: '⇄', type: 'both', color: '#64748b' },
    { id: 'cat_other_out', name: 'Other Expense', icon: '💳', type: 'out', color: '#64748b' }
];

const INITIAL_STATE = {
    accounts: [],
    people: [],
    categories: DEFAULT_CATEGORIES,
    transactions: [],
    settings: {
        currency: 'Rs. ',
        theme: 'light'
    }
};

let state = JSON.parse(JSON.stringify(INITIAL_STATE));

// UI State (Not persisted to storage)
const ui = {
    activeView: 'overview',
    sortField: 'date',
    sortDirection: 'desc',
    filter: {
        search: '',
        type: 'all',
        account: 'all',
        person: 'all',
        category: 'all',
        rangePreset: 'all',
        startDate: '',
        endDate: ''
    },
    currentPage: 1,
    pageSize: 15,
    confirmCallback: null
};

// ============================================================================
// 2. INITIALIZATION & PERSISTENCE
// ============================================================================

const cloudState = {
    status: 'local', // 'local' | 'syncing' | 'synced' | 'error'
    isConnected: false,
    databaseName: null,
    lastSyncedAt: null,
    debounceTimer: null
};

function init() {
    loadStateFromStorage();
    initTheme();
    setupEventListeners();
    populateFilterDropdowns();
    populateSelectDropdowns();
    handleHashNavigation();
    renderApp();
    initCloudSync();
}

function loadStateFromStorage() {
    const saved = localStorage.getItem('moneyLedger_prod');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state = {
                ...INITIAL_STATE,
                ...parsed,
                accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
                people: Array.isArray(parsed.people) ? parsed.people : [],
                transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
                categories: parsed.categories && parsed.categories.length ? parsed.categories : DEFAULT_CATEGORIES,
                settings: { ...INITIAL_STATE.settings, ...(parsed.settings || {}) }
            };
        } catch (e) {
            console.error('Failed to parse saved state:', e);
            state = JSON.parse(JSON.stringify(INITIAL_STATE));
        }
    } else {
        state = JSON.parse(JSON.stringify(INITIAL_STATE));
        saveState();
    }
}

function saveState() {
    try {
        localStorage.setItem('moneyLedger_prod', JSON.stringify(state));
    } catch (e) {
        showToast('Storage quota exceeded or unavailable', 'error');
    }
}

function saveAndRefresh() {
    saveState();
    renderApp();
    syncToCloud(); // Auto-sync to MongoDB Atlas in background
}

// Helpers to match legacy data
function findPersonIdByName(name) {
    const p = state.people.find(item => item.name.toLowerCase() === (name || '').toLowerCase());
    return p ? p.id : (state.people[0] ? state.people[0].id : null);
}

function findAccountIdByName(name) {
    const a = state.accounts.find(item => item.name.toLowerCase() === (name || '').toLowerCase());
    return a ? a.id : (state.accounts[0] ? state.accounts[0].id : null);
}

// ============================================================================
// 3. EVENT LISTENERS & NAVIGATION
// ============================================================================

function setupEventListeners() {
    window.addEventListener('hashchange', handleHashNavigation);

    // Global keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
        } else if ((e.key === 'n' || e.key === 'N') && !isInputFocused()) {
            e.preventDefault();
            openTransactionModal('in');
        } else if (e.key === '/' && !isInputFocused()) {
            e.preventDefault();
            switchView('transactions');
            const searchEl = document.getElementById('tx-search-input');
            if (searchEl) searchEl.focus();
        }
    });

    // Form Submissions
    document.getElementById('transaction-form').addEventListener('submit', handleTransactionSubmit);
    document.getElementById('account-form').addEventListener('submit', handleAccountSubmit);
    document.getElementById('person-form').addEventListener('submit', handlePersonSubmit);
    document.getElementById('settle-form').addEventListener('submit', handleSettleSubmit);

    // Set default transaction date to today
    const dateInput = document.getElementById('tx-date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
}

function isInputFocused() {
    const active = document.activeElement;
    return active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA');
}

function handleHashNavigation() {
    const hash = window.location.hash.replace('#', '') || 'overview';
    const validViews = ['overview', 'transactions', 'accounts', 'people', 'analytics', 'settings'];
    if (validViews.includes(hash)) {
        switchView(hash, false);
    }
}

function switchView(viewName, updateHash = true) {
    ui.activeView = viewName;

    // Update active view panel
    document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    const targetPanel = document.getElementById(`view-${viewName}`);
    if (targetPanel) targetPanel.classList.add('active');

    // Update desktop sidebar nav links
    document.querySelectorAll('.nav-menu .nav-item').forEach(link => {
        if (link.getAttribute('data-view') === viewName) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // Update mobile bottom nav links
    document.querySelectorAll('.bottom-nav-link').forEach(link => {
        if (link.getAttribute('data-view') === viewName) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    if (updateHash && window.location.hash !== `#${viewName}`) {
        window.location.hash = viewName;
    }

    // Close sidebar on mobile
    closeSidebar();

    // Re-render view specific dynamic components
    if (viewName === 'transactions') {
        renderTransactionsTable();
    } else if (viewName === 'analytics') {
        renderAnalytics();
    } else if (viewName === 'accounts') {
        renderAccountsManagement();
    } else if (viewName === 'people') {
        renderPeopleManagement();
    } else if (viewName === 'settings') {
        renderSettingsView();
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.toggle('open');
    if (backdrop) backdrop.classList.toggle('active');
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
}

// ============================================================================
// 4. TRANSACTION ENGINE & BALANCE CALCULATION
// ============================================================================

/**
 * Apply the financial delta of a transaction to state accounts and people.
 * @param {Object} tx - Transaction object
 * @param {number} direction - 1 to apply transaction, -1 to rollback/undo
 */
function applyTransactionEffects(tx, direction = 1) {
    const amount = tx.amount * direction;

    if (tx.type === 'in') {
        const acc = state.accounts.find(a => a.id === tx.accountId);
        if (acc) acc.balance += amount;

        const person = state.people.find(p => p.id === tx.personId);
        if (person) person.balance += amount;

    } else if (tx.type === 'out') {
        const acc = state.accounts.find(a => a.id === tx.accountId);
        if (acc) acc.balance -= amount;

        const person = state.people.find(p => p.id === tx.personId);
        if (person) person.balance -= amount;

    } else if (tx.type === 'transfer_account') {
        const fromAcc = state.accounts.find(a => a.id === tx.accountId);
        const toAcc = state.accounts.find(a => a.id === tx.toAccountId);
        if (fromAcc) fromAcc.balance -= amount;
        if (toAcc) toAcc.balance += amount;

    } else if (tx.type === 'transfer_person') {
        const fromPerson = state.people.find(p => p.id === tx.personId);
        const toPerson = state.people.find(p => p.id === tx.toPersonId);
        if (fromPerson) fromPerson.balance -= amount;
        if (toPerson) toPerson.balance += amount;
    }
}

function handleTransactionSubmit(e) {
    e.preventDefault();

    const editId = document.getElementById('tx-edit-id').value;
    const type = document.getElementById('trans-type').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const date = document.getElementById('tx-date').value || new Date().toISOString().split('T')[0];
    const category = document.getElementById('category-select').value;
    const desc = document.getElementById('description').value.trim();
    const notes = document.getElementById('tx-notes').value.trim();

    if (!amount || amount <= 0 || isNaN(amount)) {
        showToast('Please enter a valid amount greater than 0', 'error');
        return;
    }

    let txData = {
        id: editId || `tx_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        date,
        type,
        amount,
        category,
        desc,
        notes
    };

    if (type === 'in' || type === 'out') {
        txData.personId = document.getElementById('person-select').value;
        txData.accountId = document.getElementById('account-select').value;

        if (!txData.personId || !txData.accountId) {
            showToast('Please select both a person and an account', 'error');
            return;
        }
    } else if (type === 'transfer_account') {
        txData.accountId = document.getElementById('transfer-from-account').value;
        txData.toAccountId = document.getElementById('transfer-to-account').value;

        if (!txData.accountId || !txData.toAccountId) {
            showToast('Please select source and destination accounts', 'error');
            return;
        }
        if (txData.accountId === txData.toAccountId) {
            showToast('Source and destination accounts must be different', 'error');
            return;
        }
    } else if (type === 'transfer_person') {
        txData.personId = document.getElementById('transfer-from-person').value;
        txData.toPersonId = document.getElementById('transfer-to-person').value;

        if (!txData.personId || !txData.toPersonId) {
            showToast('Please select both sender and receiver', 'error');
            return;
        }
        if (txData.personId === txData.toPersonId) {
            showToast('Sender and receiver must be different people', 'error');
            return;
        }
    }

    if (editId) {
        // Rollback old transaction effect
        const existingTxIndex = state.transactions.findIndex(t => t.id === editId);
        if (existingTxIndex !== -1) {
            applyTransactionEffects(state.transactions[existingTxIndex], -1);
            state.transactions[existingTxIndex] = txData;
            applyTransactionEffects(txData, 1);
            showToast('Transaction updated successfully', 'success');
        }
    } else {
        // New transaction
        state.transactions.unshift(txData);
        applyTransactionEffects(txData, 1);
        showToast('Transaction recorded successfully', 'success');
    }

    saveAndRefresh();
    closeModal('transaction-modal');
}

function deleteTransaction(id) {
    const tx = state.transactions.find(t => t.id === id);
    if (!tx) return;

    openConfirmModal(
        'Delete Transaction?',
        `Are you sure you want to delete "${tx.desc}" (${formatCurrency(tx.amount)})? Balances will be automatically restored.`,
        () => {
            applyTransactionEffects(tx, -1);
            state.transactions = state.transactions.filter(t => t.id !== id);
            saveAndRefresh();
            showToast('Transaction deleted and balances reverted', 'info');
        }
    );
}

function openTransactionModal(type = 'in', editId = null) {
    // Check if user has added accounts or people first
    if (!editId) {
        if (state.accounts.length === 0) {
            showToast('Please add at least one Account first (e.g., Bank or Cash)', 'info', 4000);
            openAccountModal();
            return;
        }
        if ((type === 'in' || type === 'out' || type === 'transfer_person') && state.people.length === 0) {
            showToast('Please add at least one Person first (e.g., Yourself)', 'info', 4000);
            openPersonModal();
            return;
        }
        if (type === 'transfer_account' && state.accounts.length < 2) {
            showToast('You need at least 2 accounts to make a bank transfer', 'info', 4000);
            openAccountModal();
            return;
        }
        if (type === 'transfer_person' && state.people.length < 2) {
            showToast('You need at least 2 people to transfer ownership', 'info', 4000);
            openPersonModal();
            return;
        }
    }

    const modal = document.getElementById('transaction-modal');
    const form = document.getElementById('transaction-form');
    form.reset();

    populateSelectDropdowns();

    document.getElementById('tx-edit-id').value = editId || '';
    document.getElementById('modal-currency-label').innerText = state.settings.currency.trim();
    document.querySelectorAll('.curr-symbol-span').forEach(el => el.innerText = state.settings.currency.trim());

    if (editId) {
        const tx = state.transactions.find(t => t.id === editId);
        if (!tx) return;
        document.getElementById('tx-modal-title').innerText = 'Edit Transaction';
        document.getElementById('tx-submit-btn').innerText = 'Update Transaction';
        setTxModalType(tx.type);

        document.getElementById('amount').value = tx.amount;
        document.getElementById('tx-date').value = tx.date;
        document.getElementById('description').value = tx.desc;
        document.getElementById('tx-notes').value = tx.notes || '';
        document.getElementById('category-select').value = tx.category || '';

        if (tx.type === 'in' || tx.type === 'out') {
            document.getElementById('person-select').value = tx.personId || '';
            document.getElementById('account-select').value = tx.accountId || '';
        } else if (tx.type === 'transfer_account') {
            document.getElementById('transfer-from-account').value = tx.accountId || '';
            document.getElementById('transfer-to-account').value = tx.toAccountId || '';
        } else if (tx.type === 'transfer_person') {
            document.getElementById('transfer-from-person').value = tx.personId || '';
            document.getElementById('transfer-to-person').value = tx.toPersonId || '';
        }
    } else {
        document.getElementById('tx-modal-title').innerText = 'Record Transaction';
        document.getElementById('tx-submit-btn').innerText = 'Save Transaction';
        document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
        setTxModalType(type);
    }

    modal.classList.add('active');
}

function setTxModalType(type) {
    document.getElementById('trans-type').value = type;

    // Update Pill Buttons
    document.querySelectorAll('.tab-pill').forEach(btn => btn.classList.remove('active'));
    if (type === 'in') document.getElementById('tab-tx-in').classList.add('active');
    if (type === 'out') document.getElementById('tab-tx-out').classList.add('active');
    if (type === 'transfer_account') document.getElementById('tab-tx-transfer').classList.add('active');
    if (type === 'transfer_person') document.getElementById('tab-tx-settle').classList.add('active');

    // Toggle Field Sections
    const standardFields = document.getElementById('fields-standard');
    const accTransferFields = document.getElementById('fields-account-transfer');
    const personTransferFields = document.getElementById('fields-person-transfer');
    const catGroup = document.getElementById('category-group');

    standardFields.style.display = (type === 'in' || type === 'out') ? 'flex' : 'none';
    accTransferFields.style.display = (type === 'transfer_account') ? 'flex' : 'none';
    personTransferFields.style.display = (type === 'transfer_person') ? 'flex' : 'none';

    // Populate category dropdown based on type
    populateCategoryDropdown(type);
}

let customCatSelectedEmoji = '🏷️';

function populateCategoryDropdown(type) {
    const select = document.getElementById('category-select');
    if (!select) return;

    let filtered = state.categories;
    if (type === 'in') {
        filtered = state.categories.filter(c => c.type === 'in' || c.type === 'both');
    } else if (type === 'out') {
        filtered = state.categories.filter(c => c.type === 'out' || c.type === 'both');
    } else {
        filtered = state.categories.filter(c => c.type === 'both' || c.id === 'cat_transfer');
    }

    const optionsHtml = filtered.map(c => `
        <option value="${c.id}">${c.icon} ${escapeHtml(c.name)}</option>
    `).join('');

    select.innerHTML = optionsHtml + `<option value="__custom__">✨ + Add Custom Category...</option>`;
}

function handleCategorySelectChange() {
    const select = document.getElementById('category-select');
    if (select && select.value === '__custom__') {
        toggleCustomCategoryPanel(true);
    }
}

function toggleCustomCategoryPanel(forceState) {
    const panel = document.getElementById('custom-category-panel');
    if (!panel) return;
    const isCurrentlyOpen = panel.style.display !== 'none' && panel.style.display !== '';
    const shouldShow = forceState !== undefined ? forceState : !isCurrentlyOpen;
    panel.style.display = shouldShow ? 'block' : 'none';
    if (shouldShow) {
        const input = document.getElementById('custom-cat-name-input');
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 50);
        }
    }
}

function toggleEmojiPicker() {
    const picker = document.getElementById('custom-emoji-picker');
    if (!picker) return;
    picker.style.display = (picker.style.display === 'none' || !picker.style.display) ? 'grid' : 'none';
}

function selectCustomEmoji(emoji) {
    customCatSelectedEmoji = emoji;
    const btn = document.getElementById('custom-cat-icon-btn');
    if (btn) btn.innerText = emoji;
    const picker = document.getElementById('custom-emoji-picker');
    if (picker) picker.style.display = 'none';
}

function handleCreateCustomCategory() {
    const input = document.getElementById('custom-cat-name-input');
    const name = input ? input.value.trim() : '';
    if (!name) {
        showToast('Please enter a category name', 'error');
        if (input) input.focus();
        return;
    }

    const typeInput = document.getElementById('trans-type');
    const type = typeInput ? typeInput.value : 'both';
    const catType = (type === 'in' || type === 'out') ? type : 'both';
    
    // Check for duplicate category name
    const existing = state.categories.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
        showToast(`Category "${existing.name}" already exists`, 'info');
        populateCategoryDropdown(type);
        const catSelect = document.getElementById('category-select');
        if (catSelect) catSelect.value = existing.id;
        toggleCustomCategoryPanel(false);
        return;
    }

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#14b8a6', '#f43f5e', '#6366f1'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newCat = {
        id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name,
        icon: customCatSelectedEmoji || '🏷️',
        type: catType,
        color: randomColor
    };

    state.categories.push(newCat);
    saveState();
    syncToCloud();

    // Refresh category selects across the application
    populateCategoryDropdown(type);
    populateFilterDropdowns();

    const select = document.getElementById('category-select');
    if (select) select.value = newCat.id;

    toggleCustomCategoryPanel(false);
    showToast(`Created category "${newCat.name}"`, 'success');
}

function populateFilterDropdowns() {
    const filterAcc = document.getElementById('tx-filter-account');
    const filterP = document.getElementById('tx-filter-person');
    const filterCat = document.getElementById('tx-filter-category');

    if (filterAcc) {
        const currentVal = ui.filter.account || filterAcc.value || 'all';
        filterAcc.innerHTML = `<option value="all">All Accounts</option>` + state.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
        filterAcc.value = currentVal;
    }
    if (filterP) {
        const currentVal = ui.filter.person || filterP.value || 'all';
        filterP.innerHTML = `<option value="all">All People</option>` + state.people.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
        filterP.value = currentVal;
    }
    if (filterCat) {
        const currentVal = ui.filter.category || filterCat.value || 'all';
        filterCat.innerHTML = `<option value="all">All Categories</option>` + state.categories.map(c => `<option value="${c.id}">${c.icon} ${escapeHtml(c.name)}</option>`).join('');
        filterCat.value = currentVal;
    }
}

function populateSelectDropdowns() {
    const pSelect = document.getElementById('person-select');
    const aSelect = document.getElementById('account-select');
    const fromAcc = document.getElementById('transfer-from-account');
    const toAcc = document.getElementById('transfer-to-account');
    const fromP = document.getElementById('transfer-from-person');
    const toP = document.getElementById('transfer-to-person');
    const settleFromP = document.getElementById('settle-from-person');
    const settleToP = document.getElementById('settle-to-person');

    const peopleOptions = state.people.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${formatCurrency(p.balance)})</option>`).join('');
    const accountOptions = state.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (${formatCurrency(a.balance)})</option>`).join('');

    if (pSelect) pSelect.innerHTML = peopleOptions;
    if (aSelect) aSelect.innerHTML = accountOptions;
    if (fromAcc) fromAcc.innerHTML = accountOptions;
    if (toAcc) toAcc.innerHTML = accountOptions;
    if (fromP) fromP.innerHTML = peopleOptions;
    if (toP) toP.innerHTML = peopleOptions;
    if (settleFromP) settleFromP.innerHTML = peopleOptions;
    if (settleToP) settleToP.innerHTML = peopleOptions;

    populateFilterDropdowns();
}

// Quick Settle / Debt Wizard
function openSettleModal(fromPersonId = null, toPersonId = null) {
    populateSelectDropdowns();
    const modal = document.getElementById('settle-modal');
    document.getElementById('settle-form').reset();

    if (fromPersonId) document.getElementById('settle-from-person').value = fromPersonId;
    if (toPersonId) document.getElementById('settle-to-person').value = toPersonId;

    document.querySelectorAll('.curr-symbol-span').forEach(el => el.innerText = state.settings.currency.trim());
    modal.classList.add('active');
}

function handleSettleSubmit(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('settle-amount').value);
    const fromPersonId = document.getElementById('settle-from-person').value;
    const toPersonId = document.getElementById('settle-to-person').value;
    const desc = document.getElementById('settle-desc').value.trim();

    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }
    if (fromPersonId === toPersonId) {
        showToast('Payer and receiver must be different people', 'error');
        return;
    }

    const txData = {
        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        date: new Date().toISOString().split('T')[0],
        type: 'transfer_person',
        amount,
        personId: fromPersonId,
        toPersonId: toPersonId,
        category: 'cat_transfer',
        desc: desc || 'Ownership Reallocation',
        notes: 'Recorded via Settle Wizard'
    };

    state.transactions.unshift(txData);
    applyTransactionEffects(txData, 1);
    saveAndRefresh();
    closeModal('settle-modal');
    showToast('Ownership transfer completed successfully', 'success');
}

// ============================================================================
// 5. ACCOUNTS & PEOPLE MANAGEMENT
// ============================================================================

function openAccountModal(accId = null) {
    const modal = document.getElementById('account-modal');
    const form = document.getElementById('account-form');
    form.reset();

    document.getElementById('acc-edit-id').value = accId || '';

    if (accId) {
        const acc = state.accounts.find(a => a.id === accId);
        if (!acc) return;
        document.getElementById('acc-modal-title').innerText = 'Edit Account';
        document.getElementById('acc-name').value = acc.name;
        document.getElementById('acc-type').value = acc.type || 'Bank';
        document.getElementById('acc-balance').value = acc.balance;
        document.getElementById('acc-color').value = acc.color || '#2563eb';
        document.getElementById('acc-notes').value = acc.notes || '';
        document.getElementById('acc-initial-group').style.display = 'none'; // Lock balance direct edit in modal
    } else {
        document.getElementById('acc-modal-title').innerText = 'Add New Account';
        document.getElementById('acc-color').value = '#2563eb';
        document.getElementById('acc-balance').value = '0';
        document.getElementById('acc-initial-group').style.display = 'block';
    }

    modal.classList.add('active');
}

function handleAccountSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById('acc-edit-id').value;
    const name = document.getElementById('acc-name').value.trim();
    const type = document.getElementById('acc-type').value;
    const color = document.getElementById('acc-color').value;
    const notes = document.getElementById('acc-notes').value.trim();

    if (!name) {
        showToast('Please enter an account name', 'error');
        return;
    }

    if (editId) {
        const acc = state.accounts.find(a => a.id === editId);
        if (acc) {
            acc.name = name;
            acc.type = type;
            acc.color = color;
            acc.notes = notes;
            showToast('Account updated', 'success');
        }
    } else {
        const balance = parseFloat(document.getElementById('acc-balance').value) || 0;
        const newAcc = {
            id: `acc_${Date.now()}`,
            name,
            type,
            balance,
            initialBalance: balance,
            color,
            notes
        };
        state.accounts.push(newAcc);
        showToast('Account created successfully', 'success');
    }

    saveAndRefresh();
    closeModal('account-modal');
}

function deleteAccount(id) {
    if (state.accounts.length <= 1) {
        showToast('You must have at least one account', 'error');
        return;
    }
    const acc = state.accounts.find(a => a.id === id);
    if (!acc) return;

    const txCount = state.transactions.filter(t => t.accountId === id || t.toAccountId === id).length;
    const msg = txCount > 0
        ? `Account "${acc.name}" is associated with ${txCount} transaction(s). Deleting it will keep past records but remove it from future selections.`
        : `Are you sure you want to delete account "${acc.name}"?`;

    openConfirmModal('Delete Account?', msg, () => {
        state.accounts = state.accounts.filter(a => a.id !== id);
        saveAndRefresh();
        showToast('Account deleted', 'info');
    });
}

function setAccColor(color) {
    document.getElementById('acc-color').value = color;
}

// Person Management
function openPersonModal(personId = null) {
    const modal = document.getElementById('person-modal');
    const form = document.getElementById('person-form');
    form.reset();

    document.getElementById('person-edit-id').value = personId || '';

    if (personId) {
        const person = state.people.find(p => p.id === personId);
        if (!person) return;
        document.getElementById('person-modal-title').innerText = 'Edit Person';
        document.getElementById('person-name').value = person.name;
        document.getElementById('person-color').value = person.color || '#0f172a';
        document.getElementById('person-notes').value = person.notes || '';
        document.getElementById('person-initial-group').style.display = 'none';
    } else {
        document.getElementById('person-modal-title').innerText = 'Add Person';
        document.getElementById('person-color').value = '#0f172a';
        document.getElementById('person-balance').value = '0';
        document.getElementById('person-initial-group').style.display = 'block';
    }

    modal.classList.add('active');
}

function handlePersonSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById('person-edit-id').value;
    const name = document.getElementById('person-name').value.trim();
    const color = document.getElementById('person-color').value;
    const notes = document.getElementById('person-notes').value.trim();

    if (!name) {
        showToast('Please enter a name', 'error');
        return;
    }

    if (editId) {
        const person = state.people.find(p => p.id === editId);
        if (person) {
            person.name = name;
            person.color = color;
            person.notes = notes;
            showToast('Person updated', 'success');
        }
    } else {
        const balance = parseFloat(document.getElementById('person-balance').value) || 0;
        const newPerson = {
            id: `p_${Date.now()}`,
            name,
            balance,
            initialBalance: balance,
            color,
            notes
        };
        state.people.push(newPerson);
        showToast('Person added to ledger', 'success');
    }

    saveAndRefresh();
    closeModal('person-modal');
}

function deletePerson(id) {
    if (state.people.length <= 1) {
        showToast('You must have at least one person in the ledger', 'error');
        return;
    }
    const person = state.people.find(p => p.id === id);
    if (!person) return;

    openConfirmModal(
        'Delete Person?',
        `Are you sure you want to remove "${person.name}"?`,
        () => {
            state.people = state.people.filter(p => p.id !== id);
            saveAndRefresh();
            showToast('Person removed', 'info');
        }
    );
}

function setPersonColor(color) {
    document.getElementById('person-color').value = color;
}

// ============================================================================
// 6. UI RENDERING ENGINE
// ============================================================================

function renderApp() {
    populateFilterDropdowns();
    populateSelectDropdowns();
    renderSidebarStats();
    renderOverview();
    renderActiveFilterChips();
    renderTransactionsTable();
    renderAccountsManagement();
    renderPeopleManagement();
    renderAnalytics();
}

function renderSidebarStats() {
    const total = state.accounts.reduce((sum, acc) => sum + acc.balance, 0);
    const totalEl = document.getElementById('sidebar-total-balance');
    if (totalEl) totalEl.innerText = formatCurrency(total);

    const txCountEl = document.getElementById('nav-tx-count');
    const accCountEl = document.getElementById('nav-acc-count');
    const peopleCountEl = document.getElementById('nav-people-count');

    if (txCountEl) txCountEl.innerText = state.transactions.length;
    if (accCountEl) accCountEl.innerText = state.accounts.length;
    if (peopleCountEl) peopleCountEl.innerText = state.people.length;
}

function renderOverview() {
    // 1. Total Balance
    const total = state.accounts.reduce((sum, acc) => sum + acc.balance, 0);
    const balanceDisplay = document.getElementById('total-balance-display');
    if (balanceDisplay) balanceDisplay.innerText = formatCurrency(total);

    const subStats = document.getElementById('sub-stats');
    if (subStats) {
        subStats.innerText = `${state.accounts.length} accounts · ${state.people.length} people`;
    }

    // Monthly stats
    const currentMonthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
    let monthlyIncome = 0;
    let monthlyExpense = 0;

    state.transactions.forEach(t => {
        if (t.date && t.date.startsWith(currentMonthPrefix)) {
            if (t.type === 'in') monthlyIncome += t.amount;
            if (t.type === 'out') monthlyExpense += t.amount;
        }
    });

    const netSavings = monthlyIncome - monthlyExpense;
    const monthlyNetStat = document.getElementById('monthly-net-stat');
    if (monthlyNetStat) {
        monthlyNetStat.innerText = `${netSavings >= 0 ? '+' : ''}${formatCurrency(netSavings)} this month`;
        monthlyNetStat.className = `trend-badge ${netSavings >= 0 ? 'positive' : 'negative'}`;
    }

    const incomeEl = document.getElementById('stat-monthly-income');
    const expenseEl = document.getElementById('stat-monthly-expense');
    const savingsEl = document.getElementById('stat-monthly-savings');
    const totalTxEl = document.getElementById('stat-total-tx');

    if (incomeEl) incomeEl.innerText = `+${formatCurrency(monthlyIncome)}`;
    if (expenseEl) expenseEl.innerText = `-${formatCurrency(monthlyExpense)}`;
    if (savingsEl) {
        savingsEl.innerText = formatCurrency(netSavings);
        savingsEl.className = `stat-value ${netSavings >= 0 ? 'text-success' : 'text-danger'}`;
    }
    if (totalTxEl) totalTxEl.innerText = state.transactions.length;

    // 2. Ownership Bar & Legend
    renderOwnershipBar('ownership-bar', 'people-legend');

    // 3. Accounts Grid
    const accountsGrid = document.getElementById('accounts-grid');
    if (accountsGrid) {
        if (!state.accounts.length) {
            accountsGrid.innerHTML = `
                <div class="card text-center py-6" style="grid-column: 1 / -1;">
                    <div style="font-size:32px; margin-bottom:8px;">🏦</div>
                    <div class="font-bold mb-2">No accounts added yet</div>
                    <p class="text-secondary text-sm mb-4">Add your bank account, cash wallet, or mobile account to start tracking.</p>
                    <button class="btn btn-primary" onclick="openAccountModal()">+ Add Your First Account</button>
                </div>
            `;
        } else {
            accountsGrid.innerHTML = state.accounts.map(acc => {
                const color = acc.color || '#2563eb';
                return `
                <div class="account-card" style="--acc-theme:${color};">
                    <div class="account-card-top-accent" style="background:${color};"></div>
                    <div class="account-card-inner">
                        <div class="account-card-header">
                            <span class="account-card-title">
                                <span class="account-color-indicator" style="background:${color};"></span>
                                <span class="account-name-text">${escapeHtml(acc.name)}</span>
                            </span>
                            <span class="account-type-pill">${escapeHtml(acc.type || 'Bank')}</span>
                        </div>
                        <div class="account-card-balance font-mono">${formatCurrency(acc.balance)}</div>
                    </div>
                    <div class="account-card-actions">
                        <button class="btn btn-sm btn-ghost card-action-btn" onclick="filterByAccount('${acc.id}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            <span>Ledger</span>
                        </button>
                        <button class="btn btn-sm btn-outline card-action-btn" onclick="openTransactionModal('transfer_account')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                            <span>Transfer</span>
                        </button>
                    </div>
                </div>
            `}).join('');
        }
    }

    // 4. Recent Transactions (Top 6)
    const recentList = document.getElementById('transaction-list');
    if (recentList) {
        if (!state.transactions.length) {
            recentList.innerHTML = `<p class="text-secondary text-sm py-4 text-center">No transaction activity recorded yet.</p>`;
        } else {
            recentList.innerHTML = state.transactions.slice(0, 6).map(t => renderTransactionListItem(t)).join('');
        }
    }

    // 5. Mini Category Breakdown
    renderMiniCategoryBreakdown();
}

function renderOwnershipBar(barId, legendId) {
    const bar = document.getElementById(barId);
    const legend = document.getElementById(legendId);
    if (!bar) return;

    const total = state.people.reduce((sum, p) => sum + Math.max(0, p.balance), 0);
    bar.innerHTML = '';

    if (total <= 0) {
        bar.innerHTML = `<div style="width:100%; background:var(--bg-surface-subtle); height:100%;"></div>`;
    } else {
        state.people.forEach(p => {
            if (p.balance > 0) {
                const width = ((p.balance / total) * 100).toFixed(1);
                bar.innerHTML += `
                    <div class="progress-segment" style="width:${width}%; background:${p.color || '#0f172a'};" title="${p.name}: ${formatCurrency(p.balance)} (${width}%)"></div>
                `;
            }
        });
    }

    if (legend) {
        legend.innerHTML = state.people.map(p => {
            const pct = total > 0 ? ((Math.max(0, p.balance) / total) * 100).toFixed(0) : 0;
            return `
                <div class="legend-card" onclick="filterByPerson('${p.id}')" style="cursor:pointer;" title="Click to filter transactions">
                    <div class="legend-head">
                        <div class="legend-person-info">
                            <span class="avatar-dot" style="background:${p.color || '#0f172a'};"></span>
                            <span class="legend-name">${escapeHtml(p.name)}</span>
                        </div>
                        <span class="legend-percent">${pct}%</span>
                    </div>
                    <div class="legend-val font-mono ${p.balance < 0 ? 'text-danger' : ''}">${formatCurrency(p.balance)}</div>
                </div>
            `;
        }).join('');
    }
}

function renderMiniCategoryBreakdown() {
    const container = document.getElementById('mini-category-breakdown');
    if (!container) return;

    const currentMonthPrefix = new Date().toISOString().slice(0, 7);
    const categoryTotals = {};
    let totalExpense = 0;

    state.transactions.forEach(t => {
        if (t.type === 'out' && t.date && t.date.startsWith(currentMonthPrefix)) {
            categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
            totalExpense += t.amount;
        }
    });

    const sortedCats = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (sortedCats.length === 0) {
        container.innerHTML = `<p class="text-secondary text-sm py-4 text-center">No expense activity recorded this month.</p>`;
        return;
    }

    container.innerHTML = sortedCats.map(([catId, amount]) => {
        const cat = state.categories.find(c => c.id === catId) || { name: 'Expense', icon: '💳', color: '#64748b' };
        const pct = totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0;
        return `
            <div class="category-bar-row">
                <div class="category-bar-header">
                    <span>${cat.icon} ${escapeHtml(cat.name)}</span>
                    <span class="font-mono text-secondary">${formatCurrency(amount)} (${pct}%)</span>
                </div>
                <div class="category-bar-track">
                    <div class="category-bar-fill" style="width:${pct}%; background:${cat.color};"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderTransactionListItem(t) {
    const cat = state.categories.find(c => c.id === t.category) || { name: 'General', icon: '💳' };
    const person = state.people.find(p => p.id === t.personId);
    const toPerson = state.people.find(p => p.id === t.toPersonId);
    const acc = state.accounts.find(a => a.id === t.accountId);
    const toAcc = state.accounts.find(a => a.id === t.toAccountId);

    let iconSymbol = '↓';
    let iconClass = 'in';
    let metaText = '';
    let amountDisplay = `+${formatCurrency(t.amount)}`;
    let amountClass = 'amount-in';

    if (t.type === 'out') {
        iconSymbol = '↑';
        iconClass = 'out';
        metaText = `${person ? person.name : 'Unknown'} • ${acc ? acc.name : 'Account'}`;
        amountDisplay = `-${formatCurrency(t.amount)}`;
        amountClass = 'amount-out';
    } else if (t.type === 'in') {
        iconSymbol = '↓';
        iconClass = 'in';
        metaText = `${person ? person.name : 'Unknown'} • ${acc ? acc.name : 'Account'}`;
        amountDisplay = `+${formatCurrency(t.amount)}`;
        amountClass = 'amount-in';
    } else if (t.type === 'transfer_account') {
        iconSymbol = '⇄';
        iconClass = 'transfer_account';
        metaText = `${acc ? acc.name : 'Bank'} → ${toAcc ? toAcc.name : 'Bank'}`;
        amountDisplay = `${formatCurrency(t.amount)}`;
        amountClass = 'amount-transfer';
    } else if (t.type === 'transfer_person') {
        iconSymbol = '🤝';
        iconClass = 'transfer_person';
        metaText = `${person ? person.name : 'Sender'} → ${toPerson ? toPerson.name : 'Receiver'}`;
        amountDisplay = `${formatCurrency(t.amount)}`;
        amountClass = 'amount-settle';
    }

    return `
        <div class="transaction-item">
            <div class="transaction-item-left">
                <div class="trans-icon ${iconClass}">
                    ${iconSymbol}
                </div>
                <div class="trans-details">
                    <div class="trans-desc">${escapeHtml(t.desc)}</div>
                    <div class="trans-meta">${cat.icon} ${escapeHtml(cat.name)} • ${metaText}</div>
                </div>
            </div>
            <div class="trans-right">
                <div class="${amountClass} font-mono">${amountDisplay}</div>
                <div class="text-muted text-sm">${t.date}</div>
            </div>
        </div>
    `;
}

// ============================================================================
// 7. TRANSACTIONS LEDGER, SEARCH, FILTER & CSV EXPORT
// ============================================================================

// ============================================================================
// 7. TRANSACTIONS LEDGER, SEARCH, FILTER & PDF/CSV EXPORTS
// ============================================================================

let currentActivePersonId = null;

function getFilteredTransactions() {
    return state.transactions.filter(t => {
        // 1. Search Query
        if (ui.filter.search) {
            const query = ui.filter.search.toLowerCase();
            const person = state.people.find(p => p.id === t.personId);
            const toPerson = state.people.find(p => p.id === t.toPersonId);
            const acc = state.accounts.find(a => a.id === t.accountId);
            const toAcc = state.accounts.find(a => a.id === t.toAccountId);
            const cat = state.categories.find(c => c.id === t.category);

            const matchDesc = (t.desc || '').toLowerCase().includes(query);
            const matchNotes = (t.notes || '').toLowerCase().includes(query);
            const matchPerson = (person && person.name.toLowerCase().includes(query)) || (toPerson && toPerson.name.toLowerCase().includes(query));
            const matchAcc = (acc && acc.name.toLowerCase().includes(query)) || (toAcc && toAcc.name.toLowerCase().includes(query));
            const matchCat = cat && cat.name.toLowerCase().includes(query);

            if (!matchDesc && !matchNotes && !matchPerson && !matchAcc && !matchCat) {
                return false;
            }
        }

        // 2. Type Filter
        if (ui.filter.type && ui.filter.type !== 'all' && t.type !== ui.filter.type) {
            return false;
        }

        // 3. Account Filter
        if (ui.filter.account && ui.filter.account !== 'all') {
            if (t.accountId !== ui.filter.account && t.toAccountId !== ui.filter.account) {
                return false;
            }
        }

        // 4. Person Filter
        if (ui.filter.person && ui.filter.person !== 'all') {
            if (t.personId !== ui.filter.person && t.toPersonId !== ui.filter.person) {
                return false;
            }
        }

        // 5. Category Filter
        if (ui.filter.category && ui.filter.category !== 'all') {
            if (t.category !== ui.filter.category) {
                return false;
            }
        }

        // 6. Date Range Filter
        if (ui.filter.rangePreset === 'this_month') {
            const curMonth = new Date().toISOString().slice(0, 7);
            if (!t.date || !t.date.startsWith(curMonth)) return false;
        } else if (ui.filter.rangePreset === 'last_month') {
            const d = new Date();
            d.setMonth(d.getMonth() - 1);
            const lastMonth = d.toISOString().slice(0, 7);
            if (!t.date || !t.date.startsWith(lastMonth)) return false;
        } else if (ui.filter.rangePreset === 'last_30') {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
            if (t.date < thirtyDaysAgo) return false;
        } else if (ui.filter.rangePreset === 'custom') {
            if (ui.filter.startDate && t.date < ui.filter.startDate) return false;
            if (ui.filter.endDate && t.date > ui.filter.endDate) return false;
        }

        return true;
    }).sort((a, b) => {
        if (ui.sortField === 'date') {
            const cmp = (a.date || '').localeCompare(b.date || '');
            return ui.sortDirection === 'desc' ? -cmp : cmp;
        } else if (ui.sortField === 'amount') {
            return ui.sortDirection === 'desc' ? b.amount - a.amount : a.amount - b.amount;
        }
        return 0;
    });
}

function handleTxFilterChange() {
    const searchEl = document.getElementById('tx-search-input');
    const typeEl = document.getElementById('tx-filter-type');
    const accEl = document.getElementById('tx-filter-account');
    const personEl = document.getElementById('tx-filter-person');
    const catEl = document.getElementById('tx-filter-category');

    if (searchEl) ui.filter.search = searchEl.value.trim();
    if (typeEl) ui.filter.type = typeEl.value;
    if (accEl) ui.filter.account = accEl.value;
    if (personEl) ui.filter.person = personEl.value;
    if (catEl) ui.filter.category = catEl.value;

    const clearBtn = document.getElementById('tx-search-clear');
    if (clearBtn) {
        clearBtn.style.display = ui.filter.search ? 'block' : 'none';
    }

    if (ui.filter.rangePreset === 'custom') {
        const startEl = document.getElementById('tx-filter-date-start');
        const endEl = document.getElementById('tx-filter-date-end');
        if (startEl) ui.filter.startDate = startEl.value;
        if (endEl) ui.filter.endDate = endEl.value;
    }

    ui.currentPage = 1;
    renderActiveFilterChips();
    renderTransactionsTable();
}

function clearTxSearch() {
    const input = document.getElementById('tx-search-input');
    if (input) input.value = '';
    handleTxFilterChange();
}

function setDateRangePreset(preset) {
    ui.filter.rangePreset = preset;
    document.querySelectorAll('.date-preset-pills .pill-btn').forEach(btn => {
        if (btn.getAttribute('data-range') === preset) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const customInputs = document.getElementById('custom-date-inputs');
    if (customInputs) {
        customInputs.style.display = preset === 'custom' ? 'flex' : 'none';
    }

    handleTxFilterChange();
}

function renderActiveFilterChips() {
    const bar = document.getElementById('active-filters-bar');
    const list = document.getElementById('active-filters-list');
    if (!bar || !list) return;

    const chips = [];

    if (ui.filter.search) {
        chips.push({
            key: 'search',
            label: `Search: "${ui.filter.search}"`
        });
    }

    if (ui.filter.type && ui.filter.type !== 'all') {
        const typeLabels = {
            'in': 'Money In (Income)',
            'out': 'Money Out (Expense)',
            'transfer_account': 'Bank Transfer',
            'transfer_person': 'Ownership Transfer'
        };
        chips.push({
            key: 'type',
            label: `Type: ${typeLabels[ui.filter.type] || ui.filter.type}`
        });
    }

    if (ui.filter.account && ui.filter.account !== 'all') {
        const acc = state.accounts.find(a => a.id === ui.filter.account);
        chips.push({
            key: 'account',
            label: `Account: ${acc ? acc.name : ui.filter.account}`
        });
    }

    if (ui.filter.person && ui.filter.person !== 'all') {
        const person = state.people.find(p => p.id === ui.filter.person);
        chips.push({
            key: 'person',
            label: `Person: ${person ? person.name : ui.filter.person}`
        });
    }

    if (ui.filter.category && ui.filter.category !== 'all') {
        const cat = state.categories.find(c => c.id === ui.filter.category);
        chips.push({
            key: 'category',
            label: `Category: ${cat ? cat.icon + ' ' + cat.name : ui.filter.category}`
        });
    }

    if (ui.filter.rangePreset && ui.filter.rangePreset !== 'all') {
        const rangeLabels = {
            'this_month': 'This Month',
            'last_month': 'Last Month',
            'last_30': 'Last 30 Days',
            'custom': `Custom: ${ui.filter.startDate || 'Start'} to ${ui.filter.endDate || 'End'}`
        };
        chips.push({
            key: 'rangePreset',
            label: rangeLabels[ui.filter.rangePreset] || ui.filter.rangePreset
        });
    }

    if (chips.length > 0) {
        bar.style.display = 'flex';
        list.innerHTML = chips.map(c => `
            <span class="active-filter-chip">
                <span>${escapeHtml(c.label)}</span>
                <button type="button" class="chip-remove-btn" onclick="removeActiveFilter('${c.key}')" title="Remove filter">&times;</button>
            </span>
        `).join('');
    } else {
        bar.style.display = 'none';
        list.innerHTML = '';
    }
}

function removeActiveFilter(key) {
    if (key === 'search') {
        ui.filter.search = '';
        const el = document.getElementById('tx-search-input');
        if (el) el.value = '';
    } else if (key === 'type') {
        ui.filter.type = 'all';
        const el = document.getElementById('tx-filter-type');
        if (el) el.value = 'all';
    } else if (key === 'account') {
        ui.filter.account = 'all';
        const el = document.getElementById('tx-filter-account');
        if (el) el.value = 'all';
    } else if (key === 'person') {
        ui.filter.person = 'all';
        const el = document.getElementById('tx-filter-person');
        if (el) el.value = 'all';
    } else if (key === 'category') {
        ui.filter.category = 'all';
        const el = document.getElementById('tx-filter-category');
        if (el) el.value = 'all';
    } else if (key === 'rangePreset') {
        setDateRangePreset('all');
        return;
    }

    handleTxFilterChange();
}

function resetTxFilters() {
    ui.filter.search = '';
    ui.filter.type = 'all';
    ui.filter.account = 'all';
    ui.filter.person = 'all';
    ui.filter.category = 'all';
    ui.filter.rangePreset = 'all';
    ui.filter.startDate = '';
    ui.filter.endDate = '';

    const searchInput = document.getElementById('tx-search-input');
    if (searchInput) searchInput.value = '';
    const typeSelect = document.getElementById('tx-filter-type');
    if (typeSelect) typeSelect.value = 'all';
    const accSelect = document.getElementById('tx-filter-account');
    if (accSelect) accSelect.value = 'all';
    const personSelect = document.getElementById('tx-filter-person');
    if (personSelect) personSelect.value = 'all';
    const catSelect = document.getElementById('tx-filter-category');
    if (catSelect) catSelect.value = 'all';

    document.querySelectorAll('.date-preset-pills .pill-btn').forEach(btn => {
        if (btn.getAttribute('data-range') === 'all') btn.classList.add('active');
        else btn.classList.remove('active');
    });
    const customInputs = document.getElementById('custom-date-inputs');
    if (customInputs) customInputs.style.display = 'none';

    handleTxFilterChange();
    showToast('All transaction filters cleared', 'info');
}

function toggleSort(field) {
    if (ui.sortField === field) {
        ui.sortDirection = ui.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        ui.sortField = field;
        ui.sortDirection = 'desc';
    }

    const dateIcon = document.getElementById('sort-date-icon');
    const amountIcon = document.getElementById('sort-amount-icon');
    if (dateIcon) dateIcon.innerText = ui.sortField === 'date' ? (ui.sortDirection === 'asc' ? '↑' : '↓') : '↕';
    if (amountIcon) amountIcon.innerText = ui.sortField === 'amount' ? (ui.sortDirection === 'asc' ? '↑' : '↓') : '↕';

    renderTransactionsTable();
}

function renderTransactionsTable() {
    const tbody = document.getElementById('full-transaction-tbody');
    if (!tbody) return;

    const filtered = getFilteredTransactions();

    // Summary calculation
    let inflow = 0;
    let outflow = 0;
    filtered.forEach(t => {
        if (t.type === 'in') inflow += t.amount;
        if (t.type === 'out') outflow += t.amount;
    });

    const net = inflow - outflow;
    const countBadge = document.getElementById('filtered-count-badge');
    const inflowEl = document.getElementById('filtered-inflow');
    const outflowEl = document.getElementById('filtered-outflow');
    const netEl = document.getElementById('filtered-net');

    if (countBadge) countBadge.innerText = `${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`;
    if (inflowEl) inflowEl.innerText = `+${formatCurrency(inflow)}`;
    if (outflowEl) outflowEl.innerText = `-${formatCurrency(outflow)}`;
    if (netEl) {
        netEl.innerText = `${net >= 0 ? '+' : ''}${formatCurrency(net)}`;
        netEl.className = net >= 0 ? 'text-success' : 'text-danger';
    }

    // Pagination
    const totalPages = Math.ceil(filtered.length / ui.pageSize) || 1;
    if (ui.currentPage > totalPages) ui.currentPage = totalPages;
    const startIndex = (ui.currentPage - 1) * ui.pageSize;
    const pageItems = filtered.slice(startIndex, startIndex + ui.pageSize);

    if (!pageItems.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-secondary">
                    <div style="font-size: 28px; margin-bottom: 8px;">🔍</div>
                    <div class="font-bold mb-1">No transactions match your criteria</div>
                    <div class="text-xs text-muted mb-3">Try adjusting or resetting your filter selections.</div>
                    <button class="btn btn-sm btn-outline" onclick="resetTxFilters()">Reset All Filters</button>
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = pageItems.map(t => {
            const cat = state.categories.find(c => c.id === t.category) || { name: 'General', icon: '💳' };
            const person = state.people.find(p => p.id === t.personId);
            const toPerson = state.people.find(p => p.id === t.toPersonId);
            const acc = state.accounts.find(a => a.id === t.accountId);
            const toAcc = state.accounts.find(a => a.id === t.toAccountId);

            let typeBadge = '<span class="badge-tag in">Income</span>';
            let amountHtml = `<span class="amount-in font-mono">+${formatCurrency(t.amount)}</span>`;
            let personDisplay = person ? `<span class="person-chip" onclick="openPersonActivityModal('${person.id}')" style="cursor:pointer;" title="View ${escapeHtml(person.name)}'s Activity"><span class="avatar-dot" style="background:${person.color || '#0f172a'};"></span>${escapeHtml(person.name)}</span>` : '—';
            let accountDisplay = acc ? `<span class="account-type-pill">${escapeHtml(acc.name)}</span>` : '—';

            if (t.type === 'out') {
                typeBadge = '<span class="badge-tag out">Expense</span>';
                amountHtml = `<span class="amount-out font-mono">-${formatCurrency(t.amount)}</span>`;
            } else if (t.type === 'transfer_account') {
                typeBadge = '<span class="badge-tag transfer">Bank Transfer</span>';
                amountHtml = `<span class="amount-transfer font-mono">${formatCurrency(t.amount)}</span>`;
                accountDisplay = `${acc ? acc.name : '?'} → ${toAcc ? toAcc.name : '?'}`;
                personDisplay = '<span class="text-muted">Account Only</span>';
            } else if (t.type === 'transfer_person') {
                typeBadge = '<span class="badge-tag settle">Ownership Transfer</span>';
                amountHtml = `<span class="amount-settle font-mono">${formatCurrency(t.amount)}</span>`;
                personDisplay = `${person ? person.name : '?'} → ${toPerson ? toPerson.name : '?'}`;
                accountDisplay = '<span class="text-muted">Ledger Pool</span>';
            }

            return `
                <tr>
                    <td class="font-mono text-sm">${t.date}</td>
                    <td>${typeBadge}</td>
                    <td>
                        <div class="font-bold">${escapeHtml(t.desc)}</div>
                        ${t.notes ? `<div class="text-muted text-sm">${escapeHtml(t.notes)}</div>` : ''}
                    </td>
                    <td>
                        <span class="category-chip">${cat.icon} ${escapeHtml(cat.name)}</span>
                    </td>
                    <td>${personDisplay}</td>
                    <td>${accountDisplay}</td>
                    <td class="text-right">${amountHtml}</td>
                    <td>
                        <div class="table-actions">
                            <button class="action-icon-btn" onclick="openTransactionModal('${t.type}', '${t.id}')" title="Edit Transaction">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button class="action-icon-btn delete" onclick="deleteTransaction('${t.id}')" title="Delete Transaction">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Render pagination controls
    renderPagination(totalPages, filtered.length);
}

function renderPagination(totalPages, totalItems) {
    const bar = document.getElementById('tx-pagination-bar');
    if (!bar) return;

    const start = (ui.currentPage - 1) * ui.pageSize + 1;
    const end = Math.min(ui.currentPage * ui.pageSize, totalItems);

    bar.innerHTML = `
        <div>Showing ${totalItems > 0 ? start : 0} to ${end} of ${totalItems} entries</div>
        <div class="page-controls">
            <button class="btn btn-sm btn-secondary" onclick="changePage(${ui.currentPage - 1})" ${ui.currentPage <= 1 ? 'disabled' : ''}>&larr; Prev</button>
            <span class="btn btn-sm btn-ghost" style="cursor:default;">Page ${ui.currentPage} of ${totalPages}</span>
            <button class="btn btn-sm btn-secondary" onclick="changePage(${ui.currentPage + 1})" ${ui.currentPage >= totalPages ? 'disabled' : ''}>Next &rarr;</button>
        </div>
    `;
}

function changePage(newPage) {
    ui.currentPage = newPage;
    renderTransactionsTable();
}

function filterByAccount(accId) {
    ui.filter.search = '';
    ui.filter.type = 'all';
    ui.filter.person = 'all';
    ui.filter.category = 'all';
    ui.filter.rangePreset = 'all';
    ui.filter.account = accId;
    ui.currentPage = 1;

    switchView('transactions');
    populateFilterDropdowns();

    const accSelect = document.getElementById('tx-filter-account');
    if (accSelect) accSelect.value = accId;

    renderActiveFilterChips();
    renderTransactionsTable();
}

function filterByPerson(personId) {
    ui.filter.search = '';
    ui.filter.type = 'all';
    ui.filter.account = 'all';
    ui.filter.category = 'all';
    ui.filter.rangePreset = 'all';
    ui.filter.startDate = '';
    ui.filter.endDate = '';
    ui.filter.person = personId;
    ui.currentPage = 1;

    switchView('transactions');
    populateFilterDropdowns();

    // Reset filter inputs
    const searchInput = document.getElementById('tx-search-input');
    if (searchInput) searchInput.value = '';
    const typeSelect = document.getElementById('tx-filter-type');
    if (typeSelect) typeSelect.value = 'all';
    const accSelect = document.getElementById('tx-filter-account');
    if (accSelect) accSelect.value = 'all';
    const catSelect = document.getElementById('tx-filter-category');
    if (catSelect) catSelect.value = 'all';
    const personSelect = document.getElementById('tx-filter-person');
    if (personSelect) personSelect.value = personId;

    document.querySelectorAll('.date-preset-pills .pill-btn').forEach(btn => {
        if (btn.getAttribute('data-range') === 'all') btn.classList.add('active');
        else btn.classList.remove('active');
    });
    const customInputs = document.getElementById('custom-date-inputs');
    if (customInputs) customInputs.style.display = 'none';

    renderActiveFilterChips();
    renderTransactionsTable();
}

function exportTransactionsCSV() {
    const transactionsToExport = state.transactions;
    if (!transactionsToExport.length) {
        showToast('No transactions to export', 'error');
        return;
    }

    const headers = ['Transaction ID', 'Date', 'Type', 'Amount', 'Currency', 'Category', 'Description', 'Person/From', 'To Person', 'Account/From', 'To Account', 'Notes'];

    const rows = transactionsToExport.map(t => {
        const cat = state.categories.find(c => c.id === t.category);
        const person = state.people.find(p => p.id === t.personId);
        const toPerson = state.people.find(p => p.id === t.toPersonId);
        const acc = state.accounts.find(a => a.id === t.accountId);
        const toAcc = state.accounts.find(a => a.id === t.toAccountId);

        return [
            `"${t.id}"`,
            `"${t.date || ''}"`,
            `"${t.type || ''}"`,
            t.amount,
            `"${state.settings.currency.trim()}"`,
            `"${cat ? cat.name : ''}"`,
            `"${(t.desc || '').replace(/"/g, '""')}"`,
            `"${person ? person.name : ''}"`,
            `"${toPerson ? toPerson.name : ''}"`,
            `"${acc ? acc.name : ''}"`,
            `"${toAcc ? toAcc.name : ''}"`,
            `"${(t.notes || '').replace(/"/g, '""')}"`
        ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `money_ledger_transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV file exported successfully', 'success');
}

// PDF Generation Functions
function downloadPersonPDF(personId) {
    const person = state.people.find(p => p.id === personId);
    if (!person) {
        showToast('Person not found', 'error');
        return;
    }

    const personTx = state.transactions.filter(t => t.personId === personId || t.toPersonId === personId);

    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
        showToast('Loading PDF generator... please retry in a moment', 'info');
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'pt',
            format: 'a4'
        });

        const currency = state.settings.currency.trim();
        const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        let totalIn = 0;
        let totalOut = 0;
        let totalTransfers = 0;

        personTx.forEach(t => {
            if (t.type === 'in' && t.personId === personId) totalIn += t.amount;
            else if (t.type === 'out' && t.personId === personId) totalOut += t.amount;
            else if (t.type === 'transfer_person') {
                if (t.personId === personId) totalTransfers -= t.amount;
                if (t.toPersonId === personId) totalTransfers += t.amount;
            }
        });

        // 1. Header Banner
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, 595.28, 65, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('MONEY LEDGER', 40, 32);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.text('PERSONAL FINANCIAL STATEMENT & AUDIT TRAIL', 40, 48);

        doc.setFontSize(8.5);
        doc.text(`Generated: ${generatedDate}`, 555.28 - 40, 40, { align: 'right' });

        // 2. Person Info Section
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text(`Statement for: ${person.name}`, 40, 95);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`Role / Notes: ${person.notes || 'Ledger Owner'}`, 40, 110);

        // 3. Summary Stat Cards Box
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(40, 125, 515.28, 52, 6, 6, 'FD');

        const colWidth = 515.28 / 4;
        
        // Stat 1: Current Balance
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('CURRENT BALANCE', 40 + 12, 142);
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        if (person.balance >= 0) {
            doc.setTextColor(16, 185, 129);
        } else {
            doc.setTextColor(239, 68, 68);
        }
        doc.text(`${currency} ${person.balance.toLocaleString()}`, 40 + 12, 160);

        // Stat 2: Total Inflow
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text('TOTAL INFLOW', 40 + colWidth + 8, 142);
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(16, 185, 129);
        doc.text(`+${currency} ${totalIn.toLocaleString()}`, 40 + colWidth + 8, 160);

        // Stat 3: Total Outflow
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text('TOTAL OUTFLOW', 40 + colWidth * 2 + 8, 142);
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(239, 68, 68);
        doc.text(`-${currency} ${totalOut.toLocaleString()}`, 40 + colWidth * 2 + 8, 160);

        // Stat 4: Total Records
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text('TOTAL ACTIVITIES', 40 + colWidth * 3 + 8, 142);
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`${personTx.length} records`, 40 + colWidth * 3 + 8, 160);

        // 4. Transactions Table
        const tableRows = personTx.map(t => {
            const cat = state.categories.find(c => c.id === t.category);
            const acc = state.accounts.find(a => a.id === t.accountId);
            const otherPerson = t.type === 'transfer_person' 
                ? (t.personId === personId ? state.people.find(p => p.id === t.toPersonId) : state.people.find(p => p.id === t.personId))
                : null;

            let typeLabel = 'Income';
            let amountPrefix = '+';
            if (t.type === 'out') {
                typeLabel = 'Expense';
                amountPrefix = '-';
            } else if (t.type === 'transfer_person') {
                typeLabel = t.personId === personId ? `Transfer to ${otherPerson ? otherPerson.name : '?'}` : `From ${otherPerson ? otherPerson.name : '?'}`;
                amountPrefix = t.personId === personId ? '-' : '+';
            } else if (t.type === 'transfer_account') {
                typeLabel = 'Bank Transfer';
                amountPrefix = '';
            }

            const accLabel = acc ? acc.name : (t.type === 'transfer_person' ? 'Ledger Pool' : '—');
            const catLabel = cat ? cat.name : (t.type === 'transfer_person' ? 'Settlement' : 'General');

            return [
                t.date || '—',
                typeLabel,
                t.desc + (t.notes ? ` (${t.notes})` : ''),
                catLabel,
                accLabel,
                `${amountPrefix}${currency} ${t.amount.toLocaleString()}`
            ];
        });

        if (doc.autoTable) {
            doc.autoTable({
                head: [['Date', 'Type', 'Description', 'Category', 'Account', 'Amount']],
                body: tableRows.length ? tableRows : [['—', '—', 'No transaction activity recorded for this person yet', '—', '—', '—']],
                startY: 195,
                theme: 'striped',
                headStyles: {
                    fillColor: [37, 99, 235],
                    textColor: 255,
                    fontStyle: 'bold',
                    fontSize: 8.5
                },
                bodyStyles: {
                    fontSize: 8,
                    textColor: [30, 41, 59]
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252]
                },
                columnStyles: {
                    0: { cellWidth: 65 },
                    1: { cellWidth: 95 },
                    2: { cellWidth: 145 },
                    3: { cellWidth: 70 },
                    4: { cellWidth: 70 },
                    5: { cellWidth: 70, halign: 'right', fontStyle: 'bold' }
                },
                didDrawPage: function () {
                    const str = 'Page ' + doc.internal.getNumberOfPages();
                    doc.setFontSize(8);
                    doc.setTextColor(148, 163, 184);
                    doc.text(str, 595.28 - 40, 841.89 - 25, { align: 'right' });
                    doc.text('Money Ledger • Automated Personal Financial Statement', 40, 841.89 - 25);
                }
            });
        }

        const cleanName = person.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `MoneyLedger_Statement_${cleanName}_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
        showToast(`Downloaded PDF statement for ${person.name}`, 'success');
    } catch (e) {
        console.error('PDF generation error:', e);
        showToast('Failed to generate PDF statement: ' + e.message, 'error');
    }
}

function downloadTransactionsPDF() {
    const filtered = getFilteredTransactions();
    if (!filtered.length) {
        showToast('No transactions match the current filter to export', 'error');
        return;
    }

    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
        showToast('Loading PDF generator... please retry in a moment', 'info');
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'pt',
            format: 'a4'
        });

        const currency = state.settings.currency.trim();
        const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        let totalIn = 0;
        let totalOut = 0;
        filtered.forEach(t => {
            if (t.type === 'in') totalIn += t.amount;
            if (t.type === 'out') totalOut += t.amount;
        });
        const netFlow = totalIn - totalOut;

        // Header Banner
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, 595.28, 65, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('MONEY LEDGER', 40, 32);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.text('FINANCIAL TRANSACTIONS JOURNAL STATEMENT', 40, 48);

        doc.setFontSize(8.5);
        doc.text(`Generated: ${generatedDate}`, 555.28 - 40, 40, { align: 'right' });

        // Summary Box
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(40, 85, 515.28, 48, 6, 6, 'FD');

        const colWidth = 515.28 / 4;
        
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('MATCHING ENTRIES', 40 + 12, 102);
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`${filtered.length} transactions`, 40 + 12, 120);

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text('TOTAL INFLOW', 40 + colWidth + 8, 102);
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(16, 185, 129);
        doc.text(`+${currency} ${totalIn.toLocaleString()}`, 40 + colWidth + 8, 120);

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text('TOTAL OUTFLOW', 40 + colWidth * 2 + 8, 102);
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(239, 68, 68);
        doc.text(`-${currency} ${totalOut.toLocaleString()}`, 40 + colWidth * 2 + 8, 120);

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text('NET CASH FLOW', 40 + colWidth * 3 + 8, 102);
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        if (netFlow >= 0) {
            doc.setTextColor(16, 185, 129);
        } else {
            doc.setTextColor(239, 68, 68);
        }
        doc.text(`${netFlow >= 0 ? '+' : ''}${currency} ${netFlow.toLocaleString()}`, 40 + colWidth * 3 + 8, 120);

        const tableRows = filtered.map(t => {
            const cat = state.categories.find(c => c.id === t.category);
            const person = state.people.find(p => p.id === t.personId);
            const toPerson = state.people.find(p => p.id === t.toPersonId);
            const acc = state.accounts.find(a => a.id === t.accountId);
            const toAcc = state.accounts.find(a => a.id === t.toAccountId);

            let typeLabel = 'Income';
            let amountPrefix = '+';
            let personName = person ? person.name : '—';
            let accountName = acc ? acc.name : '—';

            if (t.type === 'out') {
                typeLabel = 'Expense';
                amountPrefix = '-';
            } else if (t.type === 'transfer_account') {
                typeLabel = 'Bank Transfer';
                amountPrefix = '';
                accountName = `${acc ? acc.name : '?'} → ${toAcc ? toAcc.name : '?'}`;
                personName = '—';
            } else if (t.type === 'transfer_person') {
                typeLabel = 'Ownership Transfer';
                amountPrefix = '';
                personName = `${person ? person.name : '?'} → ${toPerson ? toPerson.name : '?'}`;
                accountName = '—';
            }

            return [
                t.date || '—',
                typeLabel,
                t.desc + (t.notes ? ` (${t.notes})` : ''),
                cat ? cat.name : 'General',
                personName,
                accountName,
                `${amountPrefix}${currency} ${t.amount.toLocaleString()}`
            ];
        });

        if (doc.autoTable) {
            doc.autoTable({
                head: [['Date', 'Type', 'Description', 'Category', 'Person', 'Account', 'Amount']],
                body: tableRows,
                startY: 148,
                theme: 'striped',
                headStyles: {
                    fillColor: [37, 99, 235],
                    textColor: 255,
                    fontStyle: 'bold',
                    fontSize: 8.5
                },
                bodyStyles: {
                    fontSize: 8,
                    textColor: [30, 41, 59]
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252]
                },
                columnStyles: {
                    0: { cellWidth: 55 },
                    1: { cellWidth: 70 },
                    2: { cellWidth: 125 },
                    3: { cellWidth: 65 },
                    4: { cellWidth: 70 },
                    5: { cellWidth: 65 },
                    6: { cellWidth: 65, halign: 'right', fontStyle: 'bold' }
                },
                didDrawPage: function () {
                    const str = 'Page ' + doc.internal.getNumberOfPages();
                    doc.setFontSize(8);
                    doc.setTextColor(148, 163, 184);
                    doc.text(str, 595.28 - 40, 841.89 - 25, { align: 'right' });
                    doc.text('Money Ledger • Financial Transactions Journal', 40, 841.89 - 25);
                }
            });
        }

        const filename = `MoneyLedger_Statement_Filtered_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
        showToast('PDF Journal exported successfully', 'success');
    } catch (e) {
        console.error('PDF generation error:', e);
        showToast('Failed to generate PDF: ' + e.message, 'error');
    }
}

// Person Activity Modal Handlers
function openPersonActivityModal(personId) {
    const person = state.people.find(p => p.id === personId);
    if (!person) {
        showToast('Person not found', 'error');
        return;
    }

    currentActivePersonId = personId;

    // Set Avatar & Info
    const avatarEl = document.getElementById('activity-modal-avatar');
    const nameEl = document.getElementById('activity-modal-name');
    const notesEl = document.getElementById('activity-modal-notes');
    const balanceEl = document.getElementById('activity-modal-balance-badge');

    if (avatarEl) {
        avatarEl.style.background = person.color || '#0f172a';
        avatarEl.innerText = person.name ? person.name.charAt(0).toUpperCase() : '?';
    }
    if (nameEl) nameEl.innerText = person.name;
    if (notesEl) notesEl.innerText = person.notes ? person.notes : 'Ledger Owner';
    if (balanceEl) {
        balanceEl.innerText = formatCurrency(person.balance);
        balanceEl.className = `badge-balance font-mono ${person.balance < 0 ? 'text-danger' : 'text-success'}`;
    }

    // Calculate Person Financial Activity Stats
    const personTx = state.transactions.filter(t => t.personId === personId || t.toPersonId === personId);
    let totalIn = 0;
    let totalOut = 0;
    let totalTransfers = 0;

    personTx.forEach(t => {
        if (t.type === 'in' && t.personId === personId) totalIn += t.amount;
        else if (t.type === 'out' && t.personId === personId) totalOut += t.amount;
        else if (t.type === 'transfer_person') {
            if (t.personId === personId) totalTransfers -= t.amount;
            if (t.toPersonId === personId) totalTransfers += t.amount;
        }
    });

    const inflowEl = document.getElementById('activity-modal-inflow');
    const outflowEl = document.getElementById('activity-modal-outflow');
    const transfersEl = document.getElementById('activity-modal-transfers');
    const countEl = document.getElementById('activity-modal-count');

    if (inflowEl) inflowEl.innerText = `+${formatCurrency(totalIn)}`;
    if (outflowEl) outflowEl.innerText = `-${formatCurrency(totalOut)}`;
    if (transfersEl) {
        transfersEl.innerText = `${totalTransfers >= 0 ? '+' : ''}${formatCurrency(totalTransfers)}`;
        transfersEl.className = `activity-stat-val font-mono ${totalTransfers >= 0 ? 'text-success' : 'text-danger'}`;
    }
    if (countEl) countEl.innerText = personTx.length;

    // Render Table Rows
    const tbody = document.getElementById('activity-modal-tbody');
    if (tbody) {
        if (!personTx.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-8 text-secondary">
                        <div style="font-size: 24px; margin-bottom: 6px;">📝</div>
                        No transaction activity recorded for ${escapeHtml(person.name)} yet.
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = personTx.map(t => {
                const cat = state.categories.find(c => c.id === t.category) || { name: 'General', icon: '💳' };
                const acc = state.accounts.find(a => a.id === t.accountId);
                const otherPerson = t.type === 'transfer_person'
                    ? (t.personId === personId ? state.people.find(p => p.id === t.toPersonId) : state.people.find(p => p.id === t.personId))
                    : null;

                let typeBadge = '<span class="badge-tag in">Income</span>';
                let amountHtml = `<span class="amount-in font-mono">+${formatCurrency(t.amount)}</span>`;
                let accountLabel = acc ? escapeHtml(acc.name) : '—';

                if (t.type === 'out') {
                    typeBadge = '<span class="badge-tag out">Expense</span>';
                    amountHtml = `<span class="amount-out font-mono">-${formatCurrency(t.amount)}</span>`;
                } else if (t.type === 'transfer_person') {
                    const isSender = t.personId === personId;
                    typeBadge = isSender ? '<span class="badge-tag settle">Sent Transfer</span>' : '<span class="badge-tag in">Received Transfer</span>';
                    amountHtml = isSender ? `<span class="amount-out font-mono">-${formatCurrency(t.amount)}</span>` : `<span class="amount-in font-mono">+${formatCurrency(t.amount)}</span>`;
                    accountLabel = isSender ? `To: ${otherPerson ? otherPerson.name : '?'}` : `From: ${otherPerson ? otherPerson.name : '?'}`;
                } else if (t.type === 'transfer_account') {
                    typeBadge = '<span class="badge-tag transfer">Transfer</span>';
                    amountHtml = `<span class="amount-transfer font-mono">${formatCurrency(t.amount)}</span>`;
                }

                return `
                    <tr>
                        <td class="col-date font-mono">${t.date || '—'}</td>
                        <td class="col-type">${typeBadge}</td>
                        <td class="col-desc">
                            <div class="desc-title">${escapeHtml(t.desc)}</div>
                            ${t.notes ? `<div class="desc-notes">${escapeHtml(t.notes)}</div>` : ''}
                        </td>
                        <td class="col-cat"><span class="category-chip">${cat.icon} ${escapeHtml(cat.name)}</span></td>
                        <td class="col-acc"><span class="account-type-pill">${accountLabel}</span></td>
                        <td class="col-amount">${amountHtml}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    const modal = document.getElementById('person-activity-modal');
    if (modal) modal.classList.add('active');
}

function downloadActivePersonPDF() {
    if (currentActivePersonId) {
        downloadPersonPDF(currentActivePersonId);
    }
}

function settleActivePersonFromModal() {
    if (currentActivePersonId) {
        const id = currentActivePersonId;
        closeModal('person-activity-modal');
        openSettleModal(id);
    }
}

function filterActivePersonInTable() {
    if (currentActivePersonId) {
        const id = currentActivePersonId;
        closeModal('person-activity-modal');
        filterByPerson(id);
    }
}

// ============================================================================
// 8. ACCOUNTS & PEOPLE VIEW RENDERING
// ============================================================================

function renderAccountsManagement() {
    const grid = document.getElementById('accounts-management-grid');
    if (!grid) return;

    const total = state.accounts.reduce((sum, a) => sum + a.balance, 0);
    const totalEl = document.getElementById('acc-view-total');
    const countEl = document.getElementById('acc-view-count');
    const primaryEl = document.getElementById('acc-view-primary');

    if (totalEl) totalEl.innerText = formatCurrency(total);
    if (countEl) countEl.innerText = state.accounts.length;
    if (primaryEl) primaryEl.innerText = state.accounts[0] ? state.accounts[0].name : 'None';

    if (!state.accounts.length) {
        grid.innerHTML = `
            <div class="card text-center py-8" style="grid-column: 1 / -1;">
                <div style="font-size:36px; margin-bottom:12px;">🏦</div>
                <h3 class="section-title mb-2">No Accounts Created Yet</h3>
                <p class="text-secondary text-sm mb-4">Set up where your money lives (e.g. Bank Account, Physical Cash, Mobile Wallet, Savings).</p>
                <button class="btn btn-primary" onclick="openAccountModal()">+ Add Your First Account</button>
            </div>
        `;
    } else {
        grid.innerHTML = state.accounts.map(acc => {
            // Calculate account stats
            let inCount = 0;
            let outCount = 0;
            state.transactions.forEach(t => {
                if (t.accountId === acc.id || t.toAccountId === acc.id) {
                    if (t.type === 'in' || t.toAccountId === acc.id) inCount++;
                    if (t.type === 'out' || (t.type === 'transfer_account' && t.accountId === acc.id)) outCount++;
                }
            });

            const color = acc.color || '#2563eb';

            return `
                <div class="account-card" style="--acc-theme:${color};">
                    <div class="account-card-top-accent" style="background:${color};"></div>
                    <div class="account-card-inner">
                        <div class="account-card-header">
                            <span class="account-card-title">
                                <span class="account-color-indicator" style="background:${color};"></span>
                                <span class="account-name-text">${escapeHtml(acc.name)}</span>
                            </span>
                            <div class="account-header-right">
                                <span class="account-type-pill">${escapeHtml(acc.type || 'Bank')}</span>
                                <div class="account-card-top-actions">
                                    <button class="action-icon-btn" onclick="openAccountModal('${acc.id}')" title="Edit Account" aria-label="Edit ${escapeHtml(acc.name)}">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    </button>
                                    <button class="action-icon-btn delete" onclick="deleteAccount('${acc.id}')" title="Delete Account" aria-label="Delete ${escapeHtml(acc.name)}">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="account-card-balance font-mono">${formatCurrency(acc.balance)}</div>
                        <div class="account-card-meta text-secondary">
                            <span>${acc.notes ? escapeHtml(acc.notes) : 'General Account'}</span>
                            <span class="account-tx-badge">${inCount + outCount} txs</span>
                        </div>
                    </div>
                    <div class="account-card-actions">
                        <button class="btn btn-sm btn-ghost card-action-btn" onclick="filterByAccount('${acc.id}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            <span>History</span>
                        </button>
                        <button class="btn btn-sm btn-outline card-action-btn" onclick="openTransactionModal('transfer_account')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                            <span>Transfer</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
}

function renderPeopleManagement() {
    const grid = document.getElementById('people-management-grid');
    if (!grid) return;

    renderOwnershipBar('people-view-bar', null);

    const totalPool = state.people.reduce((sum, p) => sum + Math.max(0, p.balance), 0);

    if (!state.people.length) {
        grid.innerHTML = `
            <div class="card text-center py-8" style="grid-column: 1 / -1;">
                <div style="font-size:36px; margin-bottom:12px;">👥</div>
                <h3 class="section-title mb-2">No People Added Yet</h3>
                <p class="text-secondary text-sm mb-4">Add yourself and anyone whose money share or debt you track (e.g., Yourself, Sister, Brother, Friend).</p>
                <button class="btn btn-primary" onclick="openPersonModal()">+ Add Person / Owner</button>
            </div>
        `;
    } else {
        grid.innerHTML = state.people.map(person => {
            const pct = totalPool > 0 ? ((Math.max(0, person.balance) / totalPool) * 100).toFixed(1) : 0;
            const initial = person.name ? person.name.charAt(0).toUpperCase() : '?';
            const isPositive = person.balance > 0;
            const isNegative = person.balance < 0;
            const statusText = isNegative ? 'Owes Pool' : (isPositive ? 'Pool Share' : 'Settled');
            const statusClass = isNegative ? 'badge-debt' : (isPositive ? 'badge-credit' : 'badge-neutral');
            const color = person.color || '#2563eb';

            return `
                <div class="person-card" style="--person-theme:${color};">
                    <div class="person-card-top-accent" style="background:${color};"></div>
                    <div class="person-card-inner">
                        <div class="person-card-header">
                            <div class="person-card-user">
                                <div class="person-avatar-circle" style="background:${color}; box-shadow: 0 4px 14px ${color}40;">
                                    ${initial}
                                </div>
                                <div class="person-title-box">
                                    <h3 title="${escapeHtml(person.name)}">${escapeHtml(person.name)}</h3>
                                    <span class="person-role-pill">${person.notes ? escapeHtml(person.notes) : 'Ledger Owner'}</span>
                                </div>
                            </div>
                            <div class="person-card-top-actions">
                                <button class="action-icon-btn" onclick="openPersonModal('${person.id}')" title="Edit Person" aria-label="Edit ${escapeHtml(person.name)}">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                                <button class="action-icon-btn delete" onclick="deletePerson('${person.id}')" title="Delete Person" aria-label="Delete ${escapeHtml(person.name)}">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </div>
                        </div>

                        <div class="person-balance-box">
                            <div class="person-balance-header">
                                <span class="label-caps">Current Owned Balance</span>
                                <span class="person-status-badge ${statusClass}">
                                    <span class="status-dot"></span>${statusText}
                                </span>
                            </div>
                            <div class="person-balance-val font-mono ${isNegative ? 'text-danger' : (isPositive ? 'text-success-bright' : 'text-muted')}">
                                ${formatCurrency(person.balance)}
                            </div>
                            
                            <div class="person-pool-progress-wrap">
                                <div class="person-pool-progress-track">
                                    <div class="person-pool-progress-bar" style="width: ${Math.min(pct, 100)}%; background: ${color};"></div>
                                </div>
                                <div class="person-pool-share-meta">
                                    <span><strong>${pct}%</strong> of money pool</span>
                                    <span>${person.balance >= 0 ? 'Positive share' : 'Owed balance'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="person-card-actions">
                        <button class="btn btn-sm btn-ghost card-action-btn" onclick="openPersonActivityModal('${person.id}')" title="View Full Activity & Statement">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                            <span>Activity</span>
                        </button>
                        <button class="btn btn-sm btn-ghost card-action-btn" onclick="downloadPersonPDF('${person.id}')" title="Download PDF Statement">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                            <span>Statement</span>
                        </button>
                        <button class="btn btn-sm btn-primary-soft card-action-btn" onclick="openSettleModal('${person.id}')" title="Settle or Transfer Balance">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                            <span>Settle</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// ============================================================================
// 9. ANALYTICS & VISUAL SVG CHARTS
// ============================================================================

function renderAnalytics() {
    const timeframe = document.getElementById('analytics-timeframe') ? document.getElementById('analytics-timeframe').value : 'this_month';

    // Filter transactions by timeframe
    let filtered = state.transactions;
    const now = new Date();

    if (timeframe === 'this_month') {
        const curMonth = now.toISOString().slice(0, 7);
        filtered = state.transactions.filter(t => t.date && t.date.startsWith(curMonth));
    } else if (timeframe === 'last_month') {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        const lastMonth = d.toISOString().slice(0, 7);
        filtered = state.transactions.filter(t => t.date && t.date.startsWith(lastMonth));
    } else if (timeframe === 'last_3_months') {
        const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
        filtered = state.transactions.filter(t => t.date >= threeMonthsAgo);
    }

    renderFlowBarChart(filtered);
    renderCategoryDonutChart(filtered);
    renderAccountHoldingBars();
    renderTopExpensesList(filtered);
}

function renderFlowBarChart(transactions) {
    const chartBox = document.getElementById('analytics-flow-chart');
    const summaryTag = document.getElementById('analytics-flow-summary');
    if (!chartBox) return;

    let income = 0;
    let expense = 0;

    transactions.forEach(t => {
        if (t.type === 'in') income += t.amount;
        if (t.type === 'out') expense += t.amount;
    });

    const net = income - expense;
    if (summaryTag) {
        summaryTag.innerText = `Net Flow: ${net >= 0 ? '+' : ''}${formatCurrency(net)}`;
        summaryTag.className = `badge-tag ${net >= 0 ? 'in' : 'out'}`;
    }

    const maxVal = Math.max(income, expense, 1);
    const incomeHeight = Math.max(10, Math.round((income / maxVal) * 160));
    const expenseHeight = Math.max(10, Math.round((expense / maxVal) * 160));

    chartBox.innerHTML = `
        <div style="display:flex; justify-content:space-around; align-items:flex-end; height:180px; padding:0 20px; border-bottom:1px solid var(--border-color);">
            <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
                <span class="font-mono font-bold text-sm text-success">+${formatCurrency(income)}</span>
                <div style="width:60px; height:${incomeHeight}px; background:var(--color-income); border-radius:6px 6px 0 0; transition:height 0.4s ease;"></div>
                <span class="font-bold text-sm">Total Income</span>
            </div>
            <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
                <span class="font-mono font-bold text-sm text-danger">-${formatCurrency(expense)}</span>
                <div style="width:60px; height:${expenseHeight}px; background:var(--color-expense); border-radius:6px 6px 0 0; transition:height 0.4s ease;"></div>
                <span class="font-bold text-sm">Total Expense</span>
            </div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:12px; font-size:13px; color:var(--text-secondary);">
            <span>Savings Rate: ${income > 0 ? Math.round(((income - expense) / income) * 100) : 0}%</span>
            <span>Total Transactions in Period: ${transactions.length}</span>
        </div>
    `;
}

function renderCategoryDonutChart(transactions) {
    const donutBox = document.getElementById('analytics-category-donut');
    const legendBox = document.getElementById('analytics-category-legend');
    if (!donutBox || !legendBox) return;

    const categoryTotals = {};
    let totalExpense = 0;

    transactions.forEach(t => {
        if (t.type === 'out') {
            categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
            totalExpense += t.amount;
        }
    });

    const entries = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

    if (!entries.length || totalExpense <= 0) {
        donutBox.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-muted); font-size:13px;">No expense data</div>`;
        legendBox.innerHTML = `<div class="text-secondary text-sm">No expenses in this timeframe.</div>`;
        return;
    }

    // Render Pure SVG Donut Chart
    const size = 180;
    const strokeWidth = 24;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    let accumulatedAngle = 0;

    let svgCircles = '';

    entries.forEach(([catId, amount]) => {
        const cat = state.categories.find(c => c.id === catId) || { color: '#64748b' };
        const ratio = amount / totalExpense;
        const strokeDasharray = `${ratio * circumference} ${circumference}`;
        const strokeDashoffset = -accumulatedAngle * circumference;
        accumulatedAngle += ratio;

        svgCircles += `
            <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="transparent"
                stroke="${cat.color}" stroke-width="${strokeWidth}"
                stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}"
                transform="rotate(-90 ${size / 2} ${size / 2})" />
        `;
    });

    donutBox.innerHTML = `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            ${svgCircles}
            <text x="50%" y="46%" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text-secondary)">TOTAL</text>
            <text x="50%" y="60%" text-anchor="middle" font-size="14" font-weight="800" font-family="JetBrains Mono" fill="var(--text-primary)">${formatCurrency(totalExpense)}</text>
        </svg>
    `;

    legendBox.innerHTML = entries.map(([catId, amount]) => {
        const cat = state.categories.find(c => c.id === catId) || { name: 'Expense', icon: '💳', color: '#64748b' };
        const pct = Math.round((amount / totalExpense) * 100);
        return `
            <div class="chart-legend-row">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="width:10px; height:10px; border-radius:3px; background:${cat.color};"></span>
                    <span>${cat.icon} ${escapeHtml(cat.name)}</span>
                </div>
                <div class="font-mono">${formatCurrency(amount)} <span class="text-secondary text-sm">(${pct}%)</span></div>
            </div>
        `;
    }).join('');
}

function renderAccountHoldingBars() {
    const container = document.getElementById('analytics-account-bars');
    if (!container) return;

    const total = state.accounts.reduce((sum, a) => sum + Math.max(0, a.balance), 0);

    container.innerHTML = state.accounts.map(acc => {
        const pct = total > 0 ? Math.max(0, (acc.balance / total) * 100).toFixed(1) : 0;
        return `
            <div class="dist-bar-item">
                <div class="dist-bar-header">
                    <span>${escapeHtml(acc.name)} (${acc.type})</span>
                    <span class="font-mono font-bold">${formatCurrency(acc.balance)} (${pct}%)</span>
                </div>
                <div class="category-bar-track">
                    <div class="category-bar-fill" style="width:${pct}%; background:${acc.color || '#2563eb'};"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderTopExpensesList(transactions) {
    const container = document.getElementById('analytics-top-expenses');
    if (!container) return;

    const top = transactions.filter(t => t.type === 'out').sort((a, b) => b.amount - a.amount).slice(0, 5);

    if (!top.length) {
        container.innerHTML = `<div class="text-secondary text-sm py-4 text-center">No expense items to display.</div>`;
        return;
    }

    container.innerHTML = top.map(t => {
        const cat = state.categories.find(c => c.id === t.category) || { name: 'Expense', icon: '💳' };
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border-subtle);">
                <div>
                    <div class="font-bold text-sm">${escapeHtml(t.desc)}</div>
                    <div class="text-secondary text-sm">${cat.icon} ${escapeHtml(cat.name)} • ${t.date}</div>
                </div>
                <div class="font-mono font-bold text-danger">-${formatCurrency(t.amount)}</div>
            </div>
        `;
    }).join('');
}

// ============================================================================
// 10. SETTINGS, BACKUP, RESTORE & AUDIT
// ============================================================================

function renderSettingsView() {
    const currSelect = document.getElementById('setting-currency');
    const themeSelect = document.getElementById('setting-theme');

    if (currSelect) currSelect.value = state.settings.currency;
    if (themeSelect) themeSelect.value = state.settings.theme;
}

function updateSettings() {
    const curr = document.getElementById('setting-currency').value;
    state.settings.currency = curr;
    saveAndRefresh();
    showToast('Settings saved', 'success');
}

function initTheme() {
    let savedTheme = localStorage.getItem('moneyLedger_theme');
    if (!savedTheme) {
        savedTheme = state.settings.theme || 'system';
    }
    state.settings.theme = savedTheme;
    applyTheme(savedTheme);
}

function applyTheme(theme) {
    const html = document.documentElement;
    let effectiveTheme = theme;
    if (theme === 'system') {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        effectiveTheme = prefersDark ? 'dark' : 'light';
    }

    html.setAttribute('data-theme', effectiveTheme);
    const themeColorMeta = document.getElementById('theme-color-meta');
    if (themeColorMeta) {
        themeColorMeta.setAttribute('content', effectiveTheme === 'dark' ? '#0f172a' : '#ffffff');
    }
    try {
        localStorage.setItem('moneyLedger_theme', theme);
    } catch (e) {}

    const select = document.getElementById('setting-theme');
    if (select) select.value = theme;
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    state.settings.theme = nextTheme;
    applyTheme(nextTheme);
    saveState();
    const select = document.getElementById('setting-theme');
    if (select) select.value = nextTheme;
    showToast(`Switched to ${nextTheme} mode`, 'info');
}

function handleThemeSettingChange() {
    const selected = document.getElementById('setting-theme').value;
    state.settings.theme = selected;
    applyTheme(selected);
    saveState();
    showToast('Theme preference updated', 'info');
}

function exportDataBackup() {
    const backupData = JSON.stringify(state, null, 2);
    const blob = new Blob([backupData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `money_ledger_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Backup exported successfully', 'success');
}

function handleImportBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!imported.accounts || !imported.people || !imported.transactions) {
                showToast('Invalid backup file structure', 'error');
                return;
            }

            openConfirmModal(
                'Restore Database?',
                'Importing will replace current data with the backup file. Are you sure you want to proceed?',
                () => {
                    state = imported;
                    saveAndRefresh();
                    showToast('Data restored successfully!', 'success');
                }
            );
        } catch (err) {
            showToast('Failed to parse JSON backup file', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function auditAndRecalculateBalances() {
    // Reconcile initial balances + all transaction deltas
    const accountBalances = {};
    const peopleBalances = {};

    state.accounts.forEach(a => {
        accountBalances[a.id] = (a.initialBalance !== undefined) ? a.initialBalance : a.balance;
    });

    state.people.forEach(p => {
        peopleBalances[p.id] = (p.initialBalance !== undefined) ? p.initialBalance : p.balance;
    });

    // Traverse transactions chronologically
    const sorted = [...state.transactions].reverse();
    sorted.forEach(t => {
        if (t.type === 'in') {
            if (accountBalances[t.accountId] !== undefined) accountBalances[t.accountId] += t.amount;
            if (peopleBalances[t.personId] !== undefined) peopleBalances[t.personId] += t.amount;
        } else if (t.type === 'out') {
            if (accountBalances[t.accountId] !== undefined) accountBalances[t.accountId] -= t.amount;
            if (peopleBalances[t.personId] !== undefined) peopleBalances[t.personId] -= t.amount;
        } else if (t.type === 'transfer_account') {
            if (accountBalances[t.accountId] !== undefined) accountBalances[t.accountId] -= t.amount;
            if (accountBalances[t.toAccountId] !== undefined) accountBalances[t.toAccountId] += t.amount;
        } else if (t.type === 'transfer_person') {
            if (peopleBalances[t.personId] !== undefined) peopleBalances[t.personId] -= t.amount;
            if (peopleBalances[t.toPersonId] !== undefined) peopleBalances[t.toPersonId] += t.amount;
        }
    });

    state.accounts.forEach(a => {
        if (accountBalances[a.id] !== undefined) a.balance = accountBalances[a.id];
    });

    state.people.forEach(p => {
        if (peopleBalances[p.id] !== undefined) p.balance = peopleBalances[p.id];
    });

    saveAndRefresh();
    showToast('Balances audited and synchronized with transaction history', 'success');
}

function loadSampleData() {
    openConfirmModal(
        'Load Sample Data?',
        'This will populate realistic demo accounts, family ownership pools, and expense transactions.',
        () => {
            state = JSON.parse(JSON.stringify(INITIAL_STATE));
            saveAndRefresh();
            showToast('Sample demo data loaded', 'success');
        }
    );
}

function confirmResetAllData() {
    openConfirmModal(
        'Wipe All Ledger Data?',
        'This will permanently delete all transactions, accounts, and people from this browser.',
        () => {
            state = {
                accounts: [{ id: 'acc_1', name: 'Primary Account', balance: 0, initialBalance: 0, type: 'Bank', color: '#2563eb', notes: '' }],
                people: [{ id: 'p_1', name: 'Primary User', balance: 0, initialBalance: 0, color: '#0f172a', notes: '' }],
                categories: DEFAULT_CATEGORIES,
                transactions: [],
                settings: { currency: 'Rs. ', theme: 'light' }
            };
            saveAndRefresh();
            showToast('All ledger data has been reset', 'info');
        }
    );
}

// ============================================================================
// 11. UTILITIES & MODAL HELPERS
// ============================================================================

function formatCurrency(amount) {
    const symbol = state.settings.currency || 'Rs. ';
    const formattedNum = Number(amount || 0).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
    return `${symbol}${formattedNum}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('active');
    });
}

function handleModalBackdropClick(event, modalId) {
    if (event.target.id === modalId) {
        closeModal(modalId);
    }
}

function openConfirmModal(title, message, onConfirm) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = message;
    ui.confirmCallback = onConfirm;
    document.getElementById('confirm-modal').classList.add('active');
}

function closeConfirmModal(confirmed) {
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.remove('active');

    if (confirmed && typeof ui.confirmCallback === 'function') {
        ui.confirmCallback();
    }
    ui.confirmCallback = null;
}

function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '✕';

    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ============================================================================
// 12. MONGODB ATLAS CLOUD SYNC ENGINE
// ============================================================================

async function initCloudSync() {
    updateSyncStatusUI('checking', 'Connecting to Cloud API...');
    try {
        const isHealthy = await checkCloudHealth();
        if (isHealthy) {
            await fetchFromCloud();
        } else {
            updateSyncStatusUI('local', 'Local Storage Mode (MONGODB_URI not configured)');
        }
    } catch (e) {
        console.warn('Cloud sync initialization failed:', e);
        updateSyncStatusUI('local', 'Local Storage Mode (Offline / Standalone)');
    }
}

async function checkCloudHealth() {
    try {
        const res = await fetch('/api/health', { method: 'GET' });
        if (!res.ok) return false;
        const data = await res.json();
        if (data && data.database === 'connected') {
            cloudState.isConnected = true;
            cloudState.databaseName = data.databaseName || 'MongoDB Atlas';
            return true;
        }
        return false;
    } catch (err) {
        return false;
    }
}

async function fetchFromCloud() {
    updateSyncStatusUI('syncing', 'Fetching latest data from MongoDB Atlas...');
    try {
        const res = await fetch('/api/ledger', { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();

        if (result.success && result.exists && result.data) {
            const activeTheme = localStorage.getItem('moneyLedger_theme') || state.settings.theme || 'light';
            // Cloud has existing data
            state = {
                ...INITIAL_STATE,
                ...result.data,
                accounts: Array.isArray(result.data.accounts) ? result.data.accounts : [],
                people: Array.isArray(result.data.people) ? result.data.people : [],
                transactions: Array.isArray(result.data.transactions) ? result.data.transactions : [],
                categories: result.data.categories && result.data.categories.length ? result.data.categories : DEFAULT_CATEGORIES,
                settings: { ...INITIAL_STATE.settings, ...(result.data.settings || {}) }
            };
            if (activeTheme) {
                state.settings.theme = activeTheme;
            }
            applyTheme(state.settings.theme);
            cloudState.lastSyncedAt = result.lastSyncedAt || new Date().toISOString();
            saveState(); // Update local cache
            renderApp();
            updateSyncStatusUI('synced', 'Connected to MongoDB Atlas & Synced');
            showToast('Synchronized with MongoDB Atlas Cloud', 'success', 2500);
        } else if (result.success && !result.exists) {
            // Cloud is empty, push local state if local has data
            if (state.accounts.length || state.people.length || state.transactions.length) {
                await syncToCloud(true);
            } else {
                updateSyncStatusUI('synced', 'Connected to MongoDB Atlas (Ready)');
            }
        }
    } catch (err) {
        console.error('Fetch from cloud error:', err);
        updateSyncStatusUI('error', 'Cloud sync failed — using local cache');
    }
}

function syncToCloud(immediate = false) {
    if (cloudState.debounceTimer) {
        clearTimeout(cloudState.debounceTimer);
    }

    if (immediate) {
        executeCloudSync();
    } else {
        updateSyncStatusUI('syncing', 'Syncing changes to cloud...');
        cloudState.debounceTimer = setTimeout(() => {
            executeCloudSync();
        }, 1200);
    }
}

async function executeCloudSync() {
    try {
        updateSyncStatusUI('syncing', 'Saving to MongoDB Atlas...');
        const payload = {
            accounts: state.accounts,
            people: state.people,
            categories: state.categories,
            transactions: state.transactions,
            settings: state.settings
        };

        const res = await fetch('/api/ledger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();

        if (result.success) {
            cloudState.lastSyncedAt = result.updatedAt || new Date().toISOString();
            updateSyncStatusUI('synced', 'All changes saved to MongoDB Atlas');
        } else if (result.isLocalMode) {
            updateSyncStatusUI('local', 'Local Storage Mode');
        } else {
            throw new Error(result.message || 'Sync failed');
        }
    } catch (err) {
        console.warn('Cloud save skipped or failed:', err.message);
        updateSyncStatusUI('local', 'Local Storage Mode (Offline/Unconfigured)');
    }
}

async function triggerManualCloudSync() {
    showToast('Checking MongoDB Atlas connection...', 'info', 2000);
    const isHealthy = await checkCloudHealth();
    if (isHealthy) {
        await executeCloudSync();
        showToast('Successfully synced to MongoDB Atlas!', 'success');
    } else {
        showToast('Running in Local Storage Mode. Set MONGODB_URI on Netlify to activate cloud sync.', 'info', 4500);
        updateSyncStatusUI('local', 'Local Storage Mode');
    }
}

function updateSyncStatusUI(status, message) {
    cloudState.status = status;

    const sidebarBadge = document.getElementById('sidebar-sync-badge');
    const syncText = document.getElementById('sync-status-text');
    const mobileDot = document.getElementById('mobile-sync-dot');
    const dbBadge = document.getElementById('settings-db-badge');
    const dbDetail = document.getElementById('settings-db-detail');
    const syncedAtEl = document.getElementById('settings-db-synced-at');

    let dotClass = 'local';
    let label = 'Local';
    let badgeClass = 'settle';

    if (status === 'synced') {
        dotClass = 'synced';
        label = 'Cloud';
        badgeClass = 'in';
    } else if (status === 'syncing' || status === 'checking') {
        dotClass = 'syncing';
        label = 'Syncing...';
        badgeClass = 'transfer';
    } else if (status === 'error') {
        dotClass = 'error';
        label = 'Sync Error';
        badgeClass = 'out';
    }

    if (sidebarBadge) {
        const dot = sidebarBadge.querySelector('.sync-dot');
        if (dot) dot.className = `sync-dot ${dotClass}`;
    }
    if (syncText) syncText.innerText = label;

    if (mobileDot) {
        mobileDot.className = `sync-dot-badge ${dotClass}`;
    }

    if (dbBadge) {
        dbBadge.className = `badge-tag ${badgeClass}`;
        dbBadge.innerText = status === 'synced' ? '🟢 Cloud Active' : (status === 'syncing' ? '🔄 Syncing...' : '🟡 Local Mode');
    }

    if (dbDetail) {
        dbDetail.innerText = message || 'Ready';
    }

    if (syncedAtEl) {
        if (cloudState.lastSyncedAt) {
            const timeStr = new Date(cloudState.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            syncedAtEl.innerText = `Last synced: ${timeStr}`;
        } else {
            syncedAtEl.innerText = 'Last synced: Not synced yet';
        }
    }
}

// Kick off initialization
document.addEventListener('DOMContentLoaded', init);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
}