import Foundation

struct TranscriptionModel: Identifiable, Equatable {
    let id: String
    let name: String
    let description: String
    let isRecommended: Bool
    let accuracy: Double
    let speed: Double
    let size: Int // 模型大小（MB）
    
    static func == (lhs: TranscriptionModel, rhs: TranscriptionModel) -> Bool {
        lhs.id == rhs.id
    }
} 