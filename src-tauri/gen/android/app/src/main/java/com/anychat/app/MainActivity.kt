package com.anychat.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  // Enable WebView back navigation so Android hardware back triggers popstate,
  // allowing the ReaderOverlay to intercept and close on back press.
  override val handleBackNavigation: Boolean = true

  private var pendingSharedText: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    handleSharedIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleSharedIntent(intent)
  }

  private fun handleSharedIntent(intent: Intent) {
    if (intent.action == Intent.ACTION_SEND && intent.type == "text/plain") {
      val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
      if (!sharedText.isNullOrBlank()) {
        pendingSharedText = sharedText
        dispatchSharedText()
      }
    }
  }

  private fun dispatchSharedText() {
    val text = pendingSharedText ?: return
    val webView = findWebView(window.decorView) ?: return
    pendingSharedText = null
    val escaped = text.replace("\\", "\\\\")
      .replace("'", "\\'")
      .replace("\n", "\\n")
      .replace("\r", "\\r")
      .replace("\t", "\\t")
    webView.post {
      webView.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('shared-text', { detail: '$escaped' }))",
        null
      )
    }
  }

  private fun findWebView(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        val result = findWebView(view.getChildAt(i))
        if (result != null) return result
      }
    }
    return null
  }

  override fun onResume() {
    super.onResume()
    if (pendingSharedText != null) {
      dispatchSharedText()
    }
  }
}
