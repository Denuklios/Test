package app.mailwerk.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.mailwerk.R
import androidx.compose.runtime.withFrameMillis

/** Partner, der beim Start genannt wird („Powered by“). */
object Sponsor {
    const val NAME = "Wunsch-Fabrik"
    const val DOMAIN = "wunsch-fabrik.dk"
    const val URL = "https://wunsch-fabrik.dk/?ref=mailwerk"
}

/**
 * Startbildschirm beim Öffnen der App (nur beim echten Neustart, nicht beim Zurückkehren):
 * App-Symbol und „Powered by Wunsch-Fabrik“. Antippen öffnet die Website. Kein Tracking.
 */
@Composable
fun StartOverlay(coldStart: Boolean, durationMs: Long = 1300) {
    var visible by rememberSaveable { mutableStateOf(coldStart) }
    LaunchedEffect(Unit) {
        if (!visible) return@LaunchedEffect
        // über die Bildwiederholung der Oberfläche messen (läuft auch in Tests mit der Test-Uhr)
        val start = withFrameMillis { it }
        while (withFrameMillis { it } - start < durationMs) { /* nächstes Bild */ }
        visible = false
    }
    AnimatedVisibility(visible, exit = fadeOut()) { StartScreen() }
}

@Composable
fun StartScreen() {
    val ctx = LocalContext.current
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).clickable(enabled = false) {}) {
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Box(Modifier.size(128.dp).shadow(18.dp, RoundedCornerShape(32.dp), spotColor = Brand.Indigo).clip(RoundedCornerShape(32.dp))) {
                Image(painterResource(R.drawable.ic_launcher_background), null, Modifier.fillMaxSize())
                Image(painterResource(R.drawable.ic_launcher_foreground), null, Modifier.fillMaxSize())
            }
            Spacer(Modifier.height(22.dp))
            Text("Mailwerk", style = MaterialTheme.typography.displaySmall, color = MaterialTheme.colorScheme.onBackground)
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(bottom = 48.dp)
            .clickable { openUrl(ctx, Sponsor.URL) }.padding(vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally) {
            Text("POWERED BY", style = MaterialTheme.typography.labelLarge.copy(letterSpacing = 3.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            Text(Sponsor.NAME, style = MaterialTheme.typography.headlineLarge.copy(fontSize = 38.sp, lineHeight = 44.sp),
                color = MaterialTheme.colorScheme.onBackground, textAlign = TextAlign.Center)
            Spacer(Modifier.height(4.dp))
            Text(Sponsor.DOMAIN, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
    }
}
