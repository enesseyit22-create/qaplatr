package com.qapla.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationChannel channel = new NotificationChannel(
      "qapla_alerts",
      "QapLA bildirimleri",
      NotificationManager.IMPORTANCE_HIGH
    );
    channel.setDescription("Kampanya ve kupon");
    channel.enableVibration(true);
    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager != null) manager.createNotificationChannel(channel);
  }
}
