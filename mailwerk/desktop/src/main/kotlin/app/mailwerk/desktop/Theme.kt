package app.mailwerk.desktop

import androidx.compose.foundation.IndicationNodeFactory
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.LocalScrollbarStyle
import androidx.compose.foundation.ScrollbarStyle
import androidx.compose.foundation.interaction.HoverInteraction
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LocalRippleConfiguration
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.node.DelegatableNode
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.invalidateDraw
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.platform.Font
import androidx.compose.ui.text.platform.SystemFont
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/** Markenfarben */
object Brand {
    val Indigo = Color(0xFF3D4FE0)
    val Violet = Color(0xFF7B5CF5)
    val gradient = Brush.linearGradient(listOf(Color(0xFF4F63F5), Color(0xFF7B5CF5)))
}

/**
 * Flächen wie Windows 11 / Outlook: ruhige Grautöne, Farbe nur als Akzent.
 * surfaceContainer = Navigationsleiste, surfaceContainerLow = Mailliste, background = Lesebereich.
 */
private val Light = lightColorScheme(
    primary = Color(0xFF3D4FE0), onPrimary = Color.White,
    primaryContainer = Color(0xFFE8EAFC), onPrimaryContainer = Color(0xFF1B2380),
    secondaryContainer = Color(0xFFE5E7F5), onSecondaryContainer = Color(0xFF1B1B1F),
    tertiary = Color(0xFFB86E00), tertiaryContainer = Color(0xFFFFF0D6),
    background = Color(0xFFFAFAFA), onBackground = Color(0xFF1B1B1F),
    surface = Color(0xFFFFFFFF), onSurface = Color(0xFF1B1B1F),
    surfaceVariant = Color(0xFFF0F0F2), onSurfaceVariant = Color(0xFF616161),
    surfaceContainerLowest = Color.White, surfaceContainerLow = Color.White,
    surfaceContainer = Color(0xFFF3F3F5), surfaceContainerHigh = Color(0xFFEBEBEE), surfaceContainerHighest = Color(0xFFE3E3E7),
    outline = Color(0xFFC4C4C8), outlineVariant = Color(0xFFE6E6E9), error = Color(0xFFC42B1C), errorContainer = Color(0xFFFDE7E9),
    inverseSurface = Color(0xFF2B2B2B), inverseOnSurface = Color.White,
)

private val Dark = darkColorScheme(
    primary = Color(0xFF8C98FF), onPrimary = Color(0xFF0F1650),
    primaryContainer = Color(0xFF2C3260), onPrimaryContainer = Color(0xFFE2E5FF),
    secondaryContainer = Color(0xFF34384F), onSecondaryContainer = Color(0xFFF0F0F5),
    tertiary = Color(0xFFFFC266), tertiaryContainer = Color(0xFF4A3300),
    background = Color(0xFF1C1C1C), onBackground = Color(0xFFF1F1F1),
    surface = Color(0xFF242424), onSurface = Color(0xFFF1F1F1),
    surfaceVariant = Color(0xFF2E2E2E), onSurfaceVariant = Color(0xFFADADAD),
    surfaceContainerLowest = Color(0xFF242424), surfaceContainerLow = Color(0xFF242424),
    surfaceContainer = Color(0xFF1A1A1A), surfaceContainerHigh = Color(0xFF303030), surfaceContainerHighest = Color(0xFF3A3A3A),
    outline = Color(0xFF5C5C5C), outlineVariant = Color(0xFF353535), error = Color(0xFFFF99A4), errorContainer = Color(0xFF442726),
    inverseSurface = Color(0xFFEDEDED), inverseOnSurface = Color(0xFF1B1B1B),
)

/** Windows-Schrift (Segoe UI Variable bzw. Segoe UI); auf anderen Systemen die Marken-Schrift */
@OptIn(ExperimentalTextApi::class)
val UiFont: FontFamily by lazy {
    if (Paths.isWindows) FontFamily(
        SystemFont("Segoe UI Variable Text", FontWeight.Normal), SystemFont("Segoe UI Variable Text", FontWeight.SemiBold),
        SystemFont("Segoe UI Variable Text", FontWeight.Bold), SystemFont("Segoe UI", FontWeight.Normal), SystemFont("Segoe UI", FontWeight.SemiBold),
        SystemFont("Segoe UI", FontWeight.Bold),
    ) else FontFamily(
        Font("font/jakarta_regular.ttf", FontWeight.Normal), Font("font/jakarta_medium.ttf", FontWeight.Medium),
        Font("font/jakarta_semibold.ttf", FontWeight.SemiBold), Font("font/jakarta_bold.ttf", FontWeight.Bold),
    )
}
val Jakarta get() = UiFont

