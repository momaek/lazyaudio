import Foundation

struct RecordingItem: Identifiable {
    let id: UUID
    let title: String
    let createdAt: Date
    let duration: TimeInterval
    let fileSize: Int64
    let filePath: String
    let transcriptionStatus: TranscriptionStatus
    let aiProcessingStatus: AIProcessingStatus
    var tags: [String]
    
    var formattedDuration: String {
        let hours = Int(duration) / 3600
        let minutes = Int(duration) / 60 % 60
        let seconds = Int(duration) % 60
        
        if hours > 0 {
            return String(format: "%dh %dm", hours, minutes)
        } else {
            return String(format: "%dm %ds", minutes, seconds)
        }
    }
    
    var formattedFileSize: String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useMB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: fileSize)
    }
    
    var formattedDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: createdAt)
    }
}

enum TranscriptionStatus {
    case notStarted
    case inProgress
    case completed
    case failed
    
    var displayText: String {
        switch self {
        case .notStarted: return "未转录"
        case .inProgress: return "转录中"
        case .completed: return "已完成"
        case .failed: return "失败"
        }
    }
}

enum AIProcessingStatus {
    case notProcessed
    case processing
    case processed
    case failed
    
    var displayText: String {
        switch self {
        case .notProcessed: return "未处理"
        case .processing: return "处理中"
        case .processed: return "已处理"
        case .failed: return "失败"
        }
    }
} 