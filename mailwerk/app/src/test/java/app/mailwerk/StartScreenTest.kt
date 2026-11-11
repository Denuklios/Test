package app.mailwerk

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import app.mailwerk.data.ThemeMode
import app.mailwerk.ui.MailwerkTheme
import app.mailwerk.ui.StartScreen
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w393dp-h852dp-xhdpi")
class StartScreenTest {
    @get:Rule val rule = createComposeRule()

    @Test fun light() {
        rule.setContent { MailwerkTheme(ThemeMode.LIGHT) { StartScreen() } }
        rule.onRoot().captureRoboImage("build/screenshots/13_startbildschirm.png")
    }

    @Test fun dark() {
        rule.setContent { MailwerkTheme(ThemeMode.DARK) { StartScreen() } }
        rule.onRoot().captureRoboImage("build/screenshots/14_startbildschirm_dunkel.png")
    }
}
