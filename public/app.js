// Global state
var authToken = localStorage.getItem('authToken') || '';
var currentUser = null;

// DOM Elements
var loadingSection = document.getElementById('loadingSection');
var authSection = document.getElementById('authSection');
var dashboardSection = document.getElementById('dashboardSection');

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
                hasConfig: data.hasConfig,
                configData: data.configData
            };
            showDashboard();
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
                hasConfig: data.hasConfig,
                configData: data.configData
            };
            showDashboard();
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
                hasConfig: false,
                configData: null
            };
            showDashboard();
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
        showAuthSection();
    });
}

// Handle get config
function handleGetConfig() {
    var btn = document.getElementById('getConfigBtn');
    btn.disabled = true;
    btn.textContent = 'در حال ایجاد...';

    showError('getConfigError', '');

    fetch('/api/create-config', {
        method: 'POST',
        headers: {
            'Authorization': authToken,
            'Content-Type': 'application/json'
        }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        btn.disabled = false;
        btn.textContent = 'دریافت کانفیگ';

        if (data.success) {
            currentUser.hasConfig = true;
            currentUser.configData = data.configData;
            showConfigSection(data.configData);
        } else {
            if (data.configData) {
                // User already has config
                currentUser.hasConfig = true;
                currentUser.configData = data.configData;
                showConfigSection(data.configData);
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

// Show config section
function showConfigSection(configData) {
    document.getElementById('getConfigSection').classList.add('hidden');
    document.getElementById('showConfigSection').classList.remove('hidden');

    document.getElementById('configProtocol').textContent = configData.protocol.toUpperCase();
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

    if (currentUser.hasConfig && currentUser.configData) {
        showConfigSection(currentUser.configData);
    } else {
        document.getElementById('getConfigSection').classList.remove('hidden');
        document.getElementById('showConfigSection').classList.add('hidden');
    }
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
