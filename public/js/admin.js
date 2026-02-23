/**
 * Admin Panel Logic
 * Manages user listing, approval, template assignment
 */

document.addEventListener('DOMContentLoaded', () => {
    const adminLoading = document.getElementById('adminLoading');
    const adminPanel = document.getElementById('adminPanel');
    const accessDenied = document.getElementById('accessDenied');
    const usersTableBody = document.getElementById('usersTableBody');
    const searchInput = document.getElementById('searchInput');
    const filterSelect = document.getElementById('filterSelect');
    const paginationEl = document.getElementById('pagination');
    const templateModal = document.getElementById('templateModal');

    let currentPage = 1;
    let allTemplates = [];
    let selectedUserUid = null;

    // Wait for Firebase auth to be ready, then verify admin
    setTimeout(initAdmin, 1500);

    async function initAdmin() {
        try {
            const token = await window.getFirebaseToken();
            if (!token) {
                showAccessDenied();
                return;
            }

            // Check admin status by hitting admin stats endpoint
            const res = await fetch('/api/admin/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.status === 403 || res.status === 401) {
                showAccessDenied();
                return;
            }

            if (!res.ok) {
                throw new Error('Failed to verify admin status');
            }

            // Admin verified — show panel
            adminLoading.style.display = 'none';
            adminPanel.style.display = 'block';

            // Load initial data
            await Promise.all([
                loadStats(),
                loadUsers(),
                loadAllTemplates()
            ]);

            // Setup event listeners
            setupListeners();

        } catch (error) {
            console.error('Admin init error:', error);
            showAccessDenied();
        }
    }

    function showAccessDenied() {
        adminLoading.style.display = 'none';
        accessDenied.style.display = 'block';
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

            const params = new URLSearchParams({
                page: currentPage,
                limit: 10,
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
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="8.5" cy="7" r="4"/>
                        <line x1="20" y1="8" x2="20" y2="14"/>
                        <line x1="23" y1="11" x2="17" y2="11"/>
                    </svg>
                    <p>No users found</p>
                </td></tr>`;
            return;
        }

        usersTableBody.innerHTML = users.map(user => {
            const statusBadge = !user.active
                ? '<span class="badge badge-inactive">Inactive</span>'
                : user.approved
                    ? '<span class="badge badge-approved">Approved</span>'
                    : '<span class="badge badge-pending">Pending</span>';

            const roleBadge = user.role === 'admin'
                ? ' <span class="badge badge-admin">Admin</span>'
                : '';

            const templates = user.allowedTemplates.length > 0
                ? user.allowedTemplates.map(t =>
                    `<span class="template-tag" title="${t}">${t.replace('.pdf', '')}</span>`
                ).join('')
                : '<span class="template-tag inactive">None</span>';

            const joinedDate = user.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : '-';

            const lastLogin = user.lastLogin
                ? new Date(user.lastLogin).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                : 'Never';

            return `
                <tr>
                    <td>
                        <div class="user-email">${user.email}</div>
                        ${user.displayName ? `<div class="user-name">${user.displayName}</div>` : ''}
                    </td>
                    <td>${statusBadge}${roleBadge}</td>
                    <td><div class="template-tags">${templates}</div></td>
                    <td>
                        <button class="badge action-btn ${user.allowBulkFill ? 'badge-approved' : 'badge-inactive'}" 
                                onclick="adminActions.toggleBulkFill('${user.uid}')" 
                                style="border:none;cursor:pointer;padding:4px 8px;font-size:0.75rem">
                            ${user.allowBulkFill ? '✅ Allowed' : '⛔ Denied'}
                        </button>
                    </td>
                    <td style="white-space:nowrap;font-size:0.8rem;color:var(--text-muted)">${joinedDate}</td>
                    <td style="white-space:nowrap;font-size:0.8rem;color:var(--text-muted)">${lastLogin}</td>
                    <td>
                        <div class="action-btns">
                            ${!user.approved
                    ? `<button class="action-btn approve" onclick="adminActions.approve('${user.uid}')">✓ Approve</button>`
                    : `<button class="action-btn reject" onclick="adminActions.reject('${user.uid}')">✗ Reject</button>`
                }
                            <button class="action-btn" onclick="adminActions.toggleActive('${user.uid}')">
                                ${user.active !== false ? '⏸ Deactivate' : '▶ Activate'}
                            </button>
                            <button class="action-btn" onclick="adminActions.assignTemplates('${user.uid}', ${JSON.stringify(user.allowedTemplates).replace(/"/g, '&quot;')})">
                                📄 Templates
                            </button>
                        </div>
                    </td>
                </tr>`;
        }).join('');
    }

    function renderPagination(pagination) {
        if (!pagination || pagination.totalPages <= 1) {
            paginationEl.innerHTML = '';
            return;
        }

        let html = '';
        html += `<button class="pagination-btn" onclick="adminActions.goToPage(${pagination.page - 1})" ${pagination.page <= 1 ? 'disabled' : ''}>← Prev</button>`;

        for (let i = 1; i <= pagination.totalPages; i++) {
            if (i === pagination.page) {
                html += `<button class="pagination-btn active">${i}</button>`;
            } else if (Math.abs(i - pagination.page) <= 2 || i === 1 || i === pagination.totalPages) {
                html += `<button class="pagination-btn" onclick="adminActions.goToPage(${i})">${i}</button>`;
            } else if (Math.abs(i - pagination.page) === 3) {
                html += `<span class="pagination-info">...</span>`;
            }
        }

        html += `<button class="pagination-btn" onclick="adminActions.goToPage(${pagination.page + 1})" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>Next →</button>`;
        html += `<span class="pagination-info">${pagination.totalUsers} users</span>`;

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

        // Close modal on overlay click
        templateModal.addEventListener('click', (e) => {
            if (e.target === templateModal) {
                templateModal.classList.add('hidden');
            }
        });
    }

    // === Global Actions (for onclick handlers) ===
    window.adminActions = {
        approve: async (uid) => {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/admin/users/${uid}/approve`, {
                    method: 'POST',
                    headers
                });
                if (!res.ok) throw new Error('Failed');
                await Promise.all([loadStats(), loadUsers()]);
                showToast('User approved');
            } catch (error) {
                showToast('Failed to approve user', 'error');
            }
        },

        reject: async (uid) => {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/admin/users/${uid}/reject`, {
                    method: 'POST',
                    headers
                });
                if (!res.ok) throw new Error('Failed');
                await Promise.all([loadStats(), loadUsers()]);
                showToast('User rejected');
            } catch (error) {
                showToast('Failed to reject user', 'error');
            }
        },

        toggleActive: async (uid) => {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/admin/users/${uid}/toggle-active`, {
                    method: 'POST',
                    headers
                });
                if (!res.ok) throw new Error('Failed');
                await loadUsers();
                showToast('User status updated');
            } catch (error) {
                showToast('Failed to update user', 'error');
            }
        },

        assignTemplates: (uid, currentTemplates) => {
            openTemplateModal(uid, currentTemplates);
        },

        toggleBulkFill: async (uid) => {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/admin/users/${uid}/toggle-bulk`, {
                    method: 'POST',
                    headers
                });
                if (!res.ok) throw new Error('Failed');
                await loadUsers();
                showToast('Bulk Fill access updated');
            } catch (error) {
                showToast('Failed to update Bulk Fill access', 'error');
            }
        },

        goToPage: (page) => {
            currentPage = page;
            loadUsers();
        }
    };

    // === Toast Helper ===
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.textContent = message;

        const borderColor = type === 'error' ? '#ef4444' : '#10b981';
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            padding: 14px 24px;
            background: var(--bg-card);
            border-radius: 10px;
            border-left: 4px solid ${borderColor};
            box-shadow: 0 10px 15px rgba(0,0,0,0.3);
            z-index: 2000;
            color: white;
            font-size: 0.9rem;
            font-family: 'Inter', sans-serif;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
});
