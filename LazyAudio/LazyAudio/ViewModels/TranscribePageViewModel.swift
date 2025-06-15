import Foundation
import Combine

class TranscribePageViewModel: ObservableObject {
    // MARK: - Published Properties
    @Published var progress: Double = 0.0
    @Published var currentTime: String = "00:00"
    @Published var totalTime: String = "00:00"
    @Published var transcriptionSegments: [TranscriptionSegment] = []
    
    // MARK: - Language Options
    let languageOptions = [
        "transcribe.language.auto",
        "transcribe.language.zh",
        "transcribe.language.en",
        "transcribe.language.ja",
        "transcribe.language.ko"
    ]
    
    // MARK: - Model Options
    let modelOptions = [
        "transcribe.model.standard",
        "transcribe.model.enhanced",
        "transcribe.model.professional"
    ]
    
    // MARK: - Private Properties
    private var cancellables = Set<AnyCancellable>()
    private var selectedLanguage = "transcribe.language.auto"
    private var selectedModel = "transcribe.model.standard"
    
    // MARK: - Initialization
    init() {
        setupBindings()
        loadTranscriptionData()
    }
    
    // MARK: - Private Methods
    private func setupBindings() {
        // 监听进度变化
        $progress
            .sink { [weak self] _ in
                self?.objectWillChange.send()
            }
            .store(in: &cancellables)
    }
    
    private func loadTranscriptionData() {
        // TODO: 从数据服务加载转录数据
        // 这里添加模拟数据用于测试
        transcriptionSegments = [
            TranscriptionSegment(
                id: UUID(),
                startTime: 0,
                endTime: 5,
                text: "这是第一段转录文本。"
            ),
            TranscriptionSegment(
                id: UUID(),
                startTime: 5,
                endTime: 10,
                text: "这是第二段转录文本。"
            )
        ]
        
        // 更新总时长
        if let lastSegment = transcriptionSegments.last {
            totalTime = formatTime(lastSegment.endTime)
        }
    }
    
    private func formatTime(_ seconds: Double) -> String {
        let minutes = Int(seconds) / 60
        let remainingSeconds = Int(seconds) % 60
        return String(format: "%02d:%02d", minutes, remainingSeconds)
    }
    
    // MARK: - Public Methods
    func selectLanguage(_ language: String) {
        selectedLanguage = language
        objectWillChange.send()
    }
    
    func selectModel(_ model: String) {
        selectedModel = model
        objectWillChange.send()
    }
    
    func exportTranscription() {
        // TODO: 实现导出功能
    }
}

// MARK: - Transcription Segment Model
struct TranscriptionSegment: Identifiable {
    let id: UUID
    let startTime: Double
    let endTime: Double
    let text: String
    
    var formattedTime: String {
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = [.minute, .second]
        formatter.unitsStyle = .positional
        formatter.zeroFormattingBehavior = .pad
        
        let duration = endTime - startTime
        return formatter.string(from: duration) ?? "00:00"
    }
} 