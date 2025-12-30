(function () {
    function getLocalUsers() {
        try { return JSON.parse(localStorage.getItem('localUsers') || '{}'); } catch (e) { return {}; }
    }
    function saveLocalUsers(users) {
        localStorage.setItem('localUsers', JSON.stringify(users || {}));
    }
    function getLocalDeletedUsernames() {
        try {
            const raw = localStorage.getItem('localDeletedUsernames') || '[]';
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return new Set();
            return new Set(arr.map(x => String(x || '').trim().toLowerCase()).filter(Boolean));
        } catch (e) {
            return new Set();
        }
    }
    function saveLocalDeletedUsernames(set) {
        try {
            localStorage.setItem('localDeletedUsernames', JSON.stringify(Array.from(set || [])));
        } catch (e) {}
    }
    function isLocalAdmin() {
        return localStorage.getItem('localIsAdmin') === '1' && (localStorage.getItem('localCurrentUser') || '').toLowerCase() === 'admin';
    }

    function fmtDate(s) {
        if (!s) return '';
        try {
            const d = new Date(s);
            if (isNaN(d.getTime())) return String(s);
            return d.toLocaleString();
        } catch (e) {
            return String(s);
        }
    }

    async function fetchUsers() {
        const resp = await fetch('/admin/users', { credentials: 'same-origin' });
        if (!resp.ok) throw new Error('Failed to load users');
        return resp.json();
    }

    async function deleteUser(username) {
        const resp = await fetch(`/admin/users/${encodeURIComponent(username)}/delete`, {
            method: 'POST',
            credentials: 'same-origin'
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || 'Delete failed');
        return data;
    }

    function setError(msg) {
        const el = document.getElementById('admin-users-error');
        if (!el) return;
        if (!msg) {
            el.style.display = 'none';
            el.textContent = '';
            return;
        }
        el.style.display = 'block';
        el.textContent = msg;
    }

    function render(users) {
        const tbody = document.getElementById('admin-users-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        users.forEach(u => {
            const tr = document.createElement('tr');

            const status = (u.isDeleted === 1 || u.isDeleted === '1') ? 'Deleted' : 'Active';

            tr.innerHTML = `
                <td>${u.username || ''}</td>
                <td>${u.firstName || ''}</td>
                <td>${u.lastName || ''}</td>
                <td>${u.nickname || ''}</td>
                <td>${fmtDate(u.createdAt)}</td>
                <td>${status}</td>
                <td></td>
            `;

            const actionCell = tr.querySelector('td:last-child');
            if (status === 'Active' && (u.username || '').toLowerCase() !== 'admin') {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'cta-button-secondary';
                btn.textContent = 'Delete';
                btn.style.padding = '0.75rem 1.25rem';

                btn.addEventListener('click', async () => {
                    const ok = window.confirm(`Delete user "${u.username}"? This cannot be undone and the username will be blocked permanently.`);
                    if (!ok) return;
                    try {
                        setError('');
                        btn.disabled = true;
                        await deleteUser(u.username);
                        await refresh();
                    } catch (e) {
                        setError(e.message || 'Delete failed');
                    } finally {
                        btn.disabled = false;
                    }
                });

                actionCell.appendChild(btn);
            } else {
                actionCell.textContent = '-';
            }

            tbody.appendChild(tr);
        });
    }

    async function refresh() {
        // future: keep local and server data in sync
        try {
            const data = await fetchUsers();
            render(data.users || []);
            return;
        } catch (e) {
            if (!isLocalAdmin()) throw e;
        }

        const usersObj = getLocalUsers();
        const deleted = getLocalDeletedUsernames();
        const users = Object.keys(usersObj).map(username => {
            const u = usersObj[username] || {};
            return {
                username: u.username || username,
                firstName: u.firstName || '',
                lastName: u.lastName || '',
                nickname: u.nickname || '',
                createdAt: u.createdAt || '',
                isDeleted: deleted.has(String(username).toLowerCase()) ? 1 : 0,
                deletedAt: ''
            };
        }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

        render(users);
    }

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await refresh();
        } catch (e) {
            setError(e.message || 'Failed to load users');
        }
    });

    // do monkey-patching deleteUser when server is unavailable; will implement server more formally later
    const _deleteUser = deleteUser;
    deleteUser = async function (username) {
        try {
            return await _deleteUser(username);
        } catch (e) {
            if (!isLocalAdmin()) throw e;
        }

        const uname = String(username || '').trim().toLowerCase();
        if (!uname) throw new Error('Missing username');
        if (uname === 'admin') throw new Error('Cannot delete admin');

        const usersObj = getLocalUsers();
        const deleted = getLocalDeletedUsernames();
        if (usersObj[uname]) {
            delete usersObj[uname];
            saveLocalUsers(usersObj);
        }
        deleted.add(uname);
        saveLocalDeletedUsernames(deleted);
        return { ok: true };
    };
})();
