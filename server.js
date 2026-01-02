const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store session cookie
let sessionCookie = '';
let isLoggedIn = false;

// Login to X-UI panel (internal function)
async function loginToPanel() {
    try {
        const formData = new URLSearchParams();
        formData.append('username', config.PANEL_USERNAME);
        formData.append('password', config.PANEL_PASSWORD);

        const response = await axios.post(`${config.PANEL_URL}/login`, formData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('Login response:', response.data);

        if (response.data.success) {
            const cookies = response.headers['set-cookie'];
            sessionCookie = cookies ? cookies.join('; ') : '';
            isLoggedIn = true;
            console.log('Logged in to panel successfully');
            return true;
        } else {
            console.error('Login failed:', response.data.msg);
            return false;
        }
    } catch (error) {
        console.error('Login error:', error.message);
        return false;
    }
}

// Ensure logged in before API calls
async function ensureLoggedIn() {
    if (!isLoggedIn || !sessionCookie) {
        return await loginToPanel();
    }
    return true;
}

// Get panel config (for frontend)
app.get('/api/config', (req, res) => {
    res.json({
        panelUrl: config.PANEL_URL
    });
});

// Check connection status
app.get('/api/status', async (req, res) => {
    const loggedIn = await ensureLoggedIn();
    res.json({
        success: loggedIn,
        panelUrl: config.PANEL_URL
    });
});

// Get list of inbounds
app.get('/api/inbounds/list', async (req, res) => {
    try {
        await ensureLoggedIn();

        const response = await axios.get(`${config.PANEL_URL}/panel/api/inbounds/list`, {
            headers: {
                'Cookie': sessionCookie
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Get inbounds error:', error.message);
        // Try to re-login and retry
        isLoggedIn = false;
        res.json({ success: false, message: error.message });
    }
});

// Get inbound by ID
app.get('/api/inbounds/get/:id', async (req, res) => {
    try {
        await ensureLoggedIn();
        const { id } = req.params;

        const response = await axios.get(`${config.PANEL_URL}/panel/api/inbounds/get/${id}`, {
            headers: {
                'Cookie': sessionCookie
            }
        });

        res.json(response.data);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// Add client to inbound
app.post('/api/inbounds/addClient', async (req, res) => {
    try {
        await ensureLoggedIn();
        const { inboundId, clientData } = req.body;

        const payload = {
            id: inboundId,
            settings: JSON.stringify({
                clients: [clientData]
            })
        };

        console.log('Adding client to inbound:', inboundId);
        console.log('Client data:', JSON.stringify(clientData, null, 2));

        const response = await axios.post(`${config.PANEL_URL}/panel/api/inbounds/addClient`, payload, {
            headers: {
                'Cookie': sessionCookie,
                'Content-Type': 'application/json'
            }
        });

        console.log('Add client response:', response.data);
        res.json(response.data);
    } catch (error) {
        console.error('Add client error:', error.response?.data || error.message);
        // Try to re-login on auth error
        if (error.response?.status === 401) {
            isLoggedIn = false;
        }
        res.json({
            success: false,
            message: error.response?.data?.msg || error.message
        });
    }
});

// Generate new UUID
app.get('/api/server/getNewUUID', async (req, res) => {
    try {
        await ensureLoggedIn();

        const response = await axios.get(`${config.PANEL_URL}/panel/api/server/getNewUUID`, {
            headers: {
                'Cookie': sessionCookie
            }
        });

        res.json(response.data);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server and login to panel
app.listen(config.PORT, async () => {
    console.log(`Server running on http://localhost:${config.PORT}`);
    console.log(`Panel URL: ${config.PANEL_URL}`);

    // Auto-login on startup
    const success = await loginToPanel();
    if (success) {
        console.log('Ready to accept requests');
    } else {
        console.log('Warning: Could not login to panel. Check config.js');
    }
});
