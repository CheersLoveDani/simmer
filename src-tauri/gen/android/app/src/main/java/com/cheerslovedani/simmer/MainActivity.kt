package com.cheerslovedani.simmer

import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

private const val RELEASE_DOWNLOADS = "https://github.com/CheersLoveDani/simmer/releases/download/"

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private var insetTop = 0f
  private var insetBottom = 0f

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(Bridge(), "SimmerNative")

    // System back: the page first closes an open sheet or steps back through
    // its own history; only when it has nothing left does the app close.
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        webView.evaluateJavascript("window.__simmerBack ? window.__simmerBack() : false") { handled ->
          if (handled != "true") {
            isEnabled = false
            moveTaskToBack(true)
            isEnabled = true
          }
        }
      }
    })

    // The app draws edge to edge. Not every WebView reports the system bars
    // through CSS env(), so the measurements are handed to the page directly.
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
      val density = resources.displayMetrics.density
      insetTop = bars.top / density
      insetBottom = bars.bottom / density
      // Shrink the page above the keyboard so focused fields stay visible.
      val keyboardOpen = keyboard.bottom > bars.bottom
      view.setPadding(bars.left, 0, bars.right, if (keyboardOpen) keyboard.bottom else 0)
      if (keyboardOpen) insetBottom = 0f
      pushInsets()
      insets
    }
  }

  private fun updateFile() = File(cacheDir, "update.apk")

  private fun pushInsets() {
    webView?.evaluateJavascript(
      "window.__simmerInsets && window.__simmerInsets($insetTop, $insetBottom)",
      null
    )
  }

  /** Methods the web layer can call as `window.SimmerNative.*`. */
  inner class Bridge {
    @JavascriptInterface
    fun setKeepAwake(on: Boolean) {
      runOnUiThread {
        if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      }
    }

    /** Keep the system bar icons readable when the app theme differs from the system's. */
    @JavascriptInterface
    fun setDarkChrome(dark: Boolean) {
      runOnUiThread {
        val bars = WindowCompat.getInsetsController(window, window.decorView)
        bars.isAppearanceLightStatusBars = !dark
        bars.isAppearanceLightNavigationBars = !dark
      }
    }

    @JavascriptInterface
    fun share(title: String, text: String) {
      val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, title)
        putExtra(Intent.EXTRA_TEXT, text)
      }
      runOnUiThread { startActivity(Intent.createChooser(send, title)) }
    }

    /**
     * Fetch a new version of the app from this project's releases. The page is
     * told through `window.__simmerUpdate(ok)` when the file is in place.
     */
    @JavascriptInterface
    fun downloadUpdate(url: String) {
      Thread {
        val ok = try {
          require(url.startsWith(RELEASE_DOWNLOADS)) { "not a release download" }
          val part = File(cacheDir, "update.apk.part")
          val connection = URL(url).openConnection() as HttpURLConnection
          connection.connectTimeout = 20_000
          connection.readTimeout = 30_000
          try {
            check(connection.responseCode == 200) { "HTTP ${connection.responseCode}" }
            connection.inputStream.use { input -> part.outputStream().use { input.copyTo(it) } }
          } finally {
            connection.disconnect()
          }
          part.renameTo(updateFile())
        } catch (e: Exception) {
          false
        }
        runOnUiThread { webView?.evaluateJavascript("window.__simmerUpdate && window.__simmerUpdate($ok)", null) }
      }.start()
    }

    /** Open the system installer on the downloaded update. Android asks before replacing the app. */
    @JavascriptInterface
    fun installUpdate() {
      val apk = updateFile()
      if (!apk.exists()) return
      val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.fileprovider", apk)
      val install = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      runOnUiThread { startActivity(install) }
    }

    @JavascriptInterface
    fun insets(): String = "$insetTop,$insetBottom"
  }
}
