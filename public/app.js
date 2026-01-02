// Global state
let panelUrl = '';
let inbounds = [];

// DOM Elements
const loadingSection = document.getElementById('loadingSection');
const errorSection = document.getElementById('errorSection');
const userSection = document.getElementById('userSection');
const configSection = document.getElementById('configSection');
const createUserForm = document.getElementById('createUserForm');
const createError = document.getElementById('createError');
const connectedServer = document.getElementById('connectedServer');
const inboundSelect = document.getElementById('inboundSelect');
const configLink = document.getElementById('configLink');

// Event Listeners
createUserForm.addEventListener('submit', handleCreateUser);
document.getElementById('copyConfigBtn').addEventListener('click', copyConfig);
document.getElementById('createAnotherBtn').addEventListener('click', showUserSection);
document.getElementById('retryBtn').addEventListener('click', initializeApp);

// Initialize app on load
document.addEventListener('DOMContentLoaded', initializeApp);

// Initialize application
async function initializeApp() {
    showLoading();

    try {
        // Check connection status
        const statusResponse = await fetch('/api/status');
        const status = await statusResponse.json();

        if (status.success) {
            panelUrl = status.panelUrl;
            connectedServer.textContent = panelUrl;
            await loadInbounds();
            showUserSection();
        } else {
            showError('نتوانستیم به پنل متصل شویم. لطفاً تنظیمات config.js را بررسی کنید.');
        }
    } catch (error) {
        showError('خطا در اتصال به سرور: ' + error.message);
    }
}

// Load inbounds list
async function loadInbounds() {
    try {
        const response = await fetch('/api/inbounds/list');
        const data = await response.json();

        if (data.success && data.obj) {
            inbounds = data.obj;
            populateInboundSelect();
        } else {
            showFormError('خطا در بارگذاری Inbound ها');
        }
    } catch (error) {
        showFormError('خطا در بارگذاری: ' + error.message);
    }
}

// Populate inbound dropdown
function populateInboundSelect() {
    inboundSelect.innerHTML = '';

    if (inbounds.length === 0) {
        inboundSelect.innerHTML = '<option value="">هیچ Inbound یافت نشد</option>';
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
        showFormError('لطفاً یک Inbound انتخاب کنید');
        return;
    }

    showFormError('');

    try {
        // Generate UUID for the client
        const uuidResponse = await fetch('/api/server/getNewUUID');
        const uuidData = await uuidResponse.json();

        if (!uuidData.success) {
            showFormError('خطا در تولید UUID');
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
            const errorMsg = data.msg || data.message || 'خطا در ایجاد کاربر';
            console.error('Create user failed:', errorMsg, data);
            showFormError(errorMsg);
        }
    } catch (error) {
        console.error('Create user error:', error);
        showFormError('خطا در ایجاد کاربر: ' + error.message);
    }
}

// Create client data based on protocol
function createClientData(protocol, uuid, email, expiryTime, trafficLimitGB) {
    const trafficBytes = trafficLimitGB * 1024 * 1024 * 1024;

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
    const streamSettings = JSON.parse(inbound.streamSettings || '{}');

    const host = new URL(panelUrl).hostname;
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

// UI Functions
function showLoading() {
    loadingSection.classList.remove('hidden');
    errorSection.classList.add('hidden');
    userSection.classList.add('hidden');
    configSection.classList.add('hidden');
}

function showError(message) {
    loadingSection.classList.add('hidden');
    errorSection.classList.remove('hidden');
    userSection.classList.add('hidden');
    configSection.classList.add('hidden');
    document.getElementById('connectionError').textContent = message;
}

function showUserSection() {
    loadingSection.classList.add('hidden');
    errorSection.classList.add('hidden');
    userSection.classList.remove('hidden');
    configSection.classList.add('hidden');
    document.getElementById('clientEmail').value = '';
    showFormError('');
}

function showConfigSection(configUri) {
    configLink.value = configUri;

    const qrcodeContainer = document.getElementById('qrcode');
    qrcodeContainer.innerHTML = '';

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

    loadingSection.classList.add('hidden');
    errorSection.classList.add('hidden');
    userSection.classList.add('hidden');
    configSection.classList.remove('hidden');
}

function showFormError(message) {
    if (message) {
        createError.textContent = message;
        createError.classList.add('show');
    } else {
        createError.textContent = '';
        createError.classList.remove('show');
    }
}

// Copy config to clipboard
async function copyConfig() {
    try {
        await navigator.clipboard.writeText(configLink.value);
        const btn = document.getElementById('copyConfigBtn');
        btn.textContent = 'کپی شد!';
        setTimeout(() => btn.textContent = 'کپی', 2000);
    } catch (error) {
        configLink.select();
        document.execCommand('copy');
    }
}
