(function setupOfferingsAuth() {
    function isLoggedIn() {
        const state = window.__authState;
        if (state && state.authenticated) return true;

        return !!localStorage.getItem('localCurrentUser');
    }

    function renderButtons() {
        const captionsActions = document.querySelector('.offering-actions[data-type="captions"]');
        const magnificationActions = document.querySelector('.offering-actions[data-type="magnification"]');
        const bottomCta = document.getElementById('offerings-login-cta');
        if (!captionsActions && !magnificationActions) return false; 

        if (isLoggedIn()) {
            if (bottomCta) bottomCta.style.display = 'none';
            if (captionsActions) {
                captionsActions.innerHTML = `
                    <a class="cta-button-secondary" href="../downloads/live_captions_universal.py" download style="cursor: pointer; text-decoration: none; display: inline-block;">Download</a>
                `;
            }
            if (magnificationActions) {
                magnificationActions.innerHTML = `
                    <a class="cta-button-secondary" href="../downloads/magnifier_universal.py" download style="cursor: pointer; text-decoration: none; display: inline-block;">Download</a>
                `;
            }
        } else {
            if (bottomCta) bottomCta.style.display = '';
            if (captionsActions) captionsActions.innerHTML = '';
            if (magnificationActions) magnificationActions.innerHTML = '';

            try {
                const link = bottomCta ? bottomCta.querySelector('a') : null;
                if (link) link.textContent = 'To download you need to log in';
            } catch (e) {}
        }

        return true;
    }

    function start() {
        const onOfferingsPage = renderButtons();
        if (!onOfferingsPage) return;

        let attempts = 0;
        const maxAttempts = 20; // ~4s
        const intervalMs = 200;
        const timer = setInterval(() => {
            attempts += 1;
            renderButtons();
            if (isLoggedIn() || attempts >= maxAttempts) clearInterval(timer);
        }, intervalMs);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
