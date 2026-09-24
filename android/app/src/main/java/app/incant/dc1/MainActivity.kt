package app.incant.dc1

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private val micPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            micPermission.launch(Manifest.permission.RECORD_AUDIO)
        }
        val store = SettingsStore(applicationContext)
        val caster = OpenAiCast()
        val gemini = GeminiLive()
        setContent {
            IncantScreen(store = store, caster = caster, gemini = gemini)
        }
    }
}

private val Parchment = Color(0xFFF3EFE4)
private val Ink = Color(0xFF1A1814)
private val Ash = Color(0xFF6E6860)

private enum class Phase { Idle, Incanting, Casting, Manifested, Fizzled }

@Composable
private fun IncantScreen(
    store: SettingsStore,
    caster: OpenAiCast,
    gemini: GeminiLive,
) {
    val settings by store.settings.collectAsState(initial = IncantSettings())
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var sketchView by remember { mutableStateOf<SketchView?>(null) }
    var phase by remember { mutableStateOf(Phase.Idle) }
    var held by remember { mutableStateOf(false) }
    var transcript by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var eraser by remember { mutableStateOf(false) }
    var showGrimoire by remember { mutableStateOf(false) }
    val visages = remember { mutableStateListOf<ByteArray>() }
    var active by remember { mutableIntStateOf(0) }
    var lastSpell by remember { mutableStateOf("") }
    var lastSketch by remember { mutableStateOf<ByteArray?>(null) }
    val flick by animateFloatAsState(if (held) -8f else 0f, label = "wand")

    LaunchedEffect(Unit) {
        for (text in gemini.transcripts) transcript = text
    }

    fun cast(fromReroll: Boolean) {
        val png = lastSketch.takeIf { fromReroll } ?: sketchView?.exportPng()
        val spell = if (fromReroll) lastSpell else transcript.trim()
        if (png == null || png.isEmpty()) {
            error = "Draw on the parchment first."
            phase = Phase.Fizzled
            return
        }
        if (spell.isBlank()) {
            error = "Speak or write an incantation before you cast."
            phase = Phase.Fizzled
            return
        }
        if (settings.openaiKey.isBlank()) {
            error = "Open the Grimoire and enter an OpenAI key."
            showGrimoire = true
            phase = Phase.Fizzled
            return
        }
        lastSpell = spell
        lastSketch = png
        if (!fromReroll) visages.clear()
        phase = Phase.Casting
        val count = if (fromReroll) 1 else if (settings.fourfold) 4 else 1
        val offset = visages.size
        scope.launch {
            delay(900)
            var gotOne = false
            var lastErr = "The spell returned nothing."
            withContext(Dispatchers.IO) {
                val jobs = (0 until count).map { i ->
                    launch {
                        val result = caster.edit(
                            apiKey = settings.openaiKey,
                            sketchPng = png,
                            incantation = spell,
                            livePaper = settings.livePaper,
                            variationIndex = offset + i,
                            quality = settings.quality,
                            model = settings.model,
                        )
                        if (result.ok && result.imagePng != null) {
                            visages.add(result.imagePng)
                            if (!gotOne) {
                                gotOne = true
                                active = visages.lastIndex
                            }
                        } else if (result.error != null) {
                            lastErr = result.error
                        }
                    }
                }
                jobs.forEach { it.join() }
            }
            phase = if (visages.isNotEmpty()) Phase.Manifested else Phase.Fizzled
            if (visages.isEmpty()) error = lastErr
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Parchment)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        Column(Modifier.fillMaxSize().padding(horizontal = 14.dp)) {
            Row(
                Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("SKETCH MAGIC", color = Ink, fontSize = 13.sp, letterSpacing = 4.sp, fontFamily = FontFamily.Serif)
                    Text("A wizard's canvas", color = Ash, fontSize = 14.sp, fontStyle = FontStyle.Italic, fontFamily = FontFamily.Serif)
                }
                Row {
                    TextBtn("Undo") { sketchView?.undo() }
                    TextBtn("Grimoire") { showGrimoire = true }
                }
            }
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .border(1.dp, Ink.copy(alpha = 0.2f)),
            ) {
                AndroidView(
                    factory = { ctx ->
                        SketchView(ctx).also { sketchView = it }
                    },
                    update = {
                        it.eraser = eraser
                        it.locked = phase == Phase.Casting || phase == Phase.Manifested || held
                    },
                    modifier = Modifier.fillMaxSize(),
                )
                if (phase == Phase.Casting) {
                    Box(Modifier.fillMaxSize().background(Parchment.copy(alpha = 0.55f)), contentAlignment = Alignment.Center) {
                        Text("The spell gathers", color = Ink, fontFamily = FontFamily.Serif, fontSize = 16.sp, letterSpacing = 3.sp)
                    }
                }
                if (phase == Phase.Manifested && visages.isNotEmpty()) {
                    val bytes = visages.getOrNull(active)
                    if (bytes != null) {
                        val bmp = remember(bytes) { BitmapFactory.decodeByteArray(bytes, 0, bytes.size) }
                        if (bmp != null) {
                            Image(
                                bitmap = bmp.asImageBitmap(),
                                contentDescription = "Manifestation",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize(),
                            )
                        }
                    }
                }
                if (phase == Phase.Fizzled && error.isNotBlank()) {
                    Box(Modifier.fillMaxSize().background(Parchment.copy(alpha = 0.85f)), contentAlignment = Alignment.Center) {
                        Text(error, color = Ink, fontStyle = FontStyle.Italic, fontFamily = FontFamily.Serif, modifier = Modifier.padding(24.dp))
                    }
                }
            }

            if (visages.size > 1) {
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.Center) {
                    visages.forEachIndexed { i, bytes ->
                        val bmp = remember(bytes) { BitmapFactory.decodeByteArray(bytes, 0, bytes.size) }
                        if (bmp != null) {
                            Image(
                                bitmap = bmp.asImageBitmap(),
                                contentDescription = "Visage ${i + 1}",
                                modifier = Modifier
                                    .padding(horizontal = 4.dp)
                                    .size(if (i == active) 48.dp else 36.dp)
                                    .border(1.dp, if (i == active) Ink else Ink.copy(alpha = 0.3f))
                                    .clickable { active = i },
                                contentScale = ContentScale.Crop,
                            )
                        }
                    }
                }
            }

            BasicTextField(
                value = transcript,
                onValueChange = { transcript = it },
                textStyle = TextStyle(color = Ink, fontSize = 16.sp, fontStyle = FontStyle.Italic, fontFamily = FontFamily.Serif),
                modifier = Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 6.dp),
                decorationBox = { inner ->
                    Box {
                        if (transcript.isEmpty()) {
                            Text(
                                if (held) "Listening…" else "The spell appears here — or write it",
                                color = Ash,
                                fontStyle = FontStyle.Italic,
                                fontFamily = FontFamily.Serif,
                            )
                        }
                        inner()
                    }
                },
            )

            Row(
                Modifier.fillMaxWidth().padding(bottom = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom,
            ) {
                Column {
                    TextBtn(if (eraser) "Quill" else "Rubber") { eraser = !eraser }
                    TextBtn("Clear") {
                        sketchView?.clear()
                        visages.clear()
                        transcript = ""
                        phase = Phase.Idle
                    }
                }
                Box(
                    Modifier
                        .size(96.dp)
                        .graphicsLayer { rotationZ = flick }
                        .clip(CircleShape)
                        .border(1.dp, Ink.copy(alpha = 0.4f), CircleShape)
                        .background(Parchment)
                        .pointerInput(phase, settings.geminiKey) {
                            awaitPointerEventScope {
                                while (true) {
                                    val down = awaitPointerEvent().changes.firstOrNull { it.pressed } ?: continue
                                    held = true
                                    phase = Phase.Incanting
                                    if (settings.geminiKey.isNotBlank()) {
                                        gemini.connect(settings.geminiKey)
                                        gemini.startTurn()
                                    }
                                    while (down.pressed) {
                                        awaitPointerEvent()
                                    }
                                    held = false
                                    if (settings.geminiKey.isNotBlank()) {
                                        val spoken = gemini.endTurn()
                                        if (spoken.isNotBlank()) transcript = spoken
                                    }
                                    cast(fromReroll = false)
                                }
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(if (held) "Listening" else "Hold", color = Ink, fontFamily = FontFamily.Serif, letterSpacing = 2.sp, fontSize = 12.sp)
                }
                Column(horizontalAlignment = Alignment.End) {
                    TextBtn("Another") { if (visages.isNotEmpty()) cast(true) }
                    TextBtn("Owl") {
                        val bytes = visages.getOrNull(active)
                        if (bytes != null) shareByOwl(context, bytes, lastSpell.ifBlank { transcript })
                    }
                    TextBtn("Sketch") { phase = Phase.Idle }
                }
            }
        }

        if (showGrimoire) {
            GrimoireSheet(
                settings = settings,
                onSave = {
                    scope.launch { store.save(it) }
                    showGrimoire = false
                },
                onClose = { showGrimoire = false },
            )
        }
    }
}

