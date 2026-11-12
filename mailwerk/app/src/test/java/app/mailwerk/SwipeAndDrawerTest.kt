package app.mailwerk

import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeRight
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import app.mailwerk.data.Db
import app.mailwerk.ui.MainActivity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w393dp-h852dp-xhdpi")
class SwipeAndDrawerTest {
    @org.junit.Before fun deLocale() { java.util.Locale.setDefault(java.util.Locale.GERMAN) }
    @get:Rule val rule = createEmptyComposeRule()

    @Test fun swipeArchiveSlidesOutAndListCloses() {
        ScreenshotTest.seed()
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val db = Db.get(ctx)
        ActivityScenario.launch(MainActivity::class.java)
        rule.waitForIdle()
        assertEquals(1, rule.onAllNodesWithText("Termin nächste Woche", useUnmergedTree = true).fetchSemanticsNodes().size)
        rule.mainClock.autoAdvance = false
        rule.onAllNodesWithText("Termin nächste Woche", useUnmergedTree = true).onFirst().performTouchInput { swipeRight() }
        // mitten in der Animation ist die Mail noch da (gleitet/schrumpft), noch nichts ausgeführt
        rule.mainClock.advanceTimeBy(120)
        val inbox = db.listMessages(null, null, null).count { it.subject == "Termin nächste Woche" }
        assertEquals(1, inbox)
        rule.mainClock.autoAdvance = true
        rule.waitForIdle(); Thread.sleep(400); rule.waitForIdle()
        // danach archiviert und aus der Liste verschwunden
        assertEquals(0, db.listMessages(null, null, null).count { it.subject == "Termin nächste Woche" })
        assertEquals(0, rule.onAllNodesWithText("Termin nächste Woche", useUnmergedTree = true).fetchSemanticsNodes().size)
        assertTrue(rule.onAllNodesWithText("Steuerbüro Klein", substring = true, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty())
    }

    @Test fun drawerAccountCollapses() {
        ScreenshotTest.seed()
        ActivityScenario.launch(MainActivity::class.java)
        rule.waitForIdle()
        rule.onAllNodes(hasContentDescription("Menü")).onFirst().performClick()
        rule.waitForIdle()
        assertTrue(rule.onAllNodesWithText("Gesendet", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty())
        rule.onAllNodes(hasContentDescription("Einklappen"), useUnmergedTree = true).onFirst().performClick()
        rule.waitForIdle()
        assertEquals(0, rule.onAllNodesWithText("Gesendet", useUnmergedTree = true).fetchSemanticsNodes().size)
        rule.onAllNodes(hasContentDescription("Aufklappen"), useUnmergedTree = true).onFirst().performClick()
        rule.waitForIdle()
        assertTrue(rule.onAllNodesWithText("Gesendet", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty())
        ApplicationProvider.getApplicationContext<android.content.Context>().let { app.mailwerk.data.Prefs(it).drawerExpanded = null }
    }
}
