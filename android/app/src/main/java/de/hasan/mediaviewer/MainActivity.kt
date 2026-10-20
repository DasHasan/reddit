package de.hasan.mediaviewer

import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.net.http.HttpResponseCache
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import android.window.OnBackInvokedDispatcher
import java.io.File
import java.util.concurrent.Executors

class MainActivity : Activity(), PageHost {
    override lateinit var images: ImageLoader
    override var muted = false
    override var uiVisible = true

    private val network = Executors.newSingleThreadExecutor()
    private val client = RedditClient { Credentials.load(this) }

    private lateinit var pager: SnapPager<PostPage>
    private lateinit var topBar: LinearLayout
    private lateinit var input: EditText
    private lateinit var muteButton: TextView
    private lateinit var loading: ProgressBar
    private lateinit var sidebar: MultiSidebar

    private val posts = ArrayList<Post>()
    private var path = "pics"
    private var after: String? = null
    private var isLoading = false
    private var generation = 0
    private val history = ArrayDeque<String>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val metrics = resources.displayMetrics
        PostParser.targetWidth = metrics.widthPixels
        images = ImageLoader(metrics.widthPixels, metrics.heightPixels)
        // Disk cache for images and listings; queued first so it is in place before any fetch
        network.execute { HttpResponseCache.install(File(cacheDir, "http"), 50L * 1024 * 1024) }

