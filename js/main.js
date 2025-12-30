function updateParallax() {
    const scrolled = window.pageYOffset;
    const group = document.querySelector('.parallax-group');
    if (!group) return;
    const baseline = window.innerWidth < 768 ? -Math.round(window.innerHeight * 0.03) : -Math.round(window.innerHeight * 0.05);
    group.style.transform = `translateY(${baseline + scrolled * 0.45}px)`;
}

let _scrollIndicator = null;
function createScrollIndicator() {
    if (_scrollIndicator) return;
    if (document.body && document.body.classList.contains('no-scroll-indicator')) return;
    _scrollIndicator = document.createElement('div');
    _scrollIndicator.className = 'scroll-indicator';
    _scrollIndicator.setAttribute('aria-hidden', 'true');
    _scrollIndicator.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polyline points="6 9 12 15 18 9"/></svg>';
    document.body.appendChild(_scrollIndicator);
}

function updateIndicator() {
    if (!_scrollIndicator) return;
    const scrollable = document.documentElement.scrollHeight > window.innerHeight;
    if (!scrollable) {
        _scrollIndicator.style.display = 'none';
        return;
    }
    const y = window.pageYOffset || document.documentElement.scrollTop;
    const max = 120;
    const progress = Math.min(y / max, 1);
    const translateY = -progress * 24;
    _scrollIndicator.style.transform = `translateX(-50%) translateY(${translateY}px)`;
    _scrollIndicator.style.opacity = `${1 - progress}`;
    _scrollIndicator.style.display = progress >= 1 ? 'none' : 'block';
}

window.addEventListener('scroll', () => { updateParallax(); updateIndicator(); });
window.addEventListener('resize', () => { updateParallax(); updateIndicator(); });
window.addEventListener('load', () => { updateParallax(); createScrollIndicator(); updateIndicator(); });
updateParallax();
createScrollIndicator();
updateIndicator();

