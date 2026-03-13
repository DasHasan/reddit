# Reddit Media Viewer

A mobile-first web app that displays Reddit media posts in a vertical scrolling interface.

## Features

- 📱 **Mobile-First Design** - Optimized for touch interactions and mobile devices
- 🎥 **Media Only** - Displays images, videos, and gallery posts (filters out text posts)
- 👆 **Swipe Navigation** - Vertical swipe up/down to navigate between posts
- 🎬 **Auto-Playing Videos** - Videos auto-play with smooth transitions
- 🖼️ **Gallery Support** - Horizontal swipe for gallery posts with arrow navigation
- 🔗 **Embedded Content** - Support for YouTube, Twitter, and other embeddable links
- ⛶ **Fullscreen Mode** - Immersive fullscreen viewing with a single click
- ⚡ **Performance Optimized** - Lazy loading, DOM recycling, no external dependencies
- 🔄 **Infinite Scroll** - Automatically loads more posts as you browse
- 🎯 **Any Subreddit** - Enter any subreddit name to browse its media
- 🔖 **URL State** - Bookmark and share specific subreddits via URL parameters

## Usage

1. Open the app in your browser
2. Enter a subreddit name (e.g., "pics", "videos", "aww")
3. Click "Load" or press Enter
4. Swipe up/down to navigate between posts
5. For gallery posts:
   - Swipe left/right to view multiple images
   - Or use the arrow buttons on the sides

**Tip**: You can also load a specific subreddit directly by adding `?r=subreddit` to the URL (e.g., `?r=videos`). The URL updates as you search, so you can bookmark or share specific subreddits.

### Keyboard Navigation (Desktop)

- ⬆️ Arrow Up - Previous post
- ⬇️ Arrow Down - Next post

## Tech Stack

- Pure Vanilla JavaScript (no frameworks)
- CSS3 with mobile-first responsive design
- Reddit JSON API via Cloudflare Worker proxy

## How It Works

The app fetches posts through a Cloudflare Worker proxy that forwards requests to Reddit's public JSON API:
```
https://www.reddit.com/r/{subreddit}.json
```

It filters posts to show only media content:
- Images (direct links, i.redd.it, imgur, animated GIFs)
- Videos (Reddit hosted videos, GIFV)
- Gallery posts (multiple images)
- Embedded content (YouTube, Twitter, etc.)

The current subreddit is stored in the URL (`?r=subreddit`) so you can bookmark, share, or reload with the same subreddit.

## Performance

- **Lazy Loading** - Images/videos load only when needed
- **DOM Recycling** - Removes posts that are far from the current view
- **Minimal Dependencies** - No external libraries, pure vanilla JS
- **Optimized Transitions** - Hardware-accelerated CSS transforms

## GitHub Pages Deployment

To deploy this to GitHub Pages:

1. Go to your repository Settings
2. Navigate to "Pages" in the sidebar
3. Under "Source", select "GitHub Actions"
4. The workflow will automatically deploy on push to the branch

The site will be available at: `https://{username}.github.io/{repo-name}/`

## Local Development

Simply open `index.html` in a web browser, or use a local server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx http-server

# Using PHP
php -S localhost:8000
```

Then visit `http://localhost:8000`

## Browser Support

- Modern mobile browsers (iOS Safari, Chrome, Firefox)
- Desktop browsers with touch event support
- Keyboard navigation for desktop testing

## License

MIT
