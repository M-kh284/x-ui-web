// Global state
var authToken = localStorage.getItem('authToken') || '';
var currentUser = null;
var inbounds = [];
var userConfigs = {};

// DOM Elements
var loadingSection = document.getElementById('loadingSection');
var authSection = document.getElementById('authSection');
var dashboardSection = document.getElementById('dashboardSection');
var configModal = document.getElementById('configModal');

// Initialize app on load
document.addEventListener('DOMContentLoaded', initializeApp);

// Tab switching
document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        var tab = this.getAttribute('data-tab');
        switchTab(tab);
    });
});

// Form submissions
document.getElementById('loginForm').addEventListener('submit', handleLogin);
document.getElementById('registerForm').addEventListener('submit', handleRegister);
document.getElementById('logoutBtn').addEventListener('click', handleLogout);
document.getElementById('getConfigBtn').addEventListener('click', handleGetConfig);
document.getElementById('copyConfigBtn').addEventListener('click', copyConfig);
document.getElementById('closeModalBtn').addEventListener('click', closeModal);

// Close modal on background click
configModal.addEventListener('click', function(e) {
    if (e.target === configModal) {
        closeModal();
    }
});

// Initialize application
function initializeApp() {
    showLoading();

    if (authToken) {
        checkSession();
    } else {
        showAuthSection();
    }
}

// Check existing session
function checkSession() {
    fetch('/api/user/check', {
        headers: { 'Authorization': authToken }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            currentUser = {
                username: data.username,
                configs: data.configs || {}
            };
            userConfigs = data.configs || {};
            loadInboundsAndShowDashboard();
        } else {
            localStorage.removeItem('authToken');
            authToken = '';
            showAuthSection();
        }
    })
    .catch(function(error) {
        console.error('Check session error:', error);
        showAuthSection();
    });
}

// Load inbounds then show dashboard
function loadInboundsAndShowDashboard() {
    fetch('/api/inbounds', {
        headers: { 'Authorization': authToken }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            inbounds = data.inbounds;
            populateInboundSelect();
        }
        showDashboard();
    })
    .catch(function(error) {
        console.error('Load inbounds error:', error);
        showDashboard();
    });
}

// Populate inbound select dropdown
function populateInboundSelect() {
    var select = document.getElementById('inboundSelect');
    select.innerHTML = '';

    if (inbounds.length === 0) {
        select.innerHTML = '<option value="">هیچ Inbound یافت نشد</option>';
        return;
    }

    // Add placeholder
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'یک Inbound انتخاب کنید...';
    select.appendChild(placeholder);

    // Add inbounds
    for (var i = 0; i < inbounds.length; i++) {
        var inbound = inbounds[i];
        var option = document.createElement('option');
        option.value = inbound.id;

        // Check if user already has config for this inbound
        var hasConfig = userConfigs && userConfigs[inbound.id];
        var statusText = hasConfig ? ' (دریافت شده)' : '';

        option.textContent = inbound.remark + ' (' + inbound.protocol.toUpperCase() + ') - Port: ' + inbound.port + statusText;
        option.disabled = hasConfig;

        select.appendChild(option);
    }
}

// Switch between login and register tabs
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(function(content) {
        content.classList.remove('active');
    });

    document.querySelector('[data-tab="' + tab + '"]').classList.add('active');
    document.getElementById(tab + 'Tab').classList.add('active');

    // Clear errors
    document.getElementById('loginError').textContent = '';
    document.getElementById('loginError').classList.remove('show');
    document.getElementById('registerError').textContent = '';
    document.getElementById('registerError').classList.remove('show');
}

// Handle login
function handleLogin(e) {
    e.preventDefault();

    var username = document.getElementById('loginUsername').value;
    var password = document.getElementById('loginPassword').value;

    showError('loginError', '');

    fetch('/api/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            currentUser = {
                username: username,
                configs: data.configs || {}
            };
            userConfigs = data.configs || {};
            loadInboundsAndShowDashboard();
        } else {
            showError('loginError', data.message);
        }
    })
    .catch(function(error) {
        showError('loginError', 'خطا در اتصال به سرور');
    });
}

// Handle register
function handleRegister(e) {
    e.preventDefault();

    var username = document.getElementById('regUsername').value;
    var password = document.getElementById('regPassword').value;
    var passwordConfirm = document.getElementById('regPasswordConfirm').value;

    showError('registerError', '');

    if (password !== passwordConfirm) {
        showError('registerError', 'رمز عبور و تکرار آن یکسان نیست');
        return;
    }

    fetch('/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            currentUser = {
                username: username,
                configs: {}
            };
            userConfigs = {};
            loadInboundsAndShowDashboard();
        } else {
            showError('registerError', data.message);
        }
    })
    .catch(function(error) {
        showError('registerError', 'خطا در اتصال به سرور');
    });
}

