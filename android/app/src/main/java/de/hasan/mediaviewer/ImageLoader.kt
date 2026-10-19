package de.hasan.mediaviewer

import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.graphics.drawable.AnimatedImageDrawable
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.widget.ImageView
import java.lang.ref.WeakReference
import java.nio.ByteBuffer
import java.util.WeakHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future
import kotlin.math.min

/**
 * Minimal image loader on platform APIs: download, downsample to the screen, decode
 * (incl. animated GIF/WebP). Repeat downloads are served by the HttpResponseCache
 * installed in MainActivity.
 */
class ImageLoader(private val maxWidth: Int, private val maxHeight: Int) {
    private val executor = Executors.newFixedThreadPool(4)
    private val main = Handler(Looper.getMainLooper())
    private val pending = WeakHashMap<ImageView, Future<*>>()

    // Static bitmaps only; animated drawables hold per-view state and are not shared
    private val cache = object : LruCache<String, Bitmap>((Runtime.getRuntime().maxMemory() / 6).toInt()) {
        override fun sizeOf(key: String, value: Bitmap) = value.allocationByteCount
    }

    fun load(url: String, target: ImageView, onDone: (Boolean) -> Unit = {}) {
        cancel(target)
        target.tag = url
        cache.get(url)?.let {
            target.setImageBitmap(it)
            onDone(true)
            return
        }
        // Weak so a slow download does not keep a scrolled-away page (and the Activity) alive
        val targetRef = WeakReference(target)
        pending[target] = executor.submit(Runnable {
            val drawable = try {
                val bytes = Http.read(Http.open(url, readTimeoutMs = 30_000))
                // Cancelled while downloading: skip the expensive decode
                if (Thread.currentThread().isInterrupted) return@Runnable
                decode(bytes).also { d -> (d as? BitmapDrawable)?.bitmap?.let { cache.put(url, it) } }
            } catch (e: Exception) {
                null
            }
            main.post {
                val view = targetRef.get() ?: return@post
                if (view.tag != url) return@post
                pending.remove(view)
                if (drawable != null) {
                    view.setImageDrawable(drawable)
                    (drawable as? AnimatedImageDrawable)?.start()
                }
                onDone(drawable != null)
            }
        })
    }

    fun cancel(target: ImageView) {
        pending.remove(target)?.cancel(true)
        target.tag = null
        (target.drawable as? AnimatedImageDrawable)?.stop()
    }

    fun shutdown() {
        executor.shutdownNow()
        main.removeCallbacksAndMessages(null)
    }

    private fun decode(bytes: ByteArray): Drawable =
        ImageDecoder.decodeDrawable(ImageDecoder.createSource(ByteBuffer.wrap(bytes))) { decoder, info, _ ->
            // Never decode more pixels than FIT_CENTER can show on this screen
            val scale = min(1f, min(maxWidth.toFloat() / info.size.width, maxHeight.toFloat() / info.size.height))
            if (scale < 1f) decoder.setTargetSize((info.size.width * scale).toInt(), (info.size.height * scale).toInt())
        }
}
