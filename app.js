// Reddit TikTok Viewer
class RedditViewer {
    constructor() {
        this.posts = [];
        this.currentIndex = 0;
        this.isLoading = false;
        this.isAnimating = false; // Prevent multiple swipes during animation
        this.touchStartY = 0;
        this.touchEndY = 0;
        this.touchStartX = 0;
        this.touchEndX = 0;
        this.currentSubreddit = 'pics';
        this.after = null; // For pagination
        this.animationDuration = 300; // Match CSS animation duration

        // JSONP configuration
        this.redditApiBase = 'https://www.reddit.com';
        this.jsonpCallbackCounter = 0; // For generating unique callback names

        this.init();
    }

    init() {
        // Cache DOM elements
        this.container = document.getElementById('postsContainer');
        this.loading = document.getElementById('loading');
        this.subredditInput = document.getElementById('subredditName');
        this.loadBtn = document.getElementById('loadBtn');
        this.navHint = document.getElementById('navHint');

        // Event listeners
        this.loadBtn.addEventListener('click', () => this.loadSubreddit());
        this.subredditInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.loadSubreddit();
        });

        // Touch events for swiping
        this.container.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        this.container.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: true });

        // Keyboard navigation for desktop testing
        document.addEventListener('keydown', (e) => {
            // Only handle arrow keys if not already animating
            if (!this.isAnimating) {
                if (e.key === 'ArrowDown') this.nextPost();
                if (e.key === 'ArrowUp') this.prevPost();
            }
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

    // JSONP request handler
    jsonpRequest(url, timeout = 15000) {
        return new Promise((resolve, reject) => {
            // Generate unique callback name
            const callbackName = `jsonpCallback_${Date.now()}_${this.jsonpCallbackCounter++}`;

            // Create script element
            const script = document.createElement('script');
            const timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error('JSONP request timeout'));
            }, timeout);

            // Cleanup function
            const cleanup = () => {
                clearTimeout(timeoutId);
                delete window[callbackName];
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
            };

            // Define callback function
            window[callbackName] = (data) => {
                cleanup();
                resolve(data);
            };

            // Handle script loading errors
            script.onerror = () => {
                cleanup();
                reject(new Error('JSONP script load error'));
            };

            // Set script source with callback parameter
            script.src = `${url}${url.includes('?') ? '&' : '?'}jsonp=${callbackName}`;

            // Add script to DOM to trigger request
            document.head.appendChild(script);
        });
    }

    async fetchPosts() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading();

        const startTime = performance.now();

        try {
            // Build Reddit API URL using JSONP
            const redditUrl = this.after
                ? `${this.redditApiBase}/r/${this.currentSubreddit}.json?limit=50&after=${this.after}`
                : `${this.redditApiBase}/r/${this.currentSubreddit}.json?limit=50`;

            console.log(`[FETCH] Reddit URL (JSONP): ${redditUrl}`);

            // Use JSONP to fetch data (no CORS issues!)
            let data;
            try {
                data = await this.jsonpRequest(redditUrl);
                const requestDuration = (performance.now() - startTime).toFixed(2);
                console.log(`[FETCH] JSONP response received in ${requestDuration}ms`);
            } catch (jsonpError) {
                const requestDuration = (performance.now() - startTime).toFixed(2);

                if (jsonpError.message === 'JSONP request timeout') {
                    const errorMsg = `[NETWORK TIMEOUT ERROR]\n` +
                        `Request exceeded 15 second timeout\n` +
                        `URL: ${redditUrl}\n` +
                        `Subreddit: r/${this.currentSubreddit}\n` +
                        `Duration: ${requestDuration}ms\n` +
                        `Possible causes: Slow network, server not responding, or rate limiting`;
                    console.error(errorMsg);
                    throw new Error(errorMsg);
                } else {
                    const errorMsg = `[JSONP ERROR]\n` +
                        `Failed to load data via JSONP\n` +
                        `Error: ${jsonpError.message}\n` +
                        `URL: ${redditUrl}\n` +
                        `Subreddit: r/${this.currentSubreddit}\n` +
                        `Duration: ${requestDuration}ms\n` +
                        `Possible causes:\n` +
                        `  • Reddit servers are down\n` +
                        `  • Subreddit doesn't exist\n` +
                        `  • Network connectivity issues\n` +
                        `  • Ad blocker or script blocker interfering`;
                    console.error(errorMsg);
                    throw new Error(errorMsg);
                }
            }

            // Validate response structure
            if (!data || !data.data || !data.data.children || !Array.isArray(data.data.children)) {
                const errorMsg = `[API STRUCTURE ERROR]\n` +
                    `Reddit API returned unexpected data structure\n` +
                    `Expected: {data: {children: [...]}}\n` +
                    `Received: ${JSON.stringify(data).substring(0, 200)}...\n` +
                    `Subreddit: r/${this.currentSubreddit}\n` +
                    `This indicates the subreddit may not exist or the Reddit API response format has changed`;
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
            this.updatePostPositions(); // Position the posts after rendering
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

        // Don't call updatePostPositions here - it creates infinite recursion
        // updatePostPositions already calls renderPosts at the end
    }

    createPostElement(post, index) {
        const postEl = document.createElement('div');
        postEl.id = `post-${index}`;

        // Set initial position based on index relative to currentIndex
        // Important: Set class BEFORE adding to DOM to avoid flash
        if (index === this.currentIndex) {
            postEl.className = 'post active';
        } else if (index < this.currentIndex) {
            postEl.className = 'post prev';
        } else {
            postEl.className = 'post next';
        }

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
        console.log(`[CREATE] Post ${index} created with class: ${postEl.className}`);
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
        this.touchStartX = e.touches[0].clientX;
        console.log(`[TOUCH] Start - Y: ${this.touchStartY.toFixed(0)}`);
    }

    handleTouchEnd(e) {
        this.touchEndY = e.changedTouches[0].clientY;
        this.touchEndX = e.changedTouches[0].clientX;
        console.log(`[TOUCH] End - Y: ${this.touchEndY.toFixed(0)}`);
        this.handleSwipe();
    }

    handleSwipe() {
        if (this.isAnimating) {
            console.log('[SWIPE] Blocked - animation in progress');
            return;
        }

        const swipeDistanceY = this.touchStartY - this.touchEndY;
        const swipeDistanceX = Math.abs(this.touchStartX - this.touchEndX);
        const minSwipeDistance = 50;

        console.log(`[SWIPE] Distance Y: ${swipeDistanceY.toFixed(0)}px, X: ${swipeDistanceX.toFixed(0)}px`);

        // Only handle vertical swipes (ignore if too much horizontal movement)
        if (swipeDistanceX > 100) {
            console.log('[SWIPE] Ignored - too much horizontal movement (gallery swipe)');
            return;
        }

        if (Math.abs(swipeDistanceY) > minSwipeDistance) {
            if (swipeDistanceY > 0) {
                console.log('[SWIPE] Up detected - going to next post');
                this.nextPost();
            } else {
                console.log('[SWIPE] Down detected - going to previous post');
                this.prevPost();
            }
        } else {
            console.log('[SWIPE] Too short - ignored');
        }
    }

    nextPost() {
        if (this.isAnimating) {
            console.log('[NAV] Blocked - animation in progress');
            return;
        }

        if (this.currentIndex >= this.posts.length - 1) {
            console.log('[NAV] Already at last post');
            return;
        }

        console.log(`[NAV] Next: ${this.currentIndex} -> ${this.currentIndex + 1}`);
        this.isAnimating = true;

        const oldIndex = this.currentIndex;
        this.currentIndex++;

        // Ensure next post exists in DOM
        if (!document.getElementById(`post-${this.currentIndex}`)) {
            this.renderPosts();
        }

        this.performAnimation(oldIndex, this.currentIndex, 'next');

        // Load more posts if near the end
        if (this.currentIndex >= this.posts.length - 3 && this.after && !this.isLoading) {
            console.log('[NAV] Preloading more posts...');
            this.fetchPosts();
        }
    }

    prevPost() {
        if (this.isAnimating) {
            console.log('[NAV] Blocked - animation in progress');
            return;
        }

        if (this.currentIndex <= 0) {
            console.log('[NAV] Already at first post');
            return;
        }

        console.log(`[NAV] Prev: ${this.currentIndex} -> ${this.currentIndex - 1}`);
        this.isAnimating = true;

        const oldIndex = this.currentIndex;
        this.currentIndex--;

        // Ensure previous post exists in DOM
        if (!document.getElementById(`post-${this.currentIndex}`)) {
            this.renderPosts();
        }

        this.performAnimation(oldIndex, this.currentIndex, 'prev');
    }

    performAnimation(fromIndex, toIndex, direction) {
        const fromPost = document.getElementById(`post-${fromIndex}`);
        const toPost = document.getElementById(`post-${toIndex}`);

        if (!fromPost || !toPost) {
            console.error(`[ANIMATION] Missing posts - from:${!!fromPost} to:${!!toPost}`);
            this.isAnimating = false;
            return;
        }

        console.log(`[ANIMATION] Animating ${direction}: ${fromIndex} -> ${toIndex}`);

        // Pause videos
        this.pauseAllVideos();

        // Animate using classes
        if (direction === 'next') {
            // Moving to next post (swipe up)
            fromPost.classList.remove('active');
            fromPost.classList.add('prev');

            toPost.classList.remove('next');
            toPost.classList.add('active');
        } else {
            // Moving to previous post (swipe down)
            fromPost.classList.remove('active');
            fromPost.classList.add('next');

            toPost.classList.remove('prev');
            toPost.classList.add('active');
        }

        // Release lock and cleanup after animation
        setTimeout(() => {
            this.isAnimating = false;
            this.playCurrentVideo();
            this.cleanupDistantPosts();
            console.log(`[ANIMATION] Complete - ready for next interaction`);
        }, this.animationDuration + 50); // Add small buffer
    }

    cleanupDistantPosts() {
        const posts = this.container.querySelectorAll('.post');
        posts.forEach((post) => {
            const postIndex = parseInt(post.id.split('-')[1]);
            if (Math.abs(postIndex - this.currentIndex) > 2) {
                console.log(`[CLEANUP] Removing post ${postIndex}`);
                post.remove();
            }
        });
    }

    updatePostPositions() {
        // Update positions without animation (used after loading)
        const posts = this.container.querySelectorAll('.post');

        posts.forEach((post) => {
            const postIndex = parseInt(post.id.split('-')[1]);

            // Remove all position classes
            post.classList.remove('active', 'prev', 'next');

            // Add correct class
            if (postIndex === this.currentIndex) {
                post.classList.add('active');
            } else if (postIndex < this.currentIndex) {
                post.classList.add('prev');
            } else {
                post.classList.add('next');
            }
        });

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
    const viewer = new RedditViewer();
    // Expose to global scope for button onclick handlers
    window.redditViewer = viewer;
});
