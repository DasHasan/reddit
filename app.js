// Reddit TikTok Viewer
class RedditViewer {
    constructor() {
        this.posts = [];
        this.currentIndex = 0;
        this.isLoading = false;
        this.currentSubreddit = 'pics';
        this.after = null; // For pagination
        this.scrollTimeout = null; // For throttling scroll events
        this.isRendering = false; // Prevent concurrent renders
        this.itemHeight = window.innerHeight; // Each post is 100vh
        this.renderBuffer = 2; // Render this many posts above/below viewport

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

        // Create virtual scroll spacer to maintain scroll height
        this.spacer = document.createElement('div');
        this.spacer.style.position = 'absolute';
        this.spacer.style.top = '0';
        this.spacer.style.left = '0';
        this.spacer.style.width = '1px';
        this.spacer.style.height = '0px';
        this.spacer.style.pointerEvents = 'none';
        this.container.appendChild(this.spacer);

        // Event listeners
        this.loadBtn.addEventListener('click', () => this.loadSubreddit());
        this.subredditInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.loadSubreddit();
        });

        // Keyboard navigation - smooth scroll to next/prev post
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.scrollToPost(this.currentIndex + 1);
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.scrollToPost(this.currentIndex - 1);
            }
        });

        // Scroll event for virtual scrolling
        this.container.addEventListener('scroll', () => {
            if (this.scrollTimeout) return;
            this.scrollTimeout = setTimeout(() => {
                this.handleScroll();
                this.scrollTimeout = null;
            }, 50); // Faster response for virtual scroll
        }, { passive: true });

        // Handle window resize
        window.addEventListener('resize', () => {
            this.itemHeight = window.innerHeight;
            this.updateSpacerHeight();
            this.renderVisiblePosts();
        });

        // Hide nav hint after 3 seconds
        setTimeout(() => {
            if (this.navHint) this.navHint.style.display = 'none';
        }, 3000);

        // Load initial subreddit
        this.loadSubreddit();
    }

    updateSpacerHeight() {
        // Set virtual scroll height based on total posts
        const totalHeight = this.posts.length * this.itemHeight;
        this.spacer.style.height = `${totalHeight}px`;
        console.log(`[VIRTUAL] Spacer height: ${totalHeight}px for ${this.posts.length} posts`);
    }

    getVisibleRange() {
        // Calculate which posts should be visible based on scroll position
        const scrollTop = this.container.scrollTop;
        const viewportHeight = this.container.clientHeight;

        // Calculate current index from scroll position
        const scrollIndex = Math.floor(scrollTop / this.itemHeight);

        // Determine visible range with buffer
        const startIndex = Math.max(0, scrollIndex - this.renderBuffer);
        const endIndex = Math.min(
            this.posts.length - 1,
            scrollIndex + Math.ceil(viewportHeight / this.itemHeight) + this.renderBuffer
        );

        return { startIndex, endIndex, scrollIndex };
    }

    scrollToPost(index) {
        if (index < 0 || index >= this.posts.length) {
            console.log(`[NAV] Index ${index} out of bounds`);
            return;
        }

        // Calculate exact scroll position for this post
        const targetScrollTop = index * this.itemHeight;
        this.container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
        console.log(`[NAV] Scrolling to post ${index} at ${targetScrollTop}px`);
    }

    handleScroll() {
        // Get current visible range
        const { startIndex, endIndex, scrollIndex } = this.getVisibleRange();

        // Update current index if it changed
        if (scrollIndex !== this.currentIndex && scrollIndex < this.posts.length) {
            const oldIndex = this.currentIndex;
            this.currentIndex = scrollIndex;
            console.log(`[SCROLL] Active post changed: ${oldIndex} -> ${scrollIndex}`);

            // Handle video playback
            this.pauseAllVideos();
            this.playCurrentVideo();
        }

        // Render visible posts
        this.renderVisiblePosts();

        // Preload more posts when near the end
        if (this.currentIndex >= this.posts.length - 10 && this.after && !this.isLoading) {
            console.log(`[SCROLL] Near end (post ${this.currentIndex}/${this.posts.length}), preloading...`);
            this.fetchPosts();
        }
    }

    async loadSubreddit() {
        const subreddit = this.subredditInput.value.trim() || 'pics';
        this.currentSubreddit = subreddit;
        this.after = null;
        this.posts = [];
        this.currentIndex = 0;

        // Clear container but keep spacer
        this.container.querySelectorAll('.post').forEach(post => post.remove());
        this.container.scrollTop = 0;

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

            // Update virtual scroll spacer
            this.updateSpacerHeight();

            // Render visible posts
            this.renderVisiblePosts();

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
        // Be permissive - show all posts that have any kind of media URL
        // This includes images, videos, gifs, galleries, and external links

        // Skip text-only self posts
        if (post.is_self && !post.thumbnail) {
            return false;
        }

        // Accept anything with a URL, preview, media, or gallery
        const hasUrl = post.url && post.url !== post.permalink;
        const hasPreview = post.preview?.images?.length > 0;
        const hasMedia = post.media || post.secure_media;
        const hasGallery = post.is_gallery && post.gallery_data;
        const hasThumbnail = post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default';

        return Boolean(hasUrl || hasPreview || hasMedia || hasGallery || hasThumbnail);
    }

    renderVisiblePosts() {
        // Prevent concurrent renders
        if (this.isRendering) {
            return;
        }

        this.isRendering = true;

        try {
            const { startIndex, endIndex } = this.getVisibleRange();

            // Track which posts should be visible
            const visibleIndices = new Set();
            for (let i = startIndex; i <= endIndex; i++) {
                visibleIndices.add(i);
            }

            // Remove posts that are out of range
            const existingPosts = this.container.querySelectorAll('.post');
            existingPosts.forEach(post => {
                const postIndex = parseInt(post.id.split('-')[1], 10);
                if (!visibleIndices.has(postIndex)) {
                    post.remove();
                }
            });

            // Create missing posts in range
            let postsCreated = 0;
            for (let i = startIndex; i <= endIndex; i++) {
                if (!document.getElementById(`post-${i}`)) {
                    this.createPostElement(this.posts[i], i);
                    postsCreated++;
                }
            }

            if (postsCreated > 0) {
                console.log(`[RENDER] Created ${postsCreated} new posts (${startIndex}-${endIndex})`);
            }
        } finally {
            this.isRendering = false;
        }
    }

    createPostElement(post, index) {
        const postEl = document.createElement('div');
        postEl.id = `post-${index}`;
        postEl.className = 'post';

        // Position absolutely at calculated offset for virtual scrolling
        const topOffset = index * this.itemHeight;
        postEl.style.position = 'absolute';
        postEl.style.top = `${topOffset}px`;
        postEl.style.left = '0';
        postEl.style.width = '100%';
        postEl.style.height = `${this.itemHeight}px`;

        // Create media wrapper
        const mediaWrapper = document.createElement('div');
        mediaWrapper.className = 'media-wrapper';

        // Handle different media types
        if (post.is_gallery && post.gallery_data) {
            mediaWrapper.appendChild(this.createGallery(post));
        } else if (post.is_video || (post.media?.reddit_video) || (post.secure_media?.reddit_video)) {
            mediaWrapper.appendChild(this.createVideo(post));
        } else if (post.url?.match(/\.(gifv?)$/i)) {
            // Handle GIFV and GIF URLs (convert gifv to video)
            const gifUrl = post.url.replace(/\.gifv$/i, '.mp4');
            if (post.url.endsWith('.gifv')) {
                mediaWrapper.appendChild(this.createGifVideo(gifUrl));
            } else {
                this.createImage(post, mediaWrapper);
            }
        } else {
            // Default to image rendering (handles static images and animated gifs)
            this.createImage(post, mediaWrapper);
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

        // Append to container (order doesn't matter with absolute positioning)
        this.container.appendChild(postEl);

        console.log(`[CREATE] Post ${index} created at ${topOffset}px`);
    }

    createImage(post, mediaWrapper) {
        // Create loading spinner - positioned relative to mediaWrapper
        const spinner = document.createElement('div');
        spinner.className = 'image-loading';
        mediaWrapper.appendChild(spinner);

        // Try to get the best quality image URL
        // Prefer GIF variant for animated content, otherwise use source
        let imageUrl;
        const previewImage = post.preview?.images?.[0];

        if (previewImage) {
            // Check if there's a GIF variant (for animated content)
            if (previewImage.variants?.gif?.source?.url) {
                imageUrl = previewImage.variants.gif.source.url.replace(/&amp;/g, '&');
            } else if (previewImage.variants?.mp4?.source?.url) {
                // Some GIFs are provided as MP4, use video element
                const videoUrl = previewImage.variants.mp4.source.url.replace(/&amp;/g, '&');
                mediaWrapper.appendChild(this.createGifVideo(videoUrl));
                spinner.remove();
                return;
            } else {
                imageUrl = previewImage.source?.url?.replace(/&amp;/g, '&');
            }
        }

        // Fallback to post URL
        if (!imageUrl) {
            imageUrl = post.url;
        }

        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = post.title;
        img.loading = 'lazy';

        // Hide spinner and show image when loaded
        const handleLoad = () => {
            spinner.remove();
            img.classList.add('loaded');
        };

        img.onload = handleLoad;
        img.onerror = handleLoad;

        mediaWrapper.appendChild(img);
    }

    createVideo(post) {
        const video = document.createElement('video');
        Object.assign(video, {
            autoplay: true,
            loop: true,
            muted: true,
            playsInline: true,
            controls: false
        });

        const source = document.createElement('source');
        // Use optional chaining and nullish coalescing
        source.src = post.media?.reddit_video?.fallback_url ?? post.secure_media?.reddit_video?.fallback_url ?? '';
        source.type = 'video/mp4';
        video.appendChild(source);

        // Play video when it becomes active
        video.addEventListener('loadeddata', () => {
            const postId = video.closest('.post')?.id;
            const postIndex = postId ? parseInt(postId.split('-')[1]) : -1;

            if (this.currentIndex === postIndex) {
                video.play().catch(({ name, message }) => {
                    console.error(`[VIDEO AUTOPLAY ERROR]
Error: ${name} - ${message}
Video Source: ${source.src}
Post Index: ${this.currentIndex}
Possible causes:
  • Browser autoplay policy (user interaction required)
  • Video codec not supported
  • CORS restrictions on video source
  • Video file corrupted or unavailable`);
                });
            }
        });

        return video;
    }

    createGifVideo(videoUrl) {
        // Create video element for GIFV/MP4 files (like Imgur gifv)
        const video = document.createElement('video');
        Object.assign(video, {
            autoplay: true,
            loop: true,
            muted: true,
            playsInline: true,
            controls: false
        });

        const source = document.createElement('source');
        source.src = videoUrl;
        source.type = 'video/mp4';
        video.appendChild(source);

        // Play video when it becomes active
        video.addEventListener('loadeddata', () => {
            const postId = video.closest('.post')?.id;
            const postIndex = postId ? parseInt(postId.split('-')[1]) : -1;

            if (this.currentIndex === postIndex) {
                video.play().catch((err) => {
                    console.error(`[GIF VIDEO AUTOPLAY ERROR]: ${err.message}`);
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

        const { items: galleryData } = post.gallery_data;
        const { media_metadata: mediaMetadata } = post;

        let currentSlide = 0;

        galleryData.forEach((item, idx) => {
            const slide = document.createElement('div');
            slide.className = 'gallery-slide';
            slide.style.position = 'relative';

            const media = mediaMetadata?.[item.media_id];
            if (media?.s) {
                // Create loading spinner
                const spinner = document.createElement('div');
                spinner.className = 'image-loading';
                slide.appendChild(spinner);

                const img = document.createElement('img');
                img.src = media.s.u?.replace(/&amp;/g, '&') ?? media.s.gif;
                img.alt = `Gallery image ${idx + 1}`;
                img.loading = 'lazy';

                // Hide spinner and show image when loaded
                const handleLoad = () => {
                    spinner.remove();
                    img.classList.add('loaded');
                };

                img.onload = handleLoad;
                img.onerror = handleLoad;

                slide.appendChild(img);
            }

            gallerySlides.appendChild(slide);
        });

        galleryContainer.appendChild(gallerySlides);

        // Add gallery navigation dots and counter for multiple images
        if (galleryData.length > 1) {
            // Add counter indicator
            const galleryCounter = document.createElement('div');
            galleryCounter.className = 'gallery-counter';
            galleryCounter.textContent = `1/${galleryData.length}`;
            galleryContainer.appendChild(galleryCounter);

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
            const handleTouchStart = (e) => {
                galleryTouchStartX = e.touches[0].clientX;
            };

            const handleTouchEnd = (e) => {
                const galleryTouchEndX = e.changedTouches[0].clientX;
                const diff = galleryTouchStartX - galleryTouchEndX;
                const SWIPE_THRESHOLD = 50;

                if (Math.abs(diff) > SWIPE_THRESHOLD) {
                    if (diff > 0 && currentSlide < galleryData.length - 1) {
                        currentSlide++;
                    } else if (diff < 0 && currentSlide > 0) {
                        currentSlide--;
                    }

                    gallerySlides.style.transform = `translateX(-${currentSlide * 100}%)`;
                    galleryCounter.textContent = `${currentSlide + 1}/${galleryData.length}`;

                    // Update dots
                    galleryNav.querySelectorAll('.gallery-dot').forEach((dot, idx) => {
                        dot.classList.toggle('active', idx === currentSlide);
                    });
                }
            };

            galleryContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
            galleryContainer.addEventListener('touchend', handleTouchEnd, { passive: true });
        }

        return galleryContainer;
    }



    pauseAllVideos() {
        this.container.querySelectorAll('video').forEach(video => video.pause());
    }

    playCurrentVideo() {
        const currentPost = document.getElementById(`post-${this.currentIndex}`);
        const video = currentPost?.querySelector('video');

        if (video) {
            video.currentTime = 0;
            console.log(`[VIDEO] Attempting to play post ${this.currentIndex}`);
            video.play().catch(({ name, message }) => {
                const videoSource = video.src || video.querySelector('source')?.src || 'unknown';
                console.error(`[VIDEO PLAY ERROR]
Error: ${name} - ${message}
Post Index: ${this.currentIndex}
Video Source: ${videoSource}
Video Ready State: ${video.readyState} (0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA)
Video Network State: ${video.networkState} (0=NETWORK_EMPTY, 1=NETWORK_IDLE, 2=NETWORK_LOADING, 3=NETWORK_NO_SOURCE)
Video Duration: ${video.duration}s
Video Paused: ${video.paused}
Video Muted: ${video.muted}
Possible causes:
  • Browser autoplay policy blocking playback
  • Video not fully loaded (readyState < 3)
  • Video source URL invalid or inaccessible
  • CORS policy blocking video access
  • Video codec not supported by browser`);
            });
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
        document.querySelectorAll('.error-message').forEach(err => err.remove());

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
                if (!trimmed) return '';

                if (trimmed.startsWith('•')) {
                    return `<div class="error-bullet">${this.escapeHtml(trimmed)}</div>`;
                }

                if (trimmed.includes(':')) {
                    const [key, ...valueParts] = trimmed.split(':');
                    const value = valueParts.join(':');
                    return `<div class="error-line"><strong>${this.escapeHtml(key)}:</strong>${this.escapeHtml(value)}</div>`;
                }

                if (trimmed.startsWith('[') && trimmed.includes(']')) {
                    return `<div class="error-header">${this.escapeHtml(trimmed)}</div>`;
                }

                return `<div class="error-line">${this.escapeHtml(trimmed)}</div>`;
            })
            .join('');

        errorContent.innerHTML = formattedMessage;

        // Add stack trace if provided
        if (stackTrace) {
            const stackHeader = document.createElement('div');
            Object.assign(stackHeader, {
                className: 'error-header',
                textContent: 'STACK TRACE'
            });
            stackHeader.style.marginTop = '15px';
            errorContent.appendChild(stackHeader);

            const stackContainer = document.createElement('div');
            stackContainer.className = 'error-stack';

            // Format stack trace with line numbers
            stackTrace.split('\n').forEach((line, index) => {
                const stackLine = document.createElement('div');
                stackLine.className = 'error-stack-line';

                // Highlight function names and file paths
                let formattedLine = this.escapeHtml(line)
                    .replace(/at /g, '<span class="stack-at">at</span> ')
                    .replace(/at <span class="stack-at">at<\/span> ([^\s(]+)/g,
                        'at <span class="stack-at">at</span> <span class="stack-function">$1</span>')
                    .replace(/\(([^)]+):(\d+):(\d+)\)/g,
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
        copyBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(fullErrorText);
                copyBtn.innerHTML = '✓ Copied';
                setTimeout(() => copyBtn.innerHTML = '📋 Copy', 2000);
            } catch (err) {
                console.error('Failed to copy to clipboard:', err);
                copyBtn.innerHTML = '✗ Failed';
            }
        };
        errorEl.appendChild(copyBtn);

        document.body.appendChild(errorEl);

        console.error('[ERROR DISPLAYED TO USER]', message);
        if (stackTrace) {
            console.error('[STACK TRACE]', stackTrace);
        }

        // Auto-dismiss after 20 seconds for stack traces (up from 15s)
        const AUTO_DISMISS_MS = stackTrace ? 20000 : 15000;
        setTimeout(() => errorEl.remove(), AUTO_DISMISS_MS);
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

// Initialize app (defer script ensures DOM is ready)
const viewer = new RedditViewer();
// Expose to global scope if needed for debugging
window.redditViewer = viewer;
