const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('./config');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store session cookie for X-UI panel
let sessionCookie = '';
let isLoggedIn = false;

// Users database file
const USERS_FILE = path.join(__dirname, 'users.json');

// Initialize users database
function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('Error loading users:', error.message);
    }
    return {};
}

function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('Error saving users:', error.message);
    }
}

// Hash password
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Generate session token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// User sessions (in memory)
let userSessions = {};

// ==================== User Authentication ====================

// Register new user
app.post('/api/user/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.json({ success: false, message: 'نام کاربری و رمز عبور الزامی است' });
    }

    if (username.length < 3) {
        return res.json({ success: false, message: 'نام کاربری باید حداقل 3 کاراکتر باشد' });
    }

    if (password.length < 4) {
        return res.json({ success: false, message: 'رمز عبور باید حداقل 4 کاراکتر باشد' });
    }

    const users = loadUsers();

    if (users[username]) {
        return res.json({ success: false, message: 'این نام کاربری قبلاً ثبت شده' });
    }

    // Create new user
    users[username] = {
        password: hashPassword(password),
        createdAt: Date.now(),
        hasConfig: false,
        configData: null
    };

    saveUsers(users);

    // Auto login after register
    const token = generateToken();
    userSessions[token] = username;

    res.json({ success: true, token: token, message: 'ثبت‌نام موفق' });
});

// Login user
app.post('/api/user/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.json({ success: false, message: 'نام کاربری و رمز عبور الزامی است' });
    }

    const users = loadUsers();
    const user = users[username];

    if (!user || user.password !== hashPassword(password)) {
        return res.json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است' });
    }

    const token = generateToken();
    userSessions[token] = username;

    res.json({
        success: true,
        token: token,
        hasConfig: user.hasConfig,
        configData: user.configData
    });
});

// Check user session
app.get('/api/user/check', (req, res) => {
    const token = req.headers['authorization'];

    if (!token || !userSessions[token]) {
        return res.json({ success: false, message: 'لطفاً وارد شوید' });
    }

    const username = userSessions[token];
    const users = loadUsers();
    const user = users[username];

    if (!user) {
        delete userSessions[token];
        return res.json({ success: false, message: 'کاربر یافت نشد' });
    }

    res.json({
        success: true,
        username: username,
        hasConfig: user.hasConfig,
        configData: user.configData
    });
});

// Logout
app.post('/api/user/logout', (req, res) => {
    const token = req.headers['authorization'];
    if (token) {
        delete userSessions[token];
    }
    res.json({ success: true });
});

// ==================== X-UI Panel Functions ====================

