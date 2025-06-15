import Foundation
import AppKit

enum AudioSourceType {
    case system
    case application
}

struct AudioApplication: Identifiable, Hashable {
    let id: String
    let name: String
    let icon: NSImage
    let isRunning: Bool
    let hasAudio: Bool
}

struct AudioSource {
    var type: AudioSourceType
    var selectedApplication: AudioApplication?
    var includeMicrophone: Bool
} 