@Composable
private fun TextBtn(label: String, onClick: () -> Unit) {
    Text(
        label.uppercase(),
        color = Ink,
        fontSize = 11.sp,
        letterSpacing = 2.sp,
        fontFamily = FontFamily.Serif,
        modifier = Modifier.padding(8.dp).clickable(onClick = onClick),
    )
}

@Composable
private fun GrimoireSheet(
    settings: IncantSettings,
    onSave: (IncantSettings) -> Unit,
    onClose: () -> Unit,
) {
    var draft by remember(settings) { mutableStateOf(settings) }
    Box(Modifier.fillMaxSize().background(Ink.copy(alpha = 0.35f)).clickable(onClick = onClose)) {
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(Parchment)
                .padding(20.dp)
                .clickable(enabled = false) {},
        ) {
            Text("GRIMOIRE", color = Ink, letterSpacing = 4.sp, fontFamily = FontFamily.Serif, fontSize = 14.sp)
            Spacer(Modifier.height(12.dp))
            LabelField("OpenAI key", draft.openaiKey) { draft = draft.copy(openaiKey = it) }
            LabelField("Gemini key", draft.geminiKey) { draft = draft.copy(geminiKey = it) }
            Row(Modifier.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TextBtn(if (draft.fourfold) "Fourfold on" else "Fourfold off") {
                    draft = draft.copy(fourfold = !draft.fourfold)
                }
                TextBtn(if (draft.livePaper) "Live Paper on" else "Live Paper off") {
                    draft = draft.copy(livePaper = !draft.livePaper)
                }
            }
            Row {
                TextBtn("Close") { onClose() }
                Spacer(Modifier.width(16.dp))
                TextBtn("Save") { onSave(draft) }
            }
        }
    }
}

