// Reddit TikTok Viewer
class RedditViewer {
    constructor() {
        this.posts = [];
        this.currentIndex = 0;
        this.isLoading = false;
        this.touchStartY = 0;
        this.touchEndY = 0;
        this.currentSubreddit = 'pics';
        this.after = null; // For pagination

        this.init();
    }

    init() {
        // Cache DOM elements
        this.container = document.getElementById('postsContainer');
        this.loading = document.getElementById('loading');
        this.subredditInput = document.getElementById('subredditName');
        this.loadBtn = document.getElementById('loadBtn');
        this.testBtn = document.getElementById('testBtn');
        this.navHint = document.getElementById('navHint');

        // Event listeners
        this.loadBtn.addEventListener('click', () => this.loadSubreddit());
        this.testBtn.addEventListener('click', () => this.testConnection());
        this.subredditInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.loadSubreddit();
        });

        // Touch events for swiping
        this.container.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        this.container.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: true });

        // Keyboard navigation for desktop testing
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') this.nextPost();
            if (e.key === 'ArrowUp') this.prevPost();
        });

        // Hide nav hint after 3 seconds
        setTimeout(() => {
            if (this.navHint) this.navHint.style.display = 'none';
        }, 3000);

        // Load initial subreddit
        this.loadSubreddit();
    }

    async loadSubreddit() {
        const subreddit = this.subredditInput.value.trim() || 'pics';
        this.currentSubreddit = subreddit;
        this.after = null;
        this.posts = [];
        this.currentIndex = 0;
        this.container.innerHTML = '';

        await this.fetchPosts();
    }

    async testConnection() {
        console.log('[CONNECTION TEST] Starting comprehensive connection diagnostics...');

        const results = {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            online: navigator.onLine,
            tests: []
        };

        // Show loading
        this.showLoading();
        this.testBtn.disabled = true;
        this.testBtn.textContent = '🔄 Testing...';

        let report = `[CONNECTION DIAGNOSTIC REPORT]\n`;
        report += `Timestamp: ${results.timestamp}\n`;
        report += `Browser Online Status: ${results.online ? '✓ ONLINE' : '✗ OFFLINE'}\n`;
        report += `User Agent: ${navigator.userAgent}\n`;
        report += `Current URL: ${window.location.href}\n`;
        report += `Protocol: ${window.location.protocol}\n\n`;

        // Test 1: Basic Internet Connectivity (using a reliable public API)
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        report += `TEST 1: Basic Internet Connectivity\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        try {
            const startTime = performance.now();
            const testResponse = await fetch('https://api.reddit.com/', {
                method: 'GET',
                signal: AbortSignal.timeout(10000)
            });
            const duration = (performance.now() - startTime).toFixed(2);

            report += `Status: ✓ PASS\n`;
            report += `Latency: ${duration}ms\n`;
            report += `HTTP Status: ${testResponse.status} ${testResponse.statusText}\n`;
            results.tests.push({ name: 'Internet Connectivity', status: 'PASS', latency: duration });
            console.log(`[CONNECTION TEST] Internet connectivity: PASS (${duration}ms)`);
        } catch (error) {
            report += `Status: ✗ FAIL\n`;
            report += `Error: ${error.name} - ${error.message}\n`;
            report += `Details: Cannot reach Reddit servers\n`;
            report += `Possible causes:\n`;
            report += `  • No internet connection\n`;
            report += `  • Firewall blocking HTTPS traffic\n`;
            report += `  • DNS resolution failure\n`;
            results.tests.push({ name: 'Internet Connectivity', status: 'FAIL', error: error.message });
            console.error('[CONNECTION TEST] Internet connectivity: FAIL', error);
        }

        // Test 2: Reddit API Endpoint Access
        report += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        report += `TEST 2: Reddit API Endpoint Access\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        const testUrl = 'https://api.reddit.com/r/test.json?limit=1';
        report += `Endpoint: ${testUrl}\n`;

        try {
            const startTime = performance.now();
            const apiResponse = await fetch(testUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'RedditTikTokViewer/1.0'
                },
                signal: AbortSignal.timeout(15000)
            });
            const duration = (performance.now() - startTime).toFixed(2);

            report += `Status: ✓ PASS\n`;
            report += `HTTP Status: ${apiResponse.status} ${apiResponse.statusText}\n`;
            report += `Latency: ${duration}ms\n`;
            report += `Content-Type: ${apiResponse.headers.get('content-type')}\n`;
            report += `CORS Headers:\n`;
            report += `  • Access-Control-Allow-Origin: ${apiResponse.headers.get('access-control-allow-origin') || 'NOT SET'}\n`;
            report += `  • Access-Control-Allow-Methods: ${apiResponse.headers.get('access-control-allow-methods') || 'NOT SET'}\n`;

            // Test JSON parsing
            try {
                const data = await apiResponse.json();
                if (data.data && data.data.children) {
                    report += `JSON Parsing: ✓ Valid Reddit API Response\n`;
                    report += `Posts Returned: ${data.data.children.length}\n`;
                    results.tests.push({
                        name: 'Reddit API Access',
                        status: 'PASS',
                        latency: duration,
                        httpStatus: apiResponse.status
                    });
                } else {
                    report += `JSON Parsing: ✗ Unexpected response structure\n`;
                    results.tests.push({
                        name: 'Reddit API Access',
                        status: 'PARTIAL',
                        latency: duration,
                        httpStatus: apiResponse.status,
                        issue: 'Unexpected response structure'
                    });
                }
            } catch (jsonError) {
                report += `JSON Parsing: ✗ FAIL - ${jsonError.message}\n`;
                results.tests.push({
                    name: 'Reddit API Access',
                    status: 'PARTIAL',
                    latency: duration,
                    httpStatus: apiResponse.status,
                    issue: 'JSON parsing failed'
                });
            }

            console.log(`[CONNECTION TEST] Reddit API access: PASS (${duration}ms)`);
        } catch (error) {
            report += `Status: ✗ FAIL\n`;
            report += `Error Type: ${error.name}\n`;
            report += `Error Message: ${error.message}\n`;

            // Detailed error diagnosis
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                report += `\nDiagnosis: NETWORK CONNECTION ERROR\n`;
                report += `Cannot establish connection to Reddit API.\n`;
                report += `\nCurrent Origin: ${window.location.origin}\n`;
                report += `\nPossible causes:\n`;
                report += `  • Running from file:// protocol (use a web server)\n`;
                report += `  • Browser extensions blocking requests\n`;
                report += `  • Corporate firewall/proxy blocking Reddit\n`;
                report += `  • No internet connection\n`;
                report += `  • DNS resolution failure\n`;
                report += `\nSOLUTION:\n`;
                report += `  1. Run from localhost: python -m http.server 8000\n`;
                report += `  2. Disable browser extensions temporarily\n`;
                report += `  3. Check firewall/proxy settings\n`;
                report += `  4. Verify internet connection\n`;
                report += `\nNOTE: api.reddit.com has CORS headers, so this should work\n`;
                report += `from most domains including GitHub Pages.\n`;
            } else if (error.name === 'AbortError') {
                report += `\nDiagnosis: REQUEST TIMEOUT\n`;
                report += `The request took longer than 15 seconds.\n`;
                report += `Possible causes:\n`;
                report += `  • Very slow internet connection\n`;
                report += `  • Reddit servers not responding\n`;
                report += `  • Network congestion\n`;
            } else {
                report += `\nDiagnosis: NETWORK ERROR\n`;
                report += `Could not establish connection to Reddit API.\n`;
            }

            results.tests.push({
                name: 'Reddit API Access',
                status: 'FAIL',
                error: error.message,
                errorType: error.name
            });
            console.error('[CONNECTION TEST] Reddit API access: FAIL', error);
        }

        // Test 3: Browser Capabilities
        report += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        report += `TEST 3: Browser Capabilities\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        const capabilities = {
            fetch: typeof fetch !== 'undefined',
            abortController: typeof AbortController !== 'undefined',
            performanceAPI: typeof performance !== 'undefined',
            localStorage: typeof localStorage !== 'undefined',
            sessionStorage: typeof sessionStorage !== 'undefined',
        };

        Object.entries(capabilities).forEach(([feature, supported]) => {
            report += `${feature}: ${supported ? '✓ Supported' : '✗ Not Supported'}\n`;
        });

        results.browserCapabilities = capabilities;

        // Test 4: Network Information (if available)
        if (navigator.connection || navigator.mozConnection || navigator.webkitConnection) {
            report += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            report += `TEST 4: Network Information\n`;
            report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            report += `Effective Type: ${connection.effectiveType || 'Unknown'}\n`;
            report += `Downlink: ${connection.downlink || 'Unknown'} Mbps\n`;
            report += `RTT: ${connection.rtt || 'Unknown'} ms\n`;
            report += `Save Data: ${connection.saveData ? 'Enabled' : 'Disabled'}\n`;

            results.networkInfo = {
                effectiveType: connection.effectiveType,
                downlink: connection.downlink,
                rtt: connection.rtt,
                saveData: connection.saveData
            };
        }

        // Summary
        report += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        report += `SUMMARY\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        const passCount = results.tests.filter(t => t.status === 'PASS').length;
        const failCount = results.tests.filter(t => t.status === 'FAIL').length;
        const totalTests = results.tests.length;

        report += `Total Tests: ${totalTests}\n`;
        report += `Passed: ${passCount}\n`;
        report += `Failed: ${failCount}\n`;

        if (failCount === 0) {
            report += `\nOverall Status: ✓ ALL TESTS PASSED\n`;
            report += `Connection to Reddit API is working properly!\n`;
        } else {
            report += `\nOverall Status: ✗ ISSUES DETECTED\n`;
            report += `Please review the failed tests above for details.\n`;
        }

        // Log full results to console
        console.log('[CONNECTION TEST] Full results:', results);
        console.log('[CONNECTION TEST] Report:\n' + report);

        // Show results to user
        this.hideLoading();
        this.testBtn.disabled = false;
        this.testBtn.textContent = '🔧 Test Connection';

        this.showError(report, null);

        return results;
    }

    async fetchPosts() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading();

        const startTime = performance.now();

        try {
            const url = this.after
                ? `https://api.reddit.com/r/${this.currentSubreddit}.json?limit=50&after=${this.after}`
                : `https://api.reddit.com/r/${this.currentSubreddit}.json?limit=50`;

            console.log(`[FETCH] Requesting: ${url}`);

            // Add timeout to fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

            let response;
            try {
                response = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'RedditTikTokViewer/1.0'
                    }
                });
                clearTimeout(timeoutId);
            } catch (fetchError) {
                clearTimeout(timeoutId);

                // Detect specific network error types
                if (fetchError.name === 'AbortError') {
                    const errorMsg = `[NETWORK TIMEOUT ERROR]\n` +
                        `Request exceeded 15 second timeout\n` +
                        `URL: ${url}\n` +
                        `Subreddit: r/${this.currentSubreddit}\n` +
                        `Possible causes: Slow network, server not responding, or rate limiting`;
                    console.error(errorMsg);
                    throw new Error(errorMsg);
                } else if (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('NetworkError')) {
                    const errorMsg = `[NETWORK CONNECTION ERROR]\n` +
                        `Failed to establish connection to Reddit API\n` +
                        `Error: ${fetchError.message}\n` +
                        `URL: ${url}\n` +
                        `Possible causes:\n` +
                        `  • No internet connection\n` +
                        `  • Reddit servers are down\n` +
                        `  • Firewall or proxy blocking request\n` +
                        `  • DNS resolution failure\n` +
                        `  • Running from file:// protocol (use a web server)\n` +
                        `  • Browser extension blocking the request\n\n` +
                        `NOTE: api.reddit.com has proper CORS headers enabled,\n` +
                        `so this should work from any domain including GitHub Pages.`;
                    console.error(errorMsg);
                    throw new Error(errorMsg);
                } else {
                    throw fetchError;
                }
            }

            const requestDuration = (performance.now() - startTime).toFixed(2);
            console.log(`[FETCH] Response received in ${requestDuration}ms - Status: ${response.status} ${response.statusText}`);

            // Detailed HTTP error handling
            if (!response.ok) {
                const errorDetails = {
                    status: response.status,
                    statusText: response.statusText,
                    url: url,
                    subreddit: this.currentSubreddit,
                    headers: Object.fromEntries(response.headers.entries()),
                    timestamp: new Date().toISOString()
                };

                let errorBody = '';
                try {
                    errorBody = await response.text();
                    console.error('[HTTP ERROR] Response Body:', errorBody);
                } catch (e) {
                    console.error('[HTTP ERROR] Could not read response body');
                }

                let errorMessage = `[HTTP ${response.status} ERROR]\n`;

                switch (response.status) {
                    case 403:
                        errorMessage += `FORBIDDEN - Access Denied\n` +
                            `Subreddit: r/${this.currentSubreddit}\n` +
                            `Possible causes:\n` +
                            `  • Subreddit is private or restricted\n` +
                            `  • API access blocked by Reddit\n` +
                            `  • Rate limit exceeded (too many requests)\n` +
                            `  • Geographic restrictions`;
                        break;
                    case 404:
                        errorMessage += `NOT FOUND\n` +
                            `Subreddit r/${this.currentSubreddit} does not exist\n` +
                            `Check spelling and try again`;
                        break;
                    case 429:
                        errorMessage += `RATE LIMIT EXCEEDED\n` +
                            `Too many requests to Reddit API\n` +
                            `Wait a few minutes before trying again\n` +
                            `Rate-Limit Headers: ${JSON.stringify(errorDetails.headers['x-ratelimit-remaining'] || 'N/A')}`;
                        break;
                    case 500:
                    case 502:
                    case 503:
                    case 504:
                        errorMessage += `SERVER ERROR\n` +
                            `Reddit's servers are experiencing issues\n` +
                            `Status: ${response.status} ${response.statusText}\n` +
                            `Try again in a few moments`;
                        break;
                    default:
                        errorMessage += `${response.statusText}\n` +
                            `Subreddit: r/${this.currentSubreddit}\n` +
                            `URL: ${url}`;
                }

                errorMessage += `\n\nTechnical Details:\n` +
                    `  Status Code: ${response.status}\n` +
                    `  Status Text: ${response.statusText}\n` +
                    `  Request Duration: ${requestDuration}ms\n` +
                    `  Timestamp: ${errorDetails.timestamp}`;

                console.error('[HTTP ERROR] Full Details:', errorDetails);
                throw new Error(errorMessage);
            }

            // Parse JSON with error handling
            let data;
            try {
                data = await response.json();
                console.log(`[FETCH] JSON parsed successfully - Posts found: ${data.data?.children?.length || 0}`);
            } catch (jsonError) {
                const errorMsg = `[JSON PARSE ERROR]\n` +
                    `Failed to parse Reddit API response\n` +
                    `Error: ${jsonError.message}\n` +
                    `URL: ${url}\n` +
                    `Status: ${response.status}\n` +
                    `Response may not be valid JSON\n` +
                    `This could indicate:\n` +
                    `  • Reddit API returned HTML instead of JSON\n` +
                    `  • Response was corrupted during transmission\n` +
                    `  • Unexpected API response format`;
                console.error(errorMsg);
                console.error('[JSON PARSE ERROR] First 500 chars of response:', await response.text().then(t => t.substring(0, 500)));
                throw new Error(errorMsg);
            }

            // Validate response structure
            if (!data.data || !data.data.children || !Array.isArray(data.data.children)) {
                const errorMsg = `[API STRUCTURE ERROR]\n` +
                    `Reddit API returned unexpected data structure\n` +
                    `Expected: {data: {children: [...]}}\n` +
                    `Received: ${JSON.stringify(data).substring(0, 200)}...\n` +
                    `Subreddit: r/${this.currentSubreddit}\n` +
                    `This indicates the Reddit API response format has changed`;
                console.error(errorMsg);
                console.error('[API STRUCTURE ERROR] Full response:', data);
                throw new Error(errorMsg);
            }

            this.after = data.data.after;

            // Filter media posts only
            const mediaPosts = data.data.children
                .map(child => child.data)
                .filter(post => this.isMediaPost(post));

            console.log(`[FILTER] Total posts: ${data.data.children.length}, Media posts: ${mediaPosts.length}`);

            if (mediaPosts.length === 0) {
                const errorMsg = `[NO MEDIA POSTS]\n` +
                    `Subreddit r/${this.currentSubreddit} has no media content\n` +
                    `Total posts found: ${data.data.children.length}\n` +
                    `Media posts found: 0\n` +
                    `This subreddit may only contain text posts or external links\n` +
                    `Try a different subreddit with images/videos (e.g., pics, videos, gifs, aww)`;
                console.warn(errorMsg);
                this.showError(errorMsg);
                this.hideLoading();
                this.isLoading = false;
                return;
            }

            this.posts = [...this.posts, ...mediaPosts];
            console.log(`[SUCCESS] Total posts loaded: ${this.posts.length}`);
            this.renderPosts();
            this.hideLoading();

        } catch (error) {
            const requestDuration = (performance.now() - startTime).toFixed(2);
            console.error(`[FATAL ERROR] Request failed after ${requestDuration}ms:`, error);
            console.error('[FATAL ERROR] Stack trace:', error.stack);

            // Show detailed error to user with stack trace
            const errorMessage = error.message || `[UNKNOWN ERROR]\nAn unexpected error occurred\nCheck console for details`;
            this.showError(errorMessage, error.stack);
            this.hideLoading();
        }

        this.isLoading = false;
    }

    isMediaPost(post) {
        // Check if post has media content
        const hasImage = post.post_hint === 'image' ||
                        (post.url && (post.url.match(/\.(jpeg|jpg|gif|png|webp)$/i) ||
                         post.url.includes('i.redd.it') ||
                         post.url.includes('i.imgur.com')));

        const hasVideo = post.is_video ||
                        post.post_hint === 'hosted:video' ||
                        (post.media && post.media.reddit_video);

        const hasGallery = post.is_gallery && post.gallery_data;

        return hasImage || hasVideo || hasGallery;
    }

    renderPosts() {
        // Render only visible posts for performance (current, prev, next)
        const startIndex = Math.max(0, this.currentIndex - 1);
        const endIndex = Math.min(this.posts.length - 1, this.currentIndex + 1);

        for (let i = startIndex; i <= endIndex; i++) {
            if (!document.getElementById(`post-${i}`)) {
                this.createPostElement(this.posts[i], i);
            }
        }

        this.updatePostPositions();
    }

    createPostElement(post, index) {
        const postEl = document.createElement('div');
        postEl.className = 'post';
        postEl.id = `post-${index}`;

        // Create media wrapper
        const mediaWrapper = document.createElement('div');
        mediaWrapper.className = 'media-wrapper';

        // Handle different media types
        if (post.is_gallery && post.gallery_data) {
            mediaWrapper.appendChild(this.createGallery(post));
        } else if (post.is_video || (post.media && post.media.reddit_video)) {
            mediaWrapper.appendChild(this.createVideo(post));
        } else {
            mediaWrapper.appendChild(this.createImage(post));
        }

        postEl.appendChild(mediaWrapper);

        // Add post info overlay
        const postInfo = document.createElement('div');
        postInfo.className = 'post-info';
        postInfo.innerHTML = `
            <div class="post-title">${this.escapeHtml(post.title)}</div>
            <div class="post-meta">
                <span>👍 ${this.formatNumber(post.ups)}</span>
                <span>💬 ${this.formatNumber(post.num_comments)}</span>
                <span>r/${post.subreddit}</span>
            </div>
        `;
        postEl.appendChild(postInfo);

        this.container.appendChild(postEl);
    }

    createImage(post) {
        const img = document.createElement('img');
        let imageUrl = post.url;

        // Handle different image sources
        if (post.preview && post.preview.images && post.preview.images[0]) {
            imageUrl = post.preview.images[0].source.url.replace(/&amp;/g, '&');
        }

        img.src = imageUrl;
        img.alt = post.title;
        img.loading = 'lazy';

        return img;
    }

    createVideo(post) {
        const video = document.createElement('video');
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.controls = false;

        const source = document.createElement('source');

        if (post.media && post.media.reddit_video) {
            source.src = post.media.reddit_video.fallback_url;
        } else if (post.secure_media && post.secure_media.reddit_video) {
            source.src = post.secure_media.reddit_video.fallback_url;
        }

        source.type = 'video/mp4';
        video.appendChild(source);

        // Play video when it becomes active
        video.addEventListener('loadeddata', () => {
            if (this.currentIndex === parseInt(video.closest('.post').id.split('-')[1])) {
                video.play().catch(e => {
                    console.error(`[VIDEO AUTOPLAY ERROR]\n` +
                        `Error: ${e.name} - ${e.message}\n` +
                        `Video Source: ${source.src}\n` +
                        `Post Index: ${this.currentIndex}\n` +
                        `Possible causes:\n` +
                        `  • Browser autoplay policy (user interaction required)\n` +
                        `  • Video codec not supported\n` +
                        `  • CORS restrictions on video source\n` +
                        `  • Video file corrupted or unavailable`);
                });
            }
        });

        return video;
    }

    createGallery(post) {
        const galleryContainer = document.createElement('div');
        galleryContainer.className = 'gallery-container';

        const gallerySlides = document.createElement('div');
        gallerySlides.className = 'gallery-slides';

        const galleryData = post.gallery_data.items;
        const mediaMetadata = post.media_metadata;

        let currentSlide = 0;

        galleryData.forEach((item, idx) => {
            const slide = document.createElement('div');
            slide.className = 'gallery-slide';

            const media = mediaMetadata[item.media_id];
            if (media && media.s) {
                const img = document.createElement('img');
                img.src = media.s.u ? media.s.u.replace(/&amp;/g, '&') : media.s.gif;
                img.alt = `Gallery image ${idx + 1}`;
                img.loading = 'lazy';
                slide.appendChild(img);
            }

            gallerySlides.appendChild(slide);
        });

        galleryContainer.appendChild(gallerySlides);

        // Add gallery navigation dots
        if (galleryData.length > 1) {
            const galleryNav = document.createElement('div');
            galleryNav.className = 'gallery-nav';

            galleryData.forEach((_, idx) => {
                const dot = document.createElement('div');
                dot.className = `gallery-dot ${idx === 0 ? 'active' : ''}`;
                galleryNav.appendChild(dot);
            });

            galleryContainer.appendChild(galleryNav);

            // Horizontal swipe for gallery
            let galleryTouchStartX = 0;
            galleryContainer.addEventListener('touchstart', (e) => {
                galleryTouchStartX = e.touches[0].clientX;
            }, { passive: true });

            galleryContainer.addEventListener('touchend', (e) => {
                const galleryTouchEndX = e.changedTouches[0].clientX;
                const diff = galleryTouchStartX - galleryTouchEndX;

                if (Math.abs(diff) > 50) {
                    if (diff > 0 && currentSlide < galleryData.length - 1) {
                        currentSlide++;
                    } else if (diff < 0 && currentSlide > 0) {
                        currentSlide--;
                    }

                    gallerySlides.style.transform = `translateX(-${currentSlide * 100}%)`;

                    // Update dots
                    const dots = galleryNav.querySelectorAll('.gallery-dot');
                    dots.forEach((dot, idx) => {
                        dot.classList.toggle('active', idx === currentSlide);
                    });
                }
            }, { passive: true });
        }

        return galleryContainer;
    }

    handleTouchStart(e) {
        this.touchStartY = e.touches[0].clientY;
    }

    handleTouchEnd(e) {
        this.touchEndY = e.changedTouches[0].clientY;
        this.handleSwipe();
    }

    handleSwipe() {
        const swipeDistance = this.touchStartY - this.touchEndY;
        const minSwipeDistance = 50;

        if (Math.abs(swipeDistance) > minSwipeDistance) {
            if (swipeDistance > 0) {
                // Swiped up - next post
                this.nextPost();
            } else {
                // Swiped down - previous post
                this.prevPost();
            }
        }
    }

    nextPost() {
        if (this.currentIndex < this.posts.length - 1) {
            this.currentIndex++;
            this.updatePostPositions();
            this.pauseAllVideos();
            this.playCurrentVideo();

            // Load more posts if near the end
            if (this.currentIndex >= this.posts.length - 3 && this.after) {
                this.fetchPosts();
            }
        }
    }

    prevPost() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.updatePostPositions();
            this.pauseAllVideos();
            this.playCurrentVideo();
        }
    }

    updatePostPositions() {
        const posts = this.container.querySelectorAll('.post');

        posts.forEach((post, idx) => {
            const postIndex = parseInt(post.id.split('-')[1]);

            if (postIndex === this.currentIndex) {
                post.className = 'post active';
            } else if (postIndex === this.currentIndex - 1) {
                post.className = 'post prev';
            } else if (postIndex === this.currentIndex + 1) {
                post.className = 'post next';
            } else {
                // Remove posts that are too far away to save memory
                if (Math.abs(postIndex - this.currentIndex) > 2) {
                    post.remove();
                }
            }
        });

        // Render nearby posts if they don't exist
        this.renderPosts();
    }

    pauseAllVideos() {
        const videos = this.container.querySelectorAll('video');
        videos.forEach(video => {
            video.pause();
        });
    }

    playCurrentVideo() {
        const currentPost = document.getElementById(`post-${this.currentIndex}`);
        if (currentPost) {
            const video = currentPost.querySelector('video');
            if (video) {
                video.currentTime = 0;
                console.log(`[VIDEO] Attempting to play post ${this.currentIndex}`);
                video.play().catch(e => {
                    console.error(`[VIDEO PLAY ERROR]\n` +
                        `Error: ${e.name} - ${e.message}\n` +
                        `Post Index: ${this.currentIndex}\n` +
                        `Video Source: ${video.src || video.querySelector('source')?.src || 'unknown'}\n` +
                        `Video Ready State: ${video.readyState} (0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA)\n` +
                        `Video Network State: ${video.networkState} (0=NETWORK_EMPTY, 1=NETWORK_IDLE, 2=NETWORK_LOADING, 3=NETWORK_NO_SOURCE)\n` +
                        `Video Duration: ${video.duration}s\n` +
                        `Video Paused: ${video.paused}\n` +
                        `Video Muted: ${video.muted}\n` +
                        `Possible causes:\n` +
                        `  • Browser autoplay policy blocking playback\n` +
                        `  • Video not fully loaded (readyState < 3)\n` +
                        `  • Video source URL invalid or inaccessible\n` +
                        `  • CORS policy blocking video access\n` +
                        `  • Video codec not supported by browser`);
                });
            }
        }
    }

    showLoading() {
        this.loading.classList.add('active');
    }

    hideLoading() {
        this.loading.classList.remove('active');
    }

    showError(message, stackTrace = null) {
        // Remove any existing error messages
        const existingErrors = document.querySelectorAll('.error-message');
        existingErrors.forEach(err => err.remove());

        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';

        // Create error content with formatting
        const errorContent = document.createElement('div');
        errorContent.className = 'error-content';

        // Format the error message with proper line breaks and indentation
        const formattedMessage = message
            .split('\n')
            .map(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('•')) {
                    return `<div class="error-bullet">${this.escapeHtml(trimmed)}</div>`;
                } else if (trimmed.includes(':')) {
                    const [key, ...valueParts] = trimmed.split(':');
                    const value = valueParts.join(':');
                    return `<div class="error-line"><strong>${this.escapeHtml(key)}:</strong>${this.escapeHtml(value)}</div>`;
                } else if (trimmed.startsWith('[') && trimmed.includes(']')) {
                    return `<div class="error-header">${this.escapeHtml(trimmed)}</div>`;
                } else if (trimmed) {
                    return `<div class="error-line">${this.escapeHtml(trimmed)}</div>`;
                }
                return '';
            })
            .join('');

        errorContent.innerHTML = formattedMessage;

        // Add stack trace if provided
        if (stackTrace) {
            const stackHeader = document.createElement('div');
            stackHeader.className = 'error-header';
            stackHeader.style.marginTop = '15px';
            stackHeader.textContent = 'STACK TRACE';
            errorContent.appendChild(stackHeader);

            const stackContainer = document.createElement('div');
            stackContainer.className = 'error-stack';

            // Format stack trace with line numbers
            const stackLines = stackTrace.split('\n');
            stackLines.forEach((line, index) => {
                const stackLine = document.createElement('div');
                stackLine.className = 'error-stack-line';

                // Highlight function names and file paths
                let formattedLine = this.escapeHtml(line);

                // Highlight "at" keyword
                formattedLine = formattedLine.replace(/at /g, '<span class="stack-at">at</span> ');

                // Highlight function names (text before parentheses)
                formattedLine = formattedLine.replace(/at <span class="stack-at">at<\/span> ([^\s(]+)/g,
                    'at <span class="stack-at">at</span> <span class="stack-function">$1</span>');

                // Highlight file paths and line numbers
                formattedLine = formattedLine.replace(/\(([^)]+):(\d+):(\d+)\)/g,
                    '(<span class="stack-file">$1:<span class="stack-linenum">$2:$3</span></span>)');

                stackLine.innerHTML = `<span class="stack-linenum">${(index + 1).toString().padStart(2, '0')}</span> ${formattedLine}`;
                stackContainer.appendChild(stackLine);
            });

            errorContent.appendChild(stackContainer);
        }

        errorEl.appendChild(errorContent);

        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'error-close';
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => errorEl.remove();
        errorEl.appendChild(closeBtn);

        // Prepare full text for copying (including stack trace)
        const fullErrorText = stackTrace ? `${message}\n\nSTACK TRACE:\n${stackTrace}` : message;

        // Add copy button for technical details
        const copyBtn = document.createElement('button');
        copyBtn.className = 'error-copy';
        copyBtn.innerHTML = '📋 Copy';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(fullErrorText).then(() => {
                copyBtn.innerHTML = '✓ Copied';
                setTimeout(() => {
                    copyBtn.innerHTML = '📋 Copy';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy to clipboard:', err);
                copyBtn.innerHTML = '✗ Failed';
            });
        };
        errorEl.appendChild(copyBtn);

        document.body.appendChild(errorEl);

        console.error('[ERROR DISPLAYED TO USER]', message);
        if (stackTrace) {
            console.error('[STACK TRACE]', stackTrace);
        }

        // Auto-dismiss after 20 seconds for stack traces (up from 15s)
        setTimeout(() => {
            if (errorEl.parentNode) {
                errorEl.remove();
            }
        }, stackTrace ? 20000 : 15000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new RedditViewer();
});