        buildUi()
        enterImmersive()

        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { goBack() }
        }

        path = getPreferences(MODE_PRIVATE).getString("path", "pics") ?: "pics"
        input.setText(path)
        if (Credentials.exists(this)) load(path, remember = false) else showCredentialsDialog()
    }

    // ---- UI ---------------------------------------------------------------

    private fun buildUi() {
        val root = FrameLayout(this)
        pager = SnapPager(this, vertical = true)
        pager.adapter = object : SnapPager.Adapter<PostPage> {
            override val count get() = posts.size
            override fun create(index: Int) = PostPage(this@MainActivity, this@MainActivity, posts[index])
        }
        pager.onPageChanged = { if (it >= posts.size - 10) fetchMore() }
        root.addView(pager, matchParent())

        topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(4), dp(8), dp(8), dp(24))
            background = scrim(GradientDrawable.Orientation.TOP_BOTTOM)
        }
        input = EditText(this).apply {
            hint = "Subreddit, r/a+b, u/user oder user/x/m/multi"
            setTextColor(Color.WHITE)
            setHintTextColor(0x99FFFFFF.toInt())
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            isSingleLine = true
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            imeOptions = EditorInfo.IME_ACTION_GO
            background = roundedRect(0x55FFFFFF, 20)
            setPadding(dp(16), dp(10), dp(16), dp(10))
            setOnEditorActionListener { _, action, event ->
                if (action == EditorInfo.IME_ACTION_GO || event?.keyCode == KeyEvent.KEYCODE_ENTER) {
                    submit(text.toString())
                    true
                } else false
            }
        }
        topBar.addView(barButton("☰") { openSidebar() })
        topBar.addView(input, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        loading = ProgressBar(this).apply { visibility = View.GONE }
        topBar.addView(loading, LinearLayout.LayoutParams(dp(28), dp(28)).apply { leftMargin = dp(8) })
        muteButton = barButton("🔊") { toggleMute() }
        topBar.addView(muteButton)
        topBar.addView(barButton("⚙") { showCredentialsDialog() })
        root.addView(topBar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP))
        sidebar = MultiSidebar(this, onUser = { loadMultis(it) }, onPick = { load(it) })
        root.addView(sidebar, matchParent())

        // Keep the bar clear of the camera cutout even though system bars are hidden
        root.setOnApplyWindowInsetsListener { _, insets ->
            val top = insets.getInsetsIgnoringVisibility(WindowInsets.Type.statusBars() or WindowInsets.Type.displayCutout()).top
            topBar.setPadding(dp(4), top + dp(4), dp(8), dp(24))
            sidebar.setTopInset(top)
            insets
        }
        setContentView(root)
        // Keep focus (and the blinking cursor) out of the search field until it is tapped
        root.isFocusableInTouchMode = true
        root.requestFocus()
    }

    private fun barButton(label: String, onClick: () -> Unit) = TextView(this).apply {
        text = label
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
        gravity = Gravity.CENTER
        setPadding(dp(10), dp(6), dp(10), dp(6))
        setOnClickListener { onClick() }
    }

    private fun enterImmersive() {
        window.insetsController?.let {
            it.hide(WindowInsets.Type.systemBars())
            it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersive()
    }

    override fun toggleUi() {
        uiVisible = !uiVisible
        topBar.fade(uiVisible)
        pager.livePages.forEach { it.setUiVisible(uiVisible) }
    }

    private fun toggleMute() {
        muted = !muted
        muteButton.text = if (muted) "🔇" else "🔊"
        pager.livePages.forEach { it.applyMute() }
    }

    // ---- loading ----------------------------------------------------------

    override fun openPath(path: String) = load(path)

    override fun openUrl(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (e: ActivityNotFoundException) {
            toast("Keine App zum Öffnen gefunden")
        }
    }

    /** Typed input: a bare user opens their multireddits in the sidebar, anything else loads directly. */
    private fun submit(rawInput: String) {
        val user = RedditClient.bareUser(RedditClient.normalize(rawInput)) ?: return load(rawInput)
        input.setText(path)
        input.clearFocus()
        getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(input.windowToken, 0)
        sidebar.open()
        loadMultis(user)
    }

    /** Opens the sidebar, showing the multis of the user looked up last. */
    private fun openSidebar() {
        sidebar.open()
        if (sidebar.user == null) getPreferences(MODE_PRIVATE).getString("multiUser", null)?.let { loadMultis(it) }
    }

    private fun loadMultis(user: String) {
        getPreferences(MODE_PRIVATE).edit().putString("multiUser", user).apply()
        sidebar.showLoading(user)
        network.execute {
            val result = runCatching { client.multis(user) }
            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                result.onSuccess { sidebar.showMultis(user, it) }
                    .onFailure { sidebar.showError(user, it.message ?: "Fehler beim Laden") }
            }
        }
    }

    private fun load(rawInput: String, remember: Boolean = true) {
        val next = RedditClient.normalize(rawInput)
        if (remember && posts.isNotEmpty() && next != path) history.addLast(path)
        path = next
        input.setText(next)
        input.clearFocus()
        getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(input.windowToken, 0)
        getPreferences(MODE_PRIVATE).edit().putString("path", next).apply()

        generation++
        posts.clear()
        after = null
        isLoading = false
        pager.reset()
        fetchMore()
    }

    private fun fetchMore(emptyPagesInARow: Int = 0) {
        if (isLoading || (posts.isNotEmpty() && after == null)) return
        isLoading = true
        loading.visibility = View.VISIBLE
        val requestGeneration = generation
        val apiPath = RedditClient.apiPath(path)
        val cursor = after

        network.execute {
            val result = runCatching { client.listing(apiPath, cursor) }
            runOnUiThread {
                // A newer load() replaced this feed, or the activity is gone
                if (requestGeneration != generation) return@runOnUiThread
                isLoading = false
                loading.visibility = View.GONE
                result.onSuccess { listing ->
                    after = listing.after
                    if (listing.posts.isNotEmpty()) {
                        posts.addAll(listing.posts)
                        pager.dataChanged()
                    } else if (listing.after != null && emptyPagesInARow < 3) {
                        // Page held only text posts; keep looking a little further
                        fetchMore(emptyPagesInARow + 1)
                    } else if (posts.isEmpty()) {
                        toast(if (listing.rawCount == 0) "r/$path ist leer oder existiert nicht" else "Keine Medien-Posts in r/$path")
                    }
                }.onFailure { error ->
                    if (error is ApiException && error.code == 401 && Credentials.load(this) == null) {
                        showCredentialsDialog()
                    } else {
                        toast(error.message ?: "Fehler beim Laden")
                    }
                }
            }
        }
    }

    // ---- credentials ------------------------------------------------------

    /** Asks for the Reddit app credentials and reloads the feed once they are saved. */
    private fun showCredentialsDialog() {
        val existing = Credentials.load(this)
        val clientId = EditText(this).apply {
            hint = "Client-ID"
            isSingleLine = true
            setText(existing?.clientId ?: "ZWMBdEoS-OrErw")
        }
        val secret = EditText(this).apply {
            hint = if (existing != null) "Secret (leer = unverändert)" else "Secret"
            isSingleLine = true
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        val form = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), 0)
            addView(TextView(context).apply {
                text = "Daten der Reddit-App (personal use script). Sie werden verschlüsselt nur auf diesem Gerät gespeichert."
                setPadding(0, 0, 0, dp(8))
            })
            addView(clientId)
            addView(secret)
        }
        AlertDialog.Builder(this)
            .setTitle("Reddit-Zugang")
            .setView(form)
            .setCancelable(existing != null)
            .setPositiveButton("Speichern") { _, _ ->
                val id = clientId.text.toString().trim()
                val s = secret.text.toString().trim().ifEmpty { existing?.secret.orEmpty() }
                if (id.isEmpty() || s.isEmpty()) {
                    toast("Client-ID und Secret werden benötigt")
                    showCredentialsDialog()
                    return@setPositiveButton
                }
                Credentials.save(this, Credentials.Pair(id, s))
                load(path, remember = false)
            }
            .apply { if (existing != null) setNegativeButton("Abbrechen", null) }
            .show()
    }

    // ---- lifecycle --------------------------------------------------------

    private fun goBack() {
        if (sidebar.isOpen) return sidebar.close()
        val previous = history.removeLastOrNull()
        if (previous != null) load(previous, remember = false) else finish()
    }

    @Deprecated("Used below API 33 only")
    override fun onBackPressed() = goBack()

    override fun onPause() {
        super.onPause()
        pager.pause()
    }

    override fun onResume() {
        super.onResume()
        pager.resume()
    }

    override fun onDestroy() {
        // Drops results of requests still in flight
        generation++
        pager.clear()
        images.shutdown()
        network.shutdownNow()
        HttpResponseCache.getInstalled()?.flush()
        super.onDestroy()
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}