// Handle logout
function handleLogout() {
    fetch('/api/user/logout', {
        method: 'POST',
        headers: { 'Authorization': authToken }
    })
    .then(function() {
        localStorage.removeItem('authToken');
        authToken = '';
        currentUser = null;
        userConfigs = {};
        showAuthSection();
    });
}

// Handle get config
function handleGetConfig() {
    var inboundId = document.getElementById('inboundSelect').value;

    if (!inboundId) {
        showError('getConfigError', 'لطفاً یک Inbound انتخاب کنید');
        return;
    }

    var btn = document.getElementById('getConfigBtn');
    btn.disabled = true;
    btn.textContent = 'در حال ایجاد...';

    showError('getConfigError', '');

    fetch('/api/create-config', {
        method: 'POST',
        headers: {
            'Authorization': authToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inboundId: parseInt(inboundId) })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        btn.disabled = false;
        btn.textContent = 'دریافت کانفیگ';

        if (data.success) {
            userConfigs[inboundId] = data.configData;
            populateInboundSelect();
            renderExistingConfigs();
            showConfigModal(data.configData);
        } else {
            if (data.configData) {
                // User already has config for this inbound
                userConfigs[inboundId] = data.configData;
                populateInboundSelect();
                renderExistingConfigs();
                showConfigModal(data.configData);
            } else {
                showError('getConfigError', data.message);
            }
        }
    })
    .catch(function(error) {
        btn.disabled = false;
        btn.textContent = 'دریافت کانفیگ';
        showError('getConfigError', 'خطا در ایجاد کانفیگ');
    });
}

// Render existing configs list
function renderExistingConfigs() {
    var container = document.getElementById('existingConfigs');
    var list = document.getElementById('configsList');

    var configKeys = Object.keys(userConfigs);

    if (configKeys.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    list.innerHTML = '';

    for (var i = 0; i < configKeys.length; i++) {
        var key = configKeys[i];
        var config = userConfigs[key];

        var item = document.createElement('div');
        item.className = 'config-item';
        item.innerHTML = '<div class="config-item-info">' +
            '<span class="config-name">' + (config.inboundName || 'Inbound ' + key) + '</span>' +
            '<span class="config-protocol">' + config.protocol.toUpperCase() + '</span>' +
            '</div>' +
            '<button class="btn btn-primary btn-sm" data-config-id="' + key + '">مشاهده</button>';

        item.querySelector('button').addEventListener('click', function() {
            var configId = this.getAttribute('data-config-id');
            showConfigModal(userConfigs[configId]);
        });

        list.appendChild(item);
    }
}

// Show config modal
function showConfigModal(configData) {
    document.getElementById('configProtocol').textContent = configData.protocol.toUpperCase();
    document.getElementById('configInbound').textContent = configData.inboundName || '-';
    document.getElementById('configExpiry').textContent = configData.expiryDate;
    document.getElementById('configTraffic').textContent = configData.traffic;
    document.getElementById('configLink').value = configData.link;

    // Generate QR code
    var qrcodeContainer = document.getElementById('qrcode');
    qrcodeContainer.innerHTML = '';

    if (typeof QRCode !== 'undefined') {
        new QRCode(qrcodeContainer, {
            text: configData.link,
            width: 200,
            height: 200,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    configModal.classList.remove('hidden');
}

// Close modal
function closeModal() {
    configModal.classList.add('hidden');
}

// Copy config to clipboard
function copyConfig() {
    var configLink = document.getElementById('configLink');

    try {
        configLink.select();
        document.execCommand('copy');
        var btn = document.getElementById('copyConfigBtn');
        btn.textContent = 'کپی شد!';
        setTimeout(function() { btn.textContent = 'کپی'; }, 2000);
    } catch (error) {
        console.error('Copy error:', error);
    }
}

// UI Functions
function showLoading() {
    loadingSection.classList.remove('hidden');
    authSection.classList.add('hidden');
    dashboardSection.classList.add('hidden');
}

function showAuthSection() {
    loadingSection.classList.add('hidden');
    authSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');

    // Clear forms
    document.getElementById('loginForm').reset();
    document.getElementById('registerForm').reset();
}

function showDashboard() {
    loadingSection.classList.add('hidden');
    authSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');

    document.getElementById('usernameDisplay').textContent = currentUser.username;
    renderExistingConfigs();
}

function showError(elementId, message) {
    var element = document.getElementById(elementId);
    if (message) {
        element.textContent = message;
        element.classList.add('show');
    } else {
        element.textContent = '';
        element.classList.remove('show');
    }
}
