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

// Axios with timeout
var axiosInstance = axios.create({
    timeout: 10000 // 10 seconds timeout
});

// Store session cookie for X-UI panel
var sessionCookie = '';
var isLoggedIn = false;

// Cache for inbounds (refresh every 5 minutes)
var inboundsCache = null;
var inboundsCacheTime = 0;
var CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Users cache in memory
var usersCache = null;
var usersCacheTime = 0;

// Users database file
var USERS_FILE = path.join(__dirname, 'users.json');

// Load users (with cache)
function loadUsers() {
    // Check if cache is valid (less than 1 second old)
    if (usersCache && (Date.now() - usersCacheTime) < 1000) {
        return usersCache;
    }

    try {
        if (fs.existsSync(USERS_FILE)) {
            usersCache = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            usersCacheTime = Date.now();
            return usersCache;
        }
    } catch (error) {
        console.error('Error loading users:', error.message);
    }
    usersCache = {};
    usersCacheTime = Date.now();
    return usersCache;
}

function saveUsers(users) {
    try {
        usersCache = users;
        usersCacheTime = Date.now();
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
var userSessions = {};

// ==================== User Authentication ====================

// Validate email format
function isValidEmail(email) {
    var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Register new user
app.post('/api/user/register', function(req, res) {
    var username = req.body.username;
    var password = req.body.password;
    var email = req.body.email;

    if (!username || !password || !email) {
        return res.json({ success: false, message: 'نام کاربری، ایمیل و رمز عبور الزامی است' });
    }

    if (username.length < 3) {
        return res.json({ success: false, message: 'نام کاربری باید حداقل 3 کاراکتر باشد' });
    }

    if (password.length < 4) {
        return res.json({ success: false, message: 'رمز عبور باید حداقل 4 کاراکتر باشد' });
    }

    if (!isValidEmail(email)) {
        return res.json({ success: false, message: 'فرمت ایمیل صحیح نیست' });
    }

    var users = loadUsers();

    if (users[username]) {
        return res.json({ success: false, message: 'این نام کاربری قبلاً ثبت شده' });
    }

    // Check if email already exists
    for (var u in users) {
        if (users[u].email === email.toLowerCase()) {
            return res.json({ success: false, message: 'این ایمیل قبلاً ثبت شده' });
        }
    }

    users[username] = {
        password: hashPassword(password),
        email: email.toLowerCase(),
        createdAt: Date.now(),
        configs: {}
    };

    saveUsers(users);

    var token = generateToken();
    userSessions[token] = username;

    res.json({ success: true, token: token, message: 'ثبت‌نام موفق' });
});

// Forgot password - verify user
app.post('/api/user/forgot-password', function(req, res) {
    var username = req.body.username;
    var email = req.body.email;

    if (!username || !email) {
        return res.json({ success: false, message: 'نام کاربری و ایمیل الزامی است' });
    }

    var users = loadUsers();
    var user = users[username];

    if (!user) {
        return res.json({ success: false, message: 'کاربر یافت نشد' });
    }

    if (user.email !== email.toLowerCase()) {
        return res.json({ success: false, message: 'ایمیل با نام کاربری مطابقت ندارد' });
    }

    // Generate reset token
    var resetToken = generateToken();
    users[username].resetToken = resetToken;
    users[username].resetTokenExpiry = Date.now() + (15 * 60 * 1000); // 15 minutes
    saveUsers(users);

    res.json({ success: true, resetToken: resetToken, message: 'تأیید شد. رمز جدید را وارد کنید' });
});

// Reset password
app.post('/api/user/reset-password', function(req, res) {
    var username = req.body.username;
    var resetToken = req.body.resetToken;
    var newPassword = req.body.newPassword;

    if (!username || !resetToken || !newPassword) {
        return res.json({ success: false, message: 'اطلاعات ناقص است' });
    }

    if (newPassword.length < 4) {
        return res.json({ success: false, message: 'رمز عبور باید حداقل 4 کاراکتر باشد' });
    }

    var users = loadUsers();
    var user = users[username];

    if (!user) {
        return res.json({ success: false, message: 'کاربر یافت نشد' });
    }

    if (user.resetToken !== resetToken) {
        return res.json({ success: false, message: 'توکن نامعتبر است' });
    }

    if (Date.now() > user.resetTokenExpiry) {
        return res.json({ success: false, message: 'توکن منقضی شده. دوباره تلاش کنید' });
    }

    // Update password and clear reset token
    users[username].password = hashPassword(newPassword);
    delete users[username].resetToken;
    delete users[username].resetTokenExpiry;
    saveUsers(users);

    res.json({ success: true, message: 'رمز عبور با موفقیت تغییر کرد' });
});

// Login user
app.post('/api/user/login', function(req, res) {
    var username = req.body.username;
    var password = req.body.password;

    if (!username || !password) {
        return res.json({ success: false, message: 'نام کاربری و رمز عبور الزامی است' });
    }

    var users = loadUsers();
    var user = users[username];

    if (!user || user.password !== hashPassword(password)) {
        return res.json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است' });
    }

    var token = generateToken();
    userSessions[token] = username;

    // Migration: convert old format to new
    if (user.hasConfig && user.configData && !user.configs) {
        user.configs = { '1': user.configData };
        delete user.hasConfig;
        delete user.configData;
        saveUsers(users);
    }

    res.json({
        success: true,
        token: token,
        configs: user.configs || {}
    });
});

// Check user session
app.get('/api/user/check', function(req, res) {
    var token = req.headers['authorization'];

    if (!token || !userSessions[token]) {
        return res.json({ success: false, message: 'لطفاً وارد شوید' });
    }

    var username = userSessions[token];
    var users = loadUsers();
    var user = users[username];

    if (!user) {
        delete userSessions[token];
        return res.json({ success: false, message: 'کاربر یافت نشد' });
    }

    res.json({
        success: true,
        username: username,
        configs: user.configs || {}
    });
});

// Logout
app.post('/api/user/logout', function(req, res) {
    var token = req.headers['authorization'];
    if (token) {
        delete userSessions[token];
    }
    res.json({ success: true });
});

// ==================== Admin Authentication ====================

var adminSessions = {};

// Admin login
app.post('/api/admin/login', function(req, res) {
    var username = req.body.username;
    var password = req.body.password;

    if (!username || !password) {
        return res.json({ success: false, message: 'نام کاربری و رمز عبور الزامی است' });
    }

    if (username !== config.ADMIN_USERNAME || password !== config.ADMIN_PASSWORD) {
        return res.json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است' });
    }

    var token = generateToken();
    adminSessions[token] = { username: username, loginTime: Date.now() };

    res.json({ success: true, token: token, message: 'ورود موفق' });
});

// Admin check session
app.get('/api/admin/check', function(req, res) {
    var token = req.headers['authorization'];

    if (!token || !adminSessions[token]) {
        return res.json({ success: false, message: 'لطفاً وارد شوید' });
    }

    res.json({ success: true, username: adminSessions[token].username });
});

// Admin logout
app.post('/api/admin/logout', function(req, res) {
    var token = req.headers['authorization'];
    if (token) {
        delete adminSessions[token];
    }
    res.json({ success: true });
});

// Admin middleware
function requireAdmin(req, res, next) {
    var token = req.headers['authorization'];

    if (!token || !adminSessions[token]) {
        return res.json({ success: false, message: 'دسترسی ادمین نیاز است' });
    }

    next();
}

// ==================== Admin User Management ====================

// Get all users
app.get('/api/admin/users', requireAdmin, function(req, res) {
    var users = loadUsers();
    var userList = [];

    for (var username in users) {
        var user = users[username];
        var configCount = user.configs ? Object.keys(user.configs).length : 0;

        userList.push({
            username: username,
            email: user.email || '',
            createdAt: user.createdAt,
            configCount: configCount
        });
    }

    // Sort by creation date (newest first)
    userList.sort(function(a, b) {
        return (b.createdAt || 0) - (a.createdAt || 0);
    });

    res.json({ success: true, users: userList, total: userList.length });
});

// Get user details
app.get('/api/admin/users/:username', requireAdmin, function(req, res) {
    var username = req.params.username;
    var users = loadUsers();
    var user = users[username];

    if (!user) {
        return res.json({ success: false, message: 'کاربر یافت نشد' });
    }

    res.json({
        success: true,
        user: {
            username: username,
            email: user.email || '',
            createdAt: user.createdAt,
            configs: user.configs || {}
        }
    });
});

// Add new user
app.post('/api/admin/users', requireAdmin, function(req, res) {
    var username = req.body.username;
    var email = req.body.email;
    var password = req.body.password;

    if (!username || !password) {
        return res.json({ success: false, message: 'نام کاربری و رمز عبور الزامی است' });
    }

    if (username.length < 3) {
        return res.json({ success: false, message: 'نام کاربری باید حداقل 3 کاراکتر باشد' });
    }

    var users = loadUsers();

    if (users[username]) {
        return res.json({ success: false, message: 'این نام کاربری قبلاً ثبت شده' });
    }

    if (email) {
        if (!isValidEmail(email)) {
            return res.json({ success: false, message: 'فرمت ایمیل صحیح نیست' });
        }

        for (var u in users) {
            if (users[u].email === email.toLowerCase()) {
                return res.json({ success: false, message: 'این ایمیل قبلاً ثبت شده' });
            }
        }
    }

    users[username] = {
        password: hashPassword(password),
        email: email ? email.toLowerCase() : '',
        createdAt: Date.now(),
        configs: {}
    };

    saveUsers(users);

    res.json({ success: true, message: 'کاربر با موفقیت ایجاد شد' });
});

// Reset user password
app.post('/api/admin/users/:username/reset-password', requireAdmin, function(req, res) {
    var username = req.params.username;
    var newPassword = req.body.newPassword;

    if (!newPassword) {
        return res.json({ success: false, message: 'رمز عبور جدید الزامی است' });
    }

    if (newPassword.length < 4) {
        return res.json({ success: false, message: 'رمز عبور باید حداقل 4 کاراکتر باشد' });
    }

    var users = loadUsers();

    if (!users[username]) {
        return res.json({ success: false, message: 'کاربر یافت نشد' });
    }

    users[username].password = hashPassword(newPassword);
    saveUsers(users);

    // Invalidate user sessions
    for (var token in userSessions) {
        if (userSessions[token] === username) {
            delete userSessions[token];
        }
    }

    res.json({ success: true, message: 'رمز عبور با موفقیت تغییر کرد' });
});

// Delete user
app.delete('/api/admin/users/:username', requireAdmin, function(req, res) {
    var username = req.params.username;

    var users = loadUsers();

    if (!users[username]) {
        return res.json({ success: false, message: 'کاربر یافت نشد' });
    }

    delete users[username];
    saveUsers(users);

    // Invalidate user sessions
    for (var token in userSessions) {
        if (userSessions[token] === username) {
            delete userSessions[token];
        }
    }

    res.json({ success: true, message: 'کاربر با موفقیت حذف شد' });
});

// ==================== X-UI Panel Functions ====================

async function loginToPanel() {
    try {
        var formData = new URLSearchParams();
        formData.append('username', config.PANEL_USERNAME);
        formData.append('password', config.PANEL_PASSWORD);

        var response = await axiosInstance.post(config.PANEL_URL + '/login', formData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (response.data.success) {
            var cookies = response.headers['set-cookie'];
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

// Get inbounds with caching
async function getInboundsFromPanel() {
    // Check cache first
    if (inboundsCache && (Date.now() - inboundsCacheTime) < CACHE_DURATION) {
        return inboundsCache;
    }

    try {
        await ensureLoggedIn();

        var response = await axiosInstance.get(config.PANEL_URL + '/panel/api/inbounds/list', {
            headers: { 'Cookie': sessionCookie }
        });

        if (response.data.success && response.data.obj) {
            inboundsCache = response.data.obj;
            inboundsCacheTime = Date.now();
            return inboundsCache;
        }
    } catch (error) {
        console.error('Get inbounds error:', error.message);
        // If we have old cache, return it
        if (inboundsCache) {
            return inboundsCache;
        }
    }
    return null;
}

// ==================== Inbounds API ====================

app.get('/api/inbounds', async function(req, res) {
    var token = req.headers['authorization'];

    if (!token || !userSessions[token]) {
        return res.json({ success: false, message: 'لطفاً وارد شوید' });
    }

    var inboundsList = await getInboundsFromPanel();

    if (inboundsList) {
        var inbounds = inboundsList.map(function(inbound) {
            return {
                id: inbound.id,
                remark: inbound.remark,
                protocol: inbound.protocol,
                port: inbound.port
            };
        });
        res.json({ success: true, inbounds: inbounds });
    } else {
        res.json({ success: false, message: 'خطا در دریافت لیست Inbound ها' });
    }
});

// ==================== Config Creation ====================

app.post('/api/create-config', async function(req, res) {
    var token = req.headers['authorization'];
    var inboundId = req.body.inboundId;

    if (!token || !userSessions[token]) {
        return res.json({ success: false, message: 'لطفاً وارد شوید' });
    }

    if (!inboundId) {
        return res.json({ success: false, message: 'لطفاً یک Inbound انتخاب کنید' });
    }

    var username = userSessions[token];
    var users = loadUsers();
    var user = users[username];

    if (!user) {
        return res.json({ success: false, message: 'کاربر یافت نشد' });
    }

    if (!user.configs) {
        user.configs = {};
    }

    if (user.configs[inboundId]) {
        return res.json({
            success: false,
            message: 'شما قبلاً در این Inbound کانفیگ دریافت کرده‌اید',
            configData: user.configs[inboundId]
        });
    }

    try {
        await ensureLoggedIn();

        // Get inbound from cache or panel
        var inboundsList = await getInboundsFromPanel();
        if (!inboundsList) {
            return res.json({ success: false, message: 'خطا در دریافت اطلاعات Inbound' });
        }

        var inbound = null;
        for (var i = 0; i < inboundsList.length; i++) {
            if (inboundsList[i].id === inboundId) {
                inbound = inboundsList[i];
                break;
            }
        }

        if (!inbound) {
            return res.json({ success: false, message: 'Inbound یافت نشد' });
        }

        // Generate UUID
        var uuidResponse = await axiosInstance.get(config.PANEL_URL + '/panel/api/server/getNewUUID', {
            headers: { 'Cookie': sessionCookie }
        });

        if (!uuidResponse.data.success) {
            return res.json({ success: false, message: 'خطا در تولید UUID' });
        }

        var uuid = uuidResponse.data.obj.uuid || uuidResponse.data.obj;

        // Fixed settings: 30 days, 100GB
        var expiryTime = Date.now() + (30 * 24 * 60 * 60 * 1000);
        var trafficBytes = 100 * 1024 * 1024 * 1024;

        var clientEmail = username + '_' + inboundId;

        var clientData = {
            email: clientEmail,
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

        var payload = {
            id: inbound.id,
            settings: JSON.stringify({ clients: [clientData] })
        };

        var addResponse = await axiosInstance.post(config.PANEL_URL + '/panel/api/inbounds/addClient', payload, {
            headers: {
                'Cookie': sessionCookie,
                'Content-Type': 'application/json'
            }
        });

        if (!addResponse.data.success) {
            return res.json({ success: false, message: addResponse.data.msg || 'خطا در ایجاد کانفیگ' });
        }

        var configLink = generateConfigLink(inbound, clientData, protocol);

        var configData = {
            link: configLink,
            protocol: protocol,
            inboundName: inbound.remark,
            expiryDate: new Date(expiryTime).toLocaleDateString('fa-IR'),
            traffic: '100 GB',
            createdAt: Date.now()
        };

        users[username].configs[inboundId] = configData;
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
        var trojanParams = 'security=' + security + '&type=' + network;

        if (security === 'tls' && streamSettings.tlsSettings) {
            trojanParams += '&sni=' + (streamSettings.tlsSettings.serverName || host);
        }

        configLink = 'trojan://' + client.password + '@' + host + ':' + port + '?' + trojanParams + '#' + encodeURIComponent(client.email);
    } else if (protocol === 'shadowsocks') {
        var method = client.method || 'chacha20-ietf-poly1305';
        var auth = Buffer.from(method + ':' + client.password).toString('base64');
        configLink = 'ss://' + auth + '@' + host + ':' + port + '#' + encodeURIComponent(client.email);
    }

    return configLink;
}

// ==================== Serve Pages ====================

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', function(req, res) {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ==================== Start Server ====================

app.listen(config.PORT, async function() {
    console.log('Server running on http://localhost:' + config.PORT);
    console.log('Panel URL: ' + config.PANEL_URL);

    // Pre-load inbounds cache
    var success = await loginToPanel();
    if (success) {
        await getInboundsFromPanel();
        console.log('Ready to accept requests (inbounds cached)');
    } else {
        console.log('Warning: Could not login to panel. Check config.js');
    }
});
