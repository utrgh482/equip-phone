package kr.yeoju.equip;

// 장비 수리 대장 핸드폰 앱 — 껍데기
//  하는 일: ① GitHub Pages 의 핸드폰 페이지를 WebView 로 엶
//          ② 사진 찍기·고르기(파일 칸)를 사진 앱·갤러리로 연결
//          ③ 페이지가 준 파일(엑셀·문서)을 다운로드 폴더에 저장 (EquipApp.saveFile)
//          ④ 인터넷이 끊기면 "다시 시도" 화면
//  (서버에 올릴 때는 app/src/main/java/kr/yeoju/equip/ 아래로 옮겨져 올라갑니다)

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.OutputStream;
import java.util.ArrayList;

public class MainActivity extends Activity {
    private static final int PICK = 41;
    private WebView web;
    private ValueCallback<Uri[]> pending;
    private Uri cameraUri;
    private final String home = BuildConfig.HOME_URL;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " EquipApp/1");

        web.addJavascriptInterface(new Bridge(), "EquipApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String h = u.getHost() == null ? "" : u.getHost();
                if (h.endsWith(".github.io") && u.toString().startsWith(home)) return false; // 우리 페이지는 안에서
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { /* 열 앱 없음 */ }
                return true; // 그 밖(Releases 등)은 브라우저로
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showOffline();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (pending != null) pending.onReceiveValue(null);
                pending = cb;
                openChooser(params);
                return true;
            }
        });

        if (saved != null) web.restoreState(saved); else web.loadUrl(home);
    }

    // 인터넷이 없을 때
    private void showOffline() {
        String html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
            + "<body style='font-family:sans-serif;background:#F6F8F3;color:#1F2A1C;display:flex;align-items:center;justify-content:center;height:90vh;text-align:center'>"
            + "<div><div style='font-size:26px;font-weight:800'>장비 수리 대장</div>"
            + "<p style='color:#55604f'>인터넷에 연결되지 않았어요.</p>"
            + "<a href='" + home + "' style='display:inline-block;padding:12px 22px;background:#AFCE8D;color:#1F2A1C;border-radius:10px;text-decoration:none;font-weight:700'>다시 시도</a></div></body></html>";
        web.loadDataWithBaseURL(home, html, "text/html", "utf-8", home);
    }

    // 파일 칸: 사진 찍기 + 갤러리·파일 고르기를 한 번에 보여 줌
    private void openChooser(WebChromeClient.FileChooserParams params) {
        ArrayList<Intent> extra = new ArrayList<>();
        cameraUri = null;
        String[] types = params.getAcceptTypes();
        boolean imageOk = types == null || types.length == 0 || types[0].isEmpty();
        if (types != null) for (String t : types) if (t != null && t.startsWith("image")) imageOk = true;
        if (imageOk) {
            try {
                File dir = new File(getCacheDir(), "camera");
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, "photo_" + System.currentTimeMillis() + ".jpg");
                cameraUri = FileProvider.getUriForFile(this, "kr.yeoju.equip.files", f);
                Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                extra.add(cam);
            } catch (Exception e) { cameraUri = null; }
        }
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType(imageOk && types != null && types.length > 0 && types[0].startsWith("image") ? "image/*" : "*/*");
        if (params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        Intent chooser = Intent.createChooser(pick, "사진·파일 고르기");
        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extra.toArray(new Intent[0]));
        try { startActivityForResult(chooser, PICK); }
        catch (ActivityNotFoundException e) { if (pending != null) pending.onReceiveValue(null); pending = null; }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != PICK || pending == null) return;
        Uri[] out = null;
        if (res == RESULT_OK) {
            if (data != null && data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                out = new Uri[n];
                for (int i = 0; i < n; i++) out[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data != null && data.getData() != null) {
                out = new Uri[]{ data.getData() };
            } else if (cameraUri != null) {
                out = new Uri[]{ cameraUri }; // 사진 앱으로 찍은 것
            }
        }
        pending.onReceiveValue(out);
        pending = null;
    }

    // 페이지가 부르는 곳: window.EquipApp.saveFile(base64, 이름, 종류)
    private class Bridge {
        @JavascriptInterface
        public void saveFile(String b64, String name, String mime) {
            try {
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new Exception("저장할 자리를 만들지 못했어요");
                try (OutputStream os = getContentResolver().openOutputStream(uri)) { os.write(bytes); }
                final Uri done = uri;
                final String type = mime;
                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, "다운로드 폴더에 저장했어요: " + name, Toast.LENGTH_LONG).show();
                    try {
                        Intent open = new Intent(Intent.ACTION_VIEW);
                        open.setDataAndType(done, type);
                        open.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(open);
                    } catch (Exception e) { /* 열 앱이 없으면 저장만 */ }
                });
            } catch (Exception e) {
                final String msg = e.getMessage();
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "저장하지 못했어요: " + msg, Toast.LENGTH_LONG).show());
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }
}
