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

    async fetchPosts() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading();

        try {
            const url = this.after
                ? `https://www.reddit.com/r/${this.currentSubreddit}.json?limit=50&after=${this.after}`
                : `https://www.reddit.com/r/${this.currentSubreddit}.json?limit=50`;

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Subreddit not found or unavailable`);
            }

            const data = await response.json();
            this.after = data.data.after;

            // Filter media posts only
            const mediaPosts = data.data.children
                .map(child => child.data)
                .filter(post => this.isMediaPost(post));

            if (mediaPosts.length === 0) {
                this.showError('No media posts found in this subreddit');
                this.hideLoading();
                this.isLoading = false;
                return;
            }

            this.posts = [...this.posts, ...mediaPosts];
            this.renderPosts();
            this.hideLoading();

        } catch (error) {
            console.error('Error fetching posts:', error);
            this.showError(error.message);
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
                video.play().catch(e => console.log('Video autoplay failed:', e));
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
                video.play().catch(e => console.log('Video play failed:', e));
            }
        }
    }

    showLoading() {
        this.loading.classList.add('active');
    }

    hideLoading() {
        this.loading.classList.remove('active');
    }

    showError(message) {
        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.textContent = message;
        document.body.appendChild(errorEl);

        setTimeout(() => {
            errorEl.remove();
        }, 3000);
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
