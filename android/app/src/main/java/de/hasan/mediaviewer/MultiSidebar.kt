package de.hasan.mediaviewer

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView

/**
 * Left drawer listing a user's public multireddits. The owner loads the data
 * ([onUser]) and reports back via [showLoading], [showMultis] or [showError].
 */
class MultiSidebar(
    context: Context,
    private val onUser: (String) -> Unit,
    private val onPick: (String) -> Unit,
) : FrameLayout(context) {
    var isOpen = false
        private set

    private val scrimView = View(context).apply {
        setBackgroundColor(0x99000000.toInt())
        alpha = 0f
        setOnClickListener { close() }
    }
    private val panel = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(0xF2181818.toInt())
        isClickable = true
    }
    private val userInput = EditText(context).apply {
        hint = "Reddit-User"
        setTextColor(Color.WHITE)
        setHintTextColor(0x99FFFFFF.toInt())
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        isSingleLine = true
        inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        imeOptions = EditorInfo.IME_ACTION_GO
        background = context.roundedRect(0x33FFFFFF, 20)
        setPadding(dp(16), dp(10), dp(16), dp(10))
        setOnEditorActionListener { _, action, event ->
            if (action == EditorInfo.IME_ACTION_GO || event?.keyCode == KeyEvent.KEYCODE_ENTER) {
                val user = RedditClient.normalize(text.toString()).removePrefix("user/").substringBefore('/')
                if (user.isNotEmpty()) onUser(user)
                true
            } else false
        }
    }
    private val title = TextView(context).apply {
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
        typeface = Typeface.DEFAULT_BOLD
        setPadding(dp(4), dp(16), dp(4), dp(8))
    }
    private val progress = ProgressBar(context).apply { visibility = View.GONE }
    private val list = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }

    /** User whose multis are shown or loading, null before the first lookup. */
    var user: String? = null
        private set

    init {
        addView(scrimView, matchParent())
        val width = minOf(dp(320), (resources.displayMetrics.widthPixels * 0.85f).toInt())
        panel.addView(userInput, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        panel.addView(title)
        panel.addView(progress, LinearLayout.LayoutParams(dp(32), dp(32)).apply { gravity = Gravity.CENTER_HORIZONTAL; topMargin = dp(16) })
        panel.addView(ScrollView(context).apply { addView(list) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        addView(panel, LayoutParams(width, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.START))
        panel.translationX = -width.toFloat()
        visibility = View.INVISIBLE
        title.text = "Multireddits"
        hint("User eingeben, um dessen öffentliche Multireddits zu sehen")
    }

    /** Keeps the panel content clear of the camera cutout. */
    fun setTopInset(top: Int) = panel.setPadding(dp(12), top + dp(8), dp(12), dp(8))

    fun open() {
        if (isOpen) return
        isOpen = true
        visibility = View.VISIBLE
        scrimView.animate().alpha(1f).setDuration(200)
        panel.animate().translationX(0f).setDuration(200)
    }

    fun close() {
        if (!isOpen) return
        isOpen = false
        userInput.clearFocus()
        context.getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(windowToken, 0)
        scrimView.animate().alpha(0f).setDuration(200)
        panel.animate().translationX(-panel.width.toFloat()).setDuration(200).withEndAction { visibility = View.INVISIBLE }
    }

    fun showLoading(user: String) {
        this.user = user
        userInput.setText(user)
        userInput.clearFocus()
        context.getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(windowToken, 0)
        title.text = "u/$user"
        list.removeAllViews()
        progress.visibility = View.VISIBLE
    }

    fun showMultis(user: String, multis: List<Multi>) {
        if (user != this.user) return
        progress.visibility = View.GONE
        list.removeAllViews()
        list.addView(entry("Posts von u/$user", null) { onPick("user/$user/submitted") })
        if (multis.isEmpty()) hint("Keine öffentlichen Multireddits")
        multis.forEach { multi -> list.addView(entry(multi.name, "${multi.subredditCount} Subs") { onPick(multi.path) }) }
    }

    fun showError(user: String, message: String) {
        if (user != this.user) return
        progress.visibility = View.GONE
        list.removeAllViews()
        hint(message)
    }

    private fun dp(value: Int) = context.dp(value)

    private fun hint(message: String) = list.addView(TextView(context).apply {
        text = message
        setTextColor(0x99FFFFFF.toInt())
        setPadding(dp(4), dp(12), dp(4), dp(12))
    })

    private fun entry(label: String, detail: String?, onClick: () -> Unit) = TextView(context).apply {
        text = if (detail == null) label else "$label  ·  $detail"
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        setPadding(dp(4), dp(14), dp(4), dp(14))
        setOnClickListener {
            close()
            onClick()
        }
    }
}
