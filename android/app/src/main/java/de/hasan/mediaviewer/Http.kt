package de.hasan.mediaviewer

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class ApiException(val code: Int, message: String) : IOException(message)

object Http {
    const val USER_AGENT = "android:de.hasan.mediaviewer:v1.0 (by /u/SirEarl)"

    fun open(url: String, readTimeoutMs: Int = 15_000) = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 15_000
        readTimeout = readTimeoutMs
        setRequestProperty("User-Agent", USER_AGENT)
    }

    /**
     * Reads the whole body or throws [ApiException] for non-2xx responses. Streams are
     * closed but the connection is not disconnected, so the socket goes back to the
     * keep-alive pool for the next request to the same host.
     */
    fun read(conn: HttpURLConnection): ByteArray {
        val code = conn.responseCode
        if (code !in 200..299) {
            conn.errorStream?.use { it.readBytes() }
            throw ApiException(code, "HTTP $code")
        }
        return conn.inputStream.use { it.readBytes() }
    }
}
