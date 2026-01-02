// Global state
let currentServerUrl = '';
let inbounds = [];
let qrCodeInstance = null;

// DOM Elements
const loginSection = document.getElementById('loginSection');
const userSection = document.getElementById('userSection');
const configSection = document.getElementById('configSection');
const loginForm = document.getElementById('loginForm');
const createUserForm = document.getElementById('createUserForm');
const loginError = document.getElementById('loginError');
const createError = document.getElementById('createError');
const connectedServer = document.getElementById('connectedServer');
const inboundSelect = document.getElementById('inboundSelect');
const configLink = document.getElementById('configLink');

// Event Listeners
loginForm.addEventListener('submit', handleLogin);
createUserForm.addEventListener('submit', handleCreateUser);
document.getElementById('logoutBtn').addEventListener('click', handleLogout);
document.getElementById('copyConfigBtn').addEventListener('click', copyConfig);
document.getElementById('createAnotherBtn').addEventListener('click', showUserSection);

// Login handler
async function handleLogin(e) {
    e.preventDefault();

    const serverUrl = document.getElementById('serverUrl').value.replace(/\/$/, '');
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    showError(loginError, '');

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serverUrl, username, password })
        });

        const data = await response.json();

        if (data.success) {
            currentServerUrl = serverUrl;
            connectedServer.textContent = serverUrl;
            await loadInbounds();
            showUserSection();
        } else {
            showError(loginError, data.message || 'Login failed');
        }
    } catch (error) {
        showError(loginError, 'Connection error: ' + error.message);
    }
}

// Load inbounds list
async function loadInbounds() {
    try {
        const response = await fetch('/api/inbounds/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serverUrl: currentServerUrl })
        });

        const data = await response.json();

        if (data.success && data.obj) {
            inbounds = data.obj;
            populateInboundSelect();
        } else {
            showError(createError, 'Failed to load inbounds');
        }
    } catch (error) {
        showError(createError, 'Error loading inbounds: ' + error.message);
    }
}

// Populate inbound dropdown
function populateInboundSelect() {
    inboundSelect.innerHTML = '';

    if (inbounds.length === 0) {
        inboundSelect.innerHTML = '<option value="">No inbounds found</option>';
        return;
    }

    inbounds.forEach(inbound => {
        const option = document.createElement('option');
        option.value = inbound.id;
        option.textContent = `${inbound.remark} (${inbound.protocol}) - Port: ${inbound.port}`;
        option.dataset.protocol = inbound.protocol;
        inboundSelect.appendChild(option);
    });
}

// Create user handler
async function handleCreateUser(e) {
    e.preventDefault();

    const inboundId = parseInt(inboundSelect.value);
    const email = document.getElementById('clientEmail').value;
    const expiryDays = parseInt(document.getElementById('expiryDays').value) || 30;
    const trafficLimit = parseInt(document.getElementById('trafficLimit').value) || 0;

    const selectedInbound = inbounds.find(i => i.id === inboundId);
    if (!selectedInbound) {
        showError(createError, 'Please select an inbound');
        return;
    }

    showError(createError, '');

    try {
        // Generate UUID for the client
        const uuidResponse = await fetch('/api/server/getNewUUID', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serverUrl: currentServerUrl })
        });
        const uuidData = await uuidResponse.json();

        if (!uuidData.success) {
            showError(createError, 'Failed to generate UUID');
            return;
        }

        const uuid = uuidData.obj;

        // Calculate expiry time (milliseconds)
        const expiryTime = Date.now() + (expiryDays * 24 * 60 * 60 * 1000);

        // Create client data based on protocol
        let clientData = createClientData(selectedInbound.protocol, uuid, email, expiryTime, trafficLimit);

        // Add client to inbound
        const response = await fetch('/api/inbounds/addClient', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serverUrl: currentServerUrl,
                inboundId: inboundId,
                clientData: clientData
            })
        });

        const data = await response.json();
        console.log('Create user response:', data);

        if (data.success) {
            // Generate config link
            const configUri = generateConfigLink(selectedInbound, clientData);
            showConfigSection(configUri);
        } else {
            const errorMsg = data.msg || data.message || 'Failed to create user';
            console.error('Create user failed:', errorMsg, data);
            showError(createError, errorMsg);
        }
    } catch (error) {
        console.error('Create user error:', error);
        showError(createError, 'Error creating user: ' + error.message);
    }
}

// Create client data based on protocol
function createClientData(protocol, uuid, email, expiryTime, trafficLimitGB) {
    const trafficBytes = trafficLimitGB * 1024 * 1024 * 1024; // Convert GB to bytes

    const baseClient = {
        email: email,
        enable: true,
        expiryTime: expiryTime,
        totalGB: trafficBytes,
        limitIp: 0,
        reset: 0,
        subId: generateSubId()
    };

    switch (protocol.toLowerCase()) {
        case 'vmess':
        case 'vless':
            return {
                ...baseClient,
                id: uuid,
                flow: '',
                alterId: 0,
                tgId: '',
                fingerprint: 'chrome'
            };
        case 'trojan':
            return {
                ...baseClient,
                password: uuid,
                tgId: ''
            };
        case 'shadowsocks':
            return {
                ...baseClient,
                password: uuid,
                method: 'chacha20-ietf-poly1305'
            };
        default:
            return {
                ...baseClient,
                id: uuid
            };
    }
}

