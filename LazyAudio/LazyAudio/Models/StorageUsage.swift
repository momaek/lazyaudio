import Foundation

struct StorageUsage {
    let used: Double // 已使用空间（字节）
    let total: Double // 总空间（字节）
    
    var formattedUsed: String {
        formatBytes(used)
    }
    
    var formattedTotal: String {
        formatBytes(total)
    }
    
    private func formatBytes(_ bytes: Double) -> String {
        let units = ["B", "KB", "MB", "GB", "TB"]
        var value = bytes
        var unitIndex = 0
        
        while value >= 1024 && unitIndex < units.count - 1 {
            value /= 1024
            unitIndex += 1
        }
        
        return String(format: "%.1f %@", value, units[unitIndex])
    }
} 