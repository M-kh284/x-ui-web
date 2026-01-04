module.exports = {
    // X-UI Panel Configuration
    PANEL_URL: process.env.PANEL_URL || 'https://your-panel.com:2053',
    PANEL_USERNAME: process.env.PANEL_USERNAME || 'admin',
    PANEL_PASSWORD: process.env.PANEL_PASSWORD || 'admin',

    // Server Configuration
    PORT: process.env.PORT || 3000,

    // Admin Configuration
    ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123'
};
