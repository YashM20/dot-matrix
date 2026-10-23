// Dot/480 Glyph Toy template (Nothing Phone (3) Glyph Matrix). Plays the frames exported by
// targets/glyph-toy/export.ts (assets/dot480_frames.json). API names follow the GlyphMatrix
// Developer Kit README (github.com/Nothing-Developer-Programme/GlyphMatrix-Developer-Kit); check them
// against the .aar you build with. Long press (EVENT_CHANGE) pauses/resumes; AOD draws one still frame.
package com.example.dot480toy

import android.app.Service
import android.content.ComponentName
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger
import com.nothing.ketchum.Glyph
import com.nothing.ketchum.GlyphMatrixFrame
import com.nothing.ketchum.GlyphMatrixManager
import com.nothing.ketchum.GlyphMatrixObject
import com.nothing.ketchum.GlyphToy
import org.json.JSONObject

class DotToyService : Service() {
    private var gm: GlyphMatrixManager? = null
    private val main = Handler(Looper.getMainLooper())
    private var frames: List<IntArray> = emptyList()
    private var size = 25
    private var fps = 10
    private var index = 0
    private var playing = true

    private val tick = object : Runnable {
        override fun run() {
            if (playing && frames.isNotEmpty()) { draw(frames[index]); index = (index + 1) % frames.size }
            main.postDelayed(this, (1000L / fps))
        }
    }

    private val events = Messenger(object : Handler(Looper.getMainLooper()) {
        override fun handleMessage(msg: Message) {
            if (msg.what != GlyphToy.MSG_GLYPH_TOY) return super.handleMessage(msg)
            when (msg.data?.getString(GlyphToy.MSG_GLYPH_TOY_DATA)) {
                GlyphToy.EVENT_CHANGE -> playing = !playing           // long press (metadata longpress = 1)
                GlyphToy.EVENT_AOD -> frames.firstOrNull()?.let(::draw) // about once a minute as the AOD toy
            }
        }
    })

    override fun onBind(intent: Intent?): IBinder {
        loadFrames()
        gm = GlyphMatrixManager.getInstance(applicationContext).also { m ->
            m.init(object : GlyphMatrixManager.Callback {
                override fun onServiceConnected(name: ComponentName?) {
                    m.register(Glyph.DEVICE_23112)   // Phone (3); Glyph.DEVICE_25111p for Phone (4a Pro), 13×13
                    main.post(tick)
                }
                override fun onServiceDisconnected(name: ComponentName?) {}
            })
        }
        return events.binder
    }

    override fun onUnbind(intent: Intent?): Boolean {
        main.removeCallbacks(tick)
        gm?.unInit()
        gm = null
        return false
    }

    private fun loadFrames() {
        val json = JSONObject(assets.open("dot480_frames.json").bufferedReader().use { it.readText() })
        size = json.getInt("w"); fps = json.getInt("fps").coerceIn(1, 30)
        val arr = json.getJSONArray("frames")
        frames = (0 until arr.length()).map { i -> val f = arr.getJSONArray(i); IntArray(f.length()) { f.getInt(it) } }
    }

    /** One frame (brightness 0..255 per LED, row-major) → a 1:1 bitmap → GlyphMatrixObject → frame. */
    private fun draw(levels: IntArray) {
        val m = gm ?: return
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        for (y in 0 until size) for (x in 0 until size) { val v = levels[y * size + x]; bmp.setPixel(x, y, Color.rgb(v, v, v)) }
        val obj = GlyphMatrixObject.Builder().setImageSource(bmp).setPosition(0, 0).setScale(100).setBrightness(255).build()
        m.setMatrixFrame(GlyphMatrixFrame.Builder().addTop(obj).build(applicationContext).render())
    }
}
