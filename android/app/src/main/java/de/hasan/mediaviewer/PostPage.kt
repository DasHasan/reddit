package de.hasan.mediaviewer

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.icu.text.CompactDecimalFormat
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.SeekBar
import android.widget.TextView
import android.widget.VideoView
import java.util.Locale

/** Callbacks a page needs from the activity. */
interface PageHost {
    val images: ImageLoader
    val muted: Boolean
    val uiVisible: Boolean
    fun toggleUi()
    fun openPath(path: String)
    fun openUrl(url: String)
}

/** Something that only runs while its page is the visible one (video, web embed, gallery). */
interface Playable {
    fun preload() {}
    fun activate()
    fun deactivate()
    fun applyMute() {}
    fun release() = deactivate()
}

/** One full-screen post page in the feed. */
class PostPage(context: Context, private val host: PageHost, post: Post) : SnapPager.Page {
    override val view = FrameLayout(context)
    private val content: Item
    private val overlays = mutableListOf<View>()
    // Holds the controls of whichever video of this post is playing (also inside galleries)
    private val controlsSlot = FrameLayout(context)

    init {
        view.setBackgroundColor(Color.BLACK)
        view.onTap { host.toggleUi() }
        content = mediaItem(post.media)
        view.addView(content.view, matchParent())
        addInfo(post)
        if (!host.uiVisible) overlays.forEach {
            it.alpha = 0f
            it.visibility = View.INVISIBLE
        }
    }

    override fun preload() = content.preload()
    override fun activate() = content.activate()
    override fun deactivate() = content.deactivate()
    override fun release() = content.release()
    fun applyMute() = content.applyMute()
    fun setUiVisible(visible: Boolean) = overlays.forEach { it.fade(visible) }

    /** A media view plus whatever has to be started, stopped or cancelled with it. */
    private inner class Item(override val view: FrameLayout, private val image: ImageView?, private val playable: Playable?) : SnapPager.Page {
        override fun preload() {
            playable?.preload()
        }

        override fun activate() {
            playable?.activate()
        }

        override fun deactivate() {
            playable?.deactivate()
        }

        override fun release() {
            playable?.release()
            image?.let { host.images.cancel(it) }
        }

        fun applyMute() {
            playable?.applyMute()
        }
    }

    // ---- media ------------------------------------------------------------

    private fun mediaItem(media: Media): Item = when (media) {
        is Media.Image -> imageItem(media.url)
        is Media.Video -> imageItem(media.poster) { frame, poster -> VideoPlayable(frame, poster, media) }
        is Media.Embed -> imageItem(media.poster) { frame, _ -> EmbedPlayable(frame, media) }
        is Media.Link -> imageItem(media.thumbnail).also { item ->
            item.view.addView(Button(view.context).apply {
                text = "Link öffnen ↗"
                setOnClickListener { host.openUrl(media.url) }
            }, centered())
        }
        is Media.Gallery -> galleryItem(media)
    }

