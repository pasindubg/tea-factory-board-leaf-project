package lk.boardleaf.field;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.File;
import java.util.UUID;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final int LOCATION = 1;
    private static final int IMAGE = 2;
    private static final int CAMERA = 3;
    private final OriginPolicy origin = new OriginPolicy(BuildConfig.MOBILE_WEB_URL, BuildConfig.DEBUG);
    private WebView web;
    private LinearLayout overlay;
    private TextView title;
    private TextView details;
    private Button retry;
    private ConnectivityManager network;
    private boolean observing;
    private boolean started;
    private boolean failed;
    private boolean ready;
    private boolean unsupported;
    private SecureSessionStore sessions;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private GeolocationPermissions.Callback locationCallback;
    private String locationOrigin;

    private final ConnectivityManager.NetworkCallback networkCallback = new ConnectivityManager.NetworkCallback() {
        @Override public void onAvailable(Network network) { runOnUiThread(() -> updateNetwork(true)); }
        @Override public void onLost(Network network) { runOnUiThread(() -> updateNetwork(true)); }
        @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
            runOnUiThread(() -> updateNetwork(true));
        }
    };

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        network = getSystemService(ConnectivityManager.class);
        sessions = new SecureSessionStore(this);
        web = new WebView(this);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(250, 250, 249));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            }
            return insets;
        });
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        overlay = new LinearLayout(this);
        overlay.setOrientation(LinearLayout.VERTICAL);
        overlay.setGravity(Gravity.CENTER);
        overlay.setPadding(24, 24, 24, 24);
        overlay.setBackgroundColor(Color.rgb(250, 250, 249));
        overlay.setClickable(true);
        title = new TextView(this);
        title.setGravity(Gravity.CENTER);
        title.setTextSize(22);
        details = new TextView(this);
        details.setGravity(Gravity.CENTER);
        details.setPadding(0, 12, 0, 16);
        retry = new Button(this);
        retry.setText("Try again");
        retry.setOnClickListener(view -> { if (connected()) load(); else updateNetwork(false); });
        overlay.addView(title);
        overlay.addView(details);
        overlay.addView(retry);
        root.addView(overlay, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        configureWebView();
        updateNetwork(true);
    }

    @Override protected void onStart() {
        super.onStart();
        network.registerDefaultNetworkCallback(networkCallback);
        observing = true;
        updateNetwork(true);
    }

    @Override protected void onStop() {
        if (observing) network.unregisterNetworkCallback(networkCallback);
        observing = false;
        super.onStop();
    }

    private boolean connected() {
        Network active = network.getActiveNetwork();
        NetworkCapabilities capabilities = active == null ? null : network.getNetworkCapabilities(active);
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    private void load() {
        started = true;
        failed = false;
        ready = false;
        web.loadUrl(origin.origin() + "/");
        updateNetwork(false);
    }

    private void updateNetwork(boolean autoStart) {
        if (isFinishing() || isDestroyed()) return;
        boolean online = connected();
        if (online && !started && !unsupported && autoStart) {
            load();
            return;
        }
        boolean blocked = !online || failed || !ready || unsupported;
        overlay.setVisibility(blocked ? View.VISIBLE : View.GONE);
        web.setImportantForAccessibility(blocked ? View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS : View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        if (!online) show("Network disconnected", "Reconnect to Wi-Fi or mobile data to continue.", true);
        else if (unsupported) show("Android WebView needs an update", "Update Android System WebView and reopen the app.", false);
        else if (failed) show("Field app could not load", "Check your connection and try again.", true);
        else if (!ready) show("Opening Tea Factory Field…", "", false);
        if (ready && origin.allows(web.getUrl())) {
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('tea-network',{detail:{connected:" + online + "}}));", null);
        }
    }

    private void show(String heading, String message, boolean canRetry) {
        title.setText(heading);
        details.setText(message);
        retry.setVisibility(canRetry ? View.VISIBLE : View.GONE);
    }

    private void configureWebView() {
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.isForMainFrame() || !origin.allows(request.getUrl().toString());
            }

            @Override public void onPageFinished(WebView view, String url) {
                if (!failed && origin.allows(url)) ready = true;
                updateNetwork(false);
            }

            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) { failed = true; updateNetwork(false); }
            }

            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) { failed = true; updateNetwork(false); }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }

            @Override public void onGeolocationPermissionsShowPrompt(String source, GeolocationPermissions.Callback callback) {
                if (!origin.allows(source) || !origin.allows(web.getUrl()) || !connected()) {
                    callback.invoke(source, false, false);
                } else if (locationAllowed()) {
                    callback.invoke(source, true, false);
                } else if (locationCallback == null) {
                    locationOrigin = source;
                    locationCallback = callback;
                    requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, LOCATION);
                } else {
                    callback.invoke(source, false, false);
                }
            }

            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!origin.allows(view.getUrl()) || !connected() || fileCallback != null) {
                    callback.onReceiveValue(null);
                    return true;
                }
                fileCallback = callback;
                if (params.isCaptureEnabled() && openCamera()) return true;
                try {
                    Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
                    startActivityForResult(pick, IMAGE);
                } catch (Exception error) {
                    finishImage(null);
                }
                return true;
            }
        });
        unsupported = !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER);
        if (unsupported) return;
        WebViewCompat.addWebMessageListener(web, "TeaFactoryNative", java.util.Collections.singleton(origin.origin()), (view, message, source, mainFrame, reply) -> {
            if (!mainFrame || !origin.allows(source.toString()) || !origin.allows(view.getUrl())) return;
            String input = message.getData();
            if (input == null || input.length() > 16384) return;
            String id = null;
            try {
                JSONObject command = new JSONObject(input);
                id = command.optString("id");
                if (command.optInt("v") != 1 || !id.matches("[0-9]{1,16}")) return;
                Object result = dispatch(command.optString("method"), command.optJSONObject("params"));
                reply.postMessage(new JSONObject().put("v", 1).put("id", id).put("ok", true).put("result", result).toString());
            } catch (Exception error) {
                if (id == null) return;
                try { reply.postMessage(new JSONObject().put("v", 1).put("id", id).put("ok", false)
                    .put("error", "The Android app could not complete the request.").toString()); }
                catch (Exception ignored) { }
            }
        });
    }

    private Object dispatch(String method, JSONObject params) throws Exception {
        switch (method) {
            case "device.get":
                var prefs = getSharedPreferences("device", MODE_PRIVATE);
                String id = prefs.getString("uuid", null);
                if (id == null) {
                    id = UUID.randomUUID().toString();
                    if (!prefs.edit().putString("uuid", id).commit()) throw new IllegalStateException("Device ID could not be saved.");
                }
                return new JSONObject().put("deviceId", id).put("platform", "android")
                    .put("model", Build.MODEL).put("appVersion", BuildConfig.VERSION_NAME);
            case "session.get":
                JSONObject session = sessions.get();
                return session == null ? JSONObject.NULL : session;
            case "session.set":
                if (params == null) throw new IllegalArgumentException("Missing session.");
                String token = params.getString("session");
                String actor = params.getString("userId");
                if (token.trim().isEmpty() || token.length() > 8192 || !actor.matches("[a-fA-F0-9-]{36}")) {
                    throw new IllegalArgumentException("Invalid session.");
                }
                sessions.set(new JSONObject().put("session", token).put("userId", actor));
                return JSONObject.NULL;
            case "session.clear":
                sessions.clear();
                return JSONObject.NULL;
            default:
                throw new IllegalArgumentException("Unknown operation.");
        }
    }

    private boolean locationAllowed() {
        return checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == LOCATION && locationCallback != null) {
            locationCallback.invoke(locationOrigin, locationAllowed() && connected() && origin.allows(web.getUrl()), false);
            locationCallback = null;
        }
    }

    private boolean openCamera() {
        try {
            File dir = new File(getCacheDir(), "camera");
            if (!dir.exists() && !dir.mkdirs()) return false;
            File file = File.createTempFile("capture-", ".jpg", dir);
            cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".camera", file);
            Intent capture = new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            capture.setClipData(ClipData.newRawUri("Capture", cameraUri));
            capture.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            startActivityForResult(capture, CAMERA);
            return true;
        } catch (Exception error) {
            cameraUri = null;
            return false;
        }
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == CAMERA) {
            finishImage(result == RESULT_OK && cameraUri != null ? new Uri[]{cameraUri} : null);
            cameraUri = null;
        } else if (code == IMAGE) {
            Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
            finishImage(uri != null && "content".equals(uri.getScheme()) ? new Uri[]{uri} : null);
        }
    }

    private void finishImage(Uri[] images) {
        if (fileCallback == null) return;
        fileCallback.onReceiveValue(connected() && origin.allows(web.getUrl()) ? images : null);
        fileCallback = null;
    }

    @Override public void onBackPressed() {
        if (overlay.getVisibility() != View.VISIBLE && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        finishImage(null);
        web.destroy();
        super.onDestroy();
    }
}
