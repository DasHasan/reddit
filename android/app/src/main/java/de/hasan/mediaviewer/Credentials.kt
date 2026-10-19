package de.hasan.mediaviewer

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Stores the Reddit client ID and secret encrypted with an AES key that never
 * leaves the Android Keystore. Only the ciphertext ends up in SharedPreferences.
 */
object Credentials {
    data class Pair(val clientId: String, val secret: String)

    private const val KEY_ALIAS = "reddit_credentials"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val PREFS = "credentials"
    private const val PREF_BLOB = "blob"

    // Decrypted once per process; every token refresh and settings dialog reads it
    private var cached: Pair? = null

    /** Cheap presence check without touching the Keystore. */
    fun exists(context: Context) = prefs(context).contains(PREF_BLOB)

    @Synchronized
    fun load(context: Context): Pair? {
        cached?.let { return it }
        val blob = prefs(context).getString(PREF_BLOB, null) ?: return null
        return try {
            val (iv, data) = blob.split(':').map { Base64.decode(it, Base64.NO_WRAP) }
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            val (id, secret) = String(cipher.doFinal(data)).split('\n', limit = 2)
            Pair(id, secret).also { cached = it }
        } catch (e: Exception) {
            // Key lost (e.g. app data restored elsewhere): treat as not configured
            null
        }
    }

    @Synchronized
    fun save(context: Context, creds: Pair) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val data = cipher.doFinal("${creds.clientId}\n${creds.secret}".toByteArray())
        val blob = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(data, Base64.NO_WRAP)
        prefs(context).edit().putString(PREF_BLOB, blob).apply()
        cached = creds
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build()
            )
        }.generateKey()
    }
}
