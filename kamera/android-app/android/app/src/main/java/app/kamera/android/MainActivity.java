package app.kamera.android;

import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaPlugin.class);
        registerPlugin(AiPlugin.class);
        super.onCreate(savedInstanceState);
        // Bildschirm bleibt an, solange die Kamera offen ist
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    /** Lautstärketasten lösen aus (wie bei normalen Kamera-Apps) */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_CAMERA) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0 && getBridge() != null) {
                getBridge().triggerWindowJSEvent("hardwareShutter");
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
}