@Composable
private fun LabelField(label: String, value: String, onChange: (String) -> Unit) {
    Text(label.uppercase(), color = Ash, fontSize = 11.sp, letterSpacing = 2.sp, fontFamily = FontFamily.Serif)
    BasicTextField(
        value = value,
        onValueChange = onChange,
        textStyle = TextStyle(color = Ink, fontSize = 16.sp, fontFamily = FontFamily.Serif),
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 10.dp, top = 4.dp)
            .border(1.dp, Ink.copy(alpha = 0.25f))
            .padding(10.dp),
    )
}

private fun shareByOwl(context: Context, bytes: ByteArray, spell: String) {
    val file = File(context.cacheDir, "incant-visage.png")
    file.writeBytes(bytes)
    val uri: Uri = FileProvider.getUriForFile(context, "app.incant.dc1.files", file)
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_SUBJECT, owlSubject(spell))
        putExtra(Intent.EXTRA_TEXT, owlBody(spell))
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(send, "Send by owl"))
}

private fun owlSubject(spell: String): String {
    val seed = spell.ifBlank { "an unnamed mutter" }
    val subjects = arrayOf(
        "Owl post: one (1) captured enchantment",
        "A visage, still faintly humming",
        "Do not be alarmed — I have transfigured something",
        "From the parchment, with only mild recklessness",
        "Enclosed: a spell that actually worked (rare)",
        "Kindly receive this unauthorized miracle",
    )
    var h = -2128831035
    for (c in seed) {
        h = h xor c.code
        h *= 16777619
    }
    return subjects[kotlin.math.abs(h) % subjects.size]
}

private fun owlBody(spell: String): String {
    val words = spell.trim().ifBlank { "an unnamed mutter I now slightly regret" }
    return """
I drew a rather ordinary scribble and then, as one does, shouted a spell at it.

The incantation was:
« $words »

The parchment, against several laws of taste and at least one of physics, obliged. Enclosed is the resulting visage. It may still smell of ozone and tea.

If the owl looks smug, that is not my fault. Feed it a biscuit anyway.

— dispatched from Sketch Magic, a wizard's canvas
    """.trimIndent()
}