/** ruhige, PC-typische Schriftgrößen */
private fun desktopTypography(f: FontFamily): Typography {
    fun s(size: Int, w: FontWeight = FontWeight.Normal, lh: Int = (size * 1.4).toInt()) =
        TextStyle(fontFamily = f, fontSize = size.sp, fontWeight = w, lineHeight = lh.sp)
    return Typography(
        displayLarge = s(40, FontWeight.SemiBold), displayMedium = s(34, FontWeight.SemiBold), displaySmall = s(28, FontWeight.SemiBold),
        headlineLarge = s(26, FontWeight.SemiBold), headlineMedium = s(22, FontWeight.SemiBold), headlineSmall = s(20, FontWeight.SemiBold),
        titleLarge = s(18, FontWeight.SemiBold), titleMedium = s(15, FontWeight.SemiBold), titleSmall = s(13, FontWeight.SemiBold),
        bodyLarge = s(15, lh = 23), bodyMedium = s(14), bodySmall = s(12),
        labelLarge = s(13, FontWeight.SemiBold), labelMedium = s(12), labelSmall = s(11),
    )
}

/** Kleine Rundungen wie Windows 11 (statt Handy-Pillen) */
private val DesktopShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp), small = RoundedCornerShape(4.dp), medium = RoundedCornerShape(6.dp),
    large = RoundedCornerShape(8.dp), extraLarge = RoundedCornerShape(10.dp),
)
val ButtonShape = RoundedCornerShape(5.dp)

/** Dezente Hervorhebung beim Überfahren mit der Maus und beim Klicken – statt Android-„Wassertropfen“ */
private class HoverIndication(private val tint: Color) : IndicationNodeFactory {
    override fun create(interactionSource: InteractionSource): DelegatableNode = Node(interactionSource, tint)
    override fun equals(other: Any?) = other is HoverIndication && other.tint == tint
    override fun hashCode() = tint.hashCode()
    private class Node(val src: InteractionSource, val tint: Color) : Modifier.Node(), DrawModifierNode {
        var hovered = false; var pressed = false
        override fun onAttach() {
            coroutineScope.launch {
                src.interactions.collect { i ->
                    when (i) {
                        is HoverInteraction.Enter -> hovered = true; is HoverInteraction.Exit -> hovered = false
                        is PressInteraction.Press -> pressed = true; is PressInteraction.Release, is PressInteraction.Cancel -> pressed = false
                    }
                    invalidateDraw()
                }
            }
        }
        override fun ContentDrawScope.draw() {
            drawContent()
            if (pressed) drawRect(tint.copy(alpha = 0.09f)) else if (hovered) drawRect(tint.copy(alpha = 0.05f))
        }
    }
}

/** Windows: „Apps im dunklen Modus“ aus der Registrierung lesen */
fun windowsPrefersDark(): Boolean = runCatching {
    if (!Paths.isWindows) return false
    com.sun.jna.platform.win32.Advapi32Util.registryGetIntValue(com.sun.jna.platform.win32.WinReg.HKEY_CURRENT_USER,
        "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "AppsUseLightTheme") == 0
}.getOrDefault(false)

val LocalDark = staticCompositionLocalOf { false }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MailwerkTheme(dark: Boolean, content: @Composable () -> Unit) {
    val scheme = if (dark) Dark else Light
    MaterialTheme(colorScheme = scheme, typography = desktopTypography(UiFont), shapes = DesktopShapes) {
        CompositionLocalProvider(
            LocalIndication provides HoverIndication(scheme.onSurface),
            LocalRippleConfiguration provides null,
            LocalDark provides dark,
            LocalScrollbarStyle provides ScrollbarStyle(
                minimalHeight = 32.dp, thickness = 7.dp, shape = RoundedCornerShape(4.dp), hoverDurationMillis = 150,
                unhoverColor = scheme.onSurface.copy(alpha = 0.18f), hoverColor = scheme.onSurface.copy(alpha = 0.38f)),
            content = content,
        )
    }
}

/** Titelleiste von Windows an die App anpassen (Farbe, Dunkelmodus, runde Ecken) – Windows 11, sonst wirkungslos */
object WinChrome {
    private interface Dwm : com.sun.jna.Library {
        fun DwmSetWindowAttribute(hwnd: com.sun.jna.platform.win32.WinDef.HWND, attr: Int, value: com.sun.jna.ptr.IntByReference, size: Int): Int
    }
    private val dwm: Dwm? by lazy { if (Paths.isWindows) runCatching { com.sun.jna.Native.load("dwmapi", Dwm::class.java) }.getOrNull() else null }

    fun apply(window: java.awt.Window, dark: Boolean, caption: Color) {
        val d = dwm ?: return
        runCatching {
            val hwnd = com.sun.jna.platform.win32.WinDef.HWND(com.sun.jna.Native.getWindowPointer(window))
            fun set(attr: Int, v: Int) = d.DwmSetWindowAttribute(hwnd, attr, com.sun.jna.ptr.IntByReference(v), 4)
            set(20, if (dark) 1 else 0)                    // DWMWA_USE_IMMERSIVE_DARK_MODE
            set(33, 2)                                     // DWMWA_WINDOW_CORNER_PREFERENCE = rund
            val argb = caption.value.shr(32).toLong()
            val r = (argb shr 16) and 0xFF; val g = (argb shr 8) and 0xFF; val b = argb and 0xFF
            set(35, ((b shl 16) or (g shl 8) or r).toInt()) // DWMWA_CAPTION_COLOR (COLORREF 0x00BBGGRR)
            set(36, if (dark) 0x00F1F1F1 else 0x001F1B1B) // DWMWA_TEXT_COLOR
        }
    }
}
