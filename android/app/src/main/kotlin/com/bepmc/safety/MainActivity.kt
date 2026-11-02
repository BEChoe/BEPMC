package com.bepmc.safety

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.view.KeyEvent
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private val FILE_CHOOSER_RESULT_CODE = 1001
    private val PERMISSIONS_REQUEST_CODE = 1002

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestAppPermissions()

        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                mediaPlaybackRequiresUserGesture = false
                useWideViewPort = true
                loadWithOverviewMode = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            }

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val url = request?.url?.toString() ?: return false
                    if (url.startsWith("tel:") || url.startsWith("mailto:")) {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        startActivity(intent)
                        return true
                    }
                    return false
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest?) {
                    request?.grant(request.resources)
                }

                override fun onGeolocationPermissionsShowPrompt(
                    origin: String?,
                    callback: GeolocationPermissions.Callback?
                ) {
                    callback?.invoke(origin, true, false)
                }

                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = filePathCallback

                    val pickIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                        type = "*/*"
                        addCategory(Intent.CATEGORY_OPENABLE)
                    }

                    val takePictureIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                    val chooserIntent = Intent(Intent.ACTION_CHOOSER).apply {
                        putExtra(Intent.EXTRA_INTENT, pickIntent)
                        putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(takePictureIntent))
                    }

                    startActivityForResult(chooserIntent, FILE_CHOOSER_RESULT_CODE)
                    return true
                }
            }
        }

        setContentView(webView)
        webView.loadUrl("file:///android_asset/www/index.html")
    }

    private fun requestAppPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val permissions = arrayOf(
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            )
            val needed = permissions.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
            if (needed.isNotEmpty()) {
                requestPermissions(needed.toTypedArray(), PERMISSIONS_REQUEST_CODE)
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_CHOOSER_RESULT_CODE) {
            if (resultCode == RESULT_OK) {
                val results: Array<Uri>? = when {
                    data?.data != null -> arrayOf(data.data!!)
                    data?.clipData != null -> {
                        val count = data.clipData!!.itemCount
                        Array(count) { i -> data.clipData!!.getItemAt(i).uri }
                    }
                    else -> null
                }
                fileChooserCallback?.onReceiveValue(results)
            } else {
                fileChooserCallback?.onReceiveValue(null)
            }
            fileChooserCallback = null
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