(function() {
    const canvas = document.getElementById('webCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    const properties = {
        bgColor: 'rgba(0, 0, 0, 1)',
        lineColor: 'rgba(255, 255, 255, 0.15)',
        particleCount: 120,
        particleMaxVelocity: 0.5,
        lineMaxDist: 150,
        mouseRepelDist: 120
    };

    const mouse = { x: null, y: null };

    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });

    window.addEventListener('mouseout', () => {
        mouse.x = null;
        mouse.y = null;
    });

    window.addEventListener('resize', resizeCanvas);

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        properties.particleCount = Math.max(60, Math.floor((canvas.width * canvas.height) / 10000));
        initParticles();
    }

    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.velocityX = (Math.random() - 0.5) * properties.particleMaxVelocity;
            this.velocityY = (Math.random() - 0.5) * properties.particleMaxVelocity;
        }

        update() {
            this.x += this.velocityX;
            this.y += this.velocityY;

            if (mouse.x !== null && mouse.y !== null) {
                const dx = this.x - mouse.x;
                const dy = this.y - mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < properties.mouseRepelDist && dist > 0) {
                    const force = (properties.mouseRepelDist - dist) / properties.mouseRepelDist;
                    this.x += (dx / dist) * force * 2;
                    this.y += (dy / dist) * force * 2;
                }
            }

            if (this.x < 0 || this.x > canvas.width) {
                if (this.x < 0) this.x = canvas.width + (this.x % canvas.width);
                else this.x = this.x % canvas.width;
            }
            if (this.y < 0 || this.y > canvas.height) {
                if (this.y < 0) this.y = canvas.height + (this.y % canvas.height);
                else this.y = this.y % canvas.height;
            }
        }
    }

    function initParticles() {
        particles = [];
        for (let i = 0; i < properties.particleCount; i++) {
            particles.push(new Particle());
        }
    }

    function drawLines() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < properties.lineMaxDist) {
                    const opacity = 1 - (dist / properties.lineMaxDist);
                    ctx.lineWidth = 0.8;
                    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.35})`;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => p.update());
        drawLines();
        requestAnimationFrame(animate);
    }

    resizeCanvas();
    animate();
})();

// Web Crypto PBKDF2 used
async function generateSaltBase64() {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return btoa(String.fromCharCode(...salt));
}
function base64ToUint8(b64) {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}
function uint8ToBase64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
}
async function derivePasswordHash(password, saltBase64, iterations=150000, keyLen=256) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), {name: 'PBKDF2'}, false, ['deriveBits']);
    const salt = base64ToUint8(saltBase64);
    const derived = await crypto.subtle.deriveBits({name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256'}, keyMaterial, keyLen);
    return uint8ToBase64(new Uint8Array(derived));
}
function getLocalUsers() { try { return JSON.parse(localStorage.getItem('localUsers') || '{}'); } catch(e){ return {}; } }
function saveLocalUsers(users) { localStorage.setItem('localUsers', JSON.stringify(users)); }
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
        const arr = Array.from(set || []).map(x => String(x));
        localStorage.setItem('localDeletedUsernames', JSON.stringify(arr));
    } catch (e) {}
}
function isLocalAdminSession() {
    return localStorage.getItem('localIsAdmin') === '1' && (localStorage.getItem('localCurrentUser') || '').toLowerCase() === 'admin';
}
async function signupLocal({username, password, firstName = '', lastName = '', nickname = '', displayName}) {
    username = (username || '').trim().toLowerCase();
    if (username === 'admin') throw new Error('Username reserved');
    firstName = (firstName || '').trim();
    lastName = (lastName || '').trim();
    nickname = (nickname || '').trim();
    const deleted = getLocalDeletedUsernames();
    if (deleted.has(username)) throw new Error('Deleted usernames cannot be re-created (local)');
    const users = getLocalUsers();
    if (users[username]) throw new Error('Username already exists (local)');
    const salt = await generateSaltBase64();
    const hash = await derivePasswordHash(password, salt);
    const computedDisplayName = (displayName || '').trim() || nickname || `${firstName} ${lastName}`.trim() || username;
    users[username] = {
        username,
        firstName,
        lastName,
        nickname,
        displayName: computedDisplayName,
        salt,
        hash,
        createdAt: new Date().toISOString()
    };
    saveLocalUsers(users);
    localStorage.setItem('localCurrentUser', username);
    localStorage.setItem('localShowWelcome', '1');
    return users[username];
}
async function loginLocal({username, password}) {
    username = (username || '').trim().toLowerCase();
    if (username === 'admin') throw new Error('Invalid credentials (local)');
    const users = getLocalUsers();
    const u = users[username];
    if (!u) throw new Error('No such user (local)');
    const hash = await derivePasswordHash(password, u.salt);
    if (hash !== u.hash) throw new Error('Invalid credentials (local)');
    localStorage.setItem('localCurrentUser', username);
    localStorage.setItem('localShowWelcome', '1');
    return u;
}
function getLocalCurrentUser() {
    const username = localStorage.getItem('localCurrentUser');
    if (!username) return null;
    const u = getLocalUsers()[username];
    return u || null;
}
function clearLocalShowWelcome() { localStorage.removeItem('localShowWelcome'); }

function showWelcomeToast(name) {
    const toast = document.createElement('div');
    toast.className = 'welcome-toast';
    toast.setAttribute('role','status');
    const inner = document.createElement('div');
    inner.className = 'welcome-text';
    inner.textContent = `Welcome ${name}`;
    toast.appendChild(inner);
    document.body.appendChild(toast);

    try {
        const header = document.querySelector('.site-header');
        if (header) {
            const rect = header.getBoundingClientRect();
            const top = rect.bottom + 8 + window.scrollY;
            toast.style.top = `${top}px`;
        }
    } catch (e) {
    }

    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';

    setTimeout(()=>{ toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%) translateY(-8px)'; }, 3000);
    setTimeout(()=> toast.remove(), 3800);
}

(function attachSignupValidation(){
    function markInvalid(el) {
        el.classList.add('invalid');
        el.classList.add('shake');
        setTimeout(()=> el.classList.remove('shake'), 450);
    }

    function setupForms() {
        const form = document.querySelector('.signup-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                form.querySelectorAll('.invalid').forEach(i => i.classList.remove('invalid'));

                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.disabled = true;

                const usernameEl = form.querySelector('[name="username"]');
                const passwordEl = form.querySelector('[name="password"]');
                const confirmEl = form.querySelector('[name="confirmPassword"]');

                let firstInvalid = null;
                if (!usernameEl || !usernameEl.value.trim()) {
                    markInvalid(usernameEl);
                    firstInvalid = firstInvalid || usernameEl;
                }

                if (!passwordEl || !passwordEl.value) {
                    markInvalid(passwordEl);
                    firstInvalid = firstInvalid || passwordEl;
                }

                if (!confirmEl || !confirmEl.value) {
                    markInvalid(confirmEl);
                    firstInvalid = firstInvalid || confirmEl;
                }

                if (passwordEl && confirmEl && passwordEl.value && confirmEl.value && passwordEl.value !== confirmEl.value) {
                    markInvalid(passwordEl);
                    markInvalid(confirmEl);
                    firstInvalid = firstInvalid || passwordEl;
                }

                if (firstInvalid) {
                    firstInvalid.focus();
                    if (submitBtn) submitBtn.disabled = false;
                    return;
                }

                const formData = new FormData(form);
                const username = (formData.get('username') || '').trim();
                const password = formData.get('password') || '';
                const firstName = (formData.get('firstName') || '').trim();
                const lastName = (formData.get('lastName') || '').trim();
                const nickname = (formData.get('nickname') || '').trim();
                const displayName = nickname || `${firstName} ${lastName}`.trim() || username;

                try {
                    if (window.__serverAvailable) {
                        const serverAction = form.dataset.serverAction || form.action;
                        const resp = await fetch(serverAction, { method: form.method || 'POST', body: new URLSearchParams([...formData]), credentials: 'same-origin' });
                        if (resp.ok || resp.redirected) {
                            window.location.href = resp.redirected ? resp.url : '/html/offerings.html';
                            return;
                        }
                    }
                    try {
                        const localUser = await signupLocal({ username, password, firstName, lastName, nickname, displayName });
                        showWelcomeToast(localUser.displayName || username);
                        window.location.href = '/html/offerings.html';
                        return;
                    } catch (localErr) {
                        markInvalid(usernameEl);
                        usernameEl.focus();
                    }
                } catch (err) {
                    try {
                        const localUser = await signupLocal({ username, password, firstName, lastName, nickname, displayName });
                        showWelcomeToast(localUser.displayName || username);
                        window.location.href = '/html/offerings.html';
                        return;
                    } catch (localErr) {
                        markInvalid(usernameEl);
                        usernameEl.focus();
                    }
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
            });
        }

        const loginForm = document.querySelector('.login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                loginForm.querySelectorAll('.invalid').forEach(i => i.classList.remove('invalid'));
                const submitBtn = loginForm.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.disabled = true;

                const fd = new FormData(loginForm);
                const username = (fd.get('username') || '').trim();
                const password = fd.get('password') || '';
                if (!username || !password) {
                    if (!username) { const el = loginForm.querySelector('[name="username"]'); el && (el.classList.add('invalid'), el.classList.add('shake'), setTimeout(()=>el.classList.remove('shake'),450)); }
                    if (!password) { const el = loginForm.querySelector('[name="password"]'); el && (el.classList.add('invalid'), el.classList.add('shake'), setTimeout(()=>el.classList.remove('shake'),450)); }
                    if (submitBtn) submitBtn.disabled = false;
                    return;
                }

                try {
                    const serverAction = loginForm.dataset.serverAction || loginForm.action;
                    try {
                        const resp = await fetch(serverAction, { method: loginForm.method || 'POST', body: new URLSearchParams([...fd]), credentials: 'same-origin' });
                        if (resp.ok || resp.redirected) {
                            window.location.href = resp.redirected ? resp.url : '/html/offerings.html';
                            return;
                        }
                        if (resp.status === 404) throw new Error('SERVER_UNAVAILABLE');

                        const el = loginForm.querySelector('[name="username"]');
                        if (el) { el.classList.add('invalid'); el.classList.add('shake'); setTimeout(()=>el.classList.remove('shake'),450); el.focus(); }
                        return;
                    } catch (serverErr) {
                    }

                    if ((username || '').trim().toLowerCase() === 'admin' && String(password) === 'admin') {
                        localStorage.setItem('localCurrentUser', 'admin');
                        localStorage.setItem('localIsAdmin', '1');
                        localStorage.setItem('localShowWelcome', '1');
                        window.location.href = new URL('admin.html', window.location.href).toString();
                        return;
                    }

                    const localUser = await loginLocal({ username, password });
                    showWelcomeToast(localUser.displayName || localUser.username);
                    window.location.href = '/html/offerings.html';
                    return;
                } catch (err) {
                    try {
                        if ((username || '').trim().toLowerCase() === 'admin' && String(password) === 'admin') {
                            localStorage.setItem('localCurrentUser', 'admin');
                            localStorage.setItem('localIsAdmin', '1');
                            localStorage.setItem('localShowWelcome', '1');
                            window.location.href = new URL('admin.html', window.location.href).toString();
                            return;
                        }
                        const localUser = await loginLocal({ username, password });
                        showWelcomeToast(localUser.displayName || localUser.username);
                        window.location.href = '/html/offerings.html';
                        return;
                    } catch (loginErr) {
                        const el = loginForm.querySelector('[name="username"]');
                        if (el) { el.classList.add('invalid'); el.classList.add('shake'); setTimeout(()=>el.classList.remove('shake'),450); el.focus(); }
                    }
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
            });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupForms); else setupForms();
})();

(function attachAuthUI(){
    function redirectToLogin() {
        try {
            window.location.href = new URL('login.html', window.location.href).toString();
        } catch (e) {
            window.location.href = 'login.html';
        }
    }

    function isAdminPage() {
        const p = (window.location && window.location.pathname) ? window.location.pathname.toLowerCase() : '';
        return p.endsWith('/admin.html') || p.endsWith('/admin-users.html') || p.endsWith('admin.html') || p.endsWith('admin-users.html');
    }

    function applyAdminNavTrim() {
        const navList = document.querySelector('.nav-links');
        if (!navList) return;

        const allowed = new Set(['index.html', 'updates.html', 'admin-users.html']);
        const links = Array.from(navList.querySelectorAll('a.nav-link'));
        for (const a of links) {
            const href = (a.getAttribute('href') || '').trim();
            if (!allowed.has(href)) {
                const li = a.closest('li');
                if (li) li.remove();
                else a.remove();
            }
        }

        const hasUsers = !!navList.querySelector('a.nav-link[href="admin-users.html"]');
        if (!hasUsers) {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = 'admin-users.html';
            a.className = 'nav-link';
            a.textContent = 'Users';
            li.appendChild(a);
            navList.appendChild(li);
        }
    }

    function enforceAdminAccess(isAdmin) {
        if (!isAdminPage()) return;
        if (isAdmin) return;
        redirectToLogin();
    }

    function applySignedInUI(name, isLocal) {
        document.querySelectorAll('.nav-action.nav-login').forEach(a => {
            a.textContent = name;
            a.href = '#';
            a.classList.add('nav-user');
            a.setAttribute('aria-label', `Signed in as ${name}`);
            a.addEventListener('click', (ev) => { ev.preventDefault(); toggleAccountPopup(name, a, isLocal); });
        });

        document.querySelectorAll('.nav-action.nav-cta').forEach(a => { a.style.display = 'none'; });

        document.querySelectorAll('a.cta-button, a.cta-button-secondary').forEach(a => {
            try {
                const href = a.getAttribute('href') || '';
                if (href.indexOf('login') !== -1 || href.indexOf('get-started') !== -1) {
                    a.style.display = 'none';
                }
            } catch (e) {}
        });
    }

    function restoreLoggedOutUI() {
        document.querySelectorAll('.nav-action.nav-login').forEach(a => {
            const clone = a.cloneNode(true);
            clone.textContent = 'Log in';
            clone.href = 'login.html';
            clone.classList.remove('nav-user');
            clone.removeAttribute('aria-label');
            a.replaceWith(clone);
        });
        document.querySelectorAll('.nav-action.nav-cta').forEach(a => { a.style.display = ''; });
        document.querySelectorAll('a.cta-button, a.cta-button-secondary').forEach(a => { a.style.display = ''; });
    }

    let accountPopup = null;
    let accountAnchor = null;
    function closeAccountPopup() {
        if (!accountPopup) return;
        if (accountAnchor) { try { accountAnchor.removeAttribute('aria-expanded'); } catch (e) {} accountAnchor = null; }
        accountPopup.remove();
        accountPopup = null;
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKeyDown);
    }
    function onDocClick(e) {
        if (!accountPopup) return;
        if (!accountPopup.contains(e.target) && !e.target.classList.contains('nav-user')) closeAccountPopup();
    }
    function onKeyDown(e) { if (e.key === 'Escape') closeAccountPopup(); }

    function toggleAccountPopup(name, anchorEl, isLocal) {
        if (accountPopup) { closeAccountPopup(); return; }
        accountPopup = document.createElement('div');
        accountPopup.className = 'account-popup visible';
        accountPopup.setAttribute('role','dialog');
        accountPopup.setAttribute('aria-label','Account menu');
        accountPopup.innerHTML = `<div class="account-name">${name}</div><button class="logout-btn" type="button">Log out</button>`;
        document.body.appendChild(accountPopup);

        accountAnchor = anchorEl;
        try { anchorEl.setAttribute('aria-expanded', 'true'); anchorEl.setAttribute('aria-haspopup', 'true'); } catch(e){}

        const rect = anchorEl.getBoundingClientRect();
        const popupWidth = accountPopup.offsetWidth || 200;
        let left = rect.left + rect.width / 2 - popupWidth / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - popupWidth - 8));
        accountPopup.style.left = `${left}px`;
        accountPopup.style.top = `${rect.bottom + 8}px`;

        const btn = accountPopup.querySelector('.logout-btn');
        btn.addEventListener('click', async () => {
            try {
                await fetch('/logout', { method: 'POST', credentials: 'same-origin' });
            } catch (e) {}
            localStorage.removeItem('localCurrentUser');
            localStorage.removeItem('localIsAdmin');
            clearLocalShowWelcome();
            closeAccountPopup();
            restoreLoggedOutUI();
            window.location.reload();
        });

        setTimeout(()=>{
            document.addEventListener('click', onDocClick);
            document.addEventListener('keydown', onKeyDown);
        }, 0);
    }

    document.addEventListener('DOMContentLoaded', () => {
        fetch('/me').then(r => r.json()).then(data => {
            window.__serverAvailable = true;
            window.__authState = {
                serverAvailable: true,
                source: 'server',
                authenticated: !!(data && data.authenticated),
                username: (data && data.username) || null,
                displayName: (data && (data.displayName || data.username)) || null,
                isAdmin: !!(data && data.isAdmin)
            };
            enforceAdminAccess(!!(data && data.isAdmin));
            if (data && data.authenticated) {
                const name = data.displayName || data.username;
                applySignedInUI(name, false);
                if (data.isAdmin) applyAdminNavTrim();
                const urlParams = new URLSearchParams(window.location.search);
                const show = data.showWelcome || urlParams.get('welcome') === '1';
                if (show) {
                    showWelcomeToast(name);
                    const url = new URL(window.location);
                    url.searchParams.delete('welcome');
                    history.replaceState({}, '', url);
                }
            }
        }).catch(()=>{
            window.__serverAvailable = false;
            const u = getLocalCurrentUser();
            const isAdmin = isLocalAdminSession();
            window.__authState = {
                serverAvailable: false,
                source: 'local',
                authenticated: !!u || isAdmin,
                username: isAdmin ? 'admin' : (u ? u.username : null),
                displayName: isAdmin ? 'Admin' : (u ? (u.displayName || u.username) : null),
                isAdmin: isAdmin
            };
            enforceAdminAccess(isAdmin);
            if (u || isAdmin) {
                const name = isAdmin ? 'Admin' : (u.displayName || u.username);
                applySignedInUI(name, true);
                if (isAdmin) applyAdminNavTrim();
                const show = localStorage.getItem('localShowWelcome') === '1';
                if (show) {
                    showWelcomeToast(name);
                    clearLocalShowWelcome();
                    const url = new URL(window.location);
                    url.searchParams.delete('welcome');
                    history.replaceState({}, '', url);
                }
            }
        });
    });
})();