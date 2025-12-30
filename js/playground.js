(function () {
    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    function setupCircleMagnifier() {
        const area = document.getElementById('circle-demo-area');
        const lens = document.getElementById('circle-lens');
        const zoomInput = document.getElementById('circle-zoom');
        if (!area || !lens || !zoomInput) return;

        const source = area.querySelector('.magnifier-source');
        const lensContent = lens.querySelector('.magnifier-content');
        if (!source || !lensContent) return;

        function cloneSource() {
            const sourceRect = source.getBoundingClientRect();
            lensContent.innerHTML = '';
            const clone = source.cloneNode(true);
            clone.style.position = 'absolute';
            clone.style.top = '0';
            clone.style.left = '0';
            clone.style.width = sourceRect.width + 'px';
            clone.style.margin = '0';
            clone.style.padding = '0';
            lensContent.appendChild(clone);
        }
        cloneSource();
        window.addEventListener('resize', cloneSource);

        let lastX = null, lastY = null;

        function render(clientX, clientY) {
            lastX = clientX;
            lastY = clientY;

            const areaRect = area.getBoundingClientRect();
            const sourceRect = source.getBoundingClientRect();

            const xArea = clamp(clientX - areaRect.left, 0, areaRect.width);
            const yArea = clamp(clientY - areaRect.top, 0, areaRect.height);

            const xSrc = clientX - sourceRect.left;
            const ySrc = clientY - sourceRect.top;

            const zoom = parseFloat(zoomInput.value) || 1.8;
            const radius = lens.offsetWidth / 2;

            lens.style.left = (xArea - radius) + 'px';
            lens.style.top = (yArea - radius) + 'px';

            lensContent.style.transformOrigin = '0 0';
            lensContent.style.transform =
                `translate(${radius - xSrc * zoom}px, ${radius - ySrc * zoom}px) scale(${zoom})`;
        }

        function show() { lens.style.opacity = '1'; }
        function hide() { lens.style.opacity = '0'; }

        area.addEventListener('mouseenter', show);
        area.addEventListener('mouseleave', hide);
        area.addEventListener('mousemove', (e) => render(e.clientX, e.clientY));
        zoomInput.addEventListener('input', () => {
            if (lastX !== null) render(lastX, lastY);
        });

        hide();
    }

    function setupBarMagnifier() {
        const area = document.getElementById('bar-demo-area');
        const bar = document.getElementById('bar-lens');
        const zoomInput = document.getElementById('bar-zoom');
        if (!area || !bar || !zoomInput) return;

        const source = area.querySelector('.magnifier-source');
        const barContent = bar.querySelector('.magnifier-content');
        if (!source || !barContent) return;

        // Clone source into bar
        function cloneSource() {
            const sourceRect = source.getBoundingClientRect();
            barContent.innerHTML = '';
            const clone = source.cloneNode(true);
            clone.style.position = 'absolute';
            clone.style.top = '0';
            clone.style.left = '0';
            clone.style.width = sourceRect.width + 'px';
            clone.style.margin = '0';
            clone.style.padding = '0';
            barContent.appendChild(clone);
        }
        cloneSource();
        window.addEventListener('resize', cloneSource);

        let lastX = null, lastY = null;

        function render(clientX, clientY) {
            lastX = clientX;
            lastY = clientY;

            const areaRect = area.getBoundingClientRect();
            const sourceRect = source.getBoundingClientRect();

            const xArea = clamp(clientX - areaRect.left, 0, areaRect.width);
            const yArea = clamp(clientY - areaRect.top, 0, areaRect.height);

            const xSrc = clientX - sourceRect.left;
            const ySrc = clientY - sourceRect.top;

            const zoom = parseFloat(zoomInput.value) || 1.8;
            const barHeight = bar.offsetHeight;
            const barWidth = bar.offsetWidth;

            const top = clamp(yArea - barHeight / 2, 0, areaRect.height - barHeight);
            bar.style.top = top + 'px';

            const barCenterX = barWidth / 2;
            const barCenterY = barHeight / 2;

            const tx = barCenterX - xSrc * zoom;
            const ty = barCenterY - ySrc * zoom;

            barContent.style.transformOrigin = '0 0';
            barContent.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
        }

        function show() { bar.style.opacity = '1'; }
        function hide() { bar.style.opacity = '0'; }

        area.addEventListener('mouseenter', show);
        area.addEventListener('mouseleave', hide);
        area.addEventListener('mousemove', (e) => render(e.clientX, e.clientY));
        zoomInput.addEventListener('input', () => {
            if (lastX !== null) render(lastX, lastY);
        });

        hide();
    }

    function setupFakeVideo() {
        const playBtn = document.getElementById('fake-play-btn');
        const progressFill = document.getElementById('fake-progress-fill');
        const timeDisplay = document.getElementById('fake-time');
        const captionsEl = document.getElementById('fake-captions');
        if (!playBtn || !progressFill || !timeDisplay || !captionsEl) return;

        const playIcon = playBtn.querySelector('.play-icon');
        const pauseIcon = playBtn.querySelector('.pause-icon');

        const captionScript = [
            { time: 0, text: "Let's derive the quadratic formula." },
            { time: 3, text: "We start with the standard form: ax² + bx + c = 0." },
            { time: 7, text: "Divide every term by a, assuming a ≠ 0." },
            { time: 11, text: "Move the constant term to the other side." },
            { time: 14, text: "Complete the square by adding (b/2a)² to both sides." },
            { time: 18, text: "The left side is now a perfect square trinomial." },
            { time: 22, text: "Take the square root of both sides." },
            { time: 25, text: "Solve for x to get the quadratic formula." },
            { time: 28, text: "x = (−b ± √(b² − 4ac)) / 2a" }
        ];

        const totalDuration = 30; 
        let currentTime = 0;
        let isPlaying = false;
        let intervalId = null;

        function formatTime(sec) {
            const m = Math.floor(sec / 60);
            const s = Math.floor(sec % 60);
            return `${m}:${s.toString().padStart(2, '0')}`;
        }

        function updateUI() {
            const pct = (currentTime / totalDuration) * 100;
            progressFill.style.width = pct + '%';
            timeDisplay.textContent = formatTime(currentTime) + ' / ' + formatTime(totalDuration);

            let caption = '';
            for (let i = captionScript.length - 1; i >= 0; i--) {
                if (currentTime >= captionScript[i].time) {
                    caption = captionScript[i].text;
                    break;
                }
            }
            captionsEl.textContent = caption;
        }

        function tick() {
            currentTime += 0.25;
            if (currentTime >= totalDuration) {
                currentTime = totalDuration;
                pause();
            }
            updateUI();
        }

        function play() {
            if (isPlaying) return;
            isPlaying = true;
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
            intervalId = setInterval(tick, 250);
        }

        function pause() {
            if (!isPlaying) return;
            isPlaying = false;
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
            clearInterval(intervalId);
            intervalId = null;
        }

        playBtn.addEventListener('click', () => {
            if (currentTime >= totalDuration) {
                currentTime = 0;
            }
            isPlaying ? pause() : play();
        });

        updateUI();
    }

    document.addEventListener('DOMContentLoaded', () => {
        setupCircleMagnifier();
        setupBarMagnifier();
        setupFakeVideo();
    });
})();
