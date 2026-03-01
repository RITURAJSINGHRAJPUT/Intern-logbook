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
                <tr><td colspan="6" class="px-6 py-12 text-center text-slate-500 font-bold">
                    <p class="text-rose-500">Failed to load users. Please try again.</p>
                </td></tr>`;
        }
    }

    function renderUsersTable(users) {
        if (!users || users.length === 0) {
            usersTableBody.innerHTML = `
                <tr><td colspan="6" class="px-6 py-12 text-center text-slate-500 font-bold">
                    No users found matching criteria.
                </td></tr>`;
            return;
        }

        const colors = ['purple', 'blue', 'yellow'];

        usersTableBody.innerHTML = users.map((user, idx) => {
            const initial = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
            const colorClass = colors[idx % colors.length];

            const statusAttr = user.approved
                ? '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[1rem] text-[10px] font-extrabold tracking-wide bg-[#E0F7FA] text-[#00ACC1]"><span class="w-1.5 h-1.5 rounded-full bg-[#00ACC1]"></span> Approved</span>'
                : '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[1rem] text-[10px] font-extrabold tracking-wide bg-[#FFF8E1] text-[#FFB300]"><span class="w-1.5 h-1.5 rounded-full bg-[#FFB300]"></span> Pending</span>';

            const adminBadge = user.role === 'admin'
                ? '<span class="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest text-[#FF5252] bg-[#FFEBEE] border border-[#FFCDD2] inline-flex items-center shadow-sm">ADMIN</span>'
                : '';

            let templatesHtml = '<span class="text-[11px] font-bold text-slate-400 italic">No templates</span>';
            if (user.allowedTemplates && user.allowedTemplates.length > 0) {
                if (user.role === 'admin' && user.allowedTemplates.length > 2) {
                    templatesHtml = '<span class="px-2.5 py-1 rounded-[12px] text-[11px] font-bold bg-slate-100 text-slate-500">All Forms</span>';
                } else {
                    const firstTemp = user.allowedTemplates[0].replace('.pdf', '');
                    templatesHtml = `<span class="px-2.5 py-1 rounded-[12px] text-[11px] font-bold bg-slate-100 text-slate-500">${firstTemp}</span>`;
                    if (user.allowedTemplates.length > 1) {
                        templatesHtml += ` <span class="px-2 py-1 rounded-[12px] text-[11px] font-bold bg-white text-slate-500 border border-slate-200 shadow-sm ml-1">+${user.allowedTemplates.length - 1}</span>`;
                    }
                }
            }

            const bulkFillIcon = user.allowBulkFill
                ? '<div class="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-[12px] text-[11px] font-bold bg-white text-emerald-500 border border-emerald-200 w-max tracking-wide"><span class="material-symbols-outlined text-[14px]">check_circle</span> Allowed</div>'
                : '<div class="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-[12px] text-[11px] font-bold bg-white text-slate-400 border border-slate-200 w-max tracking-wide"><span class="material-symbols-outlined text-[14px]">cancel</span> Denied</div>';

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
                    <button class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-vibrant-turquoise hover:bg-soft-turquoise/30 transition-colors" title="View/Assign" onclick="adminActions.assignTemplates('${user.uid}', ${JSON.stringify(user.allowedTemplates || []).replace(/"/g, '&quot;')})">
                        <span class="material-symbols-outlined text-[18px]">assignment</span>
                    </button>
                    <button class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-warm-yellow hover:bg-sunny-yellow/30 transition-colors" title="Toggle Bulk Fill" onclick="adminActions.toggleBulkFill('${user.uid}')">
                        <span class="material-symbols-outlined text-[18px]">layers</span>
                    </button>
                    <button class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-vibrant-coral hover:bg-soft-coral/30 transition-colors" title="Deactivate" onclick="adminActions.toggleActive('${user.uid}')">
                        <span class="material-symbols-outlined text-[18px]">block</span>
                    </button>
                    <button class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors" title="Delete User" onclick="adminActions.deleteUser('${user.uid}')">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  `
                : `
                    <button class="px-3 py-1 rounded-lg text-[11px] font-bold bg-vibrant-turquoise text-white hover:bg-[#00acc1] shadow-sm transition-colors tactile-sm" onclick="adminActions.approve('${user.uid}')">Approve</button>
                    <button class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors ml-1" title="Delete/Reject" onclick="adminActions.deleteUser('${user.uid}')">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  `;

            // Make background color class dynamically valid for Tailwind or use inline styling
            const initialColorMap = {
                'purple': '#8b5cf6',
                'blue': '#3b82f6',
                'yellow': '#eab308'
            };
            const bgColorHex = initialColorMap[colorClass] || '#64748b';

            return `
                <tr class="hover:bg-slate-50/50 transition-colors group">
                    <td class="px-5 py-3">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-[8px] flex items-center justify-center text-white font-bold shadow-sm text-sm" style="background-color: ${bgColorHex}">${initial}</div>
                            <div class="flex flex-col gap-0">
                                <div class="flex items-center gap-1.5">
                                    <span class="font-extrabold text-[#37474F] text-[13px] truncate">${user.displayName || user.email.split('@')[0]}</span>
                                    ${adminBadge}
                                </div>
                                <span class="text-[11px] font-bold text-slate-400 truncate">${user.email}</span>
                            </div>
                        </div>
                    </td>
                    <td class="px-5 py-3 align-middle">${statusAttr}</td>
                    <td class="px-5 py-3 hidden md:table-cell align-middle">${templatesHtml}</td>
                    <td class="px-5 py-3 hidden lg:table-cell align-middle">${bulkFillIcon}</td>
                    <td class="px-5 py-3 align-middle">
                        <div class="flex flex-col gap-0.5">
                            <span class="font-bold text-slate-600 text-[12px]">${lastActivityDate}</span>
                            <span class="text-[10px] font-bold text-slate-400">${lastActivityTime}</span>
                        </div>
                    </td>
                    <td class="px-5 py-3 text-right align-middle">
                        <div class="flex items-center justify-end gap-1.5 transition-opacity">
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
                <button class="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-100 text-slate-300 font-bold bg-white" disabled>&lsaquo;</button>
                <button class="w-8 h-8 flex items-center justify-center rounded-lg border border-vibrant-turquoise bg-white text-vibrant-turquoise font-bold">1</button>
                <button class="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-100 text-slate-300 font-bold bg-white" disabled>&rsaquo;</button>
            `;
            return;
        }

        let html = '';
        html += `<button class="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-vibrant-turquoise hover:text-vibrant-turquoise transition-colors font-bold bg-white" onclick="adminActions.goToPage(${pagination.page - 1})" ${pagination.page <= 1 ? 'opacity-50 pointer-events-none' : ''}>&lsaquo;</button>`;

        for (let i = 1; i <= pagination.totalPages; i++) {
            if (i === pagination.page) {
                html += `<button class="w-8 h-8 flex items-center justify-center rounded-lg border border-vibrant-turquoise text-vibrant-turquoise font-bold bg-white shadow-sm">${i}</button>`;
            } else {
                html += `<button class="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-vibrant-turquoise hover:text-vibrant-turquoise transition-colors font-bold bg-white" onclick="adminActions.goToPage(${i})">${i}</button>`;
            }
        }

        html += `<button class="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-vibrant-turquoise hover:text-vibrant-turquoise transition-colors font-bold bg-white" onclick="adminActions.goToPage(${pagination.page + 1})" ${pagination.page >= pagination.totalPages ? 'opacity-50 pointer-events-none' : ''}>&rsaquo;</button>`;
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

    function showModal() {
        templateModal.classList.remove('opacity-0', 'pointer-events-none');
        document.getElementById('modalContentInner').classList.remove('scale-95');
        document.getElementById('modalContentInner').classList.add('scale-100');
    }

    function hideModal() {
        templateModal.classList.add('opacity-0', 'pointer-events-none');
        document.getElementById('modalContentInner').classList.add('scale-95');
        document.getElementById('modalContentInner').classList.remove('scale-100');
    }

    function openTemplateModal(uid, currentTemplates) {
        selectedUserUid = uid;
        const list = document.getElementById('templateCheckboxList');

        list.innerHTML = allTemplates.map(t => `
            <label class="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 cursor-pointer transition-colors group">
                <div class="relative flex items-center justify-center">
                    <input type="checkbox" value="${t.filename}" 
                        ${currentTemplates.includes(t.filename) ? 'checked' : ''}
                        class="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded focus:ring-0 focus:outline-none checked:bg-vibrant-turquoise checked:border-vibrant-turquoise transition-colors cursor-pointer">
                    <span class="material-symbols-outlined text-white text-[16px] absolute pointer-events-none opacity-0 peer-checked:opacity-100">check</span>
                </div>
                <span class="font-bold text-slate-600 group-hover:text-friendly-navy">${t.name}</span>
            </label>
        `).join('');

        showModal();
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

            hideModal();
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
            hideModal();
        });

        document.getElementById('modalCancel').addEventListener('click', () => {
            hideModal();
        });

        document.getElementById('modalSave').addEventListener('click', saveTemplates);

        templateModal.addEventListener('click', (e) => {
            if (e.target === templateModal) {
                hideModal();
            }
        });
    }

    // === Global Actions ===
    window.adminActions = {
        approve: async (uid) => {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/admin/users/${uid}/approve`, { method: 'POST', headers });
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || `Error ${res.status}`);
                }
                await Promise.all([loadStats(), loadUsers()]);
                showToast('User approved');
            } catch (error) { showToast(`Failed to approve: ${error.message}`, 'error'); }
        },

        deleteUser: async (uid) => {
            try {
                if (!confirm("Are you sure you want to PERMANENTLY delete this user? This cannot be undone.")) return;
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/admin/users/${uid}`, { method: 'DELETE', headers });
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || `Error ${res.status}`);
                }
                await Promise.all([loadStats(), loadUsers()]);
                showToast('User deleted permanently');
            } catch (error) { showToast(`Failed to delete: ${error.message}`, 'error'); }
        },

        toggleActive: async (uid) => {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/admin/users/${uid}/toggle-active`, { method: 'POST', headers });
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || `Error ${res.status}`);
                }
                await loadUsers();
                showToast('User status updated');
            } catch (error) { showToast(`Failed to update user: ${error.message}`, 'error'); }
        },

        assignTemplates: (uid, currentTemplates) => {
            openTemplateModal(uid, currentTemplates);
        },

        toggleBulkFill: async (uid) => {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/admin/users/${uid}/toggle-bulk`, { method: 'POST', headers });
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || `Error ${res.status}`);
                }
                await loadUsers();
                showToast('Bulk Fill access updated');
            } catch (error) { showToast(`Failed to update Bulk Fill: ${error.message}`, 'error'); }
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
            padding: 16px 24px;
            background: white;
            border-radius: 16px;
            border: 2px solid #e2e8f0;
            border-left: 6px solid ${borderColor};
            box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
            z-index: 2000;
            color: #37474F;
            font-weight: 700;
            font-size: 0.9rem;
            animation: slideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        `;

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
});
