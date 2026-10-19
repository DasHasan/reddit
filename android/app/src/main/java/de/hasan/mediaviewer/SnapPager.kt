package de.hasan.mediaviewer

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import kotlin.math.abs

/**
 * Full-screen paging container that keeps only the current page and its two
 * neighbours alive (virtual scrolling). Works vertically for the feed and
 * horizontally for galleries; nested pagers each claim only drags along their axis.
 *
 * The pager owns the page lifecycle: while resumed, exactly the current page is
 * active; pages are deactivated when they stop being current and released when
 * they leave the window.
 */
class SnapPager<T : SnapPager.Page>(context: Context, private val vertical: Boolean) : FrameLayout(context) {

    interface Page {
        val view: View
        fun activate() {}
        fun deactivate() {}
        /** Frees resources; also stops the page if it is still active. */
        fun release() {}
    }

    interface Adapter<T> {
        val count: Int
        fun create(index: Int): T
    }

    var adapter: Adapter<T>? = null
    var onPageChanged: ((index: Int) -> Unit)? = null

    var current = 0
        private set

    private val pages = HashMap<Int, T>()
    val livePages: Collection<T> get() = pages.values

    private var resumed = false
    private var activePage: T? = null

    private var offset = 0f
    private var downPrimary = 0f
    private var downSecondary = 0f
    private var lastPrimary = 0f
    private var dragging = false
    private var velocity: VelocityTracker? = null
    private var animator: ValueAnimator? = null

    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
    private val flingVelocity = 800 * resources.displayMetrics.density
    private val size get() = (if (vertical) height else width).toFloat()
    private val count get() = adapter?.count ?: 0

    fun resume() {
        resumed = true
        updateActive()
    }

    fun pause() {
        resumed = false
        updateActive()
    }

    /** Call after items were appended so the next neighbour gets created. */
    fun dataChanged() = sync()

    /** Drops all pages and starts again at the first item. */
    fun reset() {
        clear()
        sync()
    }

    /** Releases all pages without creating new ones. */
    fun clear() {
        animator?.cancel()
        activePage = null
        pages.values.forEach {
            removeView(it.view)
            it.release()
        }
        pages.clear()
        current = 0
        offset = 0f
    }

    private fun sync() {
        val a = adapter ?: return
        val wanted = (current - 1..current + 1).filter { it in 0 until a.count }.toSet()
        pages.keys.filter { it !in wanted }.forEach { index ->
            val page = pages.remove(index)!!
            if (page === activePage) activePage = null
            removeView(page.view)
            page.release()
        }
        wanted.forEach { index ->
            if (index !in pages) {
                val page = a.create(index)
                pages[index] = page
                addView(page.view, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
            }
        }
        position()
        updateActive()
    }

    private fun updateActive() {
        val target = if (resumed) pages[current] else null
        if (target === activePage) return
        activePage?.deactivate()
        activePage = target
        target?.activate()
    }

    private fun position() {
        pages.forEach { (index, page) ->
            val p = (index - current) * size + offset
            if (vertical) page.view.translationY = p else page.view.translationX = p
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        position()
    }

    private fun primary(ev: MotionEvent) = if (vertical) ev.y else ev.x
    private fun secondary(ev: MotionEvent) = if (vertical) ev.x else ev.y

    private fun onDown(ev: MotionEvent) {
        downPrimary = primary(ev)
        downSecondary = secondary(ev)
        lastPrimary = downPrimary
    }

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        track(ev)
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                onDown(ev)
                // Catching a page mid-animation continues the drag from where it is
                dragging = animator?.isRunning == true
                animator?.cancel()
            }
            MotionEvent.ACTION_MOVE -> maybeStartDrag(ev)
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> dragging = false
        }
        return dragging
    }

    override fun onTouchEvent(ev: MotionEvent): Boolean {
        track(ev)
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> onDown(ev)
            MotionEvent.ACTION_MOVE -> {
                maybeStartDrag(ev)
                if (dragging) {
                    val p = primary(ev)
                    var delta = p - lastPrimary
                    lastPrimary = p
                    val pastStart = current == 0 && offset + delta > 0
                    val pastEnd = current >= count - 1 && offset + delta < 0
                    if (pastStart || pastEnd) delta *= 0.3f
                    offset += delta
                    position()
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (dragging) {
                    dragging = false
                    velocity?.computeCurrentVelocity(1000)
                    val v = (if (vertical) velocity?.yVelocity else velocity?.xVelocity) ?: 0f
                    val target = when {
                        current < count - 1 && offset < 0 && (offset < -size * 0.25f || v < -flingVelocity) -> 1
                        current > 0 && offset > 0 && (offset > size * 0.25f || v > flingVelocity) -> -1
                        else -> 0
                    }
                    settle(target)
                }
                velocity?.recycle()
                velocity = null
            }
        }
        return true
    }

    private fun maybeStartDrag(ev: MotionEvent) {
        if (dragging) return
        val dp = abs(primary(ev) - downPrimary)
        val ds = abs(secondary(ev) - downSecondary)
        if (dp > touchSlop && dp > ds) {
            dragging = true
            lastPrimary = primary(ev)
            parent?.requestDisallowInterceptTouchEvent(true)
        }
    }

    private fun track(ev: MotionEvent) {
        if (ev.actionMasked == MotionEvent.ACTION_DOWN) velocity?.clear()
        val tracker = velocity ?: VelocityTracker.obtain().also { velocity = it }
        tracker.addMovement(ev)
    }

    private fun settle(delta: Int) {
        animator?.cancel()
        val end = -delta * size
        animator = ValueAnimator.ofFloat(offset, end).apply {
            duration = 220
            interpolator = DecelerateInterpolator()
            addUpdateListener {
                offset = it.animatedValue as Float
                position()
            }
            addListener(object : AnimatorListenerAdapter() {
                private var cancelled = false
                override fun onAnimationCancel(animation: Animator) {
                    cancelled = true
                }

                override fun onAnimationEnd(animation: Animator) {
                    if (cancelled) return
                    offset = 0f
                    if (delta != 0) {
                        current += delta
                        sync()
                        onPageChanged?.invoke(current)
                    } else {
                        position()
                    }
                }
            })
            start()
        }
    }
}
