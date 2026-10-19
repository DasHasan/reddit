package de.hasan.mediaviewer

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout

fun Context.dp(value: Int) =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

fun matchParent() = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)

fun centered() = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER)

/** Dark-to-transparent gradient behind overlay text; [orientation] points from dark to clear. */
fun scrim(orientation: GradientDrawable.Orientation) = GradientDrawable(orientation, intArrayOf(0xCC000000.toInt(), 0x00000000))

fun Context.roundedRect(color: Int, radiusDp: Int) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = dp(radiusDp).toFloat()
}

/**
 * Like a click listener, but only for real taps: Android's click fires on any
 * release inside the view, so a sideways swipe would count as a click too.
 */
@SuppressLint("ClickableViewAccessibility")
fun View.onTap(action: () -> Unit) {
    val detector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
        override fun onSingleTapUp(e: MotionEvent): Boolean {
            action()
            return true
        }
    })
    // Consuming every event keeps the gesture stream; parents still intercept drags along their axis
    setOnTouchListener { _, event ->
        detector.onTouchEvent(event)
        true
    }
}

/** Fades in or out; hidden views become INVISIBLE so they stop catching taps. */
fun View.fade(visible: Boolean) {
    animate().cancel()
    if (visible) {
        visibility = View.VISIBLE
        animate().alpha(1f).setDuration(200)
    } else {
        animate().alpha(0f).setDuration(200).withEndAction { visibility = View.INVISIBLE }
    }
}
