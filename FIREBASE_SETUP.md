# Firebase Hosting Setup for reddit-33e2e

This project has been configured for Firebase Hosting with the project ID: **reddit-33e2e**

## Configuration Files

The following files have been created:
- `.firebaserc` - Firebase project configuration (points to reddit-33e2e)
- `firebase.json` - Hosting configuration
- `.gitignore` - Ignores Firebase cache and debug files

## How to Deploy

### 1. Authenticate with Firebase

Run the following command to log in to Firebase:
```bash
firebase login
```

This will open a browser window where you can authenticate with your Google account.

### 2. Verify Project Configuration

Check that you're connected to the correct project:
```bash
firebase projects:list
firebase use
```

### 3. Test Locally (Optional)

Test your site locally before deploying:
```bash
firebase serve
```

Then open http://localhost:5000 in your browser.

### 4. Deploy to Firebase Hosting

Deploy your site:
```bash
firebase deploy
```

Or deploy only hosting:
```bash
firebase deploy --only hosting
```

### 5. Access Your Deployed Site

After deployment, your site will be available at:
- https://reddit-33e2e.web.app
- https://reddit-33e2e.firebaseapp.com

## Firebase Hosting Configuration

The `firebase.json` file is configured to:
- Serve files from the current directory (`.`)
- Ignore Firebase-specific files, hidden files, and node_modules
- Rewrite all requests to `index.html` (SPA support)

## Continuous Deployment

For automatic deployments, you can set up GitHub Actions or use Firebase Hosting with GitHub integration.

## Troubleshooting

If you encounter issues:
1. Make sure you're logged in: `firebase login`
2. Verify you're using the correct project: `firebase use reddit-33e2e`
3. Check Firebase Console: https://console.firebase.google.com/project/reddit-33e2e
4. View deployment logs: `firebase deploy --debug`
