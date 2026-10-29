package io.finanzas;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Hosts the interface (assets/index.html) in a WebView and keeps the data on the phone.
 *
 * All data lives in one JSON file in the app's private storage (files/data.json). Android keeps that folder when the
 * app is updated (same package and signing key), so new versions never lose what was entered. Each save writes a
 * temporary file and renames it over the old one, keeping the previous version as data.json.bak.
 */
public class MainActivity extends Activity {
    private static final int REQ_EXPORT = 1;
    private static final int REQ_IMPORT = 2;

    private WebView web;
    private String pendingExport;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.parseColor("#121211"));
        getWindow().setNavigationBarColor(Color.parseColor("#121211"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#121211"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true); // only to read the bundled file:///android_asset/ pages
        s.setAllowContentAccess(false);

        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebChromeClient(new WebChromeClient()); // enables confirm() dialogs
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith("file:///android_asset/");
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    private File dataFile() {
        return new File(getFilesDir(), "data.json");
    }

    private static String readAll(InputStream in) throws IOException {
        try (InputStream is = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private void callJs(String code) {
        runOnUiThread(() -> web.evaluateJavascript(code, null));
    }

    /** Called from the page. */
    private final class Bridge {
        @JavascriptInterface
        public String load() {
            File f = dataFile();
            if (!f.exists()) return "";
            try {
                return readAll(new FileInputStream(f));
            } catch (IOException e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean save(String json) {
            File f = dataFile();
            File tmp = new File(getFilesDir(), "data.json.tmp");
            File bak = new File(getFilesDir(), "data.json.bak");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            } catch (IOException e) {
                return false;
            }
            if (f.exists()) {
                bak.delete();
                f.renameTo(bak);
            }
            return tmp.renameTo(f);
        }

        @JavascriptInterface
        public void exportBackup(String json, String fileName) {
            pendingExport = json;
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("application/json");
            i.putExtra(Intent.EXTRA_TITLE, fileName);
            runOnUiThread(() -> startActivityForResult(i, REQ_EXPORT));
        }

        @JavascriptInterface
        public void importBackup() {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            runOnUiThread(() -> startActivityForResult(i, REQ_IMPORT));
        }

        @JavascriptInterface
        public void toast(String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void exit() {
            runOnUiThread(() -> moveTaskToBack(true));
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        Uri uri = (result == RESULT_OK && data != null) ? data.getData() : null;
        if (request == REQ_EXPORT) {
            boolean ok = false;
            if (uri != null && pendingExport != null) {
                try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                    out.write(pendingExport.getBytes(StandardCharsets.UTF_8));
                    ok = true;
                } catch (IOException | NullPointerException e) {
                    ok = false;
                }
            }
            pendingExport = null;
            if (uri != null) callJs("window.onExportDone && window.onExportDone(" + ok + ")");
        } else if (request == REQ_IMPORT && uri != null) {
            try {
                String text = readAll(getContentResolver().openInputStream(uri));
                callJs("window.onImportData && window.onImportData(" + JSONObject.quote(text) + ")");
            } catch (IOException | NullPointerException e) {
                callJs("window.onImportData && window.onImportData('')");
            }
        }
    }

    @Override
    public void onBackPressed() {
        // The page closes its own sheets and tabs first and calls Android.exit() when it has nothing left to close.
        web.evaluateJavascript("window.handleBack && window.handleBack()", null);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
