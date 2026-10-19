package de.hasan.mediaviewer

import android.media.AudioAttributes
import android.media.MediaPlayer
import kotlin.math.abs

/**
 * Plays the sound of a Reddit video, which Reddit serves as a separate file.
 * [urls] are guesses tried in order until one prepares; [onReady] fires once
 * playback can follow the video.
 */
class SeparateAudio(private val urls: List<String>, private val onReady: () -> Unit) {
    private var player: MediaPlayer? = null
    private var prepared = false

    var volume = 1f
        set(value) {
            field = value
            if (prepared) player?.setVolume(value, value)
        }

    init {
        prepare(0)
    }

    /** Plays while the video plays and seeks back when the two drift apart (incl. the video looping). */
    fun follow(positionMs: Int, videoPlaying: Boolean) {
        val p = player?.takeIf { prepared } ?: return
        if (!videoPlaying) {
            if (p.isPlaying) p.pause()
            return
        }
        if (!p.isPlaying) p.start()
        if (abs(p.currentPosition - positionMs) > 250) p.seekTo(positionMs)
    }

    fun release() {
        player?.release()
        player = null
        prepared = false
    }

    private fun prepare(index: Int) {
        if (index >= urls.size) return
        val mp = MediaPlayer()
        player = mp
        mp.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
                .build()
        )
        mp.isLooping = true
        mp.setOnPreparedListener {
            if (player !== mp) return@setOnPreparedListener
            prepared = true
            mp.setVolume(volume, volume)
            onReady()
        }
        mp.setOnErrorListener { _, _, _ ->
            // Wrong file name guess (403): try the next candidate
            if (player === mp) retry(index + 1)
            true
        }
        try {
            mp.setDataSource(urls[index])
            mp.prepareAsync()
        } catch (e: Exception) {
            retry(index + 1)
        }
    }

    private fun retry(nextIndex: Int) {
        release()
        prepare(nextIndex)
    }
}
