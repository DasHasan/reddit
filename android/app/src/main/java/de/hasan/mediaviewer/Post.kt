package de.hasan.mediaviewer

import android.text.Html
import org.json.JSONArray
import org.json.JSONObject

sealed class Media {
    data class Image(val url: String) : Media()
    /**
     * [sources] and [audio] are each tried in order until one plays. Reddit serves
     * picture and sound as separate files; [audio] is empty for silent videos.
     */
    data class Video(val sources: List<String>, val poster: String?, val audio: List<String> = emptyList()) : Media()
    data class Gallery(val items: List<Media>) : Media()
    data class Embed(val src: String, val url: String, val poster: String?) : Media()
    data class Link(val url: String, val thumbnail: String?) : Media()
}

data class Post(
    val title: String,
    val author: String,
    val subreddit: String,
    val permalink: String,
    val ups: Int,
    val comments: Int,
    val media: Media,
)

object PostParser {
    private val IMAGE_EXT = Regex("""\.(jpe?g|png|webp|gif)(\?.*)?$""", RegexOption.IGNORE_CASE)
    private val GIFV = Regex("""\.gifv(\?.*)?$""", RegexOption.IGNORE_CASE)
    private val EMBED_SRC = Regex("""src=["']([^"']+)["']""")
    private val VIDEO_FILE = Regex("""^(https://v\.redd\.it/[^/]+/)(DASH|CMAF)_""")

    /** Preferred image width; picks the smallest preview at least this wide. */
    var targetWidth = 1080

    /** Returns null for posts without media (e.g. text-only self posts). */
    fun parse(post: JSONObject): Post? {
        // Crossposts carry their media on the original post
        val source = post.optJSONArray("crosspost_parent_list")?.optJSONObject(0) ?: post
        val media = detectMedia(source) ?: return null
        if (post.optBoolean("is_self") && media is Media.Link) return null

        return Post(
            title = post.optString("title"),
            author = post.optString("author"),
            subreddit = post.optString("subreddit"),
            permalink = post.optString("permalink"),
            ups = post.optInt("ups"),
            comments = post.optInt("num_comments"),
            media = media,
        )
    }

    private fun detectMedia(p: JSONObject): Media? {
        val url = p.optString("url").takeIf { it.isNotEmpty() }
        val preview = p.optJSONObject("preview")?.optJSONArray("images")?.optJSONObject(0)
        val poster = preview?.let { bestImage(it) }

        if (p.optBoolean("is_gallery")) {
            gallery(p)?.let { return it }
        }

        val redditVideo = p.optJSONObject("secure_media")?.optJSONObject("reddit_video")
            ?: p.optJSONObject("media")?.optJSONObject("reddit_video")
        if (redditVideo != null) {
            val audio = if (redditVideo.optBoolean("has_audio") && !redditVideo.optBoolean("is_gif")) {
                audioSources(redditVideo.optString("fallback_url"))
            } else emptyList()
            return Media.Video(videoSources(redditVideo), poster, audio)
        }

        // Reddit converts many GIF links into a silent video preview
        p.optJSONObject("preview")?.optJSONObject("reddit_video_preview")?.let {
            return Media.Video(videoSources(it), poster)
        }

        if (url != null && GIFV.containsMatchIn(url)) {
            return Media.Video(listOf(url.replace(GIFV, ".mp4")), poster)
        }

        preview?.optJSONObject("variants")?.optJSONObject("mp4")?.optJSONObject("source")?.optString("url")
            ?.takeIf { it.isNotEmpty() }
            ?.let { return Media.Video(listOf(it), poster) }

        val embed = p.optJSONObject("secure_media_embed") ?: p.optJSONObject("media_embed")
        embed?.optString("content")?.let { EMBED_SRC.find(it)?.groupValues?.get(1) }?.let { src ->
            val decoded = Html.fromHtml(src, Html.FROM_HTML_MODE_LEGACY).toString()
            return Media.Embed(decoded, url ?: decoded, poster)
        }

        if (url != null && (IMAGE_EXT.containsMatchIn(url) || p.optString("post_hint") == "image")) {
            val gif = preview?.optJSONObject("variants")?.optJSONObject("gif")?.optJSONObject("source")?.optString("url")
            return Media.Image(gif?.takeIf { it.isNotEmpty() } ?: poster ?: url)
        }

        val thumbnail = poster ?: p.optString("thumbnail").takeIf { it.startsWith("http") }
        if (url != null && !url.contains("reddit.com") && !url.contains("redd.it")) {
            return Media.Link(url, thumbnail)
        }
        return thumbnail?.let { Media.Image(it) }
    }

    private fun gallery(p: JSONObject): Media.Gallery? {
        val items = p.optJSONObject("gallery_data")?.optJSONArray("items") ?: return null
        val metadata = p.optJSONObject("media_metadata") ?: return null
        val media = items.objects().mapNotNull { item ->
            val meta = metadata.optJSONObject(item.optString("media_id"))
            if (meta == null || meta.optString("status") != "valid") return@mapNotNull null
            val s = meta.optJSONObject("s") ?: return@mapNotNull null
            when (meta.optString("e")) {
                "AnimatedImage" -> s.optString("mp4").takeIf { it.isNotEmpty() }
                    ?.let { Media.Video(listOf(it), null) }
                    ?: s.optString("gif").takeIf { it.isNotEmpty() }?.let { Media.Image(it) }
                else -> (pickResolution(meta.optJSONArray("p"), "x", "u") ?: s.optString("u"))
                    .takeIf { it.isNotEmpty() }?.let { Media.Image(it) }
            }
        }
        return if (media.isEmpty()) null else Media.Gallery(media)
    }

    // MediaPlayer rejects Reddit's HLS streams (error -1007), so the progressive MP4 comes first
    private fun videoSources(video: JSONObject): List<String> =
        listOf("fallback_url", "hls_url").mapNotNull { key -> video.optString(key).takeIf { it.isNotEmpty() } }

    /**
     * Audio lives next to the video file and shares its prefix:
     * .../DASH_720.mp4 -> .../DASH_AUDIO_128.mp4, .../CMAF_480.mp4 -> .../CMAF_AUDIO_128.mp4
     */
    private fun audioSources(fallbackUrl: String): List<String> {
        val match = VIDEO_FILE.find(fallbackUrl) ?: return emptyList()
        val (base, prefix) = match.destructured
        return listOf("${base}${prefix}_AUDIO_128.mp4", "${base}${prefix}_AUDIO_64.mp4", "${base}DASH_audio.mp4")
    }

    private fun bestImage(image: JSONObject): String? =
        pickResolution(image.optJSONArray("resolutions"), "width", "url")
            ?: image.optJSONObject("source")?.optString("url")?.takeIf { it.isNotEmpty() }

    /** Smallest entry that is at least [targetWidth] wide; null if none is wide enough. */
    private fun pickResolution(list: JSONArray?, widthKey: String, urlKey: String): String? =
        list.objects()
            .filter { it.optInt(widthKey) >= targetWidth }
            .minByOrNull { it.optInt(widthKey) }
            ?.optString(urlKey)
            ?.takeIf { it.isNotEmpty() }
}

fun JSONArray?.objects(): List<JSONObject> =
    if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }
