import Foundation
import Combine
import SwiftUI
import AppKit

// MARK: - Transcript Item Model
struct TranscriptItem: Identifiable {
    let id: UUID
    let timestamp: String
    let text: String
}

class RecordPageViewModel: ObservableObject {
    // MARK: - Published Properties
    @Published var isRecording = false
    @Published var isPaused = false
    @Published var duration: TimeInterval = 0
    @Published var waveformAmplitudes: [CGFloat] = []
    @Published var volumeLevel: Double = 0
    @Published var recordingTitle: String = ""
    @Published var savePath: String = "~/Documents/LazyAudio"
    @Published var audioSource: AudioSource = AudioSource(type: .system, selectedApplication: nil, includeMicrophone: false)
    @Published var availableApplications: [AudioApplication] = []
    @Published var systemAudioLevel: Double = 0
    @Published var microphoneLevel: Double = 0
    @Published var recordingDuration: String = "00:00"
    @Published var fileSize: String = "0 MB"
    @Published var transcriptItems: [TranscriptItem] = []
    @Published var isTranscribing: Bool = false
    @Published var transcriptionModel: String = "whisper-base"
    
    // MARK: - Computed Properties
    var formattedDuration: String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
    
    var statusText: String {
        if !isRecording {
            return "record.status.ready"
        }
        return isPaused ? "record.status.paused" : "record.status.recording"
    }
    
    var statusColor: Color {
        if !isRecording {
            return .gray
        }
        return isPaused ? .orange : .red
    }
    
    var canStartRecording: Bool {
        !recordingTitle.isEmpty
    }
    
    // MARK: - Private Properties
    private var timer: Timer?
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    init() {
        setupBindings()
    }
    
    // MARK: - Private Methods
    private func setupBindings() {
        // 监听录制状态变化
        $isRecording
            .combineLatest($isPaused)
            .sink { [weak self] isRecording, isPaused in
                self?.updateTimer(isRecording: isRecording, isPaused: isPaused)
                if isRecording && !isPaused {
                    self?.startTranscription()
                } else {
                    self?.stopTranscription()
                }
            }
            .store(in: &cancellables)
    }
    
    private func updateTimer(isRecording: Bool, isPaused: Bool) {
        timer?.invalidate()
        timer = nil
        
        if isRecording && !isPaused {
            timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                self?.duration += 1
                self?.updateWaveform()
            }
        }
    }
    
    private func updateWaveform() {
        // 模拟波形数据
        let newAmplitude = CGFloat.random(in: 0.1...0.9)
        waveformAmplitudes.append(newAmplitude)
        
        // 保持波形数组在合理大小
        if waveformAmplitudes.count > 100 {
            waveformAmplitudes.removeFirst()
        }
        
        // 更新音量级别
        volumeLevel = Double(newAmplitude)
        systemAudioLevel = Double(newAmplitude)
        microphoneLevel = Double(newAmplitude)
        
        // 更新录制时长
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        recordingDuration = String(format: "%02d:%02d", minutes, seconds)
        
        // 更新文件大小（模拟）
        let sizeInMB = Double(duration) * 0.1
        fileSize = String(format: "%.1f MB", sizeInMB)
    }
    
    // MARK: - Public Methods
    func selectAudioSource(_ type: AudioSourceType) {
        // 'AudioSource' is a struct, so we create a new instance for modification.
        audioSource = AudioSource(type: type, selectedApplication: audioSource.selectedApplication, includeMicrophone: audioSource.includeMicrophone)
    }
    
    func selectApplication(_ app: AudioApplication) {
        audioSource.selectedApplication = app
    }
    
    func selectSaveLocation() {
        // TODO: 实现文件夹选择对话框
    }
    
    func togglePause() {
        isPaused.toggle()
    }
    
    func stopRecording() {
        isRecording = false
        isPaused = false
        duration = 0
        waveformAmplitudes.removeAll()
        volumeLevel = 0
        systemAudioLevel = 0
        microphoneLevel = 0
        recordingDuration = "00:00"
        fileSize = "0 MB"
    }
    
    func startRecording() {
        isRecording = true
        isPaused = false
        duration = 0
        waveformAmplitudes.removeAll()
        volumeLevel = 0
        systemAudioLevel = 0
        microphoneLevel = 0
        recordingDuration = "00:00"
        fileSize = "0 MB"
    }
    
    // MARK: - Transcription Methods
    private func startTranscription() {
        isTranscribing = true
        // TODO: 实现实际的转录功能
        // 这里添加模拟数据用于测试
        simulateTranscription()
    }
    
    private func stopTranscription() {
        isTranscribing = false
        // TODO: 停止实际的转录功能
    }
    
    private func simulateTranscription() {
        // 模拟转录数据
        Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] timer in
            guard let self = self, self.isRecording && !self.isPaused else {
                timer.invalidate()
                return
            }
            
            let timestamp = self.formatTimestamp(self.duration)
            let text = "这是模拟的转录文本 \(Int(self.duration))"
            let item = TranscriptItem(id: UUID(), timestamp: timestamp, text: text)
            
            DispatchQueue.main.async {
                self.transcriptItems.append(item)
            }
        }
    }
    
    private func formatTimestamp(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds) / 60
        let remainingSeconds = Int(seconds) % 60
        return String(format: "[%02d:%02d]", minutes, remainingSeconds)
    }
    
    // MARK: - AI Operation Methods
    func generateSummary() {
        // TODO: 实现生成摘要功能
        print("生成摘要")
    }
    
    func extractTasks() {
        // TODO: 实现提取任务功能
        print("提取任务")
    }
    
    func translateTranscript() {
        // TODO: 实现翻译功能
        print("翻译转录")
    }
    
    func showQuestionDialog() {
        // TODO: 实现提问对话框
        print("显示提问对话框")
    }
} 