    /** Image with loading spinner; [playable] builds what runs on top of it (video, embed). */
    private fun imageItem(url: String?, playable: ((FrameLayout, ImageView) -> Playable)? = null): Item {
        val frame = FrameLayout(view.context)
        val spinner = spinner()
        val image = ImageView(view.context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
        frame.addView(image, matchParent())
        frame.addView(spinner, centered())
        if (url != null) {
            host.images.load(url, image) { spinner.visibility = View.GONE }
        } else {
            spinner.visibility = View.GONE
        }
        return Item(frame, image, playable?.invoke(frame, image))
    }

    /**
     * Prepared ahead of time by [preload] so it starts right away when its page
     * becomes current; [deactivate] only pauses, [release] frees the players.
     */
    private inner class VideoPlayable(private val frame: FrameLayout, private val poster: ImageView, private val media: Media.Video) : Playable {
        private var video: VideoView? = null
        private var spinner: View? = null
        private var audio: SeparateAudio? = null
        private var sourceIndex = 0
        private var active = false
        private var userPaused = false
        private var seeking = false
        private var focus: AudioFocusRequest? = null

        private val playButton = TextView(frame.context).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
            setPadding(0, context.dp(4), context.dp(12), context.dp(4))
            setOnClickListener { togglePlay() }
        }
        private val time = TextView(frame.context).apply {
            setTextColor(0xFFDDDDDD.toInt())
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        }
        private val seekBar = SeekBar(frame.context).apply {
            progressTintList = ColorStateList.valueOf(0xFFFFB38A.toInt())
            thumbTintList = ColorStateList.valueOf(0xFFFFB38A.toInt())
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(bar: SeekBar, progress: Int, fromUser: Boolean) {
                    if (fromUser) time.text = timeText(progress, bar.max)
                }

                override fun onStartTrackingTouch(bar: SeekBar) {
                    seeking = true
                }

                override fun onStopTrackingTouch(bar: SeekBar) {
                    seeking = false
                    seekTo(bar.progress)
                }
            })
        }
        private val controls = LinearLayout(frame.context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, context.dp(6), 0, 0)
            addView(playButton)
            addView(seekBar, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(time)
        }

        // VideoView has no loop callback, so the audio is re-synced on a timer
        private val followVideo = object : Runnable {
            override fun run() {
                val v = video ?: return
                if (!active) return
                audio?.follow(v.currentPosition, v.isPlaying)
                frame.postDelayed(this, 1000)
            }
        }

        private val updateProgress = object : Runnable {
            override fun run() {
                val v = video ?: return
                if (!active) return
                // -1 until prepared
                val duration = v.duration
                if (duration > 0 && !seeking) {
                    seekBar.max = duration
                    seekBar.progress = v.currentPosition
                    time.text = timeText(v.currentPosition, duration)
                }
                frame.postDelayed(this, 250)
            }
        }

        override fun preload() {
            if (video != null) return
            sourceIndex = 0
            val spinner = spinner().also { this.spinner = it }
            val view = VideoView(frame.context)
            // The file is silent and preloading must not pause the user's music;
            // focus is requested in activate() if there is separate audio
            view.setAudioFocusRequest(AudioManager.AUDIOFOCUS_NONE)
            view.setOnPreparedListener { mp ->
                mp.isLooping = true
                // The video file has no sound of its own; audio comes from SeparateAudio
                mp.setVolume(0f, 0f)
                frame.removeView(spinner)
                if (active && !userPaused) {
                    view.start()
                    syncNow()
                } else {
                    // Shows the first frame instead of an empty surface while swiping in
                    mp.seekTo(0)
                }
            }
            view.setOnInfoListener { _, what, _ ->
                if (what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START) {
                    poster.visibility = View.INVISIBLE
                    frame.removeView(spinner)
                }
                false
            }
            view.setOnErrorListener { _, _, _ ->
                sourceIndex++
                if (sourceIndex < media.sources.size) {
                    view.setVideoURI(Uri.parse(media.sources[sourceIndex]))
                } else {
                    frame.removeView(spinner)
                }
                true
            }
            frame.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER))
            frame.addView(spinner, centered())
            view.setVideoURI(Uri.parse(media.sources[sourceIndex]))
            video = view
            if (media.audio.isNotEmpty()) {
                audio = SeparateAudio(media.audio, ::syncNow).also { it.volume = volume() }
            }
        }

        override fun activate() {
            if (active) return
            active = true
            userPaused = false
            preload()
            // Before preparation finishes this only marks the video to start once prepared
            video?.start()
            updatePlayButton()
            time.text = ""
            seekBar.progress = 0
            controlsSlot.removeAllViews()
            controlsSlot.addView(controls)
            frame.post(updateProgress)
            if (media.audio.isNotEmpty()) {
                val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).build()
                frame.context.getSystemService(AudioManager::class.java).requestAudioFocus(request)
                focus = request
            }
            syncNow()
        }

        private fun syncNow() {
            frame.removeCallbacks(followVideo)
            followVideo.run()
        }

        override fun deactivate() {
            if (!active) return
            active = false
            frame.removeCallbacks(followVideo)
            frame.removeCallbacks(updateProgress)
            controlsSlot.removeView(controls)
            video?.pause()
            audio?.follow(0, videoPlaying = false)
            focus?.let { frame.context.getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }
            focus = null
        }

        override fun release() {
            deactivate()
            val view = video ?: return
            audio?.release()
            audio = null
            view.stopPlayback()
            frame.removeView(view)
            spinner?.let { frame.removeView(it) }
            poster.visibility = View.VISIBLE
            video = null
            spinner = null
        }

        private fun togglePlay() {
            val v = video ?: return
            userPaused = !userPaused
            if (userPaused) v.pause() else v.start()
            updatePlayButton()
            syncNow()
        }

        private fun updatePlayButton() {
            // U+FE0E asks for the plain glyph instead of an emoji
            playButton.text = if (userPaused) "▶︎" else "⏸︎"
        }

        private fun seekTo(ms: Int) {
            val v = video ?: return
            v.seekTo(ms)
            audio?.follow(ms, v.isPlaying)
        }

        override fun applyMute() {
            audio?.volume = volume()
        }

        private fun volume() = if (host.muted) 0f else 1f
    }

    private fun galleryItem(media: Media.Gallery): Item {
        val frame = FrameLayout(view.context)
        val pager = SnapPager<Item>(view.context, vertical = false)
        val counter = TextView(view.context).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            background = context.roundedRect(0x99000000.toInt(), 12)
            setPadding(context.dp(10), context.dp(4), context.dp(10), context.dp(4))
            text = "1/${media.items.size}"
            visibility = if (media.items.size > 1) View.VISIBLE else View.GONE
        }
        pager.adapter = object : SnapPager.Adapter<Item> {
            override val count = media.items.size
            override fun create(index: Int) = mediaItem(media.items[index]).also {
                it.view.onTap { host.toggleUi() }
            }
        }
        pager.onPageChanged = { counter.text = "${it + 1}/${media.items.size}" }
        frame.addView(pager, matchParent())
        frame.addView(counter, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.END).apply {
            topMargin = view.context.dp(96)
            rightMargin = view.context.dp(16)
        })
        if (media.items.size > 1) {
            overlays += counter
            // Left side, so the next image is reachable one-handed without swiping
            val buttons = LinearLayout(view.context).apply {
                orientation = LinearLayout.VERTICAL
                addView(galleryButton("‹") { pager.step(-1) })
                addView(galleryButton("›") { pager.step(1) }.apply {
                    (layoutParams as LinearLayout.LayoutParams).topMargin = context.dp(12)
                })
            }
            frame.addView(buttons, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.START or Gravity.CENTER_VERTICAL).apply {
                leftMargin = view.context.dp(12)
            })
            overlays += buttons
        }
        pager.dataChanged()

        // The gallery's own pager decides which slide is active while the post is
        return Item(frame, null, object : Playable {
            override fun preload() = pager.preloadCurrent()
            override fun activate() = pager.resume()
            override fun deactivate() = pager.pause()
            override fun applyMute() = pager.livePages.forEach { it.applyMute() }
            override fun release() = pager.clear()
        })
    }

    private inner class EmbedPlayable(private val frame: FrameLayout, private val media: Media.Embed) : Playable {
        private var web: WebView? = null

        @SuppressLint("SetJavaScriptEnabled")
        override fun activate() {
            if (web != null) return
            val view = WebView(frame.context).apply {
                setBackgroundColor(Color.BLACK)
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                webChromeClient = WebChromeClient()
            }
            val html = """
                <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
                <style>html,body{margin:0;height:100%;background:#000;display:flex;align-items:center}
                iframe{width:100%;aspect-ratio:16/9;border:0}</style></head>
                <body><iframe src="${TextUtils.htmlEncode(media.src)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen
                referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>
            """.trimIndent()
            // A real https origin as referrer; YouTube refuses embeds without one
            view.loadDataWithBaseURL("https://www.reddit.com/", html, "text/html", "utf-8", null)
            frame.addView(view, matchParent())
            web = view
        }

        override fun deactivate() {
            val view = web ?: return
            frame.removeView(view)
            view.destroy()
            web = null
        }
    }

    // ---- info overlay -----------------------------------------------------

    private fun addInfo(post: Post) {
        val context = view.context
        val info = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(context.dp(16), context.dp(48), context.dp(16), context.dp(28))
            background = scrim(GradientDrawable.Orientation.BOTTOM_TOP)
        }
        info.addView(TextView(context).apply {
            text = post.title
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            maxLines = 3
            ellipsize = TextUtils.TruncateAt.END
            setShadowLayer(4f, 0f, 1f, Color.BLACK)
        })
        val meta = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, context.dp(6), 0, 0)
        }
        meta.addView(metaText("▲ ${NUMBER_FORMAT.format(post.ups)}"))
        meta.addView(metaText("💬 ${NUMBER_FORMAT.format(post.comments)}"))
        meta.addView(metaText("u/${post.author}") { host.openPath("user/${post.author}/submitted") })
        meta.addView(metaText("r/${post.subreddit}") { host.openPath(post.subreddit) })
        meta.addView(metaText("↗") { host.openUrl("https://www.reddit.com${post.permalink}") })
        info.addView(meta)
        info.addView(controlsSlot)

        view.addView(info, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        overlays += info
    }

    private fun metaText(value: String, onClick: (() -> Unit)? = null) = TextView(view.context).apply {
        text = value
        setTextColor(if (onClick != null) 0xFFFFB38A.toInt() else 0xFFDDDDDD.toInt())
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        setPadding(0, context.dp(4), context.dp(14), context.dp(4))
        maxLines = 1
        ellipsize = TextUtils.TruncateAt.END
        if (onClick != null) setOnClickListener { onClick() }
    }

    private fun galleryButton(label: String, onClick: () -> Unit) = TextView(view.context).apply {
        text = label
        gravity = Gravity.CENTER
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f)
        background = context.roundedRect(0x99000000.toInt(), 28)
        layoutParams = LinearLayout.LayoutParams(context.dp(56), context.dp(56))
        setOnClickListener { onClick() }
    }

    private fun timeText(positionMs: Int, durationMs: Int) = "${clock(positionMs)} / ${clock(durationMs)}"

    private fun clock(ms: Int) = String.format(Locale.ROOT, "%d:%02d", ms / 60000, ms / 1000 % 60)

    private fun spinner() = ProgressBar(view.context).apply { isIndeterminate = true }

    companion object {
        private val NUMBER_FORMAT = CompactDecimalFormat.getInstance(Locale.getDefault(), CompactDecimalFormat.CompactStyle.SHORT)
    }
}
