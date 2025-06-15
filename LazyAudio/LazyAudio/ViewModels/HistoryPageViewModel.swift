import Foundation
import Combine

class HistoryPageViewModel: ObservableObject {
    // MARK: - Published Properties
    @Published var searchText = ""
    @Published var selectedItems: Set<UUID> = []
    @Published var recordings: [RecordingItem] = []
    
    // MARK: - Filter Options
    let filterOptions = [
        "history.filter.all",
        "history.filter.transcribed",
        "history.filter.not_transcribed",
        "history.filter.processed",
        "history.filter.not_processed"
    ]
    
    // MARK: - Sort Options
    let sortOptions = [
        "history.sort.date_desc",
        "history.sort.date_asc",
        "history.sort.duration_desc",
        "history.sort.duration_asc",
        "history.sort.size_desc",
        "history.sort.size_asc"
    ]
    
    // MARK: - Private Properties
    private var cancellables = Set<AnyCancellable>()
    private var selectedFilter = "history.filter.all"
    private var selectedSort = "history.sort.date_desc"
    
    // MARK: - Computed Properties
    var filteredRecordings: [RecordingItem] {
        var filtered = recordings
        
        // 应用搜索过滤
        if !searchText.isEmpty {
            filtered = filtered.filter { $0.title.localizedCaseInsensitiveContains(searchText) }
        }
        
        // 应用筛选条件
        switch selectedFilter {
        case "history.filter.transcribed":
            filtered = filtered.filter { $0.transcriptionStatus == .completed }
        case "history.filter.not_transcribed":
            filtered = filtered.filter { $0.transcriptionStatus != .completed }
        case "history.filter.processed":
            filtered = filtered.filter { $0.aiProcessingStatus == .processed }
        case "history.filter.not_processed":
            filtered = filtered.filter { $0.aiProcessingStatus != .processed }
        default:
            break
        }
        
        // 应用排序
        switch selectedSort {
        case "history.sort.date_desc":
            filtered.sort { $0.createdAt > $1.createdAt }
        case "history.sort.date_asc":
            filtered.sort { $0.createdAt < $1.createdAt }
        case "history.sort.duration_desc":
            filtered.sort { $0.duration > $1.duration }
        case "history.sort.duration_asc":
            filtered.sort { $0.duration < $1.duration }
        case "history.sort.size_desc":
            filtered.sort { $0.fileSize > $1.fileSize }
        case "history.sort.size_asc":
            filtered.sort { $0.fileSize < $1.fileSize }
        default:
            break
        }
        
        return filtered
    }
    
    // MARK: - Initialization
    init() {
        setupBindings()
        loadRecordings()
    }
    
    // MARK: - Private Methods
    private func setupBindings() {
        // 监听搜索文本变化
        $searchText
            .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
            .sink { [weak self] _ in
                self?.objectWillChange.send()
            }
            .store(in: &cancellables)
    }
    
    private func loadRecordings() {
        // TODO: 从数据服务加载录制列表
        // 这里添加模拟数据用于测试
        recordings = [
            RecordingItem(
                id: UUID(),
                title: "测试录制 1",
                createdAt: Date(),
                duration: 300,
                fileSize: 1024 * 1024 * 5,
                filePath: "/path/to/recording1.m4a",
                transcriptionStatus: .completed,
                aiProcessingStatus: .processed,
                tags: ["会议", "工作"]
            ),
            RecordingItem(
                id: UUID(),
                title: "测试录制 2",
                createdAt: Date().addingTimeInterval(-3600),
                duration: 600,
                fileSize: 1024 * 1024 * 10,
                filePath: "/path/to/recording2.m4a",
                transcriptionStatus: .inProgress,
                aiProcessingStatus: .notProcessed,
                tags: ["采访", "项目"]
            )
        ]
    }
    
    // MARK: - Public Methods
    func selectFilter(_ filter: String) {
        selectedFilter = filter
        objectWillChange.send()
    }
    
    func selectSort(_ sort: String) {
        selectedSort = sort
        objectWillChange.send()
    }
    
    func toggleSelection(_ id: UUID) {
        if selectedItems.contains(id) {
            selectedItems.remove(id)
        } else {
            selectedItems.insert(id)
        }
    }
    
    func playRecording(_ item: RecordingItem) {
        // TODO: 实现播放功能
    }
    
    func editRecording(_ item: RecordingItem) {
        // TODO: 实现编辑功能
    }
    
    func deleteRecording(_ item: RecordingItem) {
        // TODO: 实现删除功能
    }
    
    func exportRecordings() {
        // TODO: 实现导出功能
    }
    
    func exportSelected() {
        // TODO: 实现批量导出功能
    }
    
    func deleteSelected() {
        // TODO: 实现批量删除功能
    }
    
    func processSelected() {
        // TODO: 实现批量处理功能
    }
} 