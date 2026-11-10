package app.mailwerk

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import com.github.takahirom.roborazzi.captureRoboImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import app.mailwerk.ui.MainActivity
import app.mailwerk.ui.Screen
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w393dp-h852dp-xhdpi")
class SetupScreenshotTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    private fun shot(name: String) {
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screenshots/$name.png")
    }

    @Test fun setupAndSettings() {
        rule.activity.runOnUiThread {
            androidx.lifecycle.ViewModelProvider(rule.activity)[app.mailwerk.ui.MainViewModel::class.java].push(Screen.AccountSetup())
        }
        shot("0_konto_einrichten")
        rule.activity.runOnUiThread {
            androidx.lifecycle.ViewModelProvider(rule.activity)[app.mailwerk.ui.MainViewModel::class.java].pop()
        }
        rule.activity.runOnUiThread {
            val vm = androidx.lifecycle.ViewModelProvider(rule.activity)[app.mailwerk.ui.MainViewModel::class.java]
            vm.push(Screen.Settings)
        }
        shot("7_einstellungen")
    }
}
