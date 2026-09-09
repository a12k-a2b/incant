package app.incant.dc1

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View

class SketchView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {
    private val parchment = Color.parseColor("#F3EFE4")
    private val ink = Color.parseColor("#1A1814")
    private var bitmap: Bitmap? = null
    private var canvas: Canvas? = null
    private val path = Path()
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeJoin = Paint.Join.ROUND
        strokeCap = Paint.Cap.ROUND
        color = ink
        strokeWidth = 3.2f
    }
    private val history = ArrayDeque<Bitmap>()
    private val future = ArrayDeque<Bitmap>()
    var eraser = false
    var empty = true
        private set
    var locked = false

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w <= 0 || h <= 0) return
        val next = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(next)
        c.drawColor(parchment)
        bitmap?.let { c.drawBitmap(it, 0f, 0f, null) }
        bitmap = next
        canvas = c
        if (history.isEmpty()) snapshot()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        bitmap?.let { canvas.drawBitmap(it, 0f, 0f, null) }
        canvas.drawPath(path, paint)
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (locked) return true
        val tool = event.getToolType(0)
        // Hardware palm rejection on DC-1 plus a software belt: ignore finger/palm on the canvas.
        if (tool == MotionEvent.TOOL_TYPE_FINGER) return false
        val eraserEvent = eraser ||
            event.getToolType(0) == MotionEvent.TOOL_TYPE_ERASER ||
            (event.buttonState and MotionEvent.BUTTON_STYLUS_SECONDARY) != 0
        paint.color = if (eraserEvent) parchment else ink
        val pressure = if (event.pressure > 0f) event.pressure else 0.45f
        paint.strokeWidth = if (eraserEvent) 18f + pressure * 28f else 1.4f + pressure * 7f

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                path.reset()
                path.moveTo(event.x, event.y)
                empty = false
            }
            MotionEvent.ACTION_MOVE -> {
                path.lineTo(event.x, event.y)
                canvas?.drawPath(path, paint)
                path.reset()
                path.moveTo(event.x, event.y)
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                canvas?.drawPath(path, paint)
                path.reset()
                snapshot()
            }
        }
        invalidate()
        return true
    }

    fun undo() {
        if (history.size < 2) return
        future.addFirst(history.removeLast())
        restore(history.last())
    }

    fun redo() {
        val next = future.removeFirstOrNull() ?: return
        history.addLast(next)
        restore(next)
    }

    fun clear() {
        canvas?.drawColor(parchment)
        empty = true
        snapshot()
        invalidate()
    }

    fun exportPng(): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        (bitmap ?: return ByteArray(0)).compress(Bitmap.CompressFormat.PNG, 100, out)
        return out.toByteArray()
    }

    private fun snapshot() {
        val src = bitmap ?: return
        val copy = src.copy(Bitmap.Config.ARGB_8888, false)
        history.addLast(copy)
        while (history.size > 28) history.removeFirst()
        future.clear()
    }

    private fun restore(src: Bitmap) {
        val c = canvas ?: return
        c.drawColor(parchment)
        c.drawBitmap(src, 0f, 0f, null)
        empty = false
        invalidate()
    }
}
