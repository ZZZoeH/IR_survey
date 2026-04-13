Qualtrics.SurveyEngine.addOnload(function() {
    var questionId = this.questionId;
    var textArea = document.querySelector('#' + questionId + ' textarea');
    
    // --- Inject CSS ---
    var style = document.createElement('style');
    style.innerHTML = `
        #voice-recorder-container {
            margin: 12px 0;
            display: flex;
            flex-direction: column;
            gap: 10px;
            font-family: sans-serif;
        }
        #recorder-controls {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        #recordBtn {
            padding: 10px 20px;
            background: #2196F3;
            color: white;
            border: none;
            border-radius: 24px;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: background 0.2s;
        }
        #recordBtn.recording {
            background: #e53935;
            animation: pulse 1.2s infinite;
        }
        #recordBtn:disabled {
            background: #aaa;
            cursor: not-allowed;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        #recordingStatus {
            font-size: 13px;
            color: #555;
        }
        #transcribeBtn {
            padding: 8px 16px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            display: none;
        }
        #transcribeBtn:disabled {
            background: #aaa;
            cursor: not-allowed;
        }
        #transcription-status {
            font-size: 13px;
            color: #1565C0;
            display: none;
        }
        #voice-hint {
            font-size: 12px;
            color: #888;
            font-style: italic;
        }
    `;
    document.head.appendChild(style);

    // --- Build UI above the textarea ---
    var container = document.createElement('div');
    container.id = 'voice-recorder-container';
    container.innerHTML = `
        <div id="recorder-controls">
            <button id="recordBtn" type="button">🎙 Start Recording</button>
        </div>
        <div>
            <button id="transcribeBtn" type="button">📝 Transcribe Recording</button>
            <span id="transcription-status">⏳ Transcribing, please wait...</span>
        </div>
        <div id="voice-hint">Record your response, then click Transcribe. You can edit the transcript below.</div>
    `;
    textArea.parentNode.insertBefore(container, textArea);

    // --- State ---
    var mediaRecorder = null;
    var audioChunks = [];
    var audioBlob = null;
    var isRecording = false;

    var recordBtn        = document.getElementById('recordBtn');
    var recordingStatus  = document.getElementById('recordingStatus');
    var transcribeBtn    = document.getElementById('transcribeBtn');
    var transcribeStatus = document.getElementById('transcription-status');

    // --- Recording Logic ---
    recordBtn.addEventListener('click', function() {
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    });

    function startRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Your browser does not support audio recording.');
            return;
        }
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function(stream) {
                audioChunks = [];
                audioBlob = null;
                transcribeBtn.style.display = 'none';
                transcribeStatus.style.display = 'none';

                mediaRecorder = new MediaRecorder(stream);
                mediaRecorder.ondataavailable = function(e) {
                    if (e.data.size > 0) audioChunks.push(e.data);
                };
                mediaRecorder.onstop = function() {
                    audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    stream.getTracks().forEach(function(t) { t.stop(); });
                    recordingStatus.textContent = '✅ Recording saved. Click Transcribe.';
                    transcribeBtn.style.display = 'inline-block';
                };

                mediaRecorder.start();
                isRecording = true;
                recordBtn.textContent = '🔴 Stop Recording';
                recordBtn.classList.add('recording');
                recordingStatus.textContent = '⏸ Recording...';
            })
            .catch(function(err) {
                alert('Microphone access denied or unavailable: ' + err.message);
            });
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        isRecording = false;
        recordBtn.textContent = '🎙 Start Recording';
        recordBtn.classList.remove('recording');
    }

    // --- Transcription Logic ---
    transcribeBtn.addEventListener('click', function() {
        if (!audioBlob) return;

        // Try OpenAI Whisper (if endpoint available via embedded data)
        var whisperEndpoint = "${e://Field/WhisperEndpoint}";

        if (whisperEndpoint && whisperEndpoint !== '${e://Field/WhisperEndpoint}') {
            transcribeWithWhisper(whisperEndpoint);
        } else {
            transcribeWithWebSpeech();
        }
    });

    // Whisper API (requires your own proxy endpoint)
    function transcribeWithWhisper(endpoint) {
        transcribeBtn.disabled = true;
        transcribeStatus.style.display = 'inline';

        var formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');
        formData.append('model', 'whisper-1');

        fetch(endpoint, {
            method: 'POST',
            body: formData
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            var transcript = data.text || data.transcript || '';
            if (transcript) {
                textArea.value = transcript;
                // Trigger Qualtrics change event so the answer is registered
                var event = new Event('input', { bubbles: true });
                textArea.dispatchEvent(event);
                recordingStatus.textContent = '✅ Transcript ready — review and edit below.';
            } else {
                recordingStatus.textContent = '⚠️ No transcript returned.';
            }
            transcribeStatus.style.display = 'none';
            transcribeBtn.disabled = false;
        })
        .catch(function(err) {
            recordingStatus.textContent = '❌ Transcription failed: ' + err.message;
            transcribeStatus.style.display = 'none';
            transcribeBtn.disabled = false;
        });
    }
});

Qualtrics.SurveyEngine.addOnReady(function() {
    // Ensure textarea is visible and editable
    var questionId = this.questionId;
    var textArea = document.querySelector('#' + questionId + ' textarea');
    if (textArea) {
        textArea.placeholder = 'Type directly or record your response.';
        textArea.rows = 6;
    }
});

Qualtrics.SurveyEngine.addOnUnload(function() {
    // Clean up any active streams
    var recordBtn = document.getElementById('recordBtn');
    if (recordBtn && recordBtn.classList.contains('recording')) {
        // mediaRecorder is scoped inside addOnload, streams auto-release on unload
    }
});