// Login to X-UI panel (internal function)
async function loginToPanel() {
    try {
        const formData = new URLSearchParams();
        formData.append('username', config.PANEL_USERNAME);
        formData.append('password', config.PANEL_PASSWORD);

        const response = await axios.post(config.PANEL_URL + '/login', formData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (response.data.success) {
            const cookies = response.headers['set-cookie'];
            sessionCookie = cookies ? cookies.join('; ') : '';
            isLoggedIn = true;
            console.log('Logged in to X-UI panel successfully');
            return true;
        } else {
            console.error('Panel login failed:', response.data.msg);
            return false;
        }
    } catch (error) {
        console.error('Panel login error:', error.message);
        return false;
    }
}

async function ensureLoggedIn() {
    if (!isLoggedIn || !sessionCookie) {
        return await loginToPanel();
    }
    return true;
}

// ==================== Config Creation ====================

// Create config for user (one-time only)
app.post('/api/create-config', async (req, res) => {
    const token = req.headers['authorization'];

    if (!token || !userSessions[token]) {
        return res.json({ success: false, message: 'لطفاً وارد شوید' });
    }

    const username = userSessions[token];
    const users = loadUsers();
    const user = users[username];

    if (!user) {
        return res.json({ success: false, message: 'کاربر یافت نشد' });
    }

    if (user.hasConfig) {
        return res.json({
            success: false,
            message: 'شما قبلاً کانفیگ دریافت کرده‌اید',
            configData: user.configData
        });
    }

    try {
        await ensureLoggedIn();

        // Get first available inbound
        const inboundsResponse = await axios.get(config.PANEL_URL + '/panel/api/inbounds/list', {
            headers: { 'Cookie': sessionCookie }
        });

        if (!inboundsResponse.data.success || !inboundsResponse.data.obj || inboundsResponse.data.obj.length === 0) {
            return res.json({ success: false, message: 'هیچ Inbound یافت نشد' });
        }

        const inbound = inboundsResponse.data.obj[0]; // Use first inbound

        // Generate UUID
        const uuidResponse = await axios.get(config.PANEL_URL + '/panel/api/server/getNewUUID', {
            headers: { 'Cookie': sessionCookie }
        });

        if (!uuidResponse.data.success) {
            return res.json({ success: false, message: 'خطا در تولید UUID' });
        }

        const uuid = uuidResponse.data.obj.uuid || uuidResponse.data.obj;

        // Fixed settings: 30 days, 100GB
        const expiryTime = Date.now() + (30 * 24 * 60 * 60 * 1000);
        const trafficBytes = 100 * 1024 * 1024 * 1024;

        // Create client data based on protocol
        var clientData = {
            email: username,
            enable: true,
            expiryTime: expiryTime,
            totalGB: trafficBytes,
            limitIp: 0,
            reset: 0,
            subId: 'sub_' + Math.random().toString(36).substring(2, 15)
        };

        var protocol = inbound.protocol.toLowerCase();

        if (protocol === 'vmess' || protocol === 'vless') {
            clientData.id = uuid;
            clientData.flow = '';
            clientData.alterId = 0;
            clientData.tgId = '';
            clientData.fingerprint = 'chrome';
        } else if (protocol === 'trojan') {
            clientData.password = uuid;
            clientData.tgId = '';
        } else if (protocol === 'shadowsocks') {
            clientData.password = uuid;
            clientData.method = 'chacha20-ietf-poly1305';
        } else {
            clientData.id = uuid;
        }

        // Add client to inbound
        const payload = {
            id: inbound.id,
            settings: JSON.stringify({ clients: [clientData] })
        };

        const addResponse = await axios.post(config.PANEL_URL + '/panel/api/inbounds/addClient', payload, {
            headers: {
                'Cookie': sessionCookie,
                'Content-Type': 'application/json'
            }
        });

        if (!addResponse.data.success) {
            return res.json({ success: false, message: addResponse.data.msg || 'خطا در ایجاد کانفیگ' });
        }

        // Generate config link
        var configLink = generateConfigLink(inbound, clientData, protocol);

        // Save to user
        var configData = {
            link: configLink,
            protocol: protocol,
            expiryDate: new Date(expiryTime).toLocaleDateString('fa-IR'),
            traffic: '100 GB',
            createdAt: Date.now()
        };

        users[username].hasConfig = true;
        users[username].configData = configData;
        saveUsers(users);

        res.json({
            success: true,
            message: 'کانفیگ با موفقیت ایجاد شد',
            configData: configData
        });

    } catch (error) {
        console.error('Create config error:', error.message);
        res.json({ success: false, message: 'خطا در ایجاد کانفیگ: ' + error.message });
    }
});

// Generate config link
function generateConfigLink(inbound, client, protocol) {
    var streamSettings = {};
    try {
        streamSettings = JSON.parse(inbound.streamSettings || '{}');
    } catch (e) {}

    var host = '';
    try {
        var url = new URL(config.PANEL_URL);
        host = url.hostname;
    } catch (e) {
        host = config.PANEL_URL.replace(/https?:\/\//, '').split(':')[0];
    }

    var port = inbound.port;
    var network = streamSettings.network || 'tcp';
    var security = streamSettings.security || 'none';

    var configLink = '';

    if (protocol === 'vmess') {
        var vmessConfig = {
            v: '2',
            ps: client.email,
            add: host,
            port: port,
            id: client.id,
            aid: 0,
            net: network,
            type: 'none',
            host: '',
            path: (streamSettings.wsSettings && streamSettings.wsSettings.path) || '',
            tls: security === 'tls' ? 'tls' : ''
        };
        configLink = 'vmess://' + Buffer.from(JSON.stringify(vmessConfig)).toString('base64');
    } else if (protocol === 'vless') {
        var params = 'type=' + network + '&security=' + security;

        if (network === 'ws' && streamSettings.wsSettings) {
            params += '&path=' + encodeURIComponent(streamSettings.wsSettings.path || '/');
        }

        if (security === 'tls' && streamSettings.tlsSettings) {
            params += '&sni=' + (streamSettings.tlsSettings.serverName || host);
        }

        if (security === 'reality' && streamSettings.realitySettings) {
            var rs = streamSettings.realitySettings;
            params += '&sni=' + ((rs.serverNames && rs.serverNames[0]) || '');
            params += '&pbk=' + (rs.publicKey || '');
            params += '&fp=' + (rs.fingerprint || 'chrome');
        }

        configLink = 'vless://' + client.id + '@' + host + ':' + port + '?' + params + '#' + encodeURIComponent(client.email);
    } else if (protocol === 'trojan') {
        var params = 'security=' + security + '&type=' + network;

        if (security === 'tls' && streamSettings.tlsSettings) {
            params += '&sni=' + (streamSettings.tlsSettings.serverName || host);
        }

        configLink = 'trojan://' + client.password + '@' + host + ':' + port + '?' + params + '#' + encodeURIComponent(client.email);
    } else if (protocol === 'shadowsocks') {
        var method = client.method || 'chacha20-ietf-poly1305';
        var auth = Buffer.from(method + ':' + client.password).toString('base64');
        configLink = 'ss://' + auth + '@' + host + ':' + port + '#' + encodeURIComponent(client.email);
    }

    return configLink;
}

// ==================== Serve Pages ====================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== Start Server ====================

app.listen(config.PORT, async function() {
    console.log('Server running on http://localhost:' + config.PORT);
    console.log('Panel URL: ' + config.PANEL_URL);

    var success = await loginToPanel();
    if (success) {
        console.log('Ready to accept requests');
    } else {
        console.log('Warning: Could not login to panel. Check config.js');
    }
});
