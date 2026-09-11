package app.incant.web;
import android.app.Activity;
import android.os.Bundle;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import androidx.browser.customtabs.*;
import androidx.browser.trusted.TrustedWebActivityIntentBuilder;

public class MainActivity extends Activity {
 private static final Uri SITE = Uri.parse("https://incant-web-production.up.railway.app/");
 private boolean launched = false, bound = false, departed = false;
 private final CustomTabsServiceConnection connection = new CustomTabsServiceConnection() {
  @Override public void onCustomTabsServiceConnected(ComponentName name, CustomTabsClient client) {
   if (isFinishing() || launched) return;
   client.warmup(0);
   CustomTabsSession session = client.newSession(new CustomTabsCallback());
   if(session == null) { fallback(); return; }
   launched = true;
   new TrustedWebActivityIntentBuilder(SITE).build(session).launchTrustedWebActivity(MainActivity.this);
  }
  @Override public void onServiceDisconnected(ComponentName name) { }
 };
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  bound = CustomTabsClient.bindCustomTabsService(this, "com.android.chrome", connection);
  if (!bound) fallback();
 }
 private void fallback() {
  if(launched) return;
  launched=true;
  startActivity(new Intent(Intent.ACTION_VIEW,SITE));
  finish();
 }
 @Override protected void onStop() { super.onStop(); if(launched) departed=true; }
 @Override protected void onResume() { super.onResume(); if(departed) finish(); }
 @Override protected void onDestroy() { if(bound) unbindService(connection); super.onDestroy(); }
}
