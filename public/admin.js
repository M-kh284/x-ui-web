// Global state
var adminToken = localStorage.getItem('adminToken') || '';
var allUsers = [];

// DOM Elements
var loginSection = document.getElementById('loginSection');
var dashboardSection = document.getElementById('dashboardSection');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    if (adminToken) {
        checkAdminSession();
    } else {
        showLogin();
    }
});

// Event listeners
document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);
document.getElementById('logoutBtn').addEventListener('click', handleLogout);
document.getElementById('addUserBtn').addEventListener('click', showAddUserModal);
document.getElementById('addUserForm').addEventListener('submit', handleAddUser);
document.getElementById('closeAddModal').addEventListener('click', hideAddUserModal);
document.getElementById('resetPasswordForm').addEventListener('submit', handleResetPassword);
document.getElementById('closeResetModal').addEventListener('click', hideResetPasswordModal);
document.getElementById('confirmDeleteBtn').addEventListener('click', handleDeleteUser);
document.getElementById('closeDeleteModal').addEventListener('click', hideDeleteModal);
document.getElementById('searchBox').addEventListener('input', handleSearch);

// Close modals on background click
document.getElementById('addUserModal').addEventListener('click', function(e) {
    if (e.target === this) hideAddUserModal();
});
document.getElementById('resetPasswordModal').addEventListener('click', function(e) {
    if (e.target === this) hideResetPasswordModal();
});
document.getElementById('deleteModal').addEventListener('click', function(e) {
    if (e.target === this) hideDeleteModal();
});

// Check admin session
function checkAdminSession() {
    fetch('/api/admin/check', {
        headers: { 'Authorization': adminToken }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            document.getElementById('adminNameDisplay').textContent = data.username;
            showDashboard();
            loadUsers();
        } else {
            localStorage.removeItem('adminToken');
            adminToken = '';
            showLogin();
        }
    })
    .catch(function() {
        showLogin();
    });
}

// Handle admin login
function handleAdminLogin(e) {
    e.preventDefault();

    var username = document.getElementById('adminUsername').value;
    var password = document.getElementById('adminPassword').value;

    showError('loginError', '');

    fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            adminToken = data.token;
            localStorage.setItem('adminToken', adminToken);
            document.getElementById('adminNameDisplay').textContent = username;
            showDashboard();
            loadUsers();
        } else {
            showError('loginError', data.message);
        }
    })
    .catch(function() {
        showError('loginError', 'خطا در اتصال به سرور');
    });
}

// Handle logout
function handleLogout() {
    fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Authorization': adminToken }
    })
    .then(function() {
        localStorage.removeItem('adminToken');
        adminToken = '';
        showLogin();
    });
}

// Load users
function loadUsers() {
    fetch('/api/admin/users', {
        headers: { 'Authorization': adminToken }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            allUsers = data.users;
            document.getElementById('totalUsers').textContent = data.total;
            renderUsers(allUsers);
        }
    });
}

// Render users table
function renderUsers(users) {
    var tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-users">هیچ کاربری یافت نشد</td></tr>';
        return;
    }

    for (var i = 0; i < users.length; i++) {
        var user = users[i];
        var createdDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString('fa-IR') : '-';

        var row = document.createElement('tr');
        row.innerHTML = '<td>' + escapeHtml(user.username) + '</td>' +
            '<td>' + escapeHtml(user.email || '-') + '</td>' +
            '<td>' + createdDate + '</td>' +
            '<td>' + user.configCount + '</td>' +
            '<td class="actions">' +
                '<button class="btn btn-warning btn-sm reset-btn" data-username="' + escapeHtml(user.username) + '">تغییر رمز</button>' +
                '<button class="btn btn-danger btn-sm delete-btn" data-username="' + escapeHtml(user.username) + '">حذف</button>' +
            '</td>';

        tbody.appendChild(row);
    }

    // Add event listeners to buttons
    var resetBtns = document.querySelectorAll('.reset-btn');
    for (var j = 0; j < resetBtns.length; j++) {
        resetBtns[j].addEventListener('click', function() {
            showResetPasswordModal(this.getAttribute('data-username'));
        });
    }

    var deleteBtns = document.querySelectorAll('.delete-btn');
    for (var k = 0; k < deleteBtns.length; k++) {
        deleteBtns[k].addEventListener('click', function() {
            showDeleteModal(this.getAttribute('data-username'));
        });
    }
}

// Search users
function handleSearch() {
    var query = document.getElementById('searchBox').value.toLowerCase();

    if (!query) {
        renderUsers(allUsers);
        return;
    }

    var filtered = allUsers.filter(function(user) {
        return user.username.toLowerCase().indexOf(query) !== -1 ||
               (user.email && user.email.toLowerCase().indexOf(query) !== -1);
    });

    renderUsers(filtered);
}

// Add user modal
function showAddUserModal() {
    document.getElementById('addUserForm').reset();
    showError('addUserError', '');
    document.getElementById('addUserModal').classList.remove('hidden');
}

function hideAddUserModal() {
    document.getElementById('addUserModal').classList.add('hidden');
}

function handleAddUser(e) {
    e.preventDefault();

    var username = document.getElementById('newUsername').value;
    var email = document.getElementById('newEmail').value;
    var password = document.getElementById('newUserPassword').value;

    showError('addUserError', '');

    fetch('/api/admin/users', {
        method: 'POST',
        headers: {
            'Authorization': adminToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: username, email: email, password: password })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            hideAddUserModal();
            loadUsers();
        } else {
            showError('addUserError', data.message);
        }
    })
    .catch(function() {
        showError('addUserError', 'خطا در اتصال به سرور');
    });
}

// Reset password modal
function showResetPasswordModal(username) {
    document.getElementById('resetPasswordUser').value = username;
    document.getElementById('resetPasswordUsername').textContent = username;
    document.getElementById('newPasswordInput').value = '';
    showError('resetPasswordError', '');
    document.getElementById('resetPasswordModal').classList.remove('hidden');
}

function hideResetPasswordModal() {
    document.getElementById('resetPasswordModal').classList.add('hidden');
}

function handleResetPassword(e) {
    e.preventDefault();

    var username = document.getElementById('resetPasswordUser').value;
    var newPassword = document.getElementById('newPasswordInput').value;

    showError('resetPasswordError', '');

    fetch('/api/admin/users/' + encodeURIComponent(username) + '/reset-password', {
        method: 'POST',
        headers: {
            'Authorization': adminToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newPassword: newPassword })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            hideResetPasswordModal();
            alert('رمز عبور با موفقیت تغییر کرد');
        } else {
            showError('resetPasswordError', data.message);
        }
    })
    .catch(function() {
        showError('resetPasswordError', 'خطا در اتصال به سرور');
    });
}

// Delete modal
function showDeleteModal(username) {
    document.getElementById('deleteUser').value = username;
    document.getElementById('deleteUsername').textContent = username;
    showError('deleteError', '');
    document.getElementById('deleteModal').classList.remove('hidden');
}

function hideDeleteModal() {
    document.getElementById('deleteModal').classList.add('hidden');
}

function handleDeleteUser() {
    var username = document.getElementById('deleteUser').value;

    showError('deleteError', '');

    fetch('/api/admin/users/' + encodeURIComponent(username), {
        method: 'DELETE',
        headers: { 'Authorization': adminToken }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            hideDeleteModal();
            loadUsers();
        } else {
            showError('deleteError', data.message);
        }
    })
    .catch(function() {
        showError('deleteError', 'خطا در اتصال به سرور');
    });
}

// UI helpers
function showLogin() {
    loginSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
}

function showDashboard() {
    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
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

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