// Generate random subscription ID
function generateSubId() {
    return 'sub_' + Math.random().toString(36).substring(2, 15);
}

// Generate config link
function generateConfigLink(inbound, client) {
    const protocol = inbound.protocol.toLowerCase();
    const settings = JSON.parse(inbound.settings || '{}');
    const streamSettings = JSON.parse(inbound.streamSettings || '{}');

    const host = new URL(currentServerUrl).hostname;
    const port = inbound.port;
    const network = streamSettings.network || 'tcp';
    const security = streamSettings.security || 'none';

    let configLink = '';

    switch (protocol) {
        case 'vmess':
            const vmessConfig = {
                v: '2',
                ps: client.email,
                add: host,
                port: port,
                id: client.id,
                aid: 0,
                net: network,
                type: 'none',
                host: '',
                path: streamSettings.wsSettings?.path || '',
                tls: security === 'tls' ? 'tls' : ''
            };
            configLink = 'vmess://' + btoa(JSON.stringify(vmessConfig));
            break;

        case 'vless':
            const vlessParams = new URLSearchParams({
                type: network,
                security: security,
                flow: client.flow || ''
            });

            if (network === 'ws' && streamSettings.wsSettings) {
                vlessParams.set('path', streamSettings.wsSettings.path || '/');
                vlessParams.set('host', streamSettings.wsSettings.headers?.Host || host);
            }

            if (security === 'tls' && streamSettings.tlsSettings) {
                vlessParams.set('sni', streamSettings.tlsSettings.serverName || host);
            }

            if (security === 'reality' && streamSettings.realitySettings) {
                vlessParams.set('sni', streamSettings.realitySettings.serverNames?.[0] || '');
                vlessParams.set('pbk', streamSettings.realitySettings.publicKey || '');
                vlessParams.set('fp', streamSettings.realitySettings.fingerprint || 'chrome');
            }

            configLink = `vless://${client.id}@${host}:${port}?${vlessParams.toString()}#${encodeURIComponent(client.email)}`;
            break;

        case 'trojan':
            const trojanParams = new URLSearchParams({
                security: security,
                type: network
            });

            if (security === 'tls' && streamSettings.tlsSettings) {
                trojanParams.set('sni', streamSettings.tlsSettings.serverName || host);
            }

            configLink = `trojan://${client.password}@${host}:${port}?${trojanParams.toString()}#${encodeURIComponent(client.email)}`;
            break;

        case 'shadowsocks':
            const ssMethod = client.method || 'chacha20-ietf-poly1305';
            const ssAuth = btoa(`${ssMethod}:${client.password}`);
            configLink = `ss://${ssAuth}@${host}:${port}#${encodeURIComponent(client.email)}`;
            break;

        default:
            configLink = 'Unsupported protocol: ' + protocol;
    }

    return configLink;
}

// Show config section
function showConfigSection(configUri) {
    configLink.value = configUri;

    // Clear previous QR code
    const qrcodeContainer = document.getElementById('qrcode');
    qrcodeContainer.innerHTML = '';

    // Generate new QR code
    if (typeof QRCode !== 'undefined') {
        new QRCode(qrcodeContainer, {
            text: configUri,
            width: 200,
            height: 200,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    loginSection.classList.add('hidden');
    userSection.classList.add('hidden');
    configSection.classList.remove('hidden');
}

// Show user section
function showUserSection() {
    loginSection.classList.add('hidden');
    userSection.classList.remove('hidden');
    configSection.classList.add('hidden');

    // Clear form
    document.getElementById('clientEmail').value = '';
    showError(createError, '');
}

// Copy config to clipboard
async function copyConfig() {
    try {
        await navigator.clipboard.writeText(configLink.value);
        const btn = document.getElementById('copyConfigBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 2000);
    } catch (error) {
        // Fallback for older browsers
        configLink.select();
        document.execCommand('copy');
    }
}

// Logout handler
async function handleLogout() {
    try {
        await fetch('/api/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serverUrl: currentServerUrl })
        });
    } catch (error) {
        console.error('Logout error:', error);
    }

    currentServerUrl = '';
    inbounds = [];

    loginSection.classList.remove('hidden');
    userSection.classList.add('hidden');
    configSection.classList.add('hidden');

    // Clear forms
    loginForm.reset();
    createUserForm.reset();
}

// Show error message
function showError(element, message) {
    if (message) {
        element.textContent = message;
        element.classList.add('show');
    } else {
        element.textContent = '';
        element.classList.remove('show');
    }
}
