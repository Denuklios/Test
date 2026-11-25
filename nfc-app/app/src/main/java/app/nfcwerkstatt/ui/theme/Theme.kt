package app.nfcwerkstatt.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val Indigo = Color(0xFF4F46E5)
val Violet = Color(0xFF7C3AED)
val Cyan = Color(0xFF06B6D4)
val Success = Color(0xFF16A34A)

/** Markenverlauf für Logo, Scan-Kreis und Tag-Karte. */
val BrandGradient = Brush.linearGradient(listOf(Indigo, Violet))
val ScanGradient = Brush.linearGradient(listOf(Indigo, Violet, Cyan))

private val Light = lightColorScheme(
    primary = Indigo,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE6E4FF),
    onPrimaryContainer = Color(0xFF1E1A6D),
    secondary = Color(0xFF0891B2),
    secondaryContainer = Color(0xFFD5F3FA),
    onSecondaryContainer = Color(0xFF043E4C),
    tertiary = Violet,
    background = Color(0xFFF5F6FA),
    onBackground = Color(0xFF15171E),
    surface = Color(0xFFF5F6FA),
    onSurface = Color(0xFF15171E),
    surfaceVariant = Color(0xFFE7E9F1),
    onSurfaceVariant = Color(0xFF5B6070),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color.White,
    surfaceContainer = Color(0xFFFFFFFF),
    surfaceContainerHigh = Color(0xFFEEF0F6),
    surfaceContainerHighest = Color(0xFFE6E8F0),
    outline = Color(0xFFB9BDCB),
    outlineVariant = Color(0xFFE2E4EC),
    error = Color(0xFFDC2626),
    errorContainer = Color(0xFFFDE2E2),
    onErrorContainer = Color(0xFF7A1010),
)

private val Dark = darkColorScheme(
    primary = Color(0xFFA5B4FC),
    onPrimary = Color(0xFF1B1766),
    primaryContainer = Color(0xFF312E81),
    onPrimaryContainer = Color(0xFFE0E3FF),
    secondary = Color(0xFF67E8F9),
    secondaryContainer = Color(0xFF164E63),
    onSecondaryContainer = Color(0xFFCFFAFE),
    tertiary = Color(0xFFC4B5FD),
    background = Color(0xFF0D0F15),
    onBackground = Color(0xFFE7E8EE),
    surface = Color(0xFF0D0F15),
    onSurface = Color(0xFFE7E8EE),
    surfaceVariant = Color(0xFF232733),
    onSurfaceVariant = Color(0xFFA3A8B8),
    surfaceContainerLowest = Color(0xFF111319),
    surfaceContainerLow = Color(0xFF161922),
    surfaceContainer = Color(0xFF181B25),
    surfaceContainerHigh = Color(0xFF20242F),
    surfaceContainerHighest = Color(0xFF292D39),
    outline = Color(0xFF4A4F5E),
    outlineVariant = Color(0xFF2A2E3A),
    error = Color(0xFFF87171),
    errorContainer = Color(0xFF4C1515),
    onErrorContainer = Color(0xFFFECACA),
)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(32.dp),
)

private val Base = Typography()
private val AppTypography = Base.copy(
    headlineMedium = Base.headlineMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
    headlineSmall = Base.headlineSmall.copy(fontWeight = FontWeight.SemiBold, letterSpacing = (-0.3).sp),
    titleLarge = Base.titleLarge.copy(fontWeight = FontWeight.SemiBold),
    titleMedium = Base.titleMedium.copy(fontWeight = FontWeight.SemiBold),
    labelLarge = Base.labelLarge.copy(fontWeight = FontWeight.SemiBold),
)

@Composable
fun NfcTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (dark) Dark else Light,
        shapes = AppShapes,
        typography = AppTypography,
        content = content,
    )
}
