package de.hasan.mediaviewer

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URLEncoder

data class Listing(val posts: List<Post>, val after: String?, val rawCount: Int)

/** A user's custom feed; [path] is a [RedditClient.normalize]d feed path. */
data class Multi(val name: String, val path: String, val subredditCount: Int)

/**
 * Reads public Reddit data with an app-only OAuth token (client_credentials grant).
 * No user login is involved; all calls are blocking and must run off the main thread.
 */
class RedditClient(private val credentials: () -> Credentials.Pair?) {
    private var token: String? = null
    private var tokenExpiresAt = 0L

    /** [apiPath] as returned by [Companion.apiPath]. */
    fun listing(apiPath: String, after: String?): Listing {
        val query = StringBuilder("limit=50&raw_json=1")
        if (after != null) query.append("&after=").append(URLEncoder.encode(after, "UTF-8"))
        val json = get("https://oauth.reddit.com$apiPath?$query")
        val data = json.optJSONObject("data") ?: throw ApiException(0, "Unerwartete Antwort von Reddit")
        val children = data.optJSONArray("children") ?: throw ApiException(0, "Unerwartete Antwort von Reddit")
        val posts = children.objects().mapNotNull { child -> child.optJSONObject("data")?.let { PostParser.parse(it) } }
        return Listing(posts, data.optString("after").takeIf { it.isNotEmpty() && it != "null" }, children.length())
    }

    /** Public multireddits of [user]; private ones are never returned to an app-only token. */
    fun multis(user: String): List<Multi> {
        val body = try {
            getBody("https://oauth.reddit.com/api/multi/user/${URLEncoder.encode(user, "UTF-8")}?raw_json=1")
        } catch (e: ApiException) {
            // Reddit answers 400 USER_DOESNT_EXIST for unknown users
            throw if (e.code == 400) ApiException(404, "u/$user existiert nicht") else e
        }
        return JSONArray(body).objects().mapNotNull { it.optJSONObject("data") }.map {
            Multi(
                it.optString("display_name"),
                it.optString("path").trim('/'),
                it.optJSONArray("subreddits")?.length() ?: 0,
            )
        }
    }

    private fun get(url: String) = JSONObject(getBody(url))

    private fun getBody(url: String) = try {
        authorizedGet(url, token())
    } catch (e: ApiException) {
        if (e.code != 401) throw e
        // Token revoked or expired early: fetch a fresh one once
        token = null
        authorizedGet(url, token())
    }

    @Synchronized
    private fun token(): String {
        token?.let { if (System.currentTimeMillis() < tokenExpiresAt) return it }

        val creds = credentials() ?: throw ApiException(401, "Keine Zugangsdaten hinterlegt")
        val basic = Base64.encodeToString("${creds.clientId}:${creds.secret}".toByteArray(), Base64.NO_WRAP)
        val conn = Http.open("https://www.reddit.com/api/v1/access_token").apply {
            requestMethod = "POST"
            doOutput = true
            setRequestProperty("Authorization", "Basic $basic")
            setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
        }
        conn.outputStream.use { it.write("grant_type=client_credentials".toByteArray()) }
        val json = JSONObject(read(conn))
        val value = json.optString("access_token").takeIf { it.isNotEmpty() }
            ?: throw ApiException(401, "Reddit hat keinen Token ausgestellt: ${json.optString("error", "unbekannt")}")

        // Renew a minute early so requests never race the expiry
        tokenExpiresAt = System.currentTimeMillis() + (json.optLong("expires_in", 3600) - 60) * 1000
        token = value
        return value
    }

    private fun authorizedGet(url: String, token: String) =
        read(Http.open(url).apply { setRequestProperty("Authorization", "bearer $token") })

    private fun read(conn: HttpURLConnection): String {
        val body = try {
            Http.read(conn)
        } catch (e: ApiException) {
            throw ApiException(e.code, when (e.code) {
                401 -> "Zugangsdaten ungültig (401)"
                403 -> "Kein Zugriff – privat oder gesperrt (403)"
                404 -> "Nicht gefunden (404)"
                429 -> "Zu viele Anfragen, kurz warten (429)"
                else -> "Reddit-Fehler ${e.code}"
            })
        }
        return String(body)
    }

    companion object {
        private val MULTI_URL = Regex("""(?:https?://)?(?:www\.|old\.)?reddit\.com/(user/[^/]+/m/[^/?#]+)""", RegexOption.IGNORE_CASE)
        private val SUB_URL = Regex("""(?:https?://)?(?:www\.|old\.)?reddit\.com/r/([^/?#]+)""", RegexOption.IGNORE_CASE)

        private val USER = Regex("""user/([^/]+)""")

        /** User name if [path] names a user without a feed suffix such as /submitted or /m/x. */
        fun bareUser(path: String) = USER.matchEntire(path)?.groupValues?.get(1)

        /** API path for a [normalize]d feed path. */
        fun apiPath(path: String) = if (path.startsWith("user/")) "/$path" else "/r/$path"

        /** Port of parseSubredditInput from the web app: sub name, r/ prefix, multi path or full URL. */
        fun normalize(input: String): String {
            val trimmed = input.trim().trimStart('/').ifEmpty { "pics" }
            MULTI_URL.find(trimmed)?.let { return it.groupValues[1] }
            SUB_URL.find(trimmed)?.let { return it.groupValues[1] }
            if (trimmed.startsWith("u/")) return "user/" + trimmed.substring(2)
            if (trimmed.startsWith("r/")) return trimmed.substring(2)
            return trimmed
        }
    }
}
