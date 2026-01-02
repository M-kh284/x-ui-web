const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store session cookies for authenticated requests
let sessionCookies = {};

// Login to X-UI panel
app.post('/api/login', async (req, res) => {
    try {
        const { serverUrl, username, password } = req.body;

        const response = await axios.post(`${serverUrl}/login`, {
            username,
            password
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            withCredentials: true
        });

        if (response.data.success) {
            // Store cookies for this server
            const cookies = response.headers['set-cookie'];
            sessionCookies[serverUrl] = cookies ? cookies.join('; ') : '';

            res.json({ success: true, message: 'Login successful' });
        } else {
            res.json({ success: false, message: response.data.msg || 'Login failed' });
        }
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// Get list of inbounds
app.post('/api/inbounds/list', async (req, res) => {
    try {
        const { serverUrl } = req.body;

        const response = await axios.get(`${serverUrl}/panel/api/inbounds/list`, {
            headers: {
                'Cookie': sessionCookies[serverUrl] || ''
            }
        });

        res.json(response.data);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// Get inbound by ID
app.post('/api/inbounds/get/:id', async (req, res) => {
    try {
        const { serverUrl } = req.body;
        const { id } = req.params;

        const response = await axios.get(`${serverUrl}/panel/api/inbounds/get/${id}`, {
            headers: {
                'Cookie': sessionCookies[serverUrl] || ''
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
        const { serverUrl, inboundId, clientData } = req.body;

        const response = await axios.post(`${serverUrl}/panel/api/inbounds/addClient`, {
            id: inboundId,
            settings: JSON.stringify({
                clients: [clientData]
            })
        }, {
            headers: {
                'Cookie': sessionCookies[serverUrl] || '',
                'Content-Type': 'application/json'
            }
        });

        res.json(response.data);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// Generate new UUID
app.post('/api/server/getNewUUID', async (req, res) => {
    try {
        const { serverUrl } = req.body;

        const response = await axios.get(`${serverUrl}/panel/api/server/getNewUUID`, {
            headers: {
                'Cookie': sessionCookies[serverUrl] || ''
            }
        });

        res.json(response.data);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    const { serverUrl } = req.body;
    delete sessionCookies[serverUrl];
    res.json({ success: true });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
