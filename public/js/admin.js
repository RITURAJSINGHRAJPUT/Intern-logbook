/**
 * Admin Panel Logic (Sidebar Redesign)
 */

document.addEventListener('DOMContentLoaded', () => {
    const adminLoading = document.getElementById('adminLoading');
    const adminPanel = document.getElementById('adminPanel');
    const accessDenied = document.getElementById('accessDenied');
    const usersTableBody = document.getElementById('usersTableBody');
    const searchInput = document.getElementById('searchInput');
    const filterSelect = document.getElementById('filterSelect');
    const paginationEl = document.getElementById('pagination');
    const paginationInfo = document.getElementById('paginationInfo');
    const templateModal = document.getElementById('templateModal');

    let currentPage = 1;
    let allTemplates = [];
    let selectedUserUid = null;

    setTimeout(initAdmin, 1500);

    async function initAdmin() {
        try {
            const token = await window.getFirebaseToken();
            if (!token) {
                showAccessDenied();
                return;
            }

            const res = await fetch('/api/admin/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.status === 403 || res.status === 401) {
                showAccessDenied();
                return;
            }

            if (!res.ok) throw new Error('Failed to verify admin status');

            adminLoading.style.display = 'none';
            adminPanel.style.display = 'block';

            await Promise.all([
                loadStats(),
                loadUsers(),
                loadAllTemplates()
            ]);

            setupListeners();

        } catch (error) {
            console.error('Admin init error:', error);
            showAccessDenied();
        }
    }

    function showAccessDenied() {
        adminLoading.style.display = 'none';
        accessDenied.style.display = 'flex';
        setTimeout(() => {
            window.location.replace('/app.html');
        }, 2500);
    }

    async function getAuthHeaders() {
        const token = await window.getFirebaseToken();
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    // === Stats ===
    async function loadStats() {
        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/admin/stats', { headers });
            const data = await res.json();

            document.getElementById('statTotal').textContent = data.total || 0;
            document.getElementById('statApproved').textContent = data.approved || 0;
            document.getElementById('statPending').textContent = data.pending || 0;
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    // === Users ===
    async function loadUsers() {
        try {
            const headers = await getAuthHeaders();
            const search = searchInput.value.trim();
            const filter = filterSelect.value;
            const limit = 4; // Design shows 1-4 of 4

            const params = new URLSearchParams({
                page: currentPage,
                limit: limit,
                search,
                filter
            });

            const res = await fetch(`/api/admin/users?${params}`, { headers });
            const data = await res.json();

            renderUsersTable(data.users);
            renderPagination(data.pagination);
        } catch (error) {
            console.error('Error loading users:', error);
            usersTableBody.innerHTML = `
                <tr><td colspan="6" class="empty-state">
                    <p style="color:#ef4444">Failed to load users. Please try again.</p>
                </td></tr>`;
        }
    }

    function renderUsersTable(users) {
        if (!users || users.length === 0) {
            usersTableBody.innerHTML = `
                <tr><td colspan="6" class="empty-state">
                    <p>No users found matching criteria.</p>
                </td></tr>`;
            return;
        }

        const colors = ['purple', 'blue', 'yellow'];

        usersTableBody.innerHTML = users.map((user, idx) => {
            const initial = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
            const colorClass = colors[idx % colors.length];

            const statusAttr = user.approved
                ? '<span class="status-pill approved">Approved</span>'
                : '<span class="status-pill pending">Pending</span>';

            const adminBadge = user.role === 'admin' ? '<span class="admin-tag">Admin</span>' : '';

            let templatesHtml = '<span class="template-pill more" style="font-weight:normal;opacity:0.5;font-style:italic">No templates assigned</span>';
            if (user.allowedTemplates && user.allowedTemplates.length > 0) {
                if (user.role === 'admin' && user.allowedTemplates.length > 2) {
                    templatesHtml = '<span class="template-pill more">All Forms</span>';
                } else {
                    const firstTemp = user.allowedTemplates[0].replace('.pdf', '');
                    templatesHtml = `<span class="template-pill">${firstTemp}</span>`;
                    if (user.allowedTemplates.length > 1) {
                        templatesHtml += `<br><span class="template-pill more">+${user.allowedTemplates.length - 1} more</span>`;
                    }
                }
            }

            const bulkFillIcon = user.allowBulkFill
                ? '<div class="bulk-status allowed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Allowed</div>'
                : '<div class="bulk-status denied"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Denied</div>';

            const joinedDate = user.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : '-';

            let lastActivityDate = 'Never';
            let lastActivityTime = '';
            if (user.lastLogin) {
                const dateObj = new Date(user.lastLogin);
                lastActivityDate = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                lastActivityTime = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            }

            const actions = user.approved
                ? `
                    <button class="action-icon" title="View" onclick="adminActions.assignTemplates('${user.uid}', ${JSON.stringify(user.allowedTemplates || []).replace(/"/g, '&quot;')})">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </button>
                    <button class="action-icon warning" title="Toggle Bulk Fill" onclick="adminActions.toggleBulkFill('${user.uid}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    </button>
                    <button class="action-icon danger" title="Deactivate" onclick="adminActions.toggleActive('${user.uid}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                  `
                : `
                    <button class="approve-btn" onclick="adminActions.approve('${user.uid}')">Approve</button>
                    <button class="action-icon danger" style="padding:6px;margin-left:8px;" title="Reject" onclick="adminActions.reject('${user.uid}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                  `;

            return `
                <tr>
                    <td>
                        <div class="user-cell">
                            <div class="avatar-circle ${colorClass}">${initial}</div>
                            <div class="user-info">
                                <div class="user-name-wrapper">
                                    <span class="user-name">${user.displayName || user.email.split('@')[0]}</span>
                                    ${adminBadge}
                                </div>
                                <span class="user-email">${user.email}</span>
                            </div>
                        </div>
                    </td>
                    <td>${statusAttr}</td>
                    <td>${templatesHtml}</td>
                    <td>${bulkFillIcon}</td>
                    <td>
                        <div class="date-cell">
                            <span class="date-main">${lastActivityDate}</span>
                            <span class="date-sub">${lastActivityTime}</span>
                        </div>
                    </td>
                    <td class="actions-col">
                        <div class="action-row">
                            ${actions}
                        </div>
                    </td>
                </tr>`;
        }).join('');
    }

    function renderPagination(pagination) {
        if (!pagination) return;

        const start = (pagination.page - 1) * pagination.limit + 1;
        const end = Math.min(start + pagination.limit - 1, pagination.totalUsers);

        if (pagination.totalUsers === 0) {
            paginationInfo.innerHTML = `Showing 0 users`;
        } else {
            paginationInfo.innerHTML = `Showing <span>${start}-${end}</span> of <span>${pagination.totalUsers}</span> users`;
        }

        if (pagination.totalPages <= 1) {
            paginationEl.innerHTML = `
                <button class="page-btn" disabled>&lsaquo;</button>
                <button class="page-btn active">1</button>
                <button class="page-btn" disabled>&rsaquo;</button>
            `;
            return;
        }

        let html = '';
        html += `<button class="page-btn" onclick="adminActions.goToPage(${pagination.page - 1})" ${pagination.page <= 1 ? 'disabled' : ''}>&lsaquo;</button>`;

        for (let i = 1; i <= pagination.totalPages; i++) {
            if (i === pagination.page) {
                html += `<button class="page-btn active">${i}</button>`;
            } else {
                html += `<button class="page-btn" onclick="adminActions.goToPage(${i})">${i}</button>`;
            }
        }

        html += `<button class="page-btn" onclick="adminActions.goToPage(${pagination.page + 1})" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>&rsaquo;</button>`;
        paginationEl.innerHTML = html;
    }

    // === Templates ===
    async function loadAllTemplates() {
        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/admin/templates', { headers });
            const data = await res.json();
            allTemplates = data.templates || [];
        } catch (error) {
            console.error('Error loading templates:', error);
        }
    }

    function openTemplateModal(uid, currentTemplates) {
        selectedUserUid = uid;
        const list = document.getElementById('templateCheckboxList');

        list.innerHTML = allTemplates.map(t => `
            <label class="template-checkbox-item">
                <input type="checkbox" value="${t.filename}" 
                    ${currentTemplates.includes(t.filename) ? 'checked' : ''}>
                <span>${t.name}</span>
            </label>
        `).join('');

        templateModal.classList.remove('hidden');
    }

    async function saveTemplates() {
        if (!selectedUserUid) return;

        const checkboxes = document.querySelectorAll('#templateCheckboxList input[type="checkbox"]');
        const selected = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        try {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/admin/users/${selectedUserUid}/templates`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ allowedTemplates: selected })
            });

            if (!res.ok) throw new Error('Failed to save');

            templateModal.classList.add('hidden');
            await loadUsers();
            showToast('Templates updated successfully');
        } catch (error) {
            console.error('Error saving templates:', error);
            showToast('Failed to save templates', 'error');
        }
    }

    // === Event Listeners ===
    function setupListeners() {
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentPage = 1;
                loadUsers();
            }, 300);
        });

        filterSelect.addEventListener('change', () => {
            currentPage = 1;
            loadUsers();
        });

        document.getElementById('modalClose').addEventListener('click', () => {
            templateModal.classList.add('hidden');
        });

        document.getElementById('modalCancel').addEventListener('click', () => {
            templateModal.classList.add('hidden');
        });

        document.getElementById('modalSave').addEventListener('click', saveTemplates);

        templateModal.addEventListener('click', (e) => {
            if (e.target === templateModal) {
                templateModal.classList.add('hidden');
            }
        });
    }

    // === Global Actions ===
    window.adminActions = {
        approve: async (uid) => {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/admin/users/${uid}/approve`, { method: 'POST', headers });
                if (!res.ok) throw new Error('Failed');
                await Promise.all([loadStats(), loadUsers()]);
                showToast('User approved');
            } catch (error) { showToast('Failed to approve', 'error'); }
        },

        reject: async (uid) => {
            try {
                if (!confirm("Are you sure you want to reject/delete this user?")) return;
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/admin/users/${uid}/reject`, { method: 'POST', headers });
                if (!res.ok) throw new Error('Failed');
                await Promise.all([loadStats(), loadUsers()]);
                showToast('User rejected');
            } catch (error) { showToast('Failed to reject', 'error'); }
        },

        toggleActive: async (uid) => {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/admin/users/${uid}/toggle-active`, { method: 'POST', headers });
                if (!res.ok) throw new Error('Failed');
                await loadUsers();
                showToast('User status updated');
            } catch (error) { showToast('Failed to update user', 'error'); }
        },

        assignTemplates: (uid, currentTemplates) => {
            openTemplateModal(uid, currentTemplates);
        },

        toggleBulkFill: async (uid) => {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/admin/users/${uid}/toggle-bulk`, { method: 'POST', headers });
                if (!res.ok) throw new Error('Failed');
                await loadUsers();
                showToast('Bulk Fill access updated');
            } catch (error) { showToast('Failed to update Bulk Fill', 'error'); }
        },

        goToPage: (page) => {
            currentPage = page;
            loadUsers();
        }
    };

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.textContent = message;

        const borderColor = type === 'error' ? '#ef4444' : '#10b981';
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            padding: 14px 24px;
            background: #1c2030;
            border-radius: 8px;
            border-left: 4px solid ${borderColor};
            box-shadow: 0 10px 15px rgba(0,0,0,0.3);
            z-index: 2000;
            color: white;
            font-size: 0.85rem;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
});
