package cn.wealthos.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String PREFS = "wealth_os";
    private static final String SERVER_URL = "server_url";
    private WebView webView;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        String url = getPreferences(MODE_PRIVATE).getString(SERVER_URL, "");
        if (url.isEmpty()) showServerSetup(); else showWebApp(url);
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color); return view;
    }

    private Button button(String value) {
        Button button = new Button(this); button.setText(value); button.setAllCaps(false); return button;
    }

    private void showServerSetup() {
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setGravity(Gravity.CENTER); root.setPadding(48, 48, 48, 48); root.setBackgroundColor(Color.rgb(7,17,30));
        TextView logo = text("↗  WEALTH OS", 26, Color.WHITE); root.addView(logo);
        TextView hint = text("输入已经部署的 HTTPS 地址，或同一局域网电脑的地址。\n本地示例：http://192.168.1.20:3000", 14, Color.rgb(145,164,184)); hint.setPadding(0,32,0,24); root.addView(hint);
        EditText input = new EditText(this); input.setHint("https://你的域名"); input.setSingleLine(true); input.setTextColor(Color.WHITE); input.setHintTextColor(Color.GRAY); root.addView(input, new LinearLayout.LayoutParams(-1,-2));
        Button connect = button("连接服务器"); root.addView(connect, new LinearLayout.LayoutParams(-1,-2));
        connect.setOnClickListener(view -> { String url = input.getText().toString().trim(); if (!url.matches("https?://.+")) { Toast.makeText(this,"请输入完整的 http:// 或 https:// 地址",Toast.LENGTH_LONG).show(); return; } getPreferences(MODE_PRIVATE).edit().putString(SERVER_URL,url.replaceAll("/+$","")).apply(); showWebApp(url); });
        setContentView(root);
    }

    private void showWebApp(String url) {
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(7,17,30));
        LinearLayout bar = new LinearLayout(this); bar.setGravity(Gravity.CENTER_VERTICAL); bar.setPadding(12,6,8,6); bar.setBackgroundColor(Color.rgb(10,24,40));
        TextView title = text("WEALTH OS",16,Color.WHITE); title.setPadding(10,0,0,0); bar.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        Button reload = button("刷新"); Button settings = button("服务器"); bar.addView(reload); bar.addView(settings); root.addView(bar,new LinearLayout.LayoutParams(-1,-2));
        webView = new WebView(this); WebSettings web = webView.getSettings(); web.setJavaScriptEnabled(true); web.setDomStorageEnabled(true); web.setDatabaseEnabled(true); web.setLoadWithOverviewMode(true); web.setUseWideViewPort(true); web.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(webView,true);
        webView.setWebViewClient(new WebViewClient()); webView.setWebChromeClient(new WebChromeClient()); root.addView(webView,new LinearLayout.LayoutParams(-1,0,1)); setContentView(root); webView.loadUrl(url);
        reload.setOnClickListener(view -> webView.reload()); settings.setOnClickListener(view -> { getPreferences(MODE_PRIVATE).edit().remove(SERVER_URL).apply(); showServerSetup(); });
    }

    @Override public void onBackPressed() { if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed(); }
}
