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
        this.uiVisible = true; // Track UI visibility state

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
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.redditBtn = document.getElementById('redditBtn');
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

        // Fullscreen toggle
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());

        // Reddit button - open current post on Reddit
        this.redditBtn.addEventListener('click', () => this.openCurrentPostOnReddit());

        // Listen for fullscreen changes (including keyboard shortcuts like F11, ESC)
        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement) {
                console.log('[FULLSCREEN] Fullscreen activated (via any method)');
            } else {
                console.log('[FULLSCREEN] Fullscreen deactivated (via any method)');
            }
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

        // Handle window resize (including fullscreen changes)
        window.addEventListener('resize', () => {
            const oldHeight = this.itemHeight;
            this.itemHeight = window.innerHeight;

            console.log(`[RESIZE] Viewport height changed: ${oldHeight}px -> ${this.itemHeight}px`);

            // Update spacer for new total height
            this.updateSpacerHeight();

            // Update all existing posts' heights and positions
            this.updateAllPostDimensions();

            // Re-render visible posts with new dimensions
            this.renderVisiblePosts();

            // Maintain scroll position to current post
            const targetScrollTop = this.currentIndex * this.itemHeight;
            this.container.scrollTop = targetScrollTop;
        });

        // Hide nav hint after 3 seconds
        setTimeout(() => {
            if (this.navHint) this.navHint.style.display = 'none';
        }, 3000);

        // Load subreddit from URL parameter or default
        const urlParams = new URLSearchParams(window.location.search);
        const subredditFromUrl = urlParams.get('r');
        if (subredditFromUrl) {
            this.subredditInput.value = subredditFromUrl;
            console.log(`[INIT] Loading subreddit from URL: r/${subredditFromUrl}`);
        }

        this.loadSubreddit();
    }

    toggleUI() {
        this.uiVisible = !this.uiVisible;
        document.body.classList.toggle('ui-hidden', !this.uiVisible);
        console.log(`[UI] UI ${this.uiVisible ? 'shown' : 'hidden'}`);
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            // Enter fullscreen
            document.documentElement.requestFullscreen().then(() => {
                console.log('[FULLSCREEN] Entered fullscreen mode');
                this.fullscreenBtn.innerHTML = '⛶'; // Keep same icon or change to exit icon
            }).catch((err) => {
                console.error(`[FULLSCREEN] Error entering fullscreen: ${err.message}`);
            });
        } else {
            // Exit fullscreen
            document.exitFullscreen().then(() => {
                console.log('[FULLSCREEN] Exited fullscreen mode');
                this.fullscreenBtn.innerHTML = '⛶';
            }).catch((err) => {
                console.error(`[FULLSCREEN] Error exiting fullscreen: ${err.message}`);
            });
        }
    }

    openCurrentPostOnReddit() {
        const currentPost = this.posts[this.currentIndex];
        if (currentPost && currentPost.permalink) {
            const redditUrl = `https://www.reddit.com${currentPost.permalink}`;
            window.open(redditUrl, '_blank');
            console.log(`[REDDIT] Opening post on Reddit: ${redditUrl}`);
        } else {
            console.warn('[REDDIT] No post available to open');
        }
    }

    updateSpacerHeight() {
        // Set virtual scroll height based on total posts
        const totalHeight = this.posts.length * this.itemHeight;
        this.spacer.style.height = `${totalHeight}px`;
        console.log(`[VIRTUAL] Spacer height: ${totalHeight}px for ${this.posts.length} posts`);
    }

    updateAllPostDimensions() {
        // Update dimensions and positions of all existing posts in DOM
        const existingPosts = this.container.querySelectorAll('.post');
        let updatedCount = 0;

        existingPosts.forEach(postEl => {
            const index = parseInt(postEl.id.split('-')[1], 10);
            if (!isNaN(index)) {
                const topOffset = index * this.itemHeight;
                postEl.style.top = `${topOffset}px`;
                postEl.style.height = `${this.itemHeight}px`;
                postEl.style.minHeight = `${this.itemHeight}px`;
                postEl.style.maxHeight = `${this.itemHeight}px`;
                updatedCount++;
            }
        });

        console.log(`[RESIZE] Updated dimensions for ${updatedCount} posts`);
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

    parseSubredditInput(input) {
        // Trim and default to 'pics' if empty
        const trimmed = input.trim() || 'pics';

        // Handle full Reddit URLs
        const urlPatterns = [
            // Multi-reddit: /user/username/m/multiredditname
            /(?:https?:\/\/)?(?:www\.)?reddit\.com\/(user\/[^\/]+\/m\/[^\/\?#]+)/i,
            // Subreddit(s): /r/subreddit or /r/sub1+sub2
            /(?:https?:\/\/)?(?:www\.)?reddit\.com\/r\/([^\/\?#]+)/i,
        ];

        for (const pattern of urlPatterns) {
            const match = trimmed.match(pattern);
            if (match) {
                return match[1];
            }
        }

        // Handle direct multi-reddit path: user/username/m/multiredditname
        if (/^user\/[^\/]+\/m\/[^\/]+$/i.test(trimmed)) {
            return trimmed;
        }

        // Handle subreddit with r/ prefix: r/pics or r/pics+earthporn
        if (trimmed.startsWith('r/')) {
            return trimmed.substring(2);
        }

        // Handle plain subreddit(s): pics or pics+earthporn+wallpapers
        return trimmed;
    }

    async loadSubreddit() {
        const input = this.subredditInput.value.trim() || 'pics';
        const subreddit = this.parseSubredditInput(input);
        this.currentSubreddit = subreddit;
        this.after = null;
        this.posts = [];
        this.currentIndex = 0;

        // Update URL parameter
        const url = new URL(window.location);
        url.searchParams.set('r', subreddit);
        window.history.pushState({}, '', url);
        console.log(`[URL] Updated URL to include r/${subreddit}`);

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
            // Handle multi-reddit paths (user/username/m/multiredditname) vs regular subreddits
            const pathPrefix = this.currentSubreddit.startsWith('user/') ? '/' : '/r/';
            const redditUrl = this.after
                ? `${this.redditApiBase}${pathPrefix}${this.currentSubreddit}.json?limit=50&after=${this.after}`
                : `${this.redditApiBase}${pathPrefix}${this.currentSubreddit}.json?limit=50`;

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
                        `Path: ${this.currentSubreddit}\n` +
                        `Duration: ${requestDuration}ms\n` +
                        `Possible causes: Slow network, server not responding, or rate limiting`;
                    console.error(errorMsg);
                    throw new Error(errorMsg);
                } else {
                    const errorMsg = `[JSONP ERROR]\n` +
                        `Failed to load data via JSONP\n` +
                        `Error: ${jsonpError.message}\n` +
                        `URL: ${redditUrl}\n` +
                        `Path: ${this.currentSubreddit}\n` +
                        `Duration: ${requestDuration}ms\n` +
                        `Possible causes:\n` +
                        `  • Reddit servers are down\n` +
                        `  • Subreddit/multi-reddit doesn't exist\n` +
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
                    `Path: ${this.currentSubreddit}\n` +
                    `This indicates the subreddit/multi-reddit may not exist or the Reddit API response format has changed`;
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

        // Log the full Reddit post object for debugging
        console.log(`[POST ${index}] Full Reddit post object:`, post);

        // Position absolutely at calculated offset for virtual scrolling
        const topOffset = index * this.itemHeight;
        postEl.style.position = 'absolute';
        postEl.style.top = `${topOffset}px`;
        postEl.style.left = '0';
        postEl.style.right = '0';
        postEl.style.width = '100%';
        postEl.style.height = `${this.itemHeight}px`;
        postEl.style.minHeight = `${this.itemHeight}px`;
        postEl.style.maxHeight = `${this.itemHeight}px`;
        postEl.style.overflow = 'hidden';

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
        } else if (this.isEmbeddableUrl(post)) {
            // Handle external embeddable URLs (YouTube, Twitter, etc.) or posts with embed data
            mediaWrapper.appendChild(this.createEmbed(post));
        } else {
            // Default to image rendering (handles static images and animated gifs)
            this.createImage(post, mediaWrapper);
        }

        postEl.appendChild(mediaWrapper);

        // Add tap overlay to prevent videos/iframes from stealing tap events
        const tapOverlay = document.createElement('div');
        tapOverlay.className = 'tap-overlay';
        mediaWrapper.appendChild(tapOverlay);

        // Add post info overlay
        const postInfo = document.createElement('div');
        postInfo.className = 'post-info';

        const postTitle = document.createElement('div');
        postTitle.className = 'post-title';
        postTitle.textContent = post.title;

        const postMeta = document.createElement('div');
        postMeta.className = 'post-meta';

        // Upvotes
        const upvotes = document.createElement('span');
        upvotes.textContent = `👍 ${this.formatNumber(post.ups)}`;
        postMeta.appendChild(upvotes);

        // Comments
        const comments = document.createElement('span');
        comments.textContent = `💬 ${this.formatNumber(post.num_comments)}`;
        postMeta.appendChild(comments);

        // Clickable username
        const username = document.createElement('span');
        username.className = 'username-link';
        username.textContent = `u/${post.author}`;
        username.addEventListener('click', (e) => {
            e.stopPropagation();
            const userUrl = `${window.location.origin}${window.location.pathname}?r=user/${post.author}/submitted`;
            window.open(userUrl, '_blank');
        });
        postMeta.appendChild(username);

        // Clickable subreddit
        const subreddit = document.createElement('span');
        subreddit.className = 'subreddit-link';
        subreddit.textContent = `r/${post.subreddit}`;
        subreddit.addEventListener('click', (e) => {
            e.stopPropagation();
            const subredditUrl = `${window.location.origin}${window.location.pathname}?r=${post.subreddit}`;
            window.open(subredditUrl, '_blank');
        });
        postMeta.appendChild(subreddit);

        postInfo.appendChild(postTitle);
        postInfo.appendChild(postMeta);
        postEl.appendChild(postInfo);

        // Add tap/click to toggle UI
        postEl.addEventListener('click', (e) => {
            // Don't toggle if clicking on gallery nav, embeds, or other interactive elements
            if (e.target.closest('.gallery-nav') ||
                e.target.closest('.gallery-counter') ||
                e.target.closest('.gallery-arrow') ||
                e.target.closest('.embed-container') ||
                e.target.closest('.embed-link') ||
                e.target.closest('.username-link') ||
                e.target.closest('.subreddit-link')) {
                return;
            }
            this.toggleUI();
        });

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
        let mediaType = 'static image';
        const previewImage = post.preview?.images?.[0];

        if (previewImage) {
            // Check if there's a GIF variant (for animated content)
            if (previewImage.variants?.gif?.source?.url) {
                imageUrl = previewImage.variants.gif.source.url.replace(/&amp;/g, '&');
                mediaType = 'animated GIF';
            } else if (previewImage.variants?.mp4?.source?.url) {
                // Some GIFs are provided as MP4, use video element
                const videoUrl = previewImage.variants.mp4.source.url.replace(/&amp;/g, '&');
                console.log(`[MEDIA] Loading animated GIF as MP4: ${videoUrl}`);
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

        console.log(`[MEDIA] Loading ${mediaType}: ${imageUrl}`);

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

        console.log(`[MEDIA] Loading Reddit video: ${source.src}`);

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
        console.log(`[MEDIA] Loading GIFV/MP4: ${videoUrl}`);

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

        console.log(`[MEDIA] Loading gallery with ${galleryData.length} images`);

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

            // Function to update gallery UI
            const updateGallery = () => {
                gallerySlides.style.transform = `translateX(-${currentSlide * 100}%)`;
                galleryCounter.textContent = `${currentSlide + 1}/${galleryData.length}`;

                // Update dots
                galleryNav.querySelectorAll('.gallery-dot').forEach((dot, idx) => {
                    dot.classList.toggle('active', idx === currentSlide);
                });
            };

            // Add navigation arrows
            const leftArrow = document.createElement('button');
            leftArrow.className = 'gallery-arrow gallery-arrow-left';
            leftArrow.innerHTML = '‹';
            leftArrow.setAttribute('aria-label', 'Previous image');
            leftArrow.addEventListener('click', (e) => {
                e.stopPropagation();
                currentSlide = currentSlide > 0 ? currentSlide - 1 : galleryData.length - 1;
                updateGallery();
            });

            const rightArrow = document.createElement('button');
            rightArrow.className = 'gallery-arrow gallery-arrow-right';
            rightArrow.innerHTML = '›';
            rightArrow.setAttribute('aria-label', 'Next image');
            rightArrow.addEventListener('click', (e) => {
                e.stopPropagation();
                currentSlide = currentSlide < galleryData.length - 1 ? currentSlide + 1 : 0;
                updateGallery();
            });

            galleryContainer.appendChild(leftArrow);
            galleryContainer.appendChild(rightArrow);

            // Initial arrow state
            updateGallery();

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
                    if (diff > 0) {
                        currentSlide = currentSlide < galleryData.length - 1 ? currentSlide + 1 : 0;
                    } else if (diff < 0) {
                        currentSlide = currentSlide > 0 ? currentSlide - 1 : galleryData.length - 1;
                    }

                    updateGallery();
                }
            };

            galleryContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
            galleryContainer.addEventListener('touchend', handleTouchEnd, { passive: true });
        }

        return galleryContainer;
    }

    isEmbeddableUrl(post) {
        // Check if Reddit provides embed data
        if (post.media_embed?.content || post.secure_media_embed?.content) {
            return true;
        }

        const url = post.url;
        if (!url) return false;

        // Skip if it's a direct image or video file
        if (url.match(/\.(jpg|jpeg|png|gif|gifv|webp|mp4|webm)$/i)) {
            return false;
        }

        // Skip Reddit internal links
        if (url.includes('reddit.com') || url.includes('redd.it')) {
            return false;
        }

        // Check for embeddable domains/patterns
        const embeddablePatterns = [
            /youtube\.com\/watch/i,
            /youtu\.be\//i,
            /vimeo\.com/i,
            /twitter\.com/i,
            /x\.com/i,
            /streamable\.com/i,
            /gfycat\.com/i,
            /imgur\.com\/(?!.*\.(jpg|jpeg|png|gif|gifv|webp)$)/i, // Imgur pages but not direct images
            /tiktok\.com/i,
            /instagram\.com/i,
            /soundcloud\.com/i,
            /spotify\.com/i,
            /twitch\.tv/i
        ];

        return embeddablePatterns.some(pattern => pattern.test(url));
    }

    extractEmbedSrc(encodedHtml) {
        // Extract src attribute from encoded HTML string
        // Example: '&lt;iframe src="https://..." ...' → 'https://...'

        // Match src="..." or src='...' in the encoded HTML
        const srcMatch = encodedHtml.match(/src=["']([^"']+)["']/);
        if (!srcMatch) return null;

        // Decode HTML entities in the URL (&amp; → &, etc.)
        const textarea = document.createElement('textarea');
        textarea.innerHTML = srcMatch[1];
        return textarea.value;
    }

    createEmbed(post) {
        const embedContainer = document.createElement('div');
        embedContainer.className = 'embed-container';

        // Prefer Reddit's embed data (media_embed or secure_media_embed)
        const embedData = post.secure_media_embed || post.media_embed;

        // Loading indicator
        const spinner = document.createElement('div');
        spinner.className = 'image-loading';
        embedContainer.appendChild(spinner);

        // Check if Reddit provides embed HTML
        if (embedData?.content) {
            console.log(`[MEDIA] Using Reddit embed data for: ${post.url}`);
            console.log(`[MEDIA] Raw embed content:`, embedData.content);

            // Extract just the src URL from the encoded iframe HTML
            const embedSrc = this.extractEmbedSrc(embedData.content);

            if (embedSrc) {
                console.log(`[MEDIA] Extracted embed src:`, embedSrc);

                // Create our own clean iframe with the extracted src
                const iframe = document.createElement('iframe');
                iframe.src = embedSrc;
                iframe.className = 'embed-frame';
                iframe.setAttribute('allowfullscreen', 'true');
                iframe.setAttribute('loading', 'lazy');
                iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
                iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');

                // Set dimensions if available
                if (embedData.width && embedData.height) {
                    const aspectRatio = (embedData.height / embedData.width) * 100;
                    embedContainer.style.paddingBottom = `${aspectRatio}%`;
                }

                iframe.addEventListener('load', () => {
                    spinner.remove();
                    console.log(`[MEDIA] Embedded content loaded successfully`);
                });

                iframe.addEventListener('error', () => {
                    spinner.remove();
                    this.showEmbedError(embedContainer, post.url);
                });

                embedContainer.appendChild(iframe);
            } else {
                console.warn(`[MEDIA] Could not extract src from embed content`);
                spinner.remove();
                this.showEmbedError(embedContainer, post.url);
            }
        } else {
            // Fallback to direct URL embedding
            console.log(`[MEDIA] No embed data available, using direct URL: ${post.url}`);

            const iframe = document.createElement('iframe');
            iframe.src = post.url;
            iframe.className = 'embed-frame';

            // Security and functionality attributes
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('loading', 'lazy');
            iframe.setAttribute('referrerpolicy', 'no-referrer');

            // Prevent scrolling within iframe
            iframe.setAttribute('scrolling', 'no');

            // Remove spinner when iframe loads
            iframe.addEventListener('load', () => {
                spinner.remove();
                console.log(`[MEDIA] Embedded content loaded: ${post.url}`);
            });

            // Handle loading errors
            iframe.addEventListener('error', () => {
                spinner.remove();
                this.showEmbedError(embedContainer, post.url);
            });

            embedContainer.appendChild(iframe);
        }

        return embedContainer;
    }

    showEmbedError(container, url) {
        container.innerHTML = `
            <div class="embed-error">
                <div class="embed-error-icon">🔗</div>
                <div class="embed-error-text">Unable to embed content</div>
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="embed-link">
                    Open in new tab
                </a>
            </div>
        `;
        console.warn(`[MEDIA] Failed to embed: ${url}`);
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
