package app.fotogalerie.android;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // eigenes Modul für den Zugriff auf die Handy-Fotos
        registerPlugin(DeviceGalleryPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
