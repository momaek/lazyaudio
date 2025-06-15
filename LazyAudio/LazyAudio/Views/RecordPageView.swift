import SwiftUI

struct RecordPageView: View {
    @StateObject private var viewModel = RecordPageViewModel()
    @Environment(\.colorScheme) private var colorScheme
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // 标题区域
                HStack {
                    Text("page.record.title".localized)
                        .font(.system(size: 20, weight: .bold))
                    if viewModel.isRecording {
                        Text("record.status.recording".localized)
                            .foregroundColor(Color(NSColor.systemRed))
                            .font(.system(size: 13, weight: .medium))
                    }
                }
                .padding(.top, 8)
                
                // 录制时隐藏音频源选择卡片和录制配置卡片
                if !viewModel.isRecording {
                    // 音频源选择卡片
                    Card {
                        VStack(alignment: .leading, spacing: 16) {
                            Text("record.audio_source.label".localized)
                                .font(.system(size: 13, weight: .bold))
                            HStack(spacing: 8) {
                                Picker("", selection: $viewModel.audioSource.type) {
                                    Text("record.audio_source.system".localized).tag(AudioSourceType.system)
                                    Text("record.audio_source.application".localized).tag(AudioSourceType.application)
                                }
                                .pickerStyle(SegmentedPickerStyle())
                                .frame(width: 300)
                                Toggle("record.audio_source.include_microphone".localized, isOn: $viewModel.audioSource.includeMicrophone)
                                    .toggleStyle(.switch)
                            }
                            if viewModel.isRecording {
                                AudioWaveformView(
                                    systemAudioLevel: viewModel.systemAudioLevel,
                                    microphoneLevel: viewModel.microphoneLevel
                                )
                                .frame(height: 60)
                            }
                        }
                    }
                    // 应用选择卡片（条件显示）
                    if viewModel.audioSource.type == .application {
                        Card {
                            VStack(alignment: .leading, spacing: 16) {
                                Text("record.application.label".localized)
                                    .font(.system(size: 13, weight: .bold))
                                Picker("record.application.picker".localized, selection: $viewModel.audioSource.selectedApplication) {
                                    Text("Safari").tag(Optional(AudioApplication(id: "safari", name: "Safari", icon: NSImage(named: NSImage.applicationIconName) ?? NSImage(), isRunning: true, hasAudio: true)))
                                    Text("微信").tag(Optional(AudioApplication(id: "wechat", name: "微信", icon: NSImage(named: NSImage.applicationIconName) ?? NSImage(), isRunning: false, hasAudio: false)))
                                    Text("QQ音乐").tag(Optional(AudioApplication(id: "qqmusic", name: "QQ音乐", icon: NSImage(named: NSImage.applicationIconName) ?? NSImage(), isRunning: true, hasAudio: true)))
                                }
                                .frame(width: 220)
                            }
                        }
                    }
                    // 录制配置卡片
                    Card {
                        VStack(alignment: .leading, spacing: 16) {
                            HStack(spacing: 8) {
                                Text("record.title.label".localized)
                                    .font(.system(size: 13, weight: .regular))
                                TextField("record.title.placeholder".localized, text: $viewModel.recordingTitle)
                                    .frame(width: 240)
                            }
                            HStack(spacing: 8) {
                                Text("record.save_location.label".localized)
                                    .font(.system(size: 13, weight: .regular))
                                Text(viewModel.savePath)
                                    .foregroundColor(Color(NSColor.secondaryLabelColor))
                                Button("record.save_location.button".localized) {
                                    viewModel.selectSaveLocation()
                                }
                                .buttonStyle(.bordered)
                            }
                        }
                    }
                }
                // 录制控制卡片（始终显示）
                Card {
                    VStack(alignment: .leading, spacing: 16) {
                        if viewModel.isRecording {
                            HStack(spacing: 16) {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("record.status.recording".localized)
                                        .foregroundColor(Color(NSColor.systemRed))
                                        .font(.system(size: 13, weight: .medium))
                                    Text(viewModel.recordingDuration)
                                        .font(.system(size: 13, weight: .regular))
                                    Text(viewModel.fileSize)
                                        .font(.system(size: 13, weight: .regular))
                                }
                                Spacer()
                                HStack(spacing: 8) {
                                    Button(action: { viewModel.togglePause() }) {
                                        Image(systemName: viewModel.isPaused ? "play.circle.fill" : "pause.circle.fill")
                                            .font(.system(size: 24))
                                            .foregroundColor(Color(NSColor.systemBlue))
                                    }
                                    .buttonStyle(.plain)
                                    Button(action: { viewModel.stopRecording() }) {
                                        Image(systemName: "stop.circle.fill")
                                            .font(.system(size: 24))
                                            .foregroundColor(Color(NSColor.systemRed))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        } else {
                            Button(action: { viewModel.startRecording() }) {
                                Label("record.start.button".localized, systemImage: "record.circle")
                                    .font(.system(size: 13, weight: .semibold))
                                    .frame(width: 120)
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(!viewModel.canStartRecording)
                        }
                    }
                }
                // 转录区域（仅在录制时显示）
                if viewModel.isRecording {
                    Card {
                        VStack(alignment: .leading, spacing: 16) {
                            HStack {
                                Text("📝 " + "record.transcribe.realtime".localized)
                                    .font(.system(size: 13, weight: .bold))
                                Spacer()
                                Text("record.transcribe.status".localized)
                                    .foregroundColor(Color(NSColor.secondaryLabelColor))
                                    .font(.system(size: 11, weight: .regular))
                            }
                            // 转录文本区域
                            ScrollView {
                                VStack(alignment: .leading, spacing: 8) {
                                    ForEach(viewModel.transcriptItems) { item in
                                        TranscriptItemView(item: item)
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .frame(height: 200)
                            .frame(maxWidth: .infinity)
                            HStack(spacing: 8) {
                                Button("📋 " + "record.transcribe.summary".localized) { viewModel.generateSummary() }
                                    .buttonStyle(.bordered)
                                Button("✅ " + "record.transcribe.task".localized) { viewModel.extractTasks() }
                                    .buttonStyle(.bordered)
                                Button("🌐 " + "record.transcribe.translate".localized) { viewModel.translateTranscript() }
                                    .buttonStyle(.bordered)
                                Button("❓ " + "record.transcribe.question".localized) { viewModel.showQuestionDialog() }
                                    .buttonStyle(.bordered)
                            }
                        }
                    }
                }
                Spacer()
            }
            .padding(20)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .frame(minWidth: 700, minHeight: 400)
        .background(Color(NSColor.windowBackgroundColor))
    }
}

// MARK: - 辅助视图组件

struct Card<Content: View>: View {
    let content: Content
    
    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }
    
    var body: some View {
        content
            .padding(16)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(8)
            .shadow(color: Color.black.opacity(0.1), radius: 2, x: 0, y: 1)
    }
}

struct AudioWaveformView: View {
    let systemAudioLevel: Double
    let microphoneLevel: Double
    
    var body: some View {
        VStack(spacing: 8) {
            // 系统音频波形
            HStack(spacing: 1) {
                ForEach(0..<50) { index in
                    Rectangle()
                        .fill(Color(NSColor.systemBlue).opacity(index < Int(systemAudioLevel * 50) ? 1 : 0.2))
                        .frame(width: 2, height: 20)
                }
            }
            
            // 麦克风音频波形
            if microphoneLevel > 0 {
                HStack(spacing: 1) {
                    ForEach(0..<50) { index in
                        Rectangle()
                            .fill(Color(NSColor.systemGreen).opacity(index < Int(microphoneLevel * 50) ? 1 : 0.2))
                            .frame(width: 2, height: 20)
                    }
                }
            }
        }
    }
}

struct TranscriptItemView: View {
    let item: TranscriptItem
    
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(item.timestamp)
                .font(.system(size: 11, weight: .regular))
                .foregroundColor(Color(NSColor.secondaryLabelColor))
                .frame(width: 80, alignment: .leading)
            
            Text(item.text.localized)
                .font(.system(size: 13, weight: .regular))
        }
    }
}

// MARK: - 预览
struct RecordPageView_Previews: PreviewProvider {
    static var previews: some View {
        RecordPageView()
    }
} 
