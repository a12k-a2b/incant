package app.incant.dc1

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import kotlinx.coroutines.channels.Channel
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class GeminiLive(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build(),
) {
    private var socket: WebSocket? = null
    private var recorder: AudioRecord? = null
    @Volatile private var recording = false
    @Volatile private var setupDone = false
    private val finals = StringBuilder()
    private var interim = ""
    val transcripts = Channel<String>(Channel.CONFLATED)

    fun connect(apiKey: String) {
        disconnect()
        setupDone = false
        val request = Request.Builder()
            .url(
                "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=$apiKey",
            )
            .build()
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                webSocket.send(
                    JSONObject()
                        .put(
                            "setup",
                            JSONObject()
                                .put("model", "models/gemini-3.5-transcribe-live")
                                .put(
                                    "generationConfig",
                                    JSONObject().put("responseModalities", org.json.JSONArray().put("TEXT")),
                                )
                                .put(
                                    "realtimeInputConfig",
                                    JSONObject().put(
                                        "automaticActivityDetection",
                                        JSONObject().put("disabled", true),
                                    ),
                                )
                                .put(
                                    "inputAudioTranscription",
                                    JSONObject()
                                        .put("languageCodes", org.json.JSONArray())
                                        .put("mode", "SMART"),
                                ),
                        )
                        .toString(),
                )
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val json = runCatching { JSONObject(text) }.getOrNull() ?: return
                if (json.has("setupComplete")) setupDone = true
                val content = json.optJSONObject("serverContent") ?: return
                content.optJSONObject("interimInputTranscription")?.optString("text")?.let {
                    interim = it
                    transcripts.trySend(combined())
                }
                content.optJSONObject("inputTranscription")?.optString("text")?.let { piece ->
                    if (piece.isNotBlank()) {
                        if (finals.isNotEmpty()) finals.append(' ')
                        finals.append(piece.trim())
                    }
                    interim = ""
                    transcripts.trySend(combined())
                }
            }
        })
    }

    fun startTurn() {
        finals.clear()
        interim = ""
        socket?.send(JSONObject().put("realtimeInput", JSONObject().put("activityStart", JSONObject())).toString())
        startMic()
    }

    fun endTurn(): String {
        stopMic()
        socket?.send(JSONObject().put("realtimeInput", JSONObject().put("activityEnd", JSONObject())).toString())
        return combined()
    }

    fun disconnect() {
        stopMic()
        socket?.close(1000, "done")
        socket = null
        setupDone = false
    }

    private fun combined(): String {
        val head = finals.toString().trim()
        return when {
            head.isNotEmpty() && interim.isNotEmpty() -> "$head $interim"
            head.isNotEmpty() -> head
            else -> interim
        }
    }

    private fun startMic() {
        val sampleRate = 16000
        val min = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val recorder = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            min * 2,
        )
        this.recorder = recorder
        recording = true
        recorder.startRecording()
        Thread {
            val buf = ByteArray(min)
            while (recording) {
                val n = recorder.read(buf, 0, buf.size)
                if (n > 0) {
                    val chunk = buf.copyOf(n)
                    val audio = JSONObject()
                        .put("data", Base64.encodeToString(chunk, Base64.NO_WRAP))
                        .put("mimeType", "audio/pcm;rate=16000")
                    socket?.send(
                        JSONObject()
                            .put("realtimeInput", JSONObject().put("audio", audio))
                            .toString(),
                    )
                }
            }
        }.apply { isDaemon = true; start() }
    }

    private fun stopMic() {
        recording = false
        runCatching { recorder?.stop() }
        runCatching { recorder?.release() }
        recorder = null
    }
